<?php
/**
 * My Account → Addresses — styled cards (replaces WooCommerce's plain columns).
 */
if (!defined('ABSPATH')) exit;

$account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';
$customer_id = get_current_user_id();

$get_addresses = apply_filters('woocommerce_my_account_get_addresses', [
    'billing'  => __('Billing address', 'woocommerce'),
    'shipping' => __('Shipping address', 'woocommerce'),
], $customer_id);

// Friendlier Hebrew labels for a delivery brand.
$labels = [
    'shipping' => ['title' => 'כתובת למשלוח', 'emoji' => '🛵'],
    'billing'  => ['title' => 'פרטי חיוב',     'emoji' => '🧾'],
];

$oldcol = 1;
?>

<div class="alena-acc-sub" dir="rtl">
  <div class="alena-acc-topbar">
    <a class="alena-dash-back" href="<?php echo esc_url($account_url); ?>"><span class="alena-dash-back-ar">←</span> חזרה לחשבון</a>
  </div>
  <h2 class="alena-acc-sub-title">📍 כתובות שמורות</h2>
  <p class="alena-acc-sub-note">הכתובות נשמרות וממלאות את פרטי המשלוח אוטומטית בהזמנה הבאה.</p>

  <div class="alena-addr-list">
    <?php foreach ($get_addresses as $name => $title):
      $address = wc_get_account_formatted_address($name);
      $meta    = $labels[$name] ?? ['title' => $title, 'emoji' => '📍'];
      $edit    = wc_get_account_endpoint_url('edit-address/' . $name);
    ?>
      <div class="alena-addr-card<?php echo $address ? '' : ' is-empty'; ?>">
        <div class="alena-addr-head">
          <span class="alena-addr-emoji"><?php echo esc_html($meta['emoji']); ?></span>
          <strong class="alena-addr-title"><?php echo esc_html($meta['title']); ?></strong>
        </div>
        <div class="alena-addr-body">
          <?php echo $address ? wp_kses_post($address) : '<span class="alena-addr-empty">עדיין לא הוגדרה כתובת</span>'; ?>
        </div>
        <a class="alena-addr-btn" href="<?php echo esc_url($edit); ?>">
          <?php echo $address ? 'עריכה' : 'הוספת כתובת +'; ?>
        </a>
      </div>
    <?php endforeach; ?>
  </div>
</div>
