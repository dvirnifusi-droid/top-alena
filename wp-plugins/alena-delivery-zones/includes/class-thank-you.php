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
        // Fallback to the authoritative shipping method — the meta drifted to
        // 'delivery' on some genuine pickup orders (checkout session bug).
        if (!$is_pickup && function_exists('wc_get_order')) {
            $o_ty = wc_get_order($order_id);
            if ($o_ty) {
                foreach ($o_ty->get_shipping_methods() as $sm) {
                    if (strpos($sm->get_method_id(), 'pickup') !== false) { $is_pickup = true; break; }
                }
            }
        }

        // ETA per fulfillment type, from the configurable option
        $eta_cfg  = get_option('alena_cart_eta', []);
        $svc      = $is_pickup ? 'pickup' : 'delivery';
        $eta_min  = is_array($eta_cfg) && isset($eta_cfg[$svc . '_min']) ? (int) $eta_cfg[$svc . '_min'] : ($is_pickup ? 15 : 40);
        $eta_max  = is_array($eta_cfg) && isset($eta_cfg[$svc . '_max']) ? (int) $eta_cfg[$svc . '_max'] : ($is_pickup ? 25 : 60);
        $eta      = $eta_min . '–' . $eta_max . ' דקות';
        try {
            if (class_exists('Alena_DZ_Hours_Engine')) {
                $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
                $status = Alena_DZ_Hours_Engine::get()->status($svc, $now);
                if (!$status['open']) {
                    // "בשעות הפעילות הבאות" is not a time, and it is the one
                    // thing a customer wants after ordering. Use the engine's
                    // next opening when it can give one.
                    $when = '';
                    foreach (['next_open', 'next_opening', 'opens_at'] as $k) {
                        if (!empty($status[$k])) { $when = (string) $status[$k]; break; }
                    }
                    if ($when !== '') {
                        $eta = ($is_pickup ? 'מוכן לאיסוף החל מ-' : 'יישלח החל מ-') . $when;
                    } else {
                        $eta = $is_pickup ? 'מוכן לאיסוף עם הפתיחה הקרובה' : 'יישלח עם הפתיחה הקרובה';
                    }
                }
            }
        } catch (\Throwable $e) { /* default eta */ }

        ?>
        <div class="alena-dz-thank-you">
          <div class="alena-dz-ty-icon">🎉</div>
          <h1 class="alena-dz-ty-title">ההזמנה שלך התקבלה!</h1>
          <p class="alena-dz-ty-thanks">תודה רבה, <?php echo esc_html($order->get_billing_first_name()); ?> 💚<br>קיבלנו את ההזמנה והתחלנו להכין.</p>

          <?php
          // The tracker used to show "בהכנה" to everyone, always -- a promise of
          // progress the page never kept. It now reads the order's real status.
          //
          // WooCommerce has no "ready" status for a restaurant, so the three
          // steps map onto what a shop actually records:
          //   pending / on-hold  -> received, not yet started
          //   processing         -> being prepared (WooCommerce's working state)
          //   completed          -> ready for collection / delivered
          // Anything cancelled or failed is NOT progress and gets its own line
          // instead of a tracker pretending the food is coming.
          $status = $order->get_status();
          $dead   = in_array($status, ['cancelled', 'failed', 'refunded'], true);
          $stage  = 1;
          if (in_array($status, ['processing'], true))          $stage = 2;
          if (in_array($status, ['completed'], true))            $stage = 3;
          $cls = function ($n) use ($stage) {
              if ($stage > $n) return ' done';
              if ($stage === $n) return ' active';
              return '';
          };
          if ($dead):
          ?>
            <div class="alena-dz-ty-dead">
              <?php echo $status === 'refunded' ? '↩︎ ההזמנה זוכתה.' : '✕ ההזמנה בוטלה.'; ?>
              אם זו טעות, אנחנו כאן: <a class="alena-dz-ty-tel" href="tel:<?php echo esc_attr(Alena_DZ_Store_Controls::phone_intl()); ?>"><?php echo esc_html(Alena_DZ_Store_Controls::phone()); ?></a>
            </div>
          <?php else:
          $ready_at = (int) $order->get_meta('_alena_ready_at');
          $ready_hhmm = '';
          if ($ready_at > 0) {
              try { $d_ = new \DateTime('@' . $ready_at); $d_->setTimezone(new \DateTimeZone('Asia/Jerusalem')); $ready_hhmm = $d_->format('H:i'); }
              catch (\Exception $e) { $ready_hhmm = date('H:i', $ready_at); }
          }
          $mins_left = $ready_at > 0 ? (int) ceil(($ready_at - time()) / 60) : 0;
          ?>
          <div class="alena-dz-ty-tracker" id="alena-track" data-order-status="<?php echo esc_attr($status); ?>">
            <div class="alena-dz-ty-step<?php echo $cls(1); ?>" data-step="1"><span class="alena-dz-ty-dot">✓</span>התקבלה</div>
            <div class="alena-dz-ty-step<?php echo $cls(2); ?>" data-step="2"><span class="alena-dz-ty-dot">👨‍🍳</span>בהכנה</div>
            <div class="alena-dz-ty-step<?php echo $cls(3); ?>" data-step="3"><span class="alena-dz-ty-dot"><?php echo $is_pickup ? '🏠' : '🚚'; ?></span><?php echo $is_pickup ? 'מוכן לאיסוף' : 'נמסר'; ?></div>
          </div>
          <?php
          // Restaurant-confirmed ready time (set by the owner in TOP ALENA). When
          // present it beats the generic ETA range — it is a real promise. The JS
          // poller below keeps it live without a full reload.
          $banner_show = ($ready_at > 0 && $stage < 3);
          ?>
          <div id="alena-track-banner" style="<?php echo $banner_show ? '' : 'display:none;'; ?>background:linear-gradient(135deg,#1f7a4d,#2a9967);color:#fff;border-radius:16px;padding:14px 16px;margin:14px 0;text-align:center;font-weight:700;font-size:15px;box-shadow:0 6px 18px rgba(31,122,77,.35)">
            <span id="alena-track-main"><?php
              if ($mins_left > 0) echo esc_html(($is_pickup ? '🥡 מוכן לאיסוף בסביבות ' : '🛵 מגיע אליך בסביבות ') . $ready_hhmm);
              else echo esc_html($is_pickup ? '🥡 ההזמנה מוכנה לאיסוף!' : '🛵 ההזמנה בדרך אליך!');
            ?></span>
            <div id="alena-track-count" style="font-weight:600;font-size:13px;opacity:.92;margin-top:2px"><?php echo $mins_left > 0 ? esc_html('עוד כ-' . $mins_left . ' דקות') : ''; ?></div>
          </div>
          <p class="alena-dz-ty-live" id="alena-track-live" style="<?php echo $stage < 3 ? '' : 'display:none;'; ?>">מתעדכן אוטומטית •</p>
          <script>
          (function () {
            var TRACK = <?php echo wp_json_encode(esc_url_raw(rest_url('alena/v1/track'))); ?>;
            var OID = <?php echo (int) $order_id; ?>, KEY = <?php echo wp_json_encode($order->get_order_key()); ?>;
            var isPickup = <?php echo $is_pickup ? 'true' : 'false'; ?>;
            var readyAt = <?php echo (int) $ready_at; ?>, stage = <?php echo (int) $stage; ?>;
            function applyStage(s) {
              document.querySelectorAll('#alena-track .alena-dz-ty-step').forEach(function (el) {
                var n = +el.getAttribute('data-step');
                el.classList.remove('done', 'active');
                if (s > n) el.classList.add('done'); else if (s === n) el.classList.add('active');
              });
            }
            function paintBanner() {
              var b = document.getElementById('alena-track-banner');
              var live = document.getElementById('alena-track-live');
              if (!b) return;
              if (stage >= 3) { b.style.display = 'none'; if (live) live.style.display = 'none'; return; }
              if (readyAt > 0) {
                var mins = Math.ceil((readyAt - Date.now() / 1000) / 60);
                b.style.display = '';
                var hhmm = new Date(readyAt * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
                if (mins > 0) {
                  document.getElementById('alena-track-main').textContent = (isPickup ? '🥡 מוכן לאיסוף בסביבות ' : '🛵 מגיע אליך בסביבות ') + hhmm;
                  document.getElementById('alena-track-count').textContent = 'עוד כ-' + mins + ' דקות';
                } else {
                  document.getElementById('alena-track-main').textContent = isPickup ? '🥡 ההזמנה מוכנה לאיסוף!' : '🛵 ההזמנה בדרך אליך!';
                  document.getElementById('alena-track-count').textContent = '';
                }
              } else { b.style.display = 'none'; }
            }
            function poll() {
              fetch(TRACK + '?order=' + OID + '&key=' + encodeURIComponent(KEY) + '&_=' + Date.now(), { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                  if (!d || !d.ok) return;
                  if (d.dead) { location.reload(); return; }   // cancelled/refunded → server renders that
                  isPickup = !!d.is_pickup; readyAt = +d.ready_at || 0;
                  if (d.stage !== stage) { stage = d.stage; applyStage(stage); }
                  paintBanner();
                  if (stage >= 3 && timer) { clearInterval(timer); timer = null; }
                })
                .catch(function () { /* keep last state */ });
            }
            var timer = null;
            if (stage < 3) {
              paintBanner();
              setInterval(function () { paintBanner(); }, 20000); // keep the countdown honest
              timer = setInterval(poll, 15000);                    // live status
              poll();
            }
          })();
          </script>
          <?php endif; ?>

          <div class="alena-dz-ty-card">
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label">מס׳ הזמנה</span>
              <span class="alena-dz-ty-value">#<?php echo $order->get_order_number(); ?></span>
            </div>
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label"><?php echo $is_pickup ? 'זמן מוערך לאיסוף' : 'זמן מוערך לקבלה'; ?></span>
              <span class="alena-dz-ty-value"><?php
                $ra = (int) $order->get_meta('_alena_ready_at');
                if ($ra > 0) {
                    try { $dra = new \DateTime('@' . $ra); $dra->setTimezone(new \DateTimeZone('Asia/Jerusalem')); echo esc_html($dra->format('H:i')); }
                    catch (\Exception $e) { echo esc_html(date('H:i', $ra)); }
                } else {
                    echo esc_html($eta);
                }
              ?></span>
            </div>
            <?php
            // Items add up to more than the total whenever points were spent,
            // and with no line explaining it the page looks like it made an
            // arithmetic mistake -- on the one screen that should feel certain.
            // It is also the best moment to show the club is worth something.
            foreach ($order->get_fees() as $fee) {
                $amount = (float) $fee->get_total();
                if ($amount >= 0) continue;
                printf(
                    '<div class="alena-dz-ty-row alena-dz-ty-saved"><span class="alena-dz-ty-label">%s</span><span class="alena-dz-ty-value">%s</span></div>',
                    esc_html($fee->get_name()),
                    wp_kses_post(wc_price($amount))
                );
            }
            ?>
            <div class="alena-dz-ty-row">
              <span class="alena-dz-ty-label">סה״כ</span>
              <span class="alena-dz-ty-value"><?php echo wp_kses_post($order->get_formatted_order_total()); ?></span>
            </div>
            <?php
            // Cash on collection/delivery: say the figure to bring.
            if ($order->get_payment_method() === 'cod') {
                printf(
                    '<div class="alena-dz-ty-row"><span class="alena-dz-ty-label">תשלום</span><span class="alena-dz-ty-value">💵 להכין %s במזומן %s</span></div>',
                    wp_kses_post(wc_price($order->get_total())),
                    $is_pickup ? 'באיסוף' : 'לשליח'
                );
            }
            ?>
            <?php
            if ($is_pickup) {
                // A pickup customer is about to drive there -- make it tappable.
                $addr_txt = Alena_DZ_Store_Controls::address_full();
                echo '<div class="alena-dz-ty-row"><span class="alena-dz-ty-label">איסוף עצמי מ-</span>'
                   . '<span class="alena-dz-ty-value"><a class="alena-dz-ty-nav" target="_blank" rel="noopener"'
                   . ' href="https://waze.com/ul?q=' . rawurlencode($addr_txt) . '">🧭 ' . esc_html($addr_txt) . '</a></span></div>';
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

          <p class="alena-dz-ty-help">משהו לא מדויק בהזמנה?
            <a class="alena-dz-ty-tel" href="tel:<?php echo esc_attr(Alena_DZ_Store_Controls::phone_intl()); ?>">להתקשר אלינו <?php echo esc_html(Alena_DZ_Store_Controls::phone()); ?></a>
          </p>

          <div class="alena-dz-ty-cta-row">
            <?php // Not "add to this order" -- it starts a NEW one, with its own delivery. ?>
            <a class="alena-dz-ty-btn primary" href="<?php echo esc_url($shop_url); ?>">חזרה לתפריט</a>
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
