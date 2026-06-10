<?php
if (!defined('ABSPATH')) exit;

/**
 * Lets the customer schedule an order for later (e.g. tomorrow at 13:00).
 * Renders a "When?" picker on the checkout page; saves the chosen time as
 * order meta and shows it to the kitchen on the order detail screen.
 */
class Alena_DZ_Order_Scheduling {

    public function __construct() {
        add_action('woocommerce_review_order_before_payment',     [$this, 'render_picker']);
        add_action('woocommerce_checkout_update_order_meta',      [$this, 'save_meta']);
        add_action('woocommerce_admin_order_data_after_billing_address', [$this, 'show_in_admin']);
    }

    public function render_picker() {
        $tz = new DateTimeZone('Asia/Jerusalem');
        $now = new DateTimeImmutable('now', $tz);
        // 30-minute slots from now+30min through next 24h
        ?>
        <div class="alena-dz-schedule">
          <h3>מתי לקבל את ההזמנה? ⏰</h3>
          <div class="alena-dz-sched-tabs">
            <label class="alena-dz-sched-tab">
              <input type="radio" name="alena_schedule" value="now" checked />
              <span>הקדם האפשרי</span>
            </label>
            <label class="alena-dz-sched-tab">
              <input type="radio" name="alena_schedule" value="later" />
              <span>תזמן למועד אחר</span>
            </label>
          </div>
          <div class="alena-dz-sched-picker" style="display:none">
            <input type="datetime-local" name="alena_schedule_time" id="alena-dz-sched-time"
                   min="<?php echo esc_attr($now->modify('+30 minutes')->format('Y-m-d\TH:i')); ?>"
                   max="<?php echo esc_attr($now->modify('+7 days')->format('Y-m-d\TH:i')); ?>"
                   step="900" />
            <p class="alena-dz-sched-hint">פתוח א-ה 11:00–23:00 · ו׳ 11:00–15:00 · מוצ״ש מהוצאת שבת</p>
          </div>
        </div>
        <script>
        (function () {
          const tabs = document.querySelectorAll('input[name="alena_schedule"]');
          const picker = document.querySelector('.alena-dz-sched-picker');
          tabs.forEach(t => t.addEventListener('change', () => {
            picker.style.display = t.value === 'later' && t.checked ? 'block' : (document.querySelector('input[name="alena_schedule"]:checked').value === 'later' ? 'block' : 'none');
          }));
        })();
        </script>
        <?php
    }

    public function save_meta($order_id) {
        $when = $_POST['alena_schedule'] ?? 'now';
        if ($when === 'later' && !empty($_POST['alena_schedule_time'])) {
            $when_iso = sanitize_text_field(wp_unslash($_POST['alena_schedule_time']));
            update_post_meta($order_id, '_alena_scheduled_for', $when_iso);
        } else {
            update_post_meta($order_id, '_alena_scheduled_for', 'asap');
        }
    }

    public function show_in_admin($order) {
        $when = get_post_meta($order->get_id(), '_alena_scheduled_for', true);
        if (!$when || $when === 'asap') return;
        try {
            $dt = new DateTimeImmutable($when, new DateTimeZone('Asia/Jerusalem'));
            $human = $dt->format('d/m/Y H:i');
            echo '<p><strong>⏰ הזמנה מתוזמנת ל:</strong> ' . esc_html($human) . '</p>';
        } catch (\Throwable $e) { /* ignore */ }
    }
}
