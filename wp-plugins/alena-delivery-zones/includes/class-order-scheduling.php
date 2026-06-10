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

        // Build a date list of the next 7 days (with Hebrew weekday names)
        $weekdays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        $months   = ['','ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
        $dates = [];
        for ($i = 0; $i < 7; $i++) {
            $d = $now->modify('+' . $i . ' day');
            $label = $i === 0 ? 'היום' : ($i === 1 ? 'מחר' : 'יום ' . $weekdays[(int) $d->format('w')]);
            $label .= ', ' . (int) $d->format('d') . ' ' . $months[(int) $d->format('n')];
            $dates[] = ['value' => $d->format('Y-m-d'), 'label' => $label];
        }

        // Time slots per day — 15-min intervals from 11:00 to 23:00
        // (the actual validation against open hours happens later)
        $slots = [];
        for ($mins = 11 * 60; $mins <= 23 * 60; $mins += 15) {
            $h = intdiv($mins, 60); $m = $mins % 60;
            $slots[] = sprintf('%02d:%02d', $h, $m);
        }

        // Default ETA from the cart-redesign config (or 35-50 dz fallback)
        $eta = '35–50 דק׳';
        if (class_exists('Alena_DZ_Cart_Redesign')) {
            $eta = (new Alena_DZ_Cart_Redesign())->get_eta('delivery');
        }
        ?>
        <div class="alena-dz-schedule">
          <h3>מתי לקבל את ההזמנה? ⏰</h3>
          <div class="alena-dz-sched-tabs">
            <label class="alena-dz-sched-tab">
              <input type="radio" name="alena_schedule" value="now" checked />
              <span>
                <strong>הזמנה מיידית</strong>
                <small><?php echo esc_html($eta); ?></small>
              </span>
            </label>
            <label class="alena-dz-sched-tab">
              <input type="radio" name="alena_schedule" value="later" />
              <span>
                <strong>הזמנה עתידית</strong>
                <small>בחירת יום ושעה</small>
              </span>
            </label>
          </div>
          <div class="alena-dz-sched-picker" style="display:none">
            <div class="alena-dz-sched-row">
              <label>תאריך</label>
              <select name="alena_schedule_date" id="alena-dz-sched-date">
                <?php foreach ($dates as $d): ?>
                  <option value="<?php echo esc_attr($d['value']); ?>"><?php echo esc_html($d['label']); ?></option>
                <?php endforeach; ?>
              </select>
            </div>
            <div class="alena-dz-sched-row">
              <label>שעה</label>
              <select name="alena_schedule_hhmm" id="alena-dz-sched-hhmm">
                <?php foreach ($slots as $s): ?>
                  <option value="<?php echo esc_attr($s); ?>"><?php echo esc_html($s); ?></option>
                <?php endforeach; ?>
              </select>
            </div>
            <p class="alena-dz-sched-hint">פתוח א-ה 11:00–23:00 · ו׳ 11:00–15:00 · מוצ״ש מצאת שבת</p>
          </div>
        </div>
        <script>
        (function () {
          const radios = document.querySelectorAll('input[name="alena_schedule"]');
          const picker = document.querySelector('.alena-dz-sched-picker');
          function sync() {
            const chosen = document.querySelector('input[name="alena_schedule"]:checked')?.value;
            picker.style.display = chosen === 'later' ? 'block' : 'none';
          }
          radios.forEach(r => r.addEventListener('change', sync));
          sync();
        })();
        </script>
        <?php
    }

    public function save_meta($order_id) {
        $when = $_POST['alena_schedule'] ?? 'now';
        if ($when === 'later' && !empty($_POST['alena_schedule_date']) && !empty($_POST['alena_schedule_hhmm'])) {
            $when_iso = sanitize_text_field(wp_unslash($_POST['alena_schedule_date']))
                . 'T'
                . sanitize_text_field(wp_unslash($_POST['alena_schedule_hhmm']));
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
