<?php
if (!defined('ABSPATH')) exit;

/**
 * Renders product modifiers (toppings, options) on the single-product page
 * and adjusts cart pricing + meta when a customer makes selections.
 *
 * Data shape stored in `_alena_modifiers` (per product, JSON):
 *   [
 *     {
 *       id, name, type ("Choice"|"Multichoice"),
 *       min, max, max_single, free,
 *       values: [ {id, name, price}, ... ]
 *     }, ...
 *   ]
 */
class Alena_DZ_Modifiers {

    const META_KEY = '_alena_modifiers';

    public function __construct() {
        // Render modifiers on the product page
        add_action('woocommerce_before_add_to_cart_button',   [$this, 'render_modifiers_form']);
        add_action('wp_enqueue_scripts',                       [$this, 'enqueue']);

        // Capture, validate, attach to cart
        add_filter('woocommerce_add_cart_item_data',           [$this, 'add_to_cart_data'], 10, 3);
        add_filter('woocommerce_get_cart_item_from_session',   [$this, 'restore_from_session'], 10, 2);
        add_action('woocommerce_before_calculate_totals',      [$this, 'apply_modifier_price'], 10, 1);

        // Display chosen modifiers
        add_filter('woocommerce_get_item_data',                [$this, 'display_in_cart'], 10, 2);
        add_action('woocommerce_checkout_create_order_line_item', [$this, 'save_to_order'], 10, 4);
    }

    public function enqueue() {
        if (!function_exists('is_product') || !is_product()) return;
        wp_enqueue_style('alena-dz-modifiers', ALENA_DZ_URL . 'assets/modifiers.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-modifiers', ALENA_DZ_URL . 'assets/modifiers.js', ['jquery'], ALENA_DZ_VERSION, true);
        // Pull the product from the queried post — global $product isn't reliably
        // set at wp_enqueue_scripts time.
        $product = null;
        if (function_exists('wc_get_product')) {
            $pid = get_queried_object_id();
            if ($pid) $product = wc_get_product($pid);
        }
        if ($product && is_object($product) && method_exists($product, 'get_price')) {
            wp_localize_script('alena-dz-modifiers', 'AlenaDZModifiers', [
                'basePrice' => (float) $product->get_price(),
            ]);
        }
    }

    /**
     * Reads modifiers JSON for the current product and returns the parsed array.
     */
    public static function get_modifiers(int $product_id): array {
        $json = get_post_meta($product_id, self::META_KEY, true);
        if (!$json) return [];
        $arr = json_decode($json, true);
        return is_array($arr) ? $arr : [];
    }

    public function render_modifiers_form() {
        global $product;
        if (!$product || !is_object($product) || !method_exists($product, 'get_id')) return;
        try {
            $mods = self::get_modifiers((int) $product->get_id());
        } catch (\Throwable $e) {
            return;
        }
        if (!$mods) return;

        echo '<div class="alena-dz-modifiers">';
        foreach ($mods as $g_idx => $group) {
            $type     = $group['type'] ?? 'Choice';
            $is_radio = ($type === 'Choice');
            $name     = $group['name'] ?? '';
            $min      = (int) ($group['min'] ?? 0);
            $max      = (int) ($group['max'] ?? 0);

            $required_label = $min > 0 ? '<span class="alena-dz-req">*</span>' : '';
            $hint = '';
            if ($is_radio) {
                $hint = $min > 0 ? 'בחירה אחת חובה' : 'בחירה אחת';
            } else {
                $parts = [];
                if ($min > 0) $parts[] = 'מינ׳ ' . $min;
                if ($max > 0) $parts[] = 'מקס׳ ' . $max;
                $hint = $parts ? implode(' · ', $parts) : 'אפשר לבחור כמה';
            }

            echo '<div class="alena-dz-mod-group" data-min="' . $min . '" data-max="' . $max . '" data-type="' . esc_attr($type) . '">';
            echo '<div class="alena-dz-mod-head">';
            echo '<h4 class="alena-dz-mod-title">' . esc_html($name) . ' ' . $required_label . '</h4>';
            echo '<span class="alena-dz-mod-hint">' . esc_html($hint) . '</span>';
            echo '</div>';
            echo '<div class="alena-dz-mod-values">';

            $input_name = "alena_mod[$g_idx]" . ($is_radio ? '' : '[]');
            foreach (($group['values'] ?? []) as $v_idx => $val) {
                $price = (float) ($val['price'] ?? 0);
                $price_label = $price > 0 ? '+₪' . number_format($price, $price == (int)$price ? 0 : 2) : '';
                $input_id = 'alena-mod-' . $g_idx . '-' . $v_idx;
                $input_type = $is_radio ? 'radio' : 'checkbox';
                ?>
                <label class="alena-dz-mod-row" for="<?php echo esc_attr($input_id); ?>">
                  <input type="<?php echo $input_type; ?>"
                         id="<?php echo esc_attr($input_id); ?>"
                         name="<?php echo esc_attr($input_name); ?>"
                         value="<?php echo esc_attr($v_idx); ?>"
                         data-price="<?php echo esc_attr($price); ?>"
                         data-name="<?php echo esc_attr($val['name'] ?? ''); ?>" />
                  <span class="alena-dz-mod-name"><?php echo esc_html($val['name'] ?? ''); ?></span>
                  <?php if ($price_label): ?>
                    <span class="alena-dz-mod-price"><?php echo esc_html($price_label); ?></span>
                  <?php endif; ?>
                </label>
                <?php
            }
            echo '</div>';
            echo '</div>';
        }
        echo '</div>'; // close .alena-dz-modifiers

        // Sticky bottom cart bar (shown on all screens; mobile-friendly)
        echo '<div class="alena-dz-sticky-bar" id="alena-dz-sticky-bar">';
        echo '<div class="alena-dz-sticky-total">סה״כ <span id="alena-dz-running-price">₪' . number_format($product->get_price(), 0) . '</span></div>';
        echo '<button type="submit" form="alena-dz-cart-form-marker" class="alena-dz-sticky-cta">הוסף לסל →</button>';
        echo '</div>';
    }

