<?php
if (!defined('ABSPATH')) exit;

/**
 * Completely redesigns the WooCommerce cart page:
 *   - 2-column layout (items on the right, sticky summary on the left)
 *   - Live ETA from the Hours Engine (configurable min/max minutes)
 *   - Item upsell row of one-click adds
 *   - Modifier tags shown inline under each item
 *   - Trust signals row (rating, kosher, open hours)
 *   - Loyalty points preview (placeholder until TOPALENA Club is wired)
 *   - Mega green checkout button
 *
 * Owner can tune ETA + upsell list under "אזורי חלוקה → סיכום הזמנה".
 */
class Alena_DZ_Cart_Redesign {

    const ETA_OPTION   = 'alena_cart_eta'; // {delivery_min,delivery_max,pickup_min,pickup_max}
    const UPSELL_OPTION = 'alena_cart_upsell'; // [product_id, product_id, ...]

    public function __construct() {
        add_action('wp_enqueue_scripts',           [$this, 'enqueue']);
        add_action('woocommerce_before_cart',      [$this, 'open_layout'], 1);
        add_action('woocommerce_after_cart',       [$this, 'close_layout'], 999);
        add_action('woocommerce_before_cart_collaterals', [$this, 'inject_summary_extras']);
        add_filter('woocommerce_cart_item_name',   [$this, 'append_modifier_tags'], 10, 3);

        // Admin settings
        add_action('admin_menu',                       [$this, 'menu'], 30);
        add_action('admin_post_alena_dz_save_cart_cfg', [$this, 'save_settings']);
    }

