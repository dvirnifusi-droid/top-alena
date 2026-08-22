<?php
if (!defined('ABSPATH')) exit;

/**
 * Remote control bridge — lets the TOP ALENA app read and change the delivery
 * site's settings without anyone logging into WordPress.
 *
 * Direction: the app's BACKEND calls these endpoints with a shared secret
 * (X-Alena-Control-Key). The key lives in WordPress (auto-generated once) and is
 * copied into the app; it is never exposed to a browser. WordPress stays the
 * source of truth for its own settings — the app is a remote for them.
 *
 * Phase 2 of "control the delivery site from TOP ALENA". This first slice covers
 * the settings the owner changes most: the club benefits (member discount,
 * join incentive, point values) and the feature on/off switches. Hours, menu
 * and payment come in later slices.
 */
class Alena_DZ_Control_API {

    const OPT_KEY = 'alena_control_key';

    public function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
        add_action('admin_init',    [$this, 'ensure_key']);
    }

    /** One durable secret, created the first time and kept. */
    public function ensure_key(): void {
        if (!get_option(self::OPT_KEY)) {
            update_option(self::OPT_KEY, wp_generate_password(48, false, false));
        }
    }

    public static function key(): string {
        return (string) get_option(self::OPT_KEY, '');
    }

    public function routes(): void {
        register_rest_route('alena/v1', '/control/settings', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_settings'],
                'permission_callback' => [$this, 'auth'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'set_settings'],
                'permission_callback' => [$this, 'auth'],
            ],
        ]);
    }

    /** Constant-time key check. */
    public function auth(\WP_REST_Request $req): bool {
        $sent = (string) $req->get_header('x-alena-control-key');
        $key  = self::key();
        return $key !== '' && $sent !== '' && hash_equals($key, $sent);
    }

    public function get_settings(): \WP_REST_Response {
        return rest_ensure_response(['ok' => true, 'settings' => $this->snapshot()]);
    }

    public function set_settings(\WP_REST_Request $req): \WP_REST_Response {
        $b = $req->get_json_params();
        if (!is_array($b)) $b = [];

        // --- Club / benefits (whitelisted) ---
        $club = $b['club'] ?? [];
        if (isset($club['member_discount_pct'])) {
            update_option('alena_club_member_discount_pct', max(0, min(90, (float) $club['member_discount_pct'])));
        }
        if (array_key_exists('join_incentive', $club)) {
            update_option('alena_club_join_incentive', sanitize_text_field((string) $club['join_incentive']));
        }
        if (isset($club['coin_value'])) {
            update_option('alena_club_coin_value', max(0, (float) $club['coin_value']));
        }
        if (isset($club['earn_per'])) {
            update_option('alena_club_earn_per', max(1, (float) $club['earn_per']));
        }

        // --- Feature switches (only known slugs) ---
        if (isset($b['features']) && is_array($b['features']) && class_exists('Alena_DZ_Features')) {
            $saved = get_option(Alena_DZ_Features::OPT, []);
            if (!is_array($saved)) $saved = [];
            foreach (array_keys(Alena_DZ_Features::all()) as $slug) {
                if (array_key_exists($slug, $b['features'])) {
                    $saved[$slug] = !empty($b['features'][$slug]) ? 1 : 0;
                }
            }
            update_option(Alena_DZ_Features::OPT, $saved);
        }

        return rest_ensure_response(['ok' => true, 'settings' => $this->snapshot()]);
    }

    /** The current settings, shaped for the app. */
    private function snapshot(): array {
        $club = [
            'member_discount_pct' => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::member_discount_pct() : 0,
            'join_incentive'      => (string) get_option('alena_club_join_incentive', ''),
            'join_incentive_effective' => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '',
            'coin_value'          => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::coin_value_ils() : 4,
            'earn_per'            => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::earn_per_ils() : 100,
        ];

        $features = [];
        if (class_exists('Alena_DZ_Features')) {
            foreach (Alena_DZ_Features::all() as $slug => $meta) {
                $features[$slug] = [
                    'label'   => $meta[0],
                    'desc'    => $meta[1],
                    'enabled' => Alena_DZ_Features::on($slug),
                ];
            }
        }

        return [
            'site'     => ['name' => 'עלינא בפיתה', 'url' => home_url('/order')],
            'club'     => $club,
            'features' => $features,
        ];
    }
}
