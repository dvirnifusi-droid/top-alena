<?php
if (!defined('ABSPATH')) exit;

/**
 * Combo deals + the "bag insert" acquisition coupon.
 *
 * Two jobs:
 *
 *   1. BUILD (one-click, idempotent) — creates the "קומבו ודילים" product
 *      category, 7 combo products with their modifier groups, and the BAG25
 *      coupon. Re-running matches existing rows by exact title / coupon code
 *      and updates them, so it never duplicates. Same contract as the Wolt
 *      importer, which is the pattern the owner already knows.
 *
 *   2. GUARD (runtime) — enforces "one use per phone number" on any coupon
 *      flagged with `_alena_once_per_phone`. WooCommerce's own
 *      usage_limit_per_user keys off user id / billing email, which a guest
 *      can trivially sidestep with a second email. Phone is the real identity
 *      on this site (phone-OTP login, phone-keyed club), so that's what we
 *      key the limit on.
 *
 * Combo pricing lives in COMBOS below. Every price is the delivered menu price
 * of the components minus the deal discount — see the plan doc for the math.
 * Prices are plain WooCommerce products afterwards, so the owner can edit them
 * in Products without touching this file.
 */
class Alena_DZ_Combos {

    const CATEGORY_NAME = 'קומבו ודילים';
    const COMBO_META    = '_alena_combo';
    const ONCE_PER_PHONE_META = '_alena_once_per_phone';
    const USED_PHONES_META    = '_alena_used_phones';

    const COUPON_CODE = 'BAG25';

    public function __construct() {
        add_action('admin_menu',                     [$this, 'menu'], 26);
        add_action('wp_ajax_alena_dz_build_combos',  [$this, 'ajax_build']);

        // Once-per-phone coupon guard
        add_filter('woocommerce_coupon_is_valid',            [$this, 'validate_once_per_phone'], 10, 3);
        add_action('woocommerce_checkout_order_processed',   [$this, 'record_phone_use'], 10, 3);
        // Blocks checkout fires a different hook with the order as the first arg.
        // Without this, moving to the block cart would silently stop recording uses
        // and the once-per-phone limit would quietly become unlimited.
        add_action('woocommerce_store_api_checkout_order_processed', [$this, 'record_phone_use_blocks'], 10, 1);
    }

    /* ===========================================================
       Component catalogues — priced as SURCHARGES over the combo base.
       A ₪0 surcharge means "included at no extra cost".
       =========================================================== */

    /**
     * Full pita line-up, priced against the ₪51 base (פרגית / מרגז) from the
     * 2026-08-11 menu reprice. The two vegetarian pitas list below the base
     * (₪42 / ₪44) and are deliberately left at ₪0 rather than given a negative
     * surcharge: they carry the lowest food cost, so nudging customers toward
     * them is the outcome we want anyway.
     */
    private static function pitas(): array {
        return [
            ['name' => 'פיתה פרגית',              'price' => 0],   // ₪51 — base
            ['name' => 'פיתה מרגז',               'price' => 0],   // ₪51 — base
            ['name' => 'פיתה כרוב פחמים',         'price' => 0],   // ₪42
            ['name' => 'פיתה פטריות',             'price' => 0],   // ₪44
            ['name' => 'פיתה מיקס קבב ופרגית',    'price' => 3],   // ₪54
            ['name' => 'פיתה מיקס מרגז ופרגית',   'price' => 3],   // ₪54
            ['name' => 'פיתה מיקס קבב ומרגז',     'price' => 3],   // ₪54
            ['name' => 'פיתה קבב',                'price' => 6],   // ₪57
            ['name' => 'פיתה אסאדו',              'price' => 7],   // ₪58
            ['name' => 'פיתה תרנגולים',           'price' => 10],  // ₪61
        ];
    }

