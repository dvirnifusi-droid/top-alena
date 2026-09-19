<?php
/**
 * My Account → Orders — app-grade card list (replaces WooCommerce's table).
 */
if (!defined('ABSPATH')) exit;

$account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';

$orders = wc_get_orders([
    'customer_id' => get_current_user_id(),
    'limit'       => 25,
    'orderby'     => 'date',
    'order'       => 'DESC',
]);

// Status → colour bucket (green ok / amber in-progress / red cancelled / grey).
$status_tone = function ($status) {
    if (in_array($status, ['completed'], true)) return 'ok';
    if (in_array($status, ['processing', 'on-hold', 'pending'], true)) return 'work';
    if (in_array($status, ['cancelled', 'failed', 'refunded'], true)) return 'bad';
    return 'muted';
};
?>

<div class="alena-acc-sub" dir="rtl">
  <div class="alena-acc-topbar">
    <a class="alena-dash-back" href="<?php echo esc_url($account_url); ?>"><span class="alena-dash-back-ar">←</span> חזרה לחשבון</a>
  </div>
  <h2 class="alena-acc-sub-title">📦 ההזמנות שלי</h2>

  <?php if (empty($orders)): ?>
    <div class="alena-acc-empty">
      <div class="alena-acc-empty-emoji">🛍️</div>
      <p class="alena-acc-empty-title">עדיין אין הזמנות</p>
      <p class="alena-acc-empty-sub">ההזמנה הראשונה שלך תופיע כאן.</p>
      <a class="alena-acc-empty-cta" href="<?php echo esc_url(function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/'); ?>">לתפריט →</a>
    </div>
  <?php else: ?>
    <div class="alena-orders">
      <?php foreach ($orders as $order):
        $status = $order->get_status();
        $tone   = $status_tone($status);
        $items  = $order->get_item_count();
        $date   = $order->get_date_created();
        $again  = wp_nonce_url(add_query_arg('order_again', $order->get_id(), wc_get_cart_url()), 'woocommerce-order_again');
      ?>
        <div class="alena-order-row">
          <div class="alena-order-row-top">
            <span class="alena-order-num">#<?php echo esc_html($order->get_order_number()); ?></span>
            <span class="alena-order-status alena-order-status-<?php echo esc_attr($tone); ?>"><?php echo esc_html(wc_get_order_status_name($status)); ?></span>
          </div>
          <div class="alena-order-meta">
            <?php echo $date ? esc_html(wc_format_datetime($order, 'j בM Y')) : ''; ?>
            · <?php echo esc_html($items); ?> פריטים
            · <span class="alena-order-total"><?php echo wp_kses_post($order->get_formatted_order_total()); ?></span>
          </div>
          <div class="alena-order-actions">
            <a class="alena-order-btn alena-order-btn-ghost" href="<?php echo esc_url($order->get_view_order_url()); ?>">צפייה</a>
            <?php if (in_array($status, ['completed', 'processing', 'on-hold'], true)): ?>
              <a class="alena-order-btn alena-order-btn-primary" href="<?php echo esc_url($again); ?>">הזמן שוב ↻</a>
            <?php endif; ?>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
