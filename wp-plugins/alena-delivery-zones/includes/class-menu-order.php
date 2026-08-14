<?php
if (!defined('ABSPATH')) exit;

/**
 * Owner-facing ordering for the /shop menu.
 *
 * Category order used to be a hard-coded list of names in Alena_DZ_Shop_Styling,
 * so a rename in Wolt silently dropped a category to the bottom and the owner
 * had no way to fix it. Order now lives in data:
 *
 *   - categories: option ALENA_DZ_CAT_ORDER, an ordered array of term ids
 *   - products:   the post's own `menu_order` (already what the shop query sorts by)
 *
 * Anything not present in the stored order keeps working — it is simply appended.
 */
class Alena_DZ_Menu_Order {

    const OPT_CAT_ORDER = 'alena_dz_cat_order';

    public function __construct() {
        add_action('admin_menu',                     [$this, 'menu'], 26);
        add_action('wp_ajax_alena_dz_save_cat_order',  [$this, 'ajax_save_cat_order']);
        add_action('wp_ajax_alena_dz_save_prod_order', [$this, 'ajax_save_prod_order']);
    }

    /* ---------------------------------------------------------------- read */

    /** Stored category order as term ids, filtered to ones that still exist. */
    public static function cat_order(): array {
        $raw = get_option(self::OPT_CAT_ORDER, []);
        return is_array($raw) ? array_map('intval', $raw) : [];
    }

    /**
     * Sorts terms by the owner's saved order. Terms with no saved position are
     * appended in their incoming order, so a newly imported category shows up
     * at the end rather than disappearing.
     */
    public static function sort_terms(array $terms): array {
        $order = self::cat_order();
        if (!$order) return $terms;

        $pos = array_flip($order);
        $known = $unknown = [];
        foreach ($terms as $t) {
            if (isset($pos[(int) $t->term_id])) $known[] = $t;
            else                                $unknown[] = $t;
        }
        usort($known, function ($a, $b) use ($pos) {
            return $pos[(int) $a->term_id] <=> $pos[(int) $b->term_id];
        });
        return array_merge($known, $unknown);
    }

