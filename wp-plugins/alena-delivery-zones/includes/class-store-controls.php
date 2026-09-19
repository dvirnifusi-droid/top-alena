<?php
if (!defined('ABSPATH')) exit;

/**
 * Live operational controls the owner flips from the TOP ALENA app:
 *
 *   - Store status: open / closed-now / delivery-only / pickup-only, plus a
 *     "busy" prep-time bump. Enforced through the hours engine so every
 *     consumer (checkout notice, shipping removal, shortcode) obeys it.
 *   - Announcement bar: a thin sticky banner across the storefront.
 *   - Free delivery over ₪X: applied to the polygon shipping rate.
 *   - Date overrides: closed / special hours for a single calendar date
 *     (holidays), consulted by the hours engine before the weekday grid.
 *
 * Storage is a handful of wp_options, all whitelisted through the control
 * bridge (class-control-api.php). This class owns the READ helpers plus the
 * storefront rendering; the engine and shipping method call the helpers.
 */
class Alena_DZ_Store_Controls {

    const OPT_STATUS   = 'alena_store_status';         // {mode, busy_extra_min, message}
    const OPT_ANNOUNCE = 'alena_announcement';         // {enabled, text}
    const OPT_FREE     = 'alena_free_delivery_over';   // float (0 = off)
    const OPT_DATES    = 'alena_date_overrides';       // { "Y-m-d": {mode|delivery|pickup} }

    public function __construct() {
        add_action('wp_body_open', [$this, 'render_banner']);
        add_action('wp_head',      [$this, 'banner_css'], 20);
        // Fallback for themes that never fire wp_body_open.
        add_action('wp_footer',    [$this, 'render_banner_fallback']);
    }

    /* ----------------------- Read helpers ----------------------- */

    public static function status(): array {
        $s = get_option(self::OPT_STATUS, []);
        if (!is_array($s)) $s = [];
        return [
            'mode'           => in_array(($s['mode'] ?? 'open'), ['open', 'closed', 'delivery_only', 'pickup_only'], true) ? $s['mode'] : 'open',
            'busy_extra_min' => max(0, (int) ($s['busy_extra_min'] ?? 0)),
            'message'        => (string) ($s['message'] ?? ''),
        ];
    }

    public static function mode(): string          { return self::status()['mode']; }
    public static function busy_extra_min(): int    { return self::status()['busy_extra_min']; }

    /* ----------------------- Business info (owner-editable) ----------------------- */

    const OPT_PHONE   = 'alena_biz_phone';
    const OPT_ADDRESS = 'alena_biz_address';
    const OPT_CITY    = 'alena_biz_city';
    const OPT_RATING  = 'alena_biz_rating';
    const OPT_TIPS    = 'alena_biz_tip_presets';

    public static function phone(): string   { $v = trim((string) get_option(self::OPT_PHONE, ''));   return $v !== '' ? $v : '03-6228055'; }
    public static function address(): string { $v = trim((string) get_option(self::OPT_ADDRESS, '')); return $v !== '' ? $v : 'רוטשילד 104'; }
    public static function city(): string    { $v = trim((string) get_option(self::OPT_CITY, ''));    return $v !== '' ? $v : 'ראשון לציון'; }
    public static function address_full(): string { return self::address() . ', ' . self::city(); }

    /** International dial form for tel: links, e.g. +97236228055. */
    public static function phone_intl(): string {
        $d = preg_replace('/\D/', '', self::phone());
        if (strpos($d, '0') === 0) $d = '972' . substr($d, 1);
        elseif (strpos($d, '972') !== 0) $d = '972' . $d;
        return '+' . $d;
    }

    public static function rating(): string {
        $v = trim((string) get_option(self::OPT_RATING, ''));
        return $v !== '' ? $v : '4.9';
    }

    /** Tip preset buttons (₪), e.g. [0,5,10,15]. */
    public static function tip_presets(): array {
        $raw = get_option(self::OPT_TIPS, '');
        if (is_string($raw) && $raw !== '') {
            $vals = array_values(array_filter(array_map('intval', array_map('trim', explode(',', $raw))), function ($n) { return $n >= 0; }));
            if ($vals) { if (!in_array(0, $vals, true)) array_unshift($vals, 0); return array_slice($vals, 0, 6); }
        }
        return [0, 5, 10, 15];
    }

    /** Served cities — derived from the ENABLED delivery polygons (falls back to a
     *  sensible default). Keeps the "we deliver to X, Y, Z" copy in step with zones. */
    public static function served_cities(): array {
        $out = [];
        if (class_exists('Alena_DZ_Polygon_Store')) {
            foreach (Alena_DZ_Polygon_Store::all() as $z) {
                if (!is_array($z) || !empty($z['disabled'])) continue;
                $n = trim((string) ($z['name'] ?? ''));
                if ($n !== '' && !in_array($n, $out, true)) $out[] = $n;
            }
        }
        return $out ?: ['ראשון לציון', 'משמר השבעה', 'בית דגן'];
    }

    /** Served-cities as a Hebrew list: "א, ב ו-ג". */
    public static function served_cities_text(): string {
        $c = self::served_cities();
        if (count($c) <= 1) return implode('', $c);
        $last = array_pop($c);
        return implode(', ', $c) . ' ו' . $last;
    }

