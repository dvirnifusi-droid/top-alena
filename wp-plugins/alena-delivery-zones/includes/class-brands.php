<?php
if (!defined('ABSPATH')) exit;

/**
 * Two kitchens on one shop: עלינא בפיתה and חומוס זוהרה.
 * Phase 1 of docs/ZOHARA-SECOND-BRAND-SPEC.md — the data and the guard.
 *
 * Why one install and not a duplicate site: the owner wants a customer to put
 * a pita from Alena and hummus from Zohara in ONE order. Two WordPress
 * installs cannot share a cart, so a second site would have made the headline
 * requirement impossible.
 *
 * Hours are read PER BRAND, not per site. Saturday night is exactly why:
 * Alena reopens then, Zohara does not -- it is shut from Friday 15:00 until
 * Sunday. A site-level "open" flag cannot express that.
 */
class Alena_DZ_Brands {

    const TAX      = 'alena_brand';
    const OPT_HOURS = 'alena_dz_brand_hours';
    const DEFAULT_BRAND = 'alena';

    public function __construct() {
        add_action('init', [$this, 'register_taxonomy'], 5);
        add_action('init', [$this, 'seed_terms'], 20);

        // Server-side truth. The menu will also grey these out, but a customer
        // who keeps a stale tab open, or a crafted request, must still be
        // stopped here -- the kitchen is closed either way.
        add_filter('woocommerce_is_purchasable',        [$this, 'block_when_closed'], 20, 2);
        add_filter('woocommerce_add_to_cart_validation', [$this, 'validate_add'], 20, 3);
    }

    public function register_taxonomy() {
        register_taxonomy(self::TAX, ['product'], [
            'label'             => 'מותג',
            'hierarchical'      => true,
            'public'            => false,
            'show_ui'           => true,
            'show_admin_column' => true,
            'show_in_rest'      => true,   // so the brand travels in the webhook
            'rewrite'           => false,
        ]);
    }

    public function seed_terms() {
        foreach ([
            'alena'  => 'עלינא בפיתה',
            'zohara' => 'חומוס זוהרה',
        ] as $slug => $name) {
            if (!term_exists($slug, self::TAX)) {
                wp_insert_term($name, self::TAX, ['slug' => $slug]);
            }
        }
    }

    /** A product with no brand is Alena, so the existing menu needs no edit. */
    public static function brand_of($product_id): string {
        $terms = wp_get_object_terms((int) $product_id, self::TAX, ['fields' => 'slugs']);
        if (is_wp_error($terms) || empty($terms)) return self::DEFAULT_BRAND;
        return (string) $terms[0];
    }

    /**
     * Opening hours per brand. 0 = Sunday .. 6 = Saturday, minutes from
     * midnight, null = closed that day.
     */
    public static function hours(string $brand): array {
        $saved = get_option(self::OPT_HOURS, []);
        if (isset($saved[$brand]) && is_array($saved[$brand])) return $saved[$brand];

        if ($brand === 'zohara') {
            // Owner, 2026-08-17: Sun-Thu until 17:00, Friday until 15:00,
            // Saturday closed -- and NOT reopening on Saturday night.
            return [
                0 => [9 * 60, 17 * 60],
                1 => [9 * 60, 17 * 60],
                2 => [9 * 60, 17 * 60],
                3 => [9 * 60, 17 * 60],
                4 => [9 * 60, 17 * 60],
                5 => [9 * 60, 15 * 60],
                6 => null,
            ];
        }
        return [];   // Alena keeps using the existing hours engine.
    }

    public static function is_open(string $brand, ?DateTimeImmutable $now = null): bool {
        $hours = self::hours($brand);
        if (!$hours) return true;   // no per-brand hours = follow the site

        $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $day = (int) $now->format('w');
        $mins = ((int) $now->format('G')) * 60 + (int) $now->format('i');

        if (empty($hours[$day]) || !is_array($hours[$day])) return false;
        [$from, $to] = $hours[$day];
        return $mins >= $from && $mins < $to;
    }

    /**
     * What to tell the customer. Says the DAY when the next opening is not
     * today, because "חוזרים במוצ״ש" read on Saturday night -- while the site
     * is open and taking Alena orders -- would mean "available now".
     */
    public static function closed_label(string $brand, ?DateTimeImmutable $now = null): string {
        $hours = self::hours($brand);
        if (!$hours) return 'סגור כרגע';

        $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $day = (int) $now->format('w');
        $mins = ((int) $now->format('G')) * 60 + (int) $now->format('i');

        // Still opening later today?
        if (!empty($hours[$day]) && is_array($hours[$day]) && $mins < $hours[$day][0]) {
            return 'נפתח ב-' . self::hhmm($hours[$day][0]);
        }

        $names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        for ($i = 1; $i <= 7; $i++) {
            $d = ($day + $i) % 7;
            if (!empty($hours[$d]) && is_array($hours[$d])) {
                return $i === 1 ? 'חוזרים מחר' : 'חוזרים ביום ' . $names[$d];
            }
        }
        return 'סגור כרגע';
    }

    private static function hhmm(int $minutes): string {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    /** Label for an open brand, e.g. "זמין עד 17:00". */
    public static function open_until(string $brand, ?DateTimeImmutable $now = null): string {
        $hours = self::hours($brand);
        if (!$hours) return '';
        $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $day = (int) $now->format('w');
        if (empty($hours[$day]) || !is_array($hours[$day])) return '';
        return 'זמין עד ' . self::hhmm($hours[$day][1]);
    }

    public function block_when_closed($purchasable, $product) {
        if (!$product || is_admin()) return $purchasable;
        $brand = self::brand_of($product->get_id());
        if ($brand === self::DEFAULT_BRAND) return $purchasable;
        return $purchasable && self::is_open($brand);
    }

    public function validate_add($passed, $product_id, $qty) {
        $brand = self::brand_of($product_id);
        if ($brand === self::DEFAULT_BRAND) return $passed;
        if (self::is_open($brand)) return $passed;

        $term = get_term_by('slug', $brand, self::TAX);
        $name = $term && !is_wp_error($term) ? $term->name : 'המטבח';
        wc_add_notice(
            sprintf('%s סגור כרגע — %s', $name, self::closed_label($brand)),
            'error'
        );
        return false;
    }
}