    public function add_to_cart_data($cart_item_data, $product_id, $variation_id) {
        // Per-item note (works even if no modifiers exist)
        if (!empty($_POST['alena_item_note'])) {
            $cart_item_data['alena_item_note'] = sanitize_textarea_field(wp_unslash($_POST['alena_item_note']));
            $cart_item_data['unique_key'] = md5(microtime() . wp_json_encode($cart_item_data));
        }
        if (empty($_POST['alena_mod'])) return $cart_item_data;
        $mods = self::get_modifiers($product_id);
        if (!$mods) return $cart_item_data;

        $selected = [];
        foreach ($_POST['alena_mod'] as $g_idx => $picks) {
            $g_idx = (int) $g_idx;
            if (!isset($mods[$g_idx])) continue;
            $group = $mods[$g_idx];
            $picks = is_array($picks) ? $picks : [$picks];
            foreach ($picks as $v_idx) {
                $v_idx = (int) $v_idx;
                if (!isset($group['values'][$v_idx])) continue;
                $v = $group['values'][$v_idx];
                $selected[] = [
                    'group' => $group['name'] ?? '',
                    'name'  => $v['name']    ?? '',
                    'price' => (float) ($v['price'] ?? 0),
                ];
            }
        }
        if ($selected) {
            $cart_item_data['alena_modifiers'] = $selected;
            // Make each combination a unique cart line
            $cart_item_data['unique_key'] = md5(microtime() . wp_json_encode($selected));
        }
        return $cart_item_data;
    }

    public function restore_from_session($cart_item, $values) {
        if (!empty($values['alena_modifiers'])) {
            $cart_item['alena_modifiers'] = $values['alena_modifiers'];
        }
        return $cart_item;
    }

    public function apply_modifier_price($cart) {
        try {
            if (is_admin() && !defined('DOING_AJAX')) return;
            if (did_action('woocommerce_before_calculate_totals') >= 2) return;
            if (!$cart || !method_exists($cart, 'get_cart')) return;
            foreach ($cart->get_cart() as $cart_item) {
                if (empty($cart_item['alena_modifiers']) || !is_array($cart_item['alena_modifiers'])) continue;
                $extra = 0;
                foreach ($cart_item['alena_modifiers'] as $m) {
                    if (is_array($m) && isset($m['price'])) $extra += (float) $m['price'];
                }
                if (!isset($cart_item['data']) || !is_object($cart_item['data']) || !method_exists($cart_item['data'], 'set_price')) continue;
                $base = (float) $cart_item['data']->get_price('edit');
                if ($extra > 0) $cart_item['data']->set_price($base + $extra);
            }
        } catch (\Throwable $e) { /* swallow */ }
    }

    public function display_in_cart($item_data, $cart_item) {
        try {
            if (!empty($cart_item['alena_modifiers']) && is_array($cart_item['alena_modifiers'])) {
                foreach ($cart_item['alena_modifiers'] as $m) {
                    if (!is_array($m)) continue;
                    $label = (string) ($m['name'] ?? '');
                    if ((float) ($m['price'] ?? 0) > 0) $label .= ' (+₪' . number_format((float) $m['price'], 0) . ')';
                    $item_data[] = [
                        'key'   => (string) ($m['group'] ?? '') ?: 'תוספת',
                        'value' => $label,
                    ];
                }
            }
            if (!empty($cart_item['alena_item_note'])) {
                $item_data[] = [
                    'key'   => '📝 הערה',
                    'value' => (string) $cart_item['alena_item_note'],
                ];
            }
        } catch (\Throwable $e) { /* swallow */ }
        return $item_data;
    }

    public function save_to_order($item, $cart_item_key, $values, $order) {
        try {
            if (!empty($values['alena_modifiers']) && is_array($values['alena_modifiers'])) {
                foreach ($values['alena_modifiers'] as $i => $m) {
                    if (!is_array($m)) continue;
                    $label = (string) ($m['name'] ?? '');
                    if ((float) ($m['price'] ?? 0) > 0) $label .= ' (+₪' . number_format((float) $m['price'], 0) . ')';
                    $item->add_meta_data((string) ($m['group'] ?? '') ?: ('תוספת ' . ($i + 1)), $label);
                }
            }
            if (!empty($values['alena_item_note'])) {
                $item->add_meta_data('📝 הערה למנה', (string) $values['alena_item_note']);
            }
        } catch (\Throwable $e) { /* swallow */ }
    }
}