    public function enqueue() {
        if (!function_exists('is_cart') || !is_cart()) return;
        wp_enqueue_style('alena-dz-cart-redesign', ALENA_DZ_URL . 'assets/cart-redesign.css', ['alena-dz-cart-enhancements'], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-cart-redesign', ALENA_DZ_URL . 'assets/cart-redesign.js', ['jquery'], ALENA_DZ_VERSION, true);
    }

    /* ===========================================================
       Frontend rendering
       =========================================================== */

    public function open_layout() {
        echo '<div class="alena-cart-wrap">';
        echo '<div class="alena-cart-main">';
        $this->render_header();
        $this->render_trust_row();
    }

    public function close_layout() {
        echo '</div>'; // .alena-cart-main
        echo '</div>'; // .alena-cart-wrap
    }

    public function inject_summary_extras() {
        // Runs just before the cart totals; we use it to inject the ETA + loyalty card
        $eta = $this->get_eta('delivery');
        $points = $this->estimate_points();
        ?>
        <div class="alena-summary-extras">
          <div class="alena-summary-eta">
            <span class="alena-summary-eta-icon">⏱️</span>
            <div>
              <div class="alena-summary-eta-label">זמן הגעה משוער</div>
              <div class="alena-summary-eta-value"><?php echo esc_html($eta); ?></div>
            </div>
          </div>
          <?php if ($points > 0): ?>
          <div class="alena-summary-points">
            <span class="alena-summary-eta-icon">🎁</span>
            <div>
              <div class="alena-summary-eta-label">תרוויח מההזמנה</div>
              <div class="alena-summary-eta-value"><?php echo (int) $points; ?> נקודות מועדון</div>
            </div>
          </div>
          <?php endif; ?>
        </div>
        <?php
        $this->render_upsell_row();
    }

    private function render_header() {
        echo '<div class="alena-cart-header">';
        echo '<h1>סל הקניות שלי</h1>';
        echo '<p class="alena-cart-sub">בדוק את ההזמנה לפני המשך לתשלום ✓</p>';
        echo '</div>';
    }

    private function render_trust_row() {
        $hours_label = '🕒 נסגרים ב-23:00';
        try {
            if (class_exists('Alena_DZ_Hours_Engine')) {
                $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
                $s   = Alena_DZ_Hours_Engine::get()->status('delivery', $now);
                $hours_label = $s['open'] ? '🟢 פתוחים עכשיו' : '🔴 סגורים כרגע';
            }
        } catch (\Throwable $e) { /* default label */ }

        echo '<div class="alena-trust-row">';
        echo '<span class="alena-trust-pill">⭐ <strong>4.9</strong> · אהוב על אלפי לקוחות</span>';
        echo '<span class="alena-trust-pill">✅ כשר למהדרין</span>';
        echo '<span class="alena-trust-pill">' . esc_html($hours_label) . '</span>';
        echo '</div>';
    }

    private function render_upsell_row() {
        $ids = $this->get_upsell_ids();
        if (!$ids) return;
        echo '<div class="alena-upsell">';
        echo '<h3>שכחת משהו? 👀</h3>';
        echo '<div class="alena-upsell-row">';
        foreach ($ids as $pid) {
            $product = wc_get_product($pid);
            if (!$product || !$product->is_visible()) continue;
            $img = $product->get_image('woocommerce_thumbnail', ['class' => 'alena-upsell-img']);
            $url = '?add-to-cart=' . $pid;
            ?>
            <div class="alena-upsell-card">
              <?php echo $img; ?>
              <div class="alena-upsell-meta">
                <span class="alena-upsell-name"><?php echo esc_html($product->get_name()); ?></span>
                <span class="alena-upsell-price"><?php echo $product->get_price_html(); ?></span>
              </div>
              <a class="alena-upsell-add" href="<?php echo esc_url($url); ?>" aria-label="הוסף לסל">+</a>
            </div>
            <?php
        }
        echo '</div>';
        echo '</div>';
    }

    public function append_modifier_tags($name, $cart_item, $cart_item_key) {
        if (empty($cart_item['alena_modifiers']) || !is_array($cart_item['alena_modifiers'])) return $name;
        $tags = '';
        foreach ($cart_item['alena_modifiers'] as $m) {
            if (!is_array($m) || empty($m['name'])) continue;
            $tags .= '<span class="alena-cart-mod-tag">' . esc_html($m['name']) . '</span>';
        }
        if ($tags) {
            $name .= '<div class="alena-cart-mod-tags">' . $tags . '</div>';
        }
        if (!empty($cart_item['alena_item_note'])) {
            $name .= '<div class="alena-cart-note">📝 ' . esc_html($cart_item['alena_item_note']) . '</div>';
        }
        return $name;
    }

    /* ===========================================================
       Config helpers
       =========================================================== */

    private function get_eta_config(): array {
        $defaults = ['delivery_min' => 40, 'delivery_max' => 60, 'pickup_min' => 15, 'pickup_max' => 25];
        $stored = get_option(self::ETA_OPTION, []);
        return is_array($stored) ? array_merge($defaults, $stored) : $defaults;
    }

    public function get_eta(string $service = 'delivery'): string {
        $cfg = $this->get_eta_config();
        $min = (int) ($cfg[$service . '_min'] ?? 35);
        $max = (int) ($cfg[$service . '_max'] ?? 50);
        return $min . '–' . $max . ' דקות';
    }

    private function get_upsell_ids(): array {
        $raw = (string) get_option(self::UPSELL_OPTION, '');
        if (!$raw) return [];
        return array_map('intval', array_filter(array_map('trim', explode(',', $raw))));
    }

    private function estimate_points(): int {
        if (!function_exists('WC') || !WC()->cart) return 0;
        return (int) floor((float) WC()->cart->get_subtotal());
    }

    /* ===========================================================
       Admin
       =========================================================== */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'סיכום הזמנה',
            'סיכום הזמנה',
            'manage_woocommerce',
            'alena-cart-config',
            [$this, 'render_admin']
        );
    }

    public function render_admin() {
        $cfg = $this->get_eta_config();
        $upsell = (string) get_option(self::UPSELL_OPTION, '');
        ?>
        <div class="wrap" dir="rtl">
          <h1>סיכום הזמנה — הגדרות</h1>
          <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="alena_dz_save_cart_cfg" />
            <?php wp_nonce_field('alena_dz_cart_cfg'); ?>

            <h2>זמן הגעה משוער (דקות)</h2>
            <table class="form-table">
              <tr>
                <th>משלוח: מ-</th>
                <td><input type="number" min="0" name="delivery_min" value="<?php echo esc_attr($cfg['delivery_min']); ?>" /> דק׳</td>
              </tr>
              <tr>
                <th>משלוח: עד</th>
                <td><input type="number" min="0" name="delivery_max" value="<?php echo esc_attr($cfg['delivery_max']); ?>" /> דק׳</td>
              </tr>
              <tr>
                <th>איסוף: מ-</th>
                <td><input type="number" min="0" name="pickup_min" value="<?php echo esc_attr($cfg['pickup_min']); ?>" /> דק׳</td>
              </tr>
              <tr>
                <th>איסוף: עד</th>
                <td><input type="number" min="0" name="pickup_max" value="<?php echo esc_attr($cfg['pickup_max']); ?>" /> דק׳</td>
              </tr>
            </table>

            <h2>מוצרי Upsell ("שכחת משהו?")</h2>
            <p class="description">רשימת מזהים של מוצרים שיוצעו בסל, מופרדים בפסיק. לדוגמה: <code>2455,2467,2491</code></p>
            <input type="text" name="upsell" value="<?php echo esc_attr($upsell); ?>" style="width:520px" />

            <p><?php submit_button('שמור הגדרות'); ?></p>
          </form>
        </div>
        <?php
    }

    public function save_settings() {
        if (!current_user_can('manage_woocommerce')) wp_die('forbidden');
        check_admin_referer('alena_dz_cart_cfg');
        $cfg = [
            'delivery_min' => max(0, (int) ($_POST['delivery_min'] ?? 35)),
            'delivery_max' => max(0, (int) ($_POST['delivery_max'] ?? 50)),
            'pickup_min'   => max(0, (int) ($_POST['pickup_min']   ?? 15)),
            'pickup_max'   => max(0, (int) ($_POST['pickup_max']   ?? 25)),
        ];
        update_option(self::ETA_OPTION, $cfg);
        update_option(self::UPSELL_OPTION, sanitize_text_field(wp_unslash($_POST['upsell'] ?? '')));
        wp_safe_redirect(admin_url('admin.php?page=alena-cart-config&updated=1'));
        exit;
    }
}
