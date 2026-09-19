<?php
/**
 * Custom My Account dashboard — replaces WooCommerce's default.
 *
 * App-grade layout:
 *   1. Back-to-menu pill
 *   2. Profile hero (monogram avatar + greeting + connected status/phone chip)
 *   3. Club widget + recent-orders carousel (hooked widgets)
 *   4. Quick-action tiles (orders, addresses, details, logout)
 */
if (!defined('ABSPATH')) exit;

$current_user = wp_get_current_user();
$display_name = $current_user->display_name ?: 'לקוח';
$phone        = get_user_meta($current_user->ID, 'billing_phone', true);
$first_name   = get_user_meta($current_user->ID, 'billing_first_name', true);
if ($first_name) $display_name = $first_name;

// Monogram: first real letter of the name (Hebrew-safe), for the avatar.
$initial = mb_strtoupper(mb_substr(trim($display_name), 0, 1, 'UTF-8'), 'UTF-8');
if ($initial === '' ) $initial = 'ע';

$shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
?>

<div class="alena-dash" dir="rtl">

  <div class="alena-acc-topbar">
    <a class="alena-dash-back" href="<?php echo esc_url($shop_url); ?>">
      <span class="alena-dash-back-ar">←</span> חזרה לתפריט
    </a>
  </div>

  <div class="alena-acc-hero">
    <div class="alena-acc-hero-glow" aria-hidden="true"></div>
    <div class="alena-acc-avatar"><?php echo esc_html($initial); ?></div>
    <div class="alena-acc-hero-text">
      <h2 class="alena-acc-hero-name">שלום <?php echo esc_html($display_name); ?> 👋</h2>
      <div class="alena-acc-hero-status">
        <span class="alena-acc-dot"></span>
        <span class="alena-acc-hero-status-txt">מחובר<?php if ($phone): ?> · <span dir="ltr"><?php echo esc_html($phone); ?></span><?php endif; ?></span>
      </div>
    </div>
  </div>

  <?php do_action('woocommerce_account_dashboard'); ?>

  <h3 class="alena-dash-section-title">פעולות מהירות</h3>
  <div class="alena-acc-grid">
    <a class="alena-acc-tile" href="<?php echo esc_url(wc_get_account_endpoint_url('orders')); ?>">
      <span class="alena-acc-tile-ic alena-acc-ic-orders">📦</span>
      <span class="alena-acc-tile-txt">
        <strong>ההזמנות שלי</strong>
        <span class="alena-acc-tile-sub">היסטוריה מלאה</span>
      </span>
      <span class="alena-acc-tile-chev">‹</span>
    </a>
    <a class="alena-acc-tile" href="<?php echo esc_url(wc_get_account_endpoint_url('edit-address')); ?>">
      <span class="alena-acc-tile-ic alena-acc-ic-addr">📍</span>
      <span class="alena-acc-tile-txt">
        <strong>כתובות שמורות</strong>
        <span class="alena-acc-tile-sub">משלוח וחיוב</span>
      </span>
      <span class="alena-acc-tile-chev">‹</span>
    </a>
    <a class="alena-acc-tile" href="<?php echo esc_url(wc_get_account_endpoint_url('edit-account')); ?>">
      <span class="alena-acc-tile-ic alena-acc-ic-acct">⚙️</span>
      <span class="alena-acc-tile-txt">
        <strong>פרטי חשבון</strong>
        <span class="alena-acc-tile-sub">שם, אימייל, סיסמה</span>
      </span>
      <span class="alena-acc-tile-chev">‹</span>
    </a>
    <a class="alena-acc-tile alena-acc-tile-logout" href="<?php echo esc_url(wc_logout_url(wc_get_page_permalink('myaccount'))); ?>">
      <span class="alena-acc-tile-ic alena-acc-ic-logout">🚪</span>
      <span class="alena-acc-tile-txt">
        <strong>התנתקות</strong>
        <span class="alena-acc-tile-sub">להתחבר עם טלפון אחר</span>
      </span>
      <span class="alena-acc-tile-chev">‹</span>
    </a>
  </div>

</div>
