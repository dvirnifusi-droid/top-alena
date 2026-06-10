<?php
if (!defined('ABSPATH')) exit;

/**
 * Cart UX improvements:
 *   - Sticky mini-cart badge in the header
 *   - "Add ₪X more for free delivery / to reach minimum" notice
 *   - Driver tip (5/10/15/custom) added as a WC fee
 *   - Pretty empty-cart state
 *   - Coupon entry visual polish (CSS only)
 */
class Alena_DZ_Cart_Enhancements {

    const TIP_SESSION_KEY = 'alena_driver_tip';

    public function __construct() {
        add_action('wp_enqueue_scripts',                  [$this, 'enqueue']);
        add_action('wp_footer',                            [$this, 'render_mini_cart_badge']);
        add_action('wp_ajax_alena_dz_minicart',           [$this, 'ajax_minicart']);
        add_action('wp_ajax_nopriv_alena_dz_minicart',    [$this, 'ajax_minicart']);

        // Min-order notice on cart / checkout
        add_action('woocommerce_before_cart',              [$this, 'render_min_notice'], 5);
        add_action('woocommerce_before_checkout_form',     [$this, 'render_min_notice'], 6);

        // Driver tip — main checkout column, after the scheduling section
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_tip_picker'], 50);
        add_action('wp_ajax_alena_dz_set_tip',             [$this, 'ajax_set_tip']);
        add_action('wp_ajax_nopriv_alena_dz_set_tip',      [$this, 'ajax_set_tip']);
        add_action('woocommerce_cart_calculate_fees',      [$this, 'apply_tip_fee']);

        // Empty cart improvement
        add_action('woocommerce_cart_is_empty',            [$this, 'render_empty_cart']);
    }

    public function enqueue() {
        if (!function_exists('is_woocommerce')) return;
        wp_enqueue_style('alena-dz-cart-enhancements', ALENA_DZ_URL . 'assets/cart-enhancements.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-cart-enhancements', ALENA_DZ_URL . 'assets/cart-enhancements.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-dz-cart-enhancements', 'AlenaDZCart', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_dz_cart'),
            'cartUrl' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/',
        ]);
    }

    public function render_mini_cart_badge() {
        if (is_admin()) return;
        $cart_count = function_exists('WC') && WC()->cart ? WC()->cart->get_cart_contents_count() : 0;
        $cart_url   = function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/';
        $cart_total = function_exists('WC') && WC()->cart ? WC()->cart->get_cart_total() : '';
        ?>
        <a id="alena-dz-mini-cart" class="alena-dz-mini-cart<?php echo $cart_count ? ' has-items' : ''; ?>" href="<?php echo esc_url($cart_url); ?>" aria-label="הצגת פריטים">
          <span class="alena-dz-mini-cart-count"><?php echo (int) $cart_count; ?></span>
          <span class="alena-dz-mini-cart-label">הצגת פריטים</span>
          <span class="alena-dz-mini-cart-total"><?php echo wp_kses_post($cart_total); ?></span>
        </a>
        <?php
    }

    public function ajax_minicart() {
        check_ajax_referer('alena_dz_cart', 'nonce');
        if (!function_exists('WC') || !WC()->cart) wp_send_json_error('no_cart', 500);
        wp_send_json_success([
            'count' => WC()->cart->get_cart_contents_count(),
            'total' => WC()->cart->get_cart_total(),
        ]);
    }

    public function render_min_notice() {
        if (!function_exists('WC') || !WC()->cart) return;
        $min = $this->detect_min_for_current_zone();
        if (!$min) return;
        $subtotal = (float) WC()->cart->get_subtotal();
        if ($subtotal >= $min) return;
        $delta = $min - $subtotal;
        printf(
            '<div class="alena-dz-min-notice">🚚 הוסף עוד <strong>₪%s</strong> כדי להגיע למינ׳ ההזמנה לאזור (₪%s)</div>',
            number_format($delta, 0),
            number_format($min, 0)
        );
    }

    private function detect_min_for_current_zone(): float {
        // Best-effort: use the customer's pinned location if available
        if (!function_exists('WC') || !WC()->session) return 0.0;
        $lat = (float) WC()->session->get('alena_pin_lat');
        $lng = (float) WC()->session->get('alena_pin_lng');
        if (!$lat || !$lng) return 0.0;
        if (!class_exists('Alena_DZ_Polygon_Store')) return 0.0;
        $polygon = Alena_DZ_Polygon_Store::find_containing($lat, $lng);
        return $polygon ? (float) ($polygon['min_order'] ?? 0) : 0.0;
    }

    public function render_tip_picker() {
        $current = (float) (function_exists('WC') && WC()->session ? WC()->session->get(self::TIP_SESSION_KEY) : 0);
        $nonce = wp_create_nonce('alena_dz_tip');
        ?>
        <h2 class="alena-co-h">💚 טיפ לשליח</h2>
        <div class="alena-dz-tip">
          <p>השליח יראה את הטיפ לאחר המשלוח ויקבל את הסכום ישירות אליו</p>
          <div class="alena-dz-tip-options">
            <?php foreach ([0, 5, 10, 15] as $amount): ?>
              <button type="button" class="alena-dz-tip-opt<?php echo abs($current - $amount) < 0.01 ? ' active' : ''; ?>"
                      data-amount="<?php echo $amount; ?>"
                      data-nonce="<?php echo esc_attr($nonce); ?>">
                <?php echo $amount === 0 ? 'בלי' : '₪' . $amount; ?>
              </button>
            <?php endforeach; ?>
            <input type="number" min="0" step="1" class="alena-dz-tip-custom" placeholder="אחר…" value="<?php echo $current && !in_array((int)$current, [0,5,10,15], true) ? (int)$current : ''; ?>" data-nonce="<?php echo esc_attr($nonce); ?>" />
          </div>
        </div>
        <?php
    }

    public function ajax_set_tip() {
        check_ajax_referer('alena_dz_tip', 'nonce');
        if (!function_exists('WC') || !WC()->session) wp_send_json_error('no_session', 500);
        $amount = isset($_POST['amount']) ? max(0, (float) $_POST['amount']) : 0;
        $amount = min($amount, 100); // sanity cap
        WC()->session->set(self::TIP_SESSION_KEY, $amount);
        wp_send_json_success(['amount' => $amount]);
    }

    public function apply_tip_fee($cart) {
        if (is_admin() && !defined('DOING_AJAX')) return;
        if (!function_exists('WC') || !WC()->session) return;
        $amount = (float) WC()->session->get(self::TIP_SESSION_KEY);
        if ($amount > 0) {
            $cart->add_fee('טיפ לשליח 💚', $amount, false);
        }
    }

    public function render_empty_cart() {
        $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        ?>
        <div class="alena-dz-empty-cart">
          <div class="alena-dz-empty-icon">🥙</div>
          <h2>הסל שלך ריק</h2>
          <p>אבל יש לנו מנות מדהימות שמחכות לך!</p>
          <a class="alena-dz-empty-cta" href="<?php echo esc_url($shop_url); ?>">להזמין מהתפריט →</a>
        </div>
        <?php
    }
}
