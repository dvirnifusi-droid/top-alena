<?php
if (!defined('ABSPATH')) exit;

/**
 * Mobile-only enhancements:
 *   - Bottom navigation bar (Menu / Cart / My Account)
 *   - Floating WhatsApp share button on product modal (CSS only)
 */
class Alena_DZ_Mobile_UX {

    public function __construct() {
        add_action('wp_footer', [$this, 'render_bottom_nav']);
    }

    public function render_bottom_nav() {
        if (is_admin()) return;
        $shop_url    = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $cart_url    = function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/';
        $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';
        $count       = function_exists('WC') && WC()->cart ? (int) WC()->cart->get_cart_contents_count() : 0;
        ?>
        <nav class="alena-dz-bottom-nav" aria-label="ניווט מהיר">
          <a href="<?php echo esc_url($shop_url); ?>" class="alena-dz-bn-item">
            <span class="alena-dz-bn-icon">🍽️</span>
            <span class="alena-dz-bn-label">תפריט</span>
          </a>
          <a href="<?php echo esc_url($cart_url); ?>" class="alena-dz-bn-item alena-dz-bn-cart">
            <span class="alena-dz-bn-icon">🛒</span>
            <span class="alena-dz-bn-label">סל</span>
            <?php if ($count > 0): ?>
              <span class="alena-dz-bn-badge"><?php echo $count; ?></span>
            <?php endif; ?>
          </a>
          <a href="<?php echo esc_url($account_url); ?>" class="alena-dz-bn-item">
            <span class="alena-dz-bn-icon">👤</span>
            <span class="alena-dz-bn-label">איזור אישי</span>
          </a>
        </nav>
        <?php
    }
}
