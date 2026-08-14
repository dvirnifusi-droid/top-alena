<?php
if (!defined('ABSPATH')) exit;

/**
 * Sticky top navigation bar — Pizza-Ninja-style header.
 *
 * Right (RTL start):  logo + brand name (links home)
 * Middle:             nav items (בית · תפריט · הסל שלי · אזור אישי)
 * Left (RTL end):     cart pill with item count + total
 *
 * Server-renders count/total; the existing self-heal in cart-enhancements.js
 * refreshes both via AJAX on every page load so they never go stale.
 */
class Alena_DZ_Top_Nav {

    public function __construct() {
        add_action('wp_body_open', [$this, 'render']);
        // Fallback for themes that don't emit wp_body_open
        add_action('wp_footer',    [$this, 'render_fallback'], 1);
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);
    }

    public function enqueue() {
        wp_enqueue_style('alena-dz-top-nav', ALENA_DZ_URL . 'assets/top-nav.css', [], ALENA_DZ_VERSION);
    }

    private static $rendered = false;

    public function render() {
        if (self::$rendered) return;
        if (is_admin()) return;
        self::$rendered = true;

        $home_url    = home_url('/');
        $shop_url    = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $cart_url    = function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/';
        $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';

        $cart_count = function_exists('WC') && WC()->cart ? WC()->cart->get_cart_contents_count() : 0;
        $cart_total = function_exists('WC') && WC()->cart ? WC()->cart->get_cart_total() : '';

        $logo_url = get_site_icon_url(96);
        if (!$logo_url) {
            // Inline SVG fallback — green "ע" mark
            $logo_html = '<span class="alena-tn-logo-mark" aria-hidden="true">ע</span>';
        } else {
            $logo_html = '<img src="' . esc_url($logo_url) . '" alt="" class="alena-tn-logo-img" />';
        }
        ?>
        <header class="alena-tn" role="banner">
          <div class="alena-tn-inner">

            <a href="<?php echo esc_url($home_url); ?>" class="alena-tn-brand" aria-label="עלינא — דף הבית">
              <?php echo $logo_html; ?>
              <span class="alena-tn-brand-name">עלינא</span>
            </a>

            <nav class="alena-tn-nav" aria-label="ראשי">
              <a href="<?php echo esc_url($home_url); ?>" class="alena-tn-link<?php echo is_front_page() ? ' is-active' : ''; ?>">
                <span class="alena-tn-link-icon" aria-hidden="true">🏠</span>
                <span class="alena-tn-link-text">בית</span>
              </a>
              <a href="<?php echo esc_url($shop_url); ?>" class="alena-tn-link<?php echo (function_exists('is_shop') && is_shop()) ? ' is-active' : ''; ?>">
                <span class="alena-tn-link-icon" aria-hidden="true">📋</span>
                <span class="alena-tn-link-text">תפריט</span>
              </a>
              <a href="<?php echo esc_url($cart_url); ?>" class="alena-tn-link<?php echo (function_exists('is_cart') && is_cart()) ? ' is-active' : ''; ?>">
                <span class="alena-tn-link-icon" aria-hidden="true">🛒</span>
                <span class="alena-tn-link-text">הסל שלי</span>
                <?php if ($cart_count > 0): ?>
                <span class="alena-tn-link-badge alena-dz-mini-cart-count"><?php echo (int) $cart_count; ?></span>
                <?php else: ?>
                <span class="alena-tn-link-badge alena-dz-mini-cart-count" style="display:none">0</span>
                <?php endif; ?>
              </a>
              <a href="<?php echo esc_url($account_url); ?>" class="alena-tn-link<?php echo (function_exists('is_account_page') && is_account_page()) ? ' is-active' : ''; ?>">
                <span class="alena-tn-link-icon" aria-hidden="true">👤</span>
                <span class="alena-tn-link-text">אזור אישי</span>
              </a>
            </nav>

            <a href="<?php echo esc_url($cart_url); ?>" class="alena-tn-cart-pill <?php echo $cart_count ? 'has-items' : ''; ?>" aria-label="לסל הקניות">
              <span class="alena-tn-cart-pill-count alena-dz-mini-cart-count"><?php echo (int) $cart_count; ?></span>
              <span class="alena-tn-cart-pill-total alena-dz-mini-cart-total"><?php echo wp_kses_post($cart_total); ?></span>
            </a>
          </div>
        </header>
        <div class="alena-tn-spacer" aria-hidden="true"></div>
        <?php
    }

    public function render_fallback() {
        // If the theme doesn't fire wp_body_open, render at top of footer (then position:fixed)
        if (self::$rendered) return;
        $this->render();
    }
}