    /** Estimated time range for a service, "min–max דק׳", incl. the busy bump.
     *  Single source so every ETA on the site agrees (was 3 conflicting literals). */
    public static function eta_range(string $service): string {
        $def = ['delivery_min' => 40, 'delivery_max' => 60, 'pickup_min' => 15, 'pickup_max' => 25];
        $cfg = get_option('alena_cart_eta', []);
        $cfg = is_array($cfg) ? array_merge($def, $cfg) : $def;
        $bump = self::busy_extra_min();
        $min = (int) ($cfg[$service . '_min'] ?? 0) + $bump;
        $max = (int) ($cfg[$service . '_max'] ?? 0) + $bump;
        return $min . '–' . $max . ' דק׳';
    }
    public static function status_message(): string { return self::status()['message']; }

    /**
     * Manual override for a service, independent of the schedule.
     * @return array{closed:bool, reason:string}
     */
    public static function manual_service_closed(string $service): array {
        $st  = self::status();
        $msg = $st['message'] !== '' ? $st['message'] : 'המסעדה סגורה כרגע';
        switch ($st['mode']) {
            case 'closed':
                return ['closed' => true, 'reason' => $msg];
            case 'delivery_only':
                if ($service === 'pickup')   return ['closed' => true, 'reason' => 'כרגע משלוחים בלבד'];
                break;
            case 'pickup_only':
                if ($service === 'delivery') return ['closed' => true, 'reason' => 'כרגע איסוף עצמי בלבד'];
                break;
        }
        return ['closed' => false, 'reason' => ''];
    }

    public static function announcement(): array {
        $a = get_option(self::OPT_ANNOUNCE, []);
        if (!is_array($a)) $a = [];
        return ['enabled' => !empty($a['enabled']), 'text' => (string) ($a['text'] ?? '')];
    }

    public static function free_delivery_over(): float {
        return max(0, (float) get_option(self::OPT_FREE, 0));
    }

    public static function date_overrides(): array {
        $d = get_option(self::OPT_DATES, []);
        return is_array($d) ? $d : [];
    }

    /**
     * Override entry for a given day, or null. Shape:
     *   {"mode":"closed"}  → shut that date entirely
     *   {"delivery":[["11:00","14:00"]], "pickup":[["11:00","16:00"]]}
     */
    public static function date_override_for(DateTimeImmutable $when): ?array {
        $key = $when->format('Y-m-d');
        $all = self::date_overrides();
        return isset($all[$key]) && is_array($all[$key]) ? $all[$key] : null;
    }

    /* ----------------------- Storefront banner ----------------------- */

    private $rendered = false;

    public function banner_css() {
        if (is_admin()) return;
        echo '<style id="alena-banner-css">'
           . '.alena-topbar{position:sticky;top:0;z-index:9999;width:100%;text-align:center;'
           . 'font-weight:700;font-size:14px;line-height:1.35;padding:9px 14px;'
           . 'font-family:inherit;direction:rtl}'
           . '.alena-topbar--info{background:#3a2a1e;color:#ffe8c9}'
           . '.alena-topbar--warn{background:#b3261e;color:#fff}'
           . '.alena-topbar--busy{background:#8a5a00;color:#fff}'
           . '.alena-topbar a{color:inherit;text-decoration:underline}'
           . '</style>';
    }

    public function render_banner() {
        if ($this->rendered || is_admin()) return;
        $this->rendered = true;

        $st = self::status();

        // Closed / limited state gets top billing.
        if ($st['mode'] === 'closed') {
            $msg = $st['message'] !== '' ? $st['message'] : 'המסעדה סגורה כרגע — נשמח לראותכם בקרוב 🙏';
            echo '<div class="alena-topbar alena-topbar--warn">' . esc_html($msg) . '</div>';
        } elseif ($st['mode'] === 'delivery_only') {
            echo '<div class="alena-topbar alena-topbar--warn">כרגע משלוחים בלבד — איסוף עצמי חוזר בהמשך</div>';
        } elseif ($st['mode'] === 'pickup_only') {
            echo '<div class="alena-topbar alena-topbar--warn">כרגע איסוף עצמי בלבד — משלוחים חוזרים בהמשך</div>';
        } elseif ($st['busy_extra_min'] > 0) {
            echo '<div class="alena-topbar alena-topbar--busy">🔥 עומס גבוה — זמני ההכנה ארוכים מהרגיל בכ־'
               . (int) $st['busy_extra_min'] . ' דקות. תודה על הסבלנות!</div>';
        }

        // Owner announcement (shown in addition, when set).
        $a = self::announcement();
        if ($a['enabled'] && $a['text'] !== '') {
            echo '<div class="alena-topbar alena-topbar--info">' . wp_kses($a['text'], ['a' => ['href' => [], 'target' => []], 'strong' => [], 'b' => []]) . '</div>';
        }
    }

    /** Only fires if wp_body_open never did. */
    public function render_banner_fallback() {
        if ($this->rendered) return;
        $this->render_banner();
    }
}
