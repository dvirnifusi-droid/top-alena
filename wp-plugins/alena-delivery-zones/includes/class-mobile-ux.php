<?php
if (!defined('ABSPATH')) exit;

/**
 * Mobile-only enhancements:
 *   - Bottom navigation bar (Menu / Cart / My Account)
 *   - Floating WhatsApp share button on product modal (CSS only)
 */
class Alena_DZ_Mobile_UX {

    public function __construct() {
        // Bottom nav removed 2026-08-15 at the owner's request. Every entry had
        // somewhere better to live: the cart already floats into view as soon as
        // something is added, the menu is the page itself, and the account link
        // moved up beside the club greeting. What was left was a permanent bar
        // taking a strip of a phone screen to duplicate them.
        // add_action('wp_footer', [$this, 'render_bottom_nav']);
    }

    public function render_bottom_nav() {
        if (is_admin()) return;
        $shop_url    = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $home_url    = home_url('/');
        $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';
        ?>
        <nav class="alena-dz-bottom-nav" aria-label="ניווט מהיר">
          <a href="<?php echo esc_url($shop_url); ?>" class="alena-dz-bn-item">
            <span class="alena-dz-bn-icon">🍽️</span>
            <span class="alena-dz-bn-label">תפריט</span>
          </a>
          <a href="<?php echo esc_url($home_url); ?>" class="alena-dz-bn-item">
            <span class="alena-dz-bn-icon">🏠</span>
            <span class="alena-dz-bn-label">בית</span>
          </a>
          <a href="<?php echo esc_url($account_url); ?>" class="alena-dz-bn-item">
            <span class="alena-dz-bn-icon">👤</span>
            <span class="alena-dz-bn-label">איזור אישי</span>
          </a>
          <?php
          // The cart was the one thing missing from the bar that reaches the
          // thumb — it lived only in the header, which is now hidden on phones.
          $count = (function_exists('WC') && WC()->cart) ? WC()->cart->get_cart_contents_count() : 0;
          ?>
          <a href="<?php echo esc_url(wc_get_cart_url()); ?>"
             class="alena-dz-bn-item alena-dz-bn-cart<?php echo $count ? ' has-items' : ''; ?>"
             id="alena-dz-bn-cart">
            <span class="alena-dz-bn-icon">🛒<?php if ($count): ?><b class="alena-dz-bn-badge"><?php echo (int) $count; ?></b><?php endif; ?></span>
            <span class="alena-dz-bn-label">הסל שלי</span>
          </a>
        </nav>
        <?php
    }
}
