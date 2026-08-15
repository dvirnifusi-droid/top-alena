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
        add_filter('woocommerce_add_to_cart_validation',       [$this, 'debounce_double_add'], 5, 2);
        add_filter('woocommerce_add_cart_item_data',           [$this, 'add_to_cart_data'], 10, 3);
        add_filter('woocommerce_get_cart_item_from_session',   [$this, 'restore_from_session'], 10, 2);
        add_action('woocommerce_before_calculate_totals',      [$this, 'apply_modifier_price'], 10, 1);

        // Lightweight payload for the dish modal
        add_action('wp_ajax_alena_dish_payload',        [$this, 'ajax_dish_payload']);
        add_action('wp_ajax_nopriv_alena_dish_payload', [$this, 'ajax_dish_payload']);

        // Display chosen modifiers
        add_filter('woocommerce_get_item_data',                [$this, 'display_in_cart'], 10, 2);
        add_action('woocommerce_checkout_create_order_line_item', [$this, 'save_to_order'], 10, 4);

        // Force WC NOT to redirect to cart after add — we manage the flow ourselves.
        add_filter('option_woocommerce_cart_redirect_after_add', '__return_false');
        add_filter('pre_option_woocommerce_cart_redirect_after_add', function () { return 'no'; });
    }

    public function enqueue() {
        if (!function_exists('is_woocommerce')) return;
        // Load the modifiers CSS on shop/category pages too, because the
        // product modal injects modifier markup there.
        $on_shop_like = (function_exists('is_shop') && is_shop())
            || (function_exists('is_product_category') && is_product_category())
            || (function_exists('is_product_taxonomy') && is_product_taxonomy());
        $on_product   = function_exists('is_product') && is_product();
        if (!$on_shop_like && !$on_product) return;

        wp_enqueue_style('alena-dz-modifiers', ALENA_DZ_URL . 'assets/modifiers.css', [], ALENA_DZ_VERSION);

        // The companion JS only matters on single product pages
        if ($on_product) {
            wp_enqueue_script('alena-dz-modifiers', ALENA_DZ_URL . 'assets/modifiers.js', ['jquery'], ALENA_DZ_VERSION, true);
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

    /**
     * Everything the dish modal needs, as a small JSON payload.
     *
     * The modal used to GET the whole product page and scrape it — 231KB and
     * ~1.3s on desktop, several seconds on a phone, for a name, a price and the
     * modifier markup. This returns the same content in a couple of KB.
     */
    public function ajax_dish_payload() {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        $product = $id ? wc_get_product($id) : null;
        if (!$product || $product->get_status() !== 'publish') {
            wp_send_json_error('not_found', 404);
        }

        // render_modifiers_form() reads the global $product, so stand it up the
        // way a product page would, then put back whatever was there.
        $prev = $GLOBALS['product'] ?? null;
        $GLOBALS['product'] = $product;
        ob_start();
        $this->render_modifiers_form();
        $mods_html = ob_get_clean();
        $GLOBALS['product'] = $prev;

        $img_id = $product->get_image_id();
        $desc   = $product->get_short_description() ?: $product->get_description();

        wp_send_json_success([
            'id'         => $id,
            'title'      => $product->get_name(),
            'price_html' => $product->get_price_html(),
            'featured'   => $product->is_featured(),
            'desc'       => wpautop(wp_kses_post($desc)),
            // 'large' is ~1024px wide for a slot that renders at 540 (180 on a
            // phone), so most of those bytes were thrown away. Ship the
            // mid-size file and let the browser pick from the srcset.
            'img'        => $img_id ? (wp_get_attachment_image_url($img_id, 'medium_large') ?: wp_get_attachment_image_url($img_id, 'large') ?: '') : '',
            'img_srcset' => $img_id ? (wp_get_attachment_image_srcset($img_id, 'medium_large') ?: '') : '',
            'img_sizes'  => '(max-width: 640px) 100vw, 560px',
            'mods_html'  => $mods_html,
            'in_stock'   => $product->is_in_stock(),
        ]);
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

            $free    = (int) ($group['free'] ?? 0);

            $required_label = $min > 0 ? '<span class="alena-dz-req">*</span>' : '';

            // Wolt-style hints: full sentences instead of "min N · max M" abbreviations.
            if ($is_radio) {
                $hint = $min > 0 ? 'בחירה של פריט אחד חובה' : 'בחירה אחת';
            } else {
                if ($min > 0 && $max > 0) {
                    $hint = $min === $max
                        ? 'בחירה של ' . $min . ' פריטים'
                        : 'בחירה של לפחות פריט אחד · עד ' . $max;
                } elseif ($min > 0) {
                    $hint = $min === 1 ? 'בחירה של לפחות פריט אחד' : 'בחירה של לפחות ' . $min . ' פריטים';
                } elseif ($max > 0) {
                    $hint = 'אפשר לבחור עד ' . $max . ' פריטים נוספים';
                } else {
                    $hint = 'אפשר לבחור כמה';
                }
            }

            // "First N free" badge — matches Wolt's display
            $free_badge = '';
            if ($free > 0) {
                $free_badge = $free === 1
                    ? '<span class="alena-dz-mod-free">הראשון חינם</span>'
                    : '<span class="alena-dz-mod-free">' . $free . ' הראשונים חינם</span>';
            }

            // Per-value cap. Wolt sends 1 whenever it says nothing, which is why
            // a side of tahini could only ever be ordered once — the owner wants
            // four. Where the group itself allows several picks, let a single
            // value carry that many unless the data explicitly says otherwise.
            $max_single = (int) ($group['max_single'] ?? 1);
            $per_value  = (!$is_radio && $max > 1)
                ? ($max_single > 1 ? $max_single : $max)
                : 1;

            echo '<div class="alena-dz-mod-group" data-min="' . $min . '" data-max="' . $max . '" data-free="' . $free . '" data-per-value="' . $per_value . '" data-type="' . esc_attr($type) . '">';
            echo '<div class="alena-dz-mod-head">';
            echo '<h4 class="alena-dz-mod-title">' . esc_html($name) . ' ' . $required_label . '</h4>';
            echo '<span class="alena-dz-mod-hint">' . esc_html($hint) . ' ' . $free_badge . '</span>';
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
                  <?php if ($per_value > 1): ?>
                    <span class="alena-dz-mod-qty" data-per-value="<?php echo (int) $per_value; ?>" hidden>
                      <button type="button" class="alena-dz-mod-qty-btn" data-step="-1" aria-label="פחות">−</button>
                      <span class="alena-dz-mod-qty-val">1</span>
                      <button type="button" class="alena-dz-mod-qty-btn" data-step="1" aria-label="עוד">+</button>
                    </span>
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

    /**
     * Server-side debounce: rejects any add for the same product within 800ms of the previous one.
     * Catches browser-side double-fires (double-click, duplicate event handlers, fast retries) that
     * slip past the JS guard. Tracked per WC session.
     */
    public function debounce_double_add($passed, $product_id) {
        if (!$passed) return $passed; // already failing for another reason
        if (!function_exists('WC') || !WC()->session) return $passed;
        $key  = 'alena_last_atc_' . (int) $product_id;
        $last = (float) WC()->session->get($key, 0);
        $now  = microtime(true);
        if ($last && ($now - $last) < 0.8) {
            // Silently reject — don't spam customer with "rate limit" notices.
            // The first request already succeeded; this is the duplicate.
            return false;
        }
        WC()->session->set($key, $now);
        return $passed;
    }

    public function add_to_cart_data($cart_item_data, $product_id, $variation_id) {
        $note = !empty($_POST['alena_item_note'])
            ? sanitize_textarea_field(wp_unslash($_POST['alena_item_note']))
            : '';

        $selected = [];
        if (!empty($_POST['alena_mod'])) {
            $mods = self::get_modifiers($product_id);
            if ($mods) {
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
                            'group'      => $group['name'] ?? '',
                            'group_idx'  => $g_idx,
                            'group_free' => (int) ($group['free'] ?? 0),
                            'name'       => $v['name']    ?? '',
                            'price'      => (float) ($v['price'] ?? 0),
                        ];
                    }
                }
            }
        }

        if ($note)     $cart_item_data['alena_item_note'] = $note;
        if ($selected) $cart_item_data['alena_modifiers'] = $selected;

        // Deterministic unique_key: same product + same modifiers + same note → SAME line
        // (merges into qty=N instead of creating N separate qty=1 rows). Only set when
        // there's actually metadata; plain adds use WC's default merge.
        if ($note || $selected) {
            $cart_item_data['unique_key'] = md5(wp_json_encode([$selected, $note]));
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

                // Group selections by group_idx so we can apply "first N free" per group (Wolt semantics).
                $by_group = [];
                foreach ($cart_item['alena_modifiers'] as $m) {
                    if (!is_array($m)) continue;
                    $g = $m['group_idx'] ?? 'default';
                    if (!isset($by_group[$g])) $by_group[$g] = ['items' => [], 'free' => 0];
                    $by_group[$g]['items'][] = (float) ($m['price'] ?? 0);
                    $by_group[$g]['free'] = max($by_group[$g]['free'], (int) ($m['group_free'] ?? 0));
                }

                $extra = 0;
                foreach ($by_group as $g) {
                    $prices = $g['items'];
                    if (!$prices) continue;
                    sort($prices); // ascending — cheapest N are the "free" ones (best deal for customer)
                    $free_n = min($g['free'], count($prices));
                    for ($i = $free_n; $i < count($prices); $i++) {
                        $extra += $prices[$i];
                    }
                }

                if (!isset($cart_item['data']) || !is_object($cart_item['data']) || !method_exists($cart_item['data'], 'set_price')) continue;
                $base = (float) $cart_item['data']->get_price('edit');
                if ($extra > 0) $cart_item['data']->set_price($base + $extra);
            }
        } catch (\Throwable $e) { /* swallow */ }
    }

    public function display_in_cart($item_data, $cart_item) {
        try {
            // On the cart page Alena_DZ_Cart_Redesign already renders these as
            // chips under the dish name. Emitting them here too printed every
            // choice twice — chips, then the same list again as plain text.
            // Checkout and order review have no chips, so they still need this.
            if (function_exists('is_cart') && is_cart() && class_exists('Alena_DZ_Cart_Redesign')) {
                return $item_data;
            }
            if (!empty($cart_item['alena_modifiers']) && is_array($cart_item['alena_modifiers'])) {
                // Quantity arrives as the same selection repeated, so collapse
                // it back into one line with a count rather than printing
                // "טחינה לבנה" four times.
                $rows = [];
                foreach ($cart_item['alena_modifiers'] as $m) {
                    if (!is_array($m)) continue;
                    $key = ($m['group'] ?? '') . '|' . ($m['name'] ?? '') . '|' . ($m['price'] ?? 0);
                    if (!isset($rows[$key])) {
                        $rows[$key] = ['m' => $m, 'qty' => 0];
                    }
                    $rows[$key]['qty']++;
                }
                foreach ($rows as $row) {
                    $m     = $row['m'];
                    $label = (string) ($m['name'] ?? '');
                    if ($row['qty'] > 1) $label .= ' ×' . $row['qty'];
                    if ((float) ($m['price'] ?? 0) > 0) {
                        $label .= ' (+₪' . number_format((float) $m['price'] * $row['qty'], 0) . ')';
                    }
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
                // Hidden meta — used by "Reorder" to reconstruct the cart item with modifiers
                $item->add_meta_data('_alena_modifiers_raw', wp_json_encode($values['alena_modifiers']));
            }
            if (!empty($values['alena_item_note'])) {
                $item->add_meta_data('📝 הערה למנה', (string) $values['alena_item_note']);
                $item->add_meta_data('_alena_item_note_raw', (string) $values['alena_item_note']);
            }
        } catch (\Throwable $e) { /* swallow */ }
    }
}
