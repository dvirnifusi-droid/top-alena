<?php
/**
 * Custom My Account dashboard — replaces WooCommerce's default.
 *
 * Order of sections:
 *   1. Branded welcome card (greeting + phone)
 *   2. Club widget (Alena_DZ_Club) — points balance / tier / "join the club"
 *   3. Recent orders carousel (Alena_DZ_Recent_Orders)
 *   4. Quick actions (orders, addresses, edit details, logout)
 */
if (!defined('ABSPATH')) exit;

$current_user = wp_get_current_user();
$display_name = $current_user->display_name ?: 'לקוח';
$phone        = get_user_meta($current_user->ID, 'billing_phone', true);
$first_name   = get_user_meta($current_user->ID, 'billing_first_name', true);
if ($first_name) $display_name = $first_name;
?>

<div class="alena-dash" dir="rtl">

  <?php
  // Way back to the menu. Without it the account page was a dead end on a
  // phone — the bottom nav that used to carry "תפריט" is gone.
  $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
  ?>
  <a class="alena-dash-back" href="<?php echo esc_url($shop_url); ?>">← חזרה לתפריט</a>

  <div class="alena-dash-welcome">
    <div class="alena-dash-welcome-emoji">👋</div>
    <div>
      <h2 class="alena-dash-welcome-title">שלום <?php echo esc_html($display_name); ?>!</h2>
      <?php if ($phone): ?>
        <p class="alena-dash-welcome-sub">מחובר עם <span dir="ltr"><?php echo esc_html($phone); ?></span></p>
      <?php endif; ?>
    </div>
  </div>

  <?php do_action('woocommerce_account_dashboard'); ?>

  <h3 class="alena-dash-section-title">פעולות מהירות</h3>
  <div class="alena-dash-actions">
    <a class="alena-dash-action" href="<?php echo esc_url(wc_get_account_endpoint_url('orders')); ?>">
      <span class="alena-dash-action-emoji">📦</span>
      <strong>ההזמנות שלי</strong>
      <span class="alena-dash-action-sub">היסטוריה מלאה</span>
    </a>
    <a class="alena-dash-action" href="<?php echo esc_url(wc_get_account_endpoint_url('edit-address')); ?>">
      <span class="alena-dash-action-emoji">📍</span>
      <strong>כתובות שמורות</strong>
      <span class="alena-dash-action-sub">משלוח וחיוב</span>
    </a>
    <a class="alena-dash-action" href="<?php echo esc_url(wc_get_account_endpoint_url('edit-account')); ?>">
      <span class="alena-dash-action-emoji">⚙️</span>
      <strong>פרטי חשבון</strong>
      <span class="alena-dash-action-sub">שם, אימייל, סיסמה</span>
    </a>
    <a class="alena-dash-action alena-dash-action-logout" href="<?php echo esc_url(wc_logout_url(wc_get_page_permalink('myaccount'))); ?>">
      <span class="alena-dash-action-emoji">🚪</span>
      <strong>התנתקות</strong>
      <span class="alena-dash-action-sub">להתחבר עם טלפון אחר</span>
    </a>
  </div>

</div>