    /** Office-tray mix: base tier only. Premium cuts stay à la carte to protect the per-head price. */
    private static function pitas_mix(): array {
        return [
            ['name' => 'פרגית',            'price' => 0],
            ['name' => 'מרגז',             'price' => 0],
            ['name' => 'כרוב פחמים',       'price' => 0],
            ['name' => 'פטריות',           'price' => 0],
            ['name' => 'מיקס קבב ופרגית',  'price' => 8],
            ['name' => 'מיקס מרגז ופרגית', 'price' => 8],
            ['name' => 'מיקס קבב ומרגז',   'price' => 8],
            ['name' => 'קבב',              'price' => 15],
        ];
    }

    private static function drinks(): array {
        return [
            ['name' => 'פחית קוקה קולה',   'price' => 0],   // ₪11
            ['name' => 'פחית קולה זירו',   'price' => 0],   // ₪11
            ['name' => 'סבן אפ',           'price' => 0],   // ₪11
            ['name' => 'סבן אפ זירו',      'price' => 0],   // ₪11
            ['name' => 'סודה טמפו',        'price' => 0],   // ₪11
            ['name' => 'מים מינרליים',     'price' => 0],   // ₪11
            ['name' => 'פריגת ענבים',      'price' => 0],   // ₪11
            ['name' => 'לימונדה של השוק',  'price' => 6],   // ₪17
            ['name' => 'אריזונה אפרסק',    'price' => 7],   // ₪18
        ];
    }

    /**
     * Group combos take one drinks decision for the whole tray instead of
     * N per-person radios — fewer taps, and it is how offices actually order.
     * The Arizona surcharge is ₪7 x head-count.
     */
    private static function drinks_tray(int $heads): array {
        return [
            ['name' => 'מיקס שתייה — בחירת המסעדה',  'price' => 0],
            ['name' => 'הכל קוקה קולה',               'price' => 0],
            ['name' => 'הכל קולה זירו',               'price' => 0],
            ['name' => 'הכל סבן אפ',                  'price' => 0],
            ['name' => 'הכל מים מינרליים',            'price' => 0],
            ['name' => 'הכל אריזונה אפרסק',           'price' => 7 * $heads],
        ];
    }

    private static function salatia(): array {
        return [
            ['name' => 'משוואיה',           'price' => 0],   // ₪16
            ['name' => 'בצל מעושן',         'price' => 0],   // ₪16
            ['name' => 'בצל כבוש',          'price' => 0],   // ₪14
            ['name' => 'סלט כרוב שרוף',     'price' => 0],   // ₪14
            ['name' => 'חמוצים',            'price' => 0],   // ₪7
            ['name' => 'שום קונפי',         'price' => 0],   // ₪6
            ['name' => 'סחוג שבור',         'price' => 0],   // ₪5
        ];
    }

    /** Same salatia list sold as a paid add-on (₪14–16 à la carte, ₪10 inside a deal). */
    private static function salatia_paid(): array {
        $out = [];
        foreach (self::salatia() as $s) {
            $s['price'] = 10;
            $out[] = $s;
        }
        return $out;
    }

    /**
     * Starters priced against צ׳יפס (₪29). The ₪42 tier carries a real surcharge —
     * without it a table picks two ₪42 starters every time and the group deals
     * lose ₪26 of margin each.
     */
    private static function starters(): array {
        return [
            ['name' => 'צ׳יפס',            'price' => 0],    // ₪29
            ['name' => 'עלי גפן',          'price' => 0],    // ₪24
            ['name' => 'מסייר טריפוליטאי', 'price' => 0],    // ₪19
            ['name' => 'פרנה ומטבלים',     'price' => 2],    // ₪31
            ['name' => 'תפו״א קריספי',     'price' => 6],    // ₪35
            ['name' => 'בטטה ברולה',       'price' => 13],   // ₪42
            ['name' => 'חציל מפיל',        'price' => 13],   // ₪42
            ['name' => 'כרוב שרוף',        'price' => 13],   // ₪42
            ['name' => 'לקט פטריות',       'price' => 13],   // ₪42
            ['name' => 'סיגר בשר',         'price' => 16],   // ₪45
        ];
    }

