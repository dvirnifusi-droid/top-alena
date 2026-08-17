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
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'save_admin']);
    }

    const OPT = 'alena_dz_note_chips';

    /** Shipped defaults. Used until the owner saves their own list. */
    public static function defaults(): array {
        return [
            'kitchen'  => ['ללא בצל', 'בלי חריף', 'ללא גלוטן', 'ללא חמוצים'],
            'delivery' => ['להשאיר ליד הדלת', 'להתקשר כשמגיעים'],
        ];
    }

    public static function saved(): array {
        $saved = get_option(self::OPT, []);
        $d = self::defaults();
        // A saved-but-empty list is a deliberate "no chips here", so only fall
        // back when the key was never saved at all.
        return [
            'kitchen'  => isset($saved['kitchen'])  ? (array) $saved['kitchen']  : $d['kitchen'],
            'delivery' => isset($saved['delivery']) ? (array) $saved['delivery'] : $d['delivery'],
        ];
    }

    private function chips(): array {
        // Kitchen instructions first, then delivery ones -- that is the order a
        // customer thinks in, and the delivery pair is meaningless for pickup.
        $c = self::saved();
        $is_pickup = class_exists('Alena_DZ_Checkout_Redesign')
            && Alena_DZ_Checkout_Redesign::current_fulfillment() === 'pickup';
        return $is_pickup ? $c['kitchen'] : array_merge($c['kitchen'], $c['delivery']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'הערות להזמנה',
            'הערות להזמנה',
            'manage_options',
            'alena-note-chips',
            [$this, 'render_admin']
        );
    }

    public function save_admin() {
        if (!isset($_POST['alena_chips_nonce'])) return;
        if (!wp_verify_nonce($_POST['alena_chips_nonce'], 'alena_chips')) return;
        if (!current_user_can('manage_options')) return;

        $split = function ($raw) {
            // No regex: normalise CR out, then split on LF. Avoids escape
            // sequences entirely, which is what mangled this once already.
            $raw = str_replace("", '', (string) $raw);
            $out = [];
            foreach (explode("
", $raw) as $line) {
                $line = trim(sanitize_text_field($line));
                if ($line !== '') $out[] = $line;
            }
            return array_values(array_unique($out));
        };
        update_option(self::OPT, [
            'kitchen'  => $split($_POST['chips_kitchen']  ?? ''),
            'delivery' => $split($_POST['chips_delivery'] ?? ''),
        ]);
        add_action('admin_notices', function () {
            echo '<div class="notice notice-success is-dismissible"><p>הצ׳יפים עודכנו.</p></div>';
        });
    }

    public function render_admin() {
        $c = self::saved();
        ?>
        <div class="wrap" dir="rtl">
          <h1>הערות להזמנה — כפתורים מהירים</h1>
          <p>אלה הכפתורים שהלקוח רואה בעמוד התשלום. לחיצה עליהם ממלאת את שדה ההערה.
             <strong>שורה אחת לכל כפתור.</strong> אפשר למחוק הכל ולהשאיר ריק — אז לא יוצגו כפתורים.</p>
          <form method="post">
            <?php wp_nonce_field('alena_chips', 'alena_chips_nonce'); ?>
            <table class="form-table">
              <tr>
                <th><label for="chips_kitchen">הערות למטבח</label><br>
                    <span class="description">מוצגות תמיד</span></th>
                <td><textarea id="chips_kitchen" name="chips_kitchen" rows="7" cols="40"><?php
                    echo esc_textarea(implode("
", $c['kitchen'])); ?></textarea></td>
              </tr>
              <tr>
                <th><label for="chips_delivery">הערות לשליח</label><br>
                    <span class="description">מוצגות רק בהזמנת משלוח — באיסוף עצמי הן חסרות משמעות</span></th>
                <td><textarea id="chips_delivery" name="chips_delivery" rows="5" cols="40"><?php
                    echo esc_textarea(implode("
", $c['delivery'])); ?></textarea></td>
              </tr>
            </table>
            <?php submit_button('שמור'); ?>
          </form>
        </div>
        <?php
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
