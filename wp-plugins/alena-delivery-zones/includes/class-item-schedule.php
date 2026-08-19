<?php
if (!defined('ABSPATH')) exit;

/**
 * Per-dish availability windows — a dish that is only sold on certain days and
 * hours (the Friday specials: חלה שניצל, חומוס במשקל).
 *
 * This is deliberately separate from the brand hours (Alena/Zohara open/close)
 * and from the customer's "order for later" scheduler. A brand can be open
 * while one of its dishes is not being made yet, and that is exactly the Friday
 * special: Zohara is open Sun-Fri, but the by-weight hummus and the schnitzel
 * challah exist on Friday only.
 *
 * Owner's decisions, 2026-08-19:
 *   - Outside its window the dish stays visible but greyed, with a label that
 *     says when it is back ("זמין בשישי") — same treatment as a shut brand, so
 *     the customer learns it exists rather than wondering where it went.
 *   - No pre-ordering it for a future day: it is purchasable only inside the
 *     window. The server blocks it either way; the grey card is just the UI.
 *
 * Empty schedule = always available, so nothing changes for the other 90 dishes.
 */
class Alena_DZ_Item_Schedule {

    const OPT       = 'alena_item_schedule';
    const OPT_SEED  = 'alena_item_sched_seeded';
    const TZ        = 'Asia/Jerusalem';

    /** 0 = Sunday .. 6 = Saturday */
    public static function weekday_names(): array {
        return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    }

