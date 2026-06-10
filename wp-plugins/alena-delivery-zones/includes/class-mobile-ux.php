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
        </nav>
        <?php
    }
}