    private static function spicy(): array {
        return [
            ['name' => 'בלי חריף',   'price' => 0],
            ['name' => 'עם חריף',    'price' => 0],
            ['name' => 'חריף בצד',   'price' => 0],
        ];
    }

    /** Paid upgrade offered inside the lunch deals — lets a bigger budget lift itself. */
    private static function lunch_upsell(): array {
        return [
            ['name' => 'צ׳יפס לצד המנה',     'price' => 22],  // ₪29 à la carte
            ['name' => 'תפו״א קריספי',       'price' => 27],  // ₪35
            ['name' => 'סלט רענן',           'price' => 12],  // ₪15
            ['name' => 'סלטייה 150 גר׳',     'price' => 10],  // ₪14–16
        ];
    }

    /* ----- modifier group builders ----- */

    private static function group_one(string $name, array $values, bool $required = true): array {
        return [
            'id'     => sanitize_title($name) . '-' . substr(md5($name), 0, 6),
            'name'   => $name,
            'type'   => 'Choice',
            'min'    => $required ? 1 : 0,
            'max'    => 1,
            'max_single' => 1,
            'free'   => 0,
            'values' => $values,
        ];
    }

    private static function group_many(string $name, array $values, int $min, int $max): array {
        return [
            'id'     => sanitize_title($name) . '-' . substr(md5($name . $min . $max), 0, 6),
            'name'   => $name,
            'type'   => 'Multichoice',
            'min'    => $min,
            'max'    => $max,
            'max_single' => 1,
            'free'   => 0,
            'values' => $values,
        ];
    }

    /** One radio per seat, so a table can order the same pita four times. */
    private static function pita_slots(int $count): array {
        $groups = [];
        for ($i = 1; $i <= $count; $i++) {
            $groups[] = self::group_one('פיתה ' . $i, self::pitas());
        }
        return $groups;
    }

    /* ===========================================================
       The combos
       =========================================================== */