    /* --------------------------------------------------------------- admin */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'סדר התפריט',
            'סדר התפריט',
            'manage_woocommerce',
            'alena-menu-order',
            [$this, 'render']
        );
    }

    public function render() {
        $nonce = wp_create_nonce('alena_dz_menu_order');
        $terms = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);
        if (is_wp_error($terms)) $terms = [];
        $terms = self::sort_terms($terms);
        ?>
        <div class="wrap alena-order-wrap" dir="rtl">
          <h1>סדר התפריט</h1>
          <p>הסדר כאן הוא הסדר שהלקוח רואה ב<strong>תפריט</strong>. השינוי נשמר מיד.</p>

          <div id="alena-order-status" class="alena-order-status" hidden></div>

          <h2>קטגוריות</h2>
          <ul class="alena-order-list" id="alena-cat-list">
            <?php foreach ($terms as $t): ?>
              <li class="alena-order-row" data-id="<?php echo (int) $t->term_id; ?>">
                <span class="alena-order-btns">
                  <button type="button" class="button alena-order-up"   aria-label="הזז למעלה">▲</button>
                  <button type="button" class="button alena-order-down" aria-label="הזז למטה">▼</button>
                </span>
                <span class="alena-order-name"><?php echo esc_html($t->name); ?></span>
                <span class="alena-order-count"><?php echo (int) $t->count; ?> מנות</span>
              </li>
            <?php endforeach; ?>
          </ul>

          <h2 style="margin-top:32px">מנות בתוך קטגוריה</h2>
          <p>
            <select id="alena-cat-picker">
              <option value="">— בחר קטגוריה —</option>
              <?php foreach ($terms as $t): ?>
                <option value="<?php echo (int) $t->term_id; ?>"><?php echo esc_html($t->name); ?></option>
              <?php endforeach; ?>
            </select>
          </p>
          <ul class="alena-order-list" id="alena-prod-list"></ul>
        </div>

        <style>
          .alena-order-wrap .alena-order-list { max-width: 720px; margin: 8px 0 0; padding: 0; list-style: none; }
          .alena-order-row {
            display: flex; align-items: center; gap: 12px;
            margin: 0 0 6px; padding: 10px 12px;
            background: #fff; border: 1px solid #dcdcde; border-radius: 8px;
          }
          .alena-order-row.is-busy { opacity: .5; pointer-events: none; }
          .alena-order-row.just-moved { border-color: #2271b1; box-shadow: 0 0 0 2px rgba(34,113,177,.15); }
          .alena-order-btns { display: flex; gap: 4px; }
          .alena-order-btns .button { min-width: 34px; padding: 0 8px; line-height: 26px; }
          .alena-order-name { flex: 1 1 auto; font-weight: 600; }
          .alena-order-count { color: #646970; font-size: 12px; }
          .alena-order-thumb { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; background: #f0f0f1; }
          .alena-order-status {
            margin: 12px 0; padding: 10px 14px; border-radius: 6px;
            background: #edfaef; border: 1px solid #b7e0be;
          }
          .alena-order-status.is-error { background: #fdeded; border-color: #e5aaaa; }
        </style>

        <script>
        (function ($) {
          const NONCE = '<?php echo esc_js($nonce); ?>';

          function status(msg, isError) {
            $('#alena-order-status')
              .text(msg)
              .toggleClass('is-error', !!isError)
              .removeAttr('hidden');
          }

          function idsOf($list) {
            return $list.children('.alena-order-row').map(function () {
              return $(this).data('id');
            }).get();
          }

          // Moving a row is a DOM swap first, then a save. If the save fails the
          // list is reloaded so the screen never disagrees with the database.
          function move($row, dir) {
            const $list = $row.parent();
            const $sib  = dir === 'up' ? $row.prev('.alena-order-row') : $row.next('.alena-order-row');
            if (!$sib.length) return;
            if (dir === 'up') $row.insertBefore($sib); else $row.insertAfter($sib);
            $row.addClass('just-moved');
            setTimeout(function () { $row.removeClass('just-moved'); }, 900);
            save($list);
          }

          function save($list) {
            const isCat = $list.attr('id') === 'alena-cat-list';
            const data  = {
              action: isCat ? 'alena_dz_save_cat_order' : 'alena_dz_save_prod_order',
              nonce:  NONCE,
              ids:    idsOf($list),
            };
            if (!isCat) data.term_id = $('#alena-cat-picker').val();

            $list.addClass('is-saving');
            $.post(ajaxurl, data)
              .done(function (r) {
                if (r && r.success) status('נשמר ✓');
                else status('השמירה נכשלה', true);
              })
              .fail(function (xhr) { status('השמירה נכשלה (HTTP ' + xhr.status + ')', true); })
              .always(function () { $list.removeClass('is-saving'); });
          }

          $(document).on('click', '.alena-order-up',   function () { move($(this).closest('.alena-order-row'), 'up'); });
          $(document).on('click', '.alena-order-down', function () { move($(this).closest('.alena-order-row'), 'down'); });

          $('#alena-cat-picker').on('change', function () {
            const term = $(this).val();
            const $list = $('#alena-prod-list').empty();
            if (!term) return;
            $list.html('<li class="alena-order-row">טוען…</li>');
            $.post(ajaxurl, { action: 'alena_dz_save_prod_order', nonce: NONCE, term_id: term, list_only: 1 })
              .done(function (r) {
                if (!r || !r.success) { $list.html('<li class="alena-order-row">שגיאה בטעינה</li>'); return; }
                $list.html(r.data.html || '<li class="alena-order-row">אין מנות בקטגוריה</li>');
              })
              .fail(function () { $list.html('<li class="alena-order-row">שגיאה בטעינה</li>'); });
          });
        })(jQuery);
        </script>
        <?php
    }

    /* ---------------------------------------------------------------- ajax */

    private function guard() {
        check_ajax_referer('alena_dz_menu_order', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
    }

    public function ajax_save_cat_order() {
        $this->guard();
        $ids = array_map('intval', (array) ($_POST['ids'] ?? []));
        $ids = array_values(array_filter($ids));
        if (!$ids) wp_send_json_error('empty', 400);
        update_option(self::OPT_CAT_ORDER, $ids, false);
        wp_send_json_success(['saved' => count($ids)]);
    }

    /**
     * Doubles as the list endpoint (list_only=1) and the save endpoint, so the
     * picker and the reorder share one round trip shape.
     */
    public function ajax_save_prod_order() {
        $this->guard();
        $term_id = (int) ($_POST['term_id'] ?? 0);
        if (!$term_id) wp_send_json_error('no_term', 400);

        if (!empty($_POST['list_only'])) {
            $products = wc_get_products([
                'status'   => 'publish',
                'limit'    => -1,
                'category' => [get_term($term_id, 'product_cat')->slug ?? ''],
                'orderby'  => 'menu_order title',
                'order'    => 'ASC',
            ]);
            ob_start();
            foreach ($products as $p) {
                $img = wp_get_attachment_image_url($p->get_image_id(), 'thumbnail');
                ?>
                <li class="alena-order-row" data-id="<?php echo (int) $p->get_id(); ?>">
                  <span class="alena-order-btns">
                    <button type="button" class="button alena-order-up"   aria-label="הזז למעלה">▲</button>
                    <button type="button" class="button alena-order-down" aria-label="הזז למטה">▼</button>
                  </span>
                  <?php if ($img): ?><img class="alena-order-thumb" src="<?php echo esc_url($img); ?>" alt="" /><?php endif; ?>
                  <span class="alena-order-name"><?php echo esc_html($p->get_name()); ?></span>
                  <span class="alena-order-count"><?php echo wp_kses_post(wc_price($p->get_price())); ?></span>
                </li>
                <?php
            }
            wp_send_json_success(['html' => ob_get_clean()]);
        }

        $ids = array_map('intval', (array) ($_POST['ids'] ?? []));
        $ids = array_values(array_filter($ids));
        if (!$ids) wp_send_json_error('empty', 400);
        foreach ($ids as $i => $pid) {
            wp_update_post(['ID' => $pid, 'menu_order' => $i]);
        }
        wp_send_json_success(['saved' => count($ids)]);
    }
}
