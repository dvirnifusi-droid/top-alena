<?php
if (!defined('ABSPATH')) exit;

/**
 * Hours engine for Alena.
 *
 *   - Stores per-service (delivery / pickup), per-day open/close ranges.
 *   - Friday delivery is limited to a category whitelist (e.g. "חומוסייה זוהרה").
 *   - Saturday (motzaei Shabbat) opens dynamically: Shabbat-end (from Hebcal)
 *     + 30 minutes. Cached for 7 days.
 *
 * Stored in wp_options as JSON under self::OPTION_KEY:
 *   {
 *     "delivery": {
 *        "0": [["11:00","23:00"]],            // Sunday
 *        ...
 *        "5": [["11:00","15:00", {"category_slug":"chumosia-zohara"}]],
 *        "6": [["motzash+30","23:30"]]        // dynamic Sat night
 *     },
 *     "pickup":   { ... same shape ... }
 *   }
 *
 * Times use 24h "HH:MM". "motzash+N" means N minutes after Shabbat end
 * for the given Saturday. Closing times after midnight (e.g. "01:55")
 * are interpreted as next-day; the engine compares against an extended
 * window automatically.
 */
class Alena_DZ_Hours_Engine {

    const OPTION_KEY      = 'alena_hours_config';
    const HEBCAL_CACHE_PFX = 'alena_havdalah_';

    /** PHP day-of-week: 0=Sun, 1=Mon, ... 6=Sat */
    public function default_config(): array {
        return [
            'delivery' => [
                '0' => [['11:00', '23:00']],                            // א
                '1' => [['11:00', '23:00']],                            // ב
                '2' => [['11:00', '23:00']],                            // ג
                '3' => [['11:00', '23:00']],                            // ד
                '4' => [['11:00', '23:00']],                            // ה
                '5' => [['11:00', '15:00', ['category_slug' => 'chumosia-zohara']]], // ו (only חומוסייה זוהרה)
                '6' => [['motzash+30', '23:30']],                       // ש (after Shabbat end)
            ],
            'pickup' => [
                '0' => [['11:00', '23:55']], // א
                '1' => [['11:00', '23:55']], // ב
                '2' => [['11:00', '23:55']], // ג
                '3' => [['11:00', '23:55']], // ד
                '4' => [['11:00', '01:55']], // ה  (until 01:55 next morning)
                '5' => [['11:00', '15:00']], // ו
                '6' => [['motzash+30', '00:55']], // ש
            ],
        ];
    }

    public function get_config(): array {
        $json = get_option(self::OPTION_KEY, '');
        $arr  = $json ? json_decode($json, true) : null;
        return is_array($arr) ? $arr : $this->default_config();
    }