    private static function combos(): array {
        $combos = [];

        // Mirrors the ₪69 item that already exists on Wolt, deliberately down to the
        // composition and price — one deal with two different definitions across
        // channels is worse than no deal at all.
        $combos[] = [
            'name'  => 'עסקית כל היום — פיתה, צ׳יפס ושתייה',
            'price' => 69,
            'desc'  => 'ארוחה עסקית הכוללת פיתה עם בשר לבחירה, צ׳יפס אמיתי אישי ושתייה לבחירה.',
            'mods'  => array_merge(
                self::pita_slots(1),
                [
                    self::group_one('בחרו שתייה', self::drinks()),
                    self::group_many('להוסיף סלטייה 150 גר׳?', self::salatia_paid(), 0, 2),
                    self::group_one('חריפות', self::spicy()),
                ]
            ),
        ];

        $combos[] = [
            'name'  => 'עסקית צהריים',
            'price' => 46,
            'desc'  => 'פיתה + שתייה, 12:00–16:00. נכנסת בול בתקציב הצהריים — בלי להשלים מהכיס.',
            'mods'  => [
                self::group_one('בחרו פיתה', [
                    ['name' => 'פיתה כרוב פחמים', 'price' => 0],
                    ['name' => 'פיתה פטריות',     'price' => 0],
                ]),
                self::group_one('בחרו שתייה', self::drinks()),
                self::group_one('חריפות', self::spicy()),
                self::group_many('להוסיף ראשונה?', self::lunch_upsell(), 0, 1),
            ],
        ];

        $combos[] = [
            'name'  => 'עסקית בשרים',
            'price' => 54,
            'desc'  => 'פיתת בשר על האש + שתייה, 12:00–16:00. פרגית, מרגז או קבב.',
            'mods'  => [
                self::group_one('בחרו פיתה', [
                    ['name' => 'פיתה פרגית',  'price' => 0],
                    ['name' => 'פיתה מרגז',   'price' => 0],
                    ['name' => 'פיתה קבב',    'price' => 6],
                ]),
                self::group_one('בחרו שתייה', self::drinks()),
                self::group_one('חריפות', self::spicy()),
                self::group_many('להוסיף ראשונה?', self::lunch_upsell(), 0, 1),
            ],
        ];

        $combos[] = [
            'name'  => 'דיל זוגי',
            'price' => 135,
            'desc'  => '2 פיתות על האש + צ׳יפס אמיתי + 2 שתייה. ערב שלם לשניים, בלי לבשל.',
            'mods'  => array_merge(
                self::pita_slots(2),
                [
                    self::group_one('שתייה ראשונה', self::drinks()),
                    self::group_one('שתייה שנייה', self::drinks()),
                    self::group_one('חריפות', self::spicy()),
                ]
            ),
        ];

        $combos[] = [
            'name'  => 'פותחים שולחן — 4 סועדים',
            'price' => 269,
            'desc'  => '4 פיתות על האש + 2 ראשונות + 4 שתייה. שולחן מלא ל-4, ₪67 לאיש.',
            'mods'  => array_merge(
                self::pita_slots(4),
                [
                    self::group_many('בחרו 2 ראשונות', self::starters(), 2, 2),
                    self::group_one('שתייה לשולחן', self::drinks_tray(4)),
                    self::group_one('חריפות', self::spicy()),
                ]
            ),
        ];

        $combos[] = [
            'name'  => 'עלינא למשרד — 5 סועדים',
            'price' => 319,
            'desc'  => '5 פיתות על האש + 2 ראשונות + 5 שתייה. הכל ארוז אישית, מגיע חם לשעה שתקבעו. ₪64 לאיש.',
            'mods'  => array_merge(
                self::pita_slots(5),
                [
                    self::group_many('בחרו 2 ראשונות', self::starters(), 2, 2),
                    self::group_one('שתייה לצוות', self::drinks_tray(5)),
                    self::group_one('חריפות', self::spicy()),
                ]
            ),
        ];

        $combos[] = [
            'name'  => 'עלינא למשרד — 10 סועדים',
            'price' => 619,
            'desc'  => '10 פיתות על האש + 3 ראשונות + סלטייה משולשת + 10 שתייה. ארוחת צוות שלמה, ₪62 לאיש.',
            'mods'  => [
                self::group_many('בחרו עד 4 סוגי פיתות — נחלק שווה בשווה', self::pitas_mix(), 1, 4),
                self::group_many('בחרו 3 ראשונות', self::starters(), 3, 3),
                self::group_many('בחרו 3 סלטיות', self::salatia(), 3, 3),
                self::group_one('שתייה לצוות', self::drinks_tray(10)),
                self::group_one('חריפות', self::spicy()),
            ],
        ];

        return $combos;
    }