    public function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'save']);
        add_action('admin_init', [$this, 'maybe_seed']);

        // Server-side truth — mirrors the brand guard. A greyed card is a hint,
        // not a lock; a stale tab or a crafted request is stopped here.
        add_filter('woocommerce_is_purchasable',         [$this, 'block_when_out'], 25, 2);
        add_filter('woocommerce_add_to_cart_validation', [$this, 'validate_add'], 25, 3);
    }

    /* ---------------- data ---------------- */

    public static function all(): array {
        $s = get_option(self::OPT, []);
        return is_array($s) ? $s : [];
    }

    public static function schedule_of($product_id): ?array {
        $all = self::all();
        $s = $all[(int) $product_id] ?? null;
        if (!is_array($s) || empty($s['days'])) return null;
        return $s;
    }

    private static function to_mins(string $hhmm): int {
        $p = explode(':', $hhmm);
        return ((int) ($p[0] ?? 0)) * 60 + (int) ($p[1] ?? 0);
    }

    public static function is_available($product_id, ?DateTimeImmutable $now = null): bool {
        $s = self::schedule_of($product_id);
        if (!$s) return true;   // no window = always on

        $now = $now ?: new DateTimeImmutable('now', new DateTimeZone(self::TZ));
        $day = (int) $now->format('w');
        if (!in_array($day, array_map('intval', $s['days']), true)) return false;

        $mins = ((int) $now->format('G')) * 60 + (int) $now->format('i');
        $from = self::to_mins($s['from'] ?? '00:00');
        $to   = self::to_mins($s['to']   ?? '23:59');
        return $mins >= $from && $mins < $to;
    }

    /** Human phrase for the days, e.g. "בשישי" or "בימים שישי, שבת". */
    private static function days_phrase(array $days): string {
        $names = self::weekday_names();
        $days = array_values(array_unique(array_map('intval', $days)));
        sort($days);
        $labels = array_map(fn($d) => $names[$d] ?? '', $days);
        $labels = array_filter($labels);
        if (count($labels) === 1) return 'ב' . reset($labels);
        return 'בימים ' . implode(', ', $labels);
    }

    /**
     * Card label. When available now: "זמין עד 15:00" (only if an end hour is
     * set). When not: "זמין בשישי 09:00–15:00" so the customer knows to return.
     */
    public static function label($product_id, ?DateTimeImmutable $now = null): string {
        $s = self::schedule_of($product_id);
        if (!$s) return '';

        $from = $s['from'] ?? '';
        $to   = $s['to']   ?? '';
        // Concatenate — do NOT interpolate "$from–$to". The en-dash bytes are
        // >= 0x80, and PHP folds them into the variable name inside a
        // double-quoted string, so $from resolves to an undefined var and the
        // start time silently disappears.
        $range = ($from && $to && !($from === '00:00' && $to === '23:59'))
            ? (' ' . $from . '–' . $to) : '';

        if (self::is_available($product_id, $now)) {
            return $to && $to !== '23:59' ? 'זמין עד ' . $to : '';
        }
        return 'זמין ' . self::days_phrase($s['days']) . $range;
    }

    public static function is_scheduled_closed($product_id, ?DateTimeImmutable $now = null): bool {
        return self::schedule_of($product_id) && !self::is_available($product_id, $now);
    }

    /* ---------------- guards ---------------- */

    public function block_when_out($purchasable, $product) {
        if (!$product || is_admin()) return $purchasable;
        return $purchasable && self::is_available($product->get_id());
    }

    public function validate_add($passed, $product_id, $qty) {
        if (self::is_available($product_id)) return $passed;
        $s = self::schedule_of($product_id);
        $when = $s ? self::days_phrase($s['days']) : '';
        wc_add_notice('מנה זו זמינה ' . $when . ' בלבד.', 'error');
        return false;
    }

    /* ---------------- one-time seed ---------------- */

    /**
     * The two Friday-special categories become Friday-only the first time this
     * runs. Matched by category name, set to Friday 09:00–15:00 (Zohara's Friday
     * hours). The owner can retune or remove any of it afterwards.
     */
    public function maybe_seed() {
        if (get_option(self::OPT_SEED) === '1') return;

        $cats = ['חומוס במשקל ספיישל שישי', 'חלה שניצל של שישי'];
        $sched = self::all();
        foreach ($cats as $name) {
            $term = get_term_by('name', trim($name), 'product_cat');
            if (!$term || is_wp_error($term)) continue;
            $ids = get_posts([
                'post_type'   => 'product',
                'numberposts' => -1,
                'fields'      => 'ids',
                'tax_query'   => [[
                    'taxonomy' => 'product_cat',
                    'field'    => 'term_id',
                    'terms'    => $term->term_id,
                ]],
            ]);
            foreach ($ids as $pid) {
                if (isset($sched[$pid])) continue;   // never clobber owner edits
                $sched[$pid] = ['days' => [5], 'from' => '09:00', 'to' => '15:00'];
            }
        }
        update_option(self::OPT, $sched);
        update_option(self::OPT_SEED, '1');
    }

    /* ---------------- admin ---------------- */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'תזמון מנות (ימים/שעות)',
            'תזמון מנות',
            'manage_options',
            'alena-item-schedule',
            [$this, 'render']
        );
    }

    public function save() {
        if (!isset($_POST['alena_sched_nonce'])) return;
        if (!wp_verify_nonce($_POST['alena_sched_nonce'], 'alena_sched')) return;
        if (!current_user_can('manage_options')) return;

        $out = [];
        $rows = isset($_POST['sched']) && is_array($_POST['sched']) ? $_POST['sched'] : [];
        foreach ($rows as $pid => $row) {
            $pid = (int) $pid;
            if (!empty($row['remove'])) continue;
            $days = array_map('intval', (array) ($row['days'] ?? []));
            $days = array_values(array_filter($days, fn($d) => $d >= 0 && $d <= 6));
            if (!$days) continue;   // no days = not scheduled = remove
            $from = preg_match('/^\d{2}:\d{2}$/', $row['from'] ?? '') ? $row['from'] : '00:00';
            $to   = preg_match('/^\d{2}:\d{2}$/', $row['to']   ?? '') ? $row['to']   : '23:59';
            $out[$pid] = ['days' => $days, 'from' => $from, 'to' => $to];
        }

        // Add a newly picked product with a sensible Friday default.
        $add = (int) ($_POST['add_product'] ?? 0);
        if ($add && !isset($out[$add])) {
            $out[$add] = ['days' => [5], 'from' => '09:00', 'to' => '15:00'];
        }

        update_option(self::OPT, $out);
        add_action('admin_notices', function () {
            echo '<div class="notice notice-success is-dismissible"><p>התזמון נשמר.</p></div>';
        });
    }

    private function time_options(string $selected): string {
        $html = '';
        for ($m = 0; $m <= 23 * 60 + 30; $m += 30) {
            $v = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
            $html .= '<option value="' . esc_attr($v) . '"' . selected($v, $selected, false) . '>' . esc_html($v) . '</option>';
        }
        return $html;
    }

    public function render() {
        $sched = self::all();
        $names = self::weekday_names();
        ?>
        <div class="wrap" dir="rtl">
          <h1>תזמון מנות — ימים ושעות</h1>
          <p>מנה עם תזמון תופיע בתפריט <strong>מעומעמת עם תווית</strong> מחוץ לימים/שעות שנבחרו, ולא תהיה ניתנת להזמנה עד שהיא בחלון. מנה בלי תזמון — זמינה תמיד (זה מצב ברירת המחדל לכל השאר).</p>

          <form method="post">
            <?php wp_nonce_field('alena_sched', 'alena_sched_nonce'); ?>

            <?php if ($sched): ?>
              <table class="widefat" style="max-width:900px">
                <thead>
                  <tr>
                    <th>מנה</th>
                    <?php foreach ($names as $n): ?><th style="text-align:center"><?php echo esc_html(mb_substr($n, 0, 1)); ?></th><?php endforeach; ?>
                    <th>משעה</th><th>עד שעה</th><th>הסר</th>
                  </tr>
                </thead>
                <tbody>
                  <?php foreach ($sched as $pid => $row):
                      $p = wc_get_product($pid); if (!$p) continue;
                      $days = array_map('intval', (array) ($row['days'] ?? [])); ?>
                    <tr>
                      <td><strong><?php echo esc_html($p->get_name()); ?></strong></td>
                      <?php for ($d = 0; $d <= 6; $d++): ?>
                        <td style="text-align:center">
                          <input type="checkbox" name="sched[<?php echo $pid; ?>][days][]" value="<?php echo $d; ?>" <?php checked(in_array($d, $days, true)); ?> />
                        </td>
                      <?php endfor; ?>
                      <td><select name="sched[<?php echo $pid; ?>][from]"><?php echo $this->time_options($row['from'] ?? '00:00'); ?></select></td>
                      <td><select name="sched[<?php echo $pid; ?>][to]"><?php echo $this->time_options($row['to'] ?? '23:59'); ?></select></td>
                      <td style="text-align:center"><input type="checkbox" name="sched[<?php echo $pid; ?>][remove]" value="1" /></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            <?php else: ?>
              <p><em>אין מנות מתוזמנות כרגע.</em></p>
            <?php endif; ?>

            <h2 style="margin-top:24px">הוספת מנה לתזמון</h2>
            <p>
              <select name="add_product" style="min-width:320px">
                <option value="">— בחר מנה —</option>
                <?php
                $prods = get_posts(['post_type' => 'product', 'numberposts' => -1, 'orderby' => 'title', 'order' => 'ASC']);
                foreach ($prods as $pp) {
                    if (isset($sched[$pp->ID])) continue;
                    echo '<option value="' . (int) $pp->ID . '">' . esc_html($pp->post_title) . '</option>';
                }
                ?>
              </select>
              <span class="description">תתווסף עם ברירת מחדל: שישי 09:00–15:00 (אפשר לשנות אחרי השמירה).</span>
            </p>

            <?php submit_button('שמור תזמון'); ?>
          </form>
        </div>
        <?php
    }
}
