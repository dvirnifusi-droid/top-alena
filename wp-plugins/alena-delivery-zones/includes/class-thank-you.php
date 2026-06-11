<?php
if (!defined('ABSPATH')) exit;

/**
 * Custom WooCommerce thank-you page — brand-matched + big order number,
 * estimated delivery time from hours engine, share button, "back to shop".
 */
class Alena_DZ_Thank_You {

    public function __construct() {
        add_action('woocommerce_thankyou', [$this, 'render'], 5);
        // Hide WC's default order details (we render our own)
        remove_action('woocommerce_thankyou', 'woocommerce_order_details_table', 10);
    }

    public function render($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return;

        $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $is_pickup = get_post_meta($order_id, '_alena_fulfillment', true) === 'pickup';

        // ETA per fulfillment type, from the configurable option
        $eta_cfg  = get_option('alena_cart_eta', []);
        $svc      = $is_pickup ? 'pickup' : 'delivery';
        $eta_min  = is_array($eta_cfg) && isset($eta_cfg[$svc . '_min']) ? (int) $eta_cfg[$svc . '_min'] : ($is_pickup ? 15 : 35);
        $eta_max  = is_array($eta_cfg) && isset($eta_cfg[$svc . '_max']) ? (int) $eta_cfg[$svc . '_max'] : ($is_pickup ? 25 : 50);
        $eta      = $eta_min . '–' . $eta_max . ' דקות';
        try {
            if (class_exists('Alena_DZ_Hours_Engine')) {
                $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
                $status = Alena_DZ_Hours_Engine::get()->status($svc, $now);
                if (!$status['open']) {
                    $eta = $is_pickup ? 'מוכן לאיסוף בשעות הפעילות הבאות' : 'יישלח בשעות הפעילות הבאות';
                }
            }
        } catch (\Throwable $e) { /* default eta */ }

        ?>
        <div class="alena-dz-thank-you">
          <div class="alena-dz-ty-icon">🎉</div>
          <h1 class="alena-dz-ty-title">ההזמנה שלך התקבלה!</h1>
          <p class="alena-dz-ty-thanks">תודה רבה, <?php echo esc_html($order->get_billing_first_name()); ?> 💚<br>קיבלנו את ההזמנה והתחלנו להכין.</p>

          <div class="alena-dz-ty-card">
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label">מס׳ הזמנה</span>
              <span class="alena-dz-ty-value">#<?php echo $order->get_order_number(); ?></span>
            </div>
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label"><?php echo $is_pickup ? 'זמן מוערך לאיסוף' : 'זמן מוערך לקבלה'; ?></span>
              <span class="alena-dz-ty-value"><?php echo esc_html($eta); ?></span>
            </div>
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label">סה״כ</span>
              <span class="alena-dz-ty-value"><?php echo wp_kses_post($order->get_formatted_order_total()); ?></span>
            </div>
            <?php
            if ($is_pickup) {
                echo '<div class="alena-dz-ty-row"><span class="alena-dz-ty-label">איסוף עצמי מ-</span><span class="alena-dz-ty-value">🏠 רוטשילד 104, ראשון לציון</span></div>';
            } else {
                $addr = trim($order->get_shipping_address_1() . ' ' . $order->get_shipping_address_2() . ', ' . $order->get_shipping_city());
                if ($addr && trim($addr, ', ')) {
                    printf(
                        '<div class="alena-dz-ty-row"><span class="alena-dz-ty-label">כתובת משלוח</span><span class="alena-dz-ty-value">%s</span></div>',
                        esc_html($addr)
                    );
                }
            }
            ?>
          </div>

          <div class="alena-dz-ty-items">
            <h3>מה הזמנת</h3>
            <?php foreach ($order->get_items() as $item): ?>
              <div class="alena-dz-ty-item">
                <span class="alena-dz-ty-item-qty"><?php echo (int) $item->get_quantity(); ?>x</span>
                <span class="alena-dz-ty-item-name"><?php echo esc_html($item->get_name()); ?></span>
                <span class="alena-dz-ty-item-price"><?php echo wp_kses_post($order->get_formatted_line_subtotal($item)); ?></span>
              </div>
            <?php endforeach; ?>
          </div>

          <div class="alena-dz-ty-cta-row">
            <a class="alena-dz-ty-btn primary" href="<?php echo esc_url($shop_url); ?>">להזמין עוד מנה</a>
            <button type="button" class="alena-dz-ty-btn" id="alena-dz-share-order"
                    data-share-text="<?php echo esc_attr('הזמנתי מ-עלינא בפיתה — הזמנה #' . $order->get_order_number()); ?>"
                    data-share-url="<?php echo esc_attr(home_url()); ?>">
              שתף ב-WhatsApp 💬
            </button>
          </div>
        </div>
        <script>
        (function () {
          const btn = document.getElementById('alena-dz-share-order');
          if (!btn) return;
          btn.addEventListener('click', function () {
            const text = encodeURIComponent(btn.dataset.shareText + ' ' + btn.dataset.shareUrl);
            window.open('https://wa.me/?text=' + text, '_blank');
          });
        })();
        </script>
        <?php
    }
}