    public function save_config(array $config): bool {
        return update_option(self::OPTION_KEY, wp_json_encode($config, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Is the given service open at the given moment, for the given product
     * categories?
     *
     * @return array {
     *   open: bool,
     *   reason?: string,  // user-facing reason when closed
     *   next_open?: DateTime,  // earliest re-open (best-effort)
     * }
     */
    public function status(string $service, ?DateTimeImmutable $when = null, array $product_category_slugs = []): array {
        $when = $when ?: new DateTimeImmutable('now', $this->tz());
        $config = $this->get_config()[$service] ?? [];
        $dow = (int) $when->format('w'); // 0..6
        $hhmm = $when->format('H:i');

        $today_ranges = $config[(string) $dow] ?? [];

        foreach ($today_ranges as $range) {
            [$open_str, $close_str] = [$range[0], $range[1]];
            $meta = $range[2] ?? [];

            $open_min  = $this->resolve_time_to_minutes($open_str, $when);
            $close_min = $this->resolve_time_to_minutes($close_str, $when);
            $now_min   = $this->time_to_minutes($hhmm);

            // Handle "wraps past midnight" (e.g. close at 01:55 means next day)
            if ($close_min < $open_min) $close_min += 24 * 60;
            $effective_now = ($now_min < $open_min && $close_min > 24*60) ? $now_min + 24*60 : $now_min;

            if ($effective_now >= $open_min && $effective_now <= $close_min) {
                // Inside a range — check category restriction
                if (!empty($meta['category_slug'])) {
                    $allowed = (array) $meta['category_slug'];
                    if (!array_intersect($allowed, $product_category_slugs)) {
                        return [
                            'open' => false,
                            'reason' => 'בשעה הזו ניתן להזמין רק מוצרים מקטגוריית "' . implode(' / ', $allowed) . '"',
                        ];
                    }
                }
                return ['open' => true];
            }
        }

        // Also consider yesterday's ranges that wrap past midnight (e.g.
        // Thursday 11:00–01:55 covers Friday 00:30).
        $yesterday_dow = ($dow + 6) % 7;
        $yesterday_ranges = $config[(string) $yesterday_dow] ?? [];
        $when_yesterday = $when->modify('-1 day');
        foreach ($yesterday_ranges as $range) {
            [$open_str, $close_str] = [$range[0], $range[1]];
            $open_min  = $this->resolve_time_to_minutes($open_str, $when_yesterday);
            $close_min = $this->resolve_time_to_minutes($close_str, $when_yesterday);
            if ($close_min < $open_min) {
                // Wraps. Today's portion: 0..(close_min)
                $now_min = $this->time_to_minutes($hhmm);
                if ($now_min <= $close_min) {
                    return ['open' => true];
                }
            }
        }

        return [
            'open'   => false,
            'reason' => 'מחוץ לשעות הפעילות',
        ];
    }

    /* ----------------------- Time helpers ----------------------- */

    private function tz(): DateTimeZone {
        return new DateTimeZone('Asia/Jerusalem');
    }

    private function time_to_minutes(string $hhmm): int {
        [$h, $m] = array_pad(explode(':', $hhmm), 2, '0');
        return ((int) $h) * 60 + (int) $m;
    }

    /**
     * Resolves a config time string to "minutes since midnight" relative to
     * the given reference day. Supports literal "HH:MM" and "motzash+N".
     */
    private function resolve_time_to_minutes(string $value, DateTimeImmutable $reference_day): int {
        if (preg_match('/^motzash\+(\d+)$/', $value, $m)) {
            $havdalah_min = $this->havdalah_minutes_for_saturday($reference_day);
            return $havdalah_min + (int) $m[1];
        }
        return $this->time_to_minutes($value);
    }

    /**
     * Minutes-since-midnight of Shabbat end ("Havdalah") for the Saturday
     * that contains $when. If $when is not Saturday we still treat it as
     * "this Saturday". Result is cached for 7 days.
     */
    public function havdalah_minutes_for_saturday(DateTimeImmutable $when): int {
        // Find the Saturday of this week
        $dow = (int) $when->format('w');
        $offset_to_saturday = (6 - $dow + 7) % 7;
        $saturday = $when->modify("+{$offset_to_saturday} day")->setTime(0, 0, 0);

        $key = self::HEBCAL_CACHE_PFX . $saturday->format('Y-m-d');
        $cached = get_transient($key);
        if (is_int($cached)) return $cached;

        // Hebcal: https://www.hebcal.com/shabbat?cfg=json&geonameid=...
        // Rishon LeZion geonameid = 295629
        $url = add_query_arg([
            'cfg'        => 'json',
            'geonameid'  => 295629,
            'gy'         => $saturday->format('Y'),
            'gm'         => (int) $saturday->format('m'),
            'gd'         => (int) $saturday->format('d'),
            'M'          => 'on', // havdalah using fixed minutes (50 by default)
        ], 'https://www.hebcal.com/shabbat');

        $resp = wp_remote_get($url, ['timeout' => 6]);
        $default_minutes = 20 * 60 + 30; // 20:30 fallback
        if (is_wp_error($resp)) return $default_minutes;
        $body = json_decode(wp_remote_retrieve_body($resp), true);
        if (!is_array($body) || empty($body['items'])) {
            set_transient($key, $default_minutes, WEEK_IN_SECONDS);
            return $default_minutes;
        }

        $havdalah_iso = null;
        foreach ($body['items'] as $item) {
            if (($item['category'] ?? '') === 'havdalah') {
                $havdalah_iso = $item['date'] ?? null;
                break;
            }
        }
        if (!$havdalah_iso) {
            set_transient($key, $default_minutes, WEEK_IN_SECONDS);
            return $default_minutes;
        }
        try {
            $dt = new DateTimeImmutable($havdalah_iso);
            $dt = $dt->setTimezone($this->tz());
            $mins = ((int) $dt->format('H')) * 60 + (int) $dt->format('i');
        } catch (Exception $e) {
            $mins = $default_minutes;
        }
        set_transient($key, $mins, WEEK_IN_SECONDS);
        return $mins;
    }

    /* ----------------------- Singleton-ish helper ----------------------- */

    private static $instance = null;
    public static function get(): self {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }
}