    /* ===========================================================
       Admin page
       =========================================================== */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'קומבואים וקופון שקית',
            'קומבואים ודילים',
            'manage_woocommerce',
            'alena-combos',
            [$this, 'render']
        );
    }

    public function render() {
        $nonce   = wp_create_nonce('alena_dz_combos');
        $combos  = self::combos();
        $cat     = term_exists(self::CATEGORY_NAME, 'product_cat');
        $coupon  = new WC_Coupon(self::COUPON_CODE);
        $has_cpn = $coupon->get_id() > 0;
        ?>
        <div class="wrap" dir="rtl">
          <h1>קומבואים וקופון שקית</h1>
          <p>יוצר את קטגוריית <strong><?php echo esc_html(self::CATEGORY_NAME); ?></strong>, <strong><?php echo count($combos); ?> מוצרי קומבו</strong>
             עם כל קבוצות הבחירה, ואת קופון <strong><?php echo esc_html(self::COUPON_CODE); ?></strong>.
             ניתן להריץ שוב — קיימים יתעדכנו, לא יוכפלו.</p>

          <p>
            <strong>סטטוס:</strong>
            קטגוריה <?php echo $cat ? '✓ קיימת' : '— טרם נוצרה'; ?> ·
            קופון <?php echo $has_cpn ? '✓ קיים' : '— טרם נוצר'; ?>
          </p>

          <h2>מה ייבנה</h2>
          <table class="widefat striped" style="max-width:820px">
            <thead><tr><th>קומבו</th><th style="width:90px">מחיר</th><th style="width:130px">קבוצות בחירה</th></tr></thead>
            <tbody>
            <?php foreach ($combos as $c): ?>
              <tr>
                <td><strong><?php echo esc_html($c['name']); ?></strong><br>
                    <span style="color:#666"><?php echo esc_html($c['desc']); ?></span></td>
                <td>₪<?php echo (int) $c['price']; ?></td>
                <td><?php echo count($c['mods']); ?></td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>

          <h2>קופון <?php echo esc_html(self::COUPON_CODE); ?></h2>
          <ul style="list-style:disc;padding-inline-start:22px;max-width:820px">
            <li><strong>₪25 הנחה</strong> על הזמנה מעל <strong>₪110</strong>.</li>
            <li><strong>שימוש אחד לכל מספר טלפון</strong> — נאכף גם על הזמנות אורח, לא רק על משתמשים רשומים.</li>
            <li>לא מצטבר עם קופונים אחרים ולא חל על פריטים במבצע.</li>
            <li><strong>ללא תאריך תפוגה</strong> — הכרטיסים המודפסים מסתובבים חודשים, קוד שפג תוקפו על כרטיס מודפס הוא לקוח אבוד.</li>
          </ul>

          <div class="notice notice-warning inline" style="max-width:820px;margin:16px 0">
            <p><strong>לבדוק לפני שמפרסמים:</strong> המחירים מחושבים מול תפריט Wolt החי נכון ל-11.8.2026
               (פיתה בסיס ₪51), לא מול עלות המזון בפועל. אם עלות חומר הגלם גבוהה מ-35%, כדאי להעלות את
               הדילים הקבוצתיים ב-₪10 לפני שהם עולים לאוויר. אחרי הבנייה אפשר לערוך כל מחיר ישירות במוצרים.</p>
          </div>

          <p><button id="alena-combos-go" class="button button-primary button-hero">בנה עכשיו</button></p>
          <pre id="alena-combos-log" style="background:#fff;border:1px solid #ddd;padding:12px;max-height:420px;overflow:auto;white-space:pre-wrap;direction:ltr"></pre>
        </div>
        <script>
        (function ($) {
          const $log = $('#alena-combos-log');
          function log(line) { $log.append(line + "\n"); $log[0].scrollTop = $log[0].scrollHeight; }
          $('#alena-combos-go').on('click', function () {
            $(this).prop('disabled', true).text('בונה…');
            $log.empty(); log('-- starting --');
            $.post(ajaxurl, { action: 'alena_dz_build_combos', nonce: '<?php echo esc_js($nonce); ?>' }, function (r) {
              if (r.success) {
                (r.data.lines || []).forEach(log);
                log('-- ' + r.data.summary + ' --');
              } else {
                log('ERROR: ' + (r.data || ''));
              }
              $('#alena-combos-go').prop('disabled', false).text('הרץ שוב');
            }).fail(function (xhr) {
              log('NETWORK ERROR: HTTP ' + xhr.status);
              $('#alena-combos-go').prop('disabled', false).text('נסה שוב');
            });
          });
        })(jQuery);
        </script>
        <?php
    }

    /* ===========================================================
       Build
       =========================================================== */

    public function ajax_build() {
        check_ajax_referer('alena_dz_combos', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);

        @set_time_limit(120);
        $lines = [];
        $created = 0;
        $updated = 0;

        // 1. Category — pinned to the top of the shop so the deals are the first thing seen.
        $term = term_exists(self::CATEGORY_NAME, 'product_cat');
        if (!$term) {
            $term = wp_insert_term(self::CATEGORY_NAME, 'product_cat', ['slug' => 'combo-deals']);
            if (is_wp_error($term)) wp_send_json_error('category_failed: ' . $term->get_error_message(), 500);
            $lines[] = '+ category: ' . self::CATEGORY_NAME;
        } else {
            $lines[] = '= category exists: ' . self::CATEGORY_NAME;
        }
        $cat_id = (int) (is_array($term) ? $term['term_id'] : $term);
        update_term_meta($cat_id, 'order', 0);

        // 2. Combo products
        foreach (self::combos() as $idx => $c) {
            $existing_id = $this->find_product_by_title($c['name']);
            $price = (string) $c['price'];

            if ($existing_id) {
                wp_update_post([
                    'ID'           => $existing_id,
                    'post_content' => $c['desc'],
                    'post_excerpt' => $c['desc'],
                    'menu_order'   => $idx,
                ]);
                $product_id = $existing_id;
                $updated++;
                $lines[] = '~ updated: ' . $c['name'] . ' ₪' . $price;
            } else {
                $product_id = wp_insert_post([
                    'post_type'    => 'product',
                    'post_status'  => 'publish',
                    'post_title'   => $c['name'],
                    'post_content' => $c['desc'],
                    'post_excerpt' => $c['desc'],
                    'menu_order'   => $idx,
                ]);
                if (is_wp_error($product_id)) {
                    $lines[] = 'x error: ' . $c['name'] . ' :: ' . $product_id->get_error_message();
                    continue;
                }
                wp_set_object_terms($product_id, ['simple'], 'product_type');
                $created++;
                $lines[] = '+ created: ' . $c['name'] . ' ₪' . $price;
            }

            // Price is only forced on creation — once live, the owner's edits in
            // Products win, so a re-run never silently reverts a considered price change.
            if (!$existing_id) {
                update_post_meta($product_id, '_regular_price', $price);
                update_post_meta($product_id, '_price', $price);
            }
            update_post_meta($product_id, '_stock_status', 'instock');
            update_post_meta($product_id, '_virtual', 'no');
            update_post_meta($product_id, '_visibility', 'visible');
            update_post_meta($product_id, self::COMBO_META, 1);
            update_post_meta($product_id, Alena_DZ_Modifiers::META_KEY, wp_json_encode($c['mods'], JSON_UNESCAPED_UNICODE));
            wp_set_object_terms($product_id, [$cat_id], 'product_cat');
        }

        // 3. Coupon
        $lines[] = $this->build_coupon();

        if (function_exists('wc_delete_product_transients')) wc_delete_product_transients();

        wp_send_json_success([
            'summary' => sprintf('combos: %d created, %d updated', $created, $updated),
            'lines'   => $lines,
        ]);
    }

    /**
     * Exact-title lookup. WP_Query's `title` arg is fuzzy on some installs, so we
     * go straight to the DB — same approach the Wolt importer settled on.
     */
    private function find_product_by_title(string $title): int {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts} WHERE post_type='product' AND post_status IN ('publish','draft') AND post_title=%s LIMIT 1",
            $title
        ));
    }

    private function build_coupon(): string {
        $coupon = new WC_Coupon(self::COUPON_CODE);
        $is_new = !$coupon->get_id();

        $coupon->set_code(self::COUPON_CODE);
        $coupon->set_discount_type('fixed_cart');
        $coupon->set_amount(25);
        // ₪110, not ₪120: after the 2026-08-11 reprice a pita sits at ₪51, so the
        // threshold has to land just under the two-person deal to still pull upward.
        $coupon->set_minimum_amount(110);
        $coupon->set_individual_use(true);
        $coupon->set_exclude_sale_items(true);
        $coupon->set_usage_limit_per_user(1);
        $coupon->set_description('כרטיס שקית — ₪25 להזמנה ישירה ראשונה מעל ₪110. שימוש אחד לכל טלפון.');
        $coupon->save();

        update_post_meta($coupon->get_id(), self::ONCE_PER_PHONE_META, 1);

        return ($is_new ? '+ created' : '~ updated') . ' coupon: ' . self::COUPON_CODE . ' (₪25 off, min ₪120)';
    }

    /* ===========================================================
       Once-per-phone guard
       =========================================================== */

    /** 0501234567 / +972501234567 / 972-50-123-4567 all collapse to 0501234567. */
    public static function normalize_phone(string $raw): string {
        $d = preg_replace('/\D/', '', $raw);
        if ($d === '') return '';
        if (strpos($d, '972') === 0) $d = '0' . substr($d, 3);
        return $d;
    }

    /** Best guess at the phone for the order being built — checkout POST first, then the account. */
    private function current_phone(): string {
        if (!empty($_POST['billing_phone'])) {
            return self::normalize_phone(sanitize_text_field(wp_unslash($_POST['billing_phone'])));
        }
        // During checkout's AJAX refresh the fields arrive url-encoded inside `post_data`
        // rather than as top-level params, so the phone is invisible without this.
        if (!empty($_POST['post_data'])) {
            parse_str((string) wp_unslash($_POST['post_data']), $fields);
            if (!empty($fields['billing_phone'])) {
                return self::normalize_phone(sanitize_text_field((string) $fields['billing_phone']));
            }
        }
        if (function_exists('WC') && WC()->customer) {
            $p = (string) WC()->customer->get_billing_phone();
            if ($p !== '') return self::normalize_phone($p);
        }
        if (is_user_logged_in()) {
            $p = (string) get_user_meta(get_current_user_id(), 'billing_phone', true);
            if ($p !== '') return self::normalize_phone($p);
        }
        return '';
    }

    private function used_phones(int $coupon_id): array {
        $list = get_post_meta($coupon_id, self::USED_PHONES_META, true);
        return is_array($list) ? $list : [];
    }

    /**
     * Blocks a flagged coupon once its phone has already redeemed it.
     *
     * Deliberately fails OPEN when no phone is known yet: on the cart page the
     * customer has not entered one, and rejecting there would make the coupon
     * look broken. Checkout re-runs this filter with billing_phone present,
     * which is where the limit actually bites.
     */
    public function validate_once_per_phone($valid, $coupon, $discounts) {
        $already_used = false;
        try {
            if (!$valid) return $valid;
            if (!is_object($coupon) || !method_exists($coupon, 'get_id')) return $valid;
            if (!get_post_meta($coupon->get_id(), self::ONCE_PER_PHONE_META, true)) return $valid;

            $phone = $this->current_phone();
            if ($phone === '') return $valid;

            $already_used = in_array($phone, $this->used_phones($coupon->get_id()), true);
        } catch (\Throwable $e) {
            return $valid; // never break checkout over a bookkeeping failure
        }

        // Thrown outside the try so the rejection can't be swallowed by our own catch.
        // WooCommerce catches it and shows the message to the customer verbatim.
        if ($already_used) {
            throw new Exception('הקוד הזה כבר מומש עם מספר הטלפון הזה. הוא תקף להזמנה ישירה ראשונה בלבד.');
        }
        return $valid;
    }

    public function record_phone_use_blocks($order) {
        if (is_object($order) && method_exists($order, 'get_id')) {
            $this->record_phone_use($order->get_id(), [], $order);
        }
    }

    public function record_phone_use($order_id, $posted_data, $order = null) {
        try {
            if (!$order) $order = wc_get_order($order_id);
            if (!$order) return;
            $phone = self::normalize_phone((string) $order->get_billing_phone());
            if ($phone === '') return;

            foreach ($order->get_coupon_codes() as $code) {
                $coupon = new WC_Coupon($code);
                $cid = $coupon->get_id();
                if (!$cid || !get_post_meta($cid, self::ONCE_PER_PHONE_META, true)) continue;

                $list = $this->used_phones($cid);
                if (!in_array($phone, $list, true)) {
                    $list[] = $phone;
                    update_post_meta($cid, self::USED_PHONES_META, $list);
                }
            }
        } catch (\Throwable $e) {
            if (function_exists('error_log')) {
                error_log('Alena_DZ_Combos::record_phone_use error: ' . $e->getMessage());
            }
        }
    }
}
