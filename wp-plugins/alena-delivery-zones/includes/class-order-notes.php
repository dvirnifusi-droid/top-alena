<?php
if (!defined('ABSPATH')) exit;

/**
 * "הערה למסעדה / שליח" on the CHECKOUT, wired to WooCommerce's own order note.
 *
 * This used to live in the cart drawer, and it did not work: the drawer posted
 * the text to admin-ajax with action `alena_cart_drawer_note`, and no handler
 * for that action was ever registered. WordPress answered "unknown action" and
 * the note was discarded -- so a customer who typed "אלרגיה לאגוזים" sent it
 * nowhere. It never reached the order, the kitchen, or the POS.
 *
 * Here it writes into #order_comments, which WooCommerce stores on the order,
 * prints on the admin screen, and includes in the webhook payload. The chips
 * are just fast ways to fill that one field.
 */
class Alena_DZ_Order_Notes {

    public function __construct() {
        add_action('woocommerce_before_order_notes', [$this, 'render'], 5);
    }

    private function chips(): array {
        // Kitchen instructions first, then delivery ones -- that is the order a
        // customer thinks in, and the delivery pair is meaningless for pickup.
        $kitchen = ['ללא בצל', 'בלי חריף', 'ללא גלוטן', 'ללא חמוצים'];
        $delivery = ['להשאיר ליד הדלת', 'להתקשר כשמגיעים'];
        $is_pickup = class_exists('Alena_DZ_Checkout_Redesign')
            && Alena_DZ_Checkout_Redesign::current_fulfillment() === 'pickup';
        return $is_pickup ? $kitchen : array_merge($kitchen, $delivery);
    }

    public function render($checkout) {
        ?>
        <div class="alena-note-chips-wrap">
          <div class="alena-note-chips-title">📝 משהו שחשוב שנדע?</div>
          <div class="alena-note-chips">
            <?php foreach ($this->chips() as $chip): ?>
              <button type="button" class="alena-note-chip" data-text="<?php echo esc_attr($chip); ?>">
                <?php echo esc_html($chip); ?>
              </button>
            <?php endforeach; ?>
          </div>
        </div>
        <script>
        (function () {
          function bind() {
            var box = document.getElementById('order_comments');
            document.querySelectorAll('.alena-note-chip').forEach(function (btn) {
              if (btn.dataset.alenaBound) return;
              btn.dataset.alenaBound = '1';
              btn.addEventListener('click', function () {
                box = document.getElementById('order_comments');
                if (!box) return;
                var text = btn.dataset.text || '';
                var cur = (box.value || '').trim();
                // Toggle: a chip tapped twice removes what it added, so a
                // mis-tap does not leave "ללא בצל" on an order forever.
                if (cur.indexOf(text) === -1) {
                  box.value = cur ? cur + ' · ' + text : text;
                  btn.classList.add('is-active');
                } else {
                  box.value = cur.split('·').map(function (s) { return s.trim(); })
                                 .filter(function (s) { return s && s !== text; })
                                 .join(' · ');
                  btn.classList.remove('is-active');
                }
                box.dispatchEvent(new Event('input', { bubbles: true }));
                box.dispatchEvent(new Event('change', { bubbles: true }));
              });
            });
          }
          bind();
          if (window.jQuery) jQuery(document.body).on('updated_checkout', bind);
        })();
        </script>
        <?php
    }
}
