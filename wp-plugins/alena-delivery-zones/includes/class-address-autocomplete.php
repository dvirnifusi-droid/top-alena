<?php
if (!defined('ABSPATH')) exit;

/**
 * Real address autocomplete on checkout.
 *
 * Customers typed addresses freehand, so the shipping method received things
 * like "hrzael 34" — which no geocoder resolves, so no delivery rate was
 * offered and the order could not be completed. Picking from Google Places
 * guarantees the string that reaches Alena_DZ_Geocoder is one that geocodes,
 * and the chosen coordinates are stored so the zone lookup does not have to
 * geocode the text again.
 *
 * Restricted to Israel, addresses only, biased to the restaurant.
 */
class Alena_DZ_Address_Autocomplete {

    const SESS_LAT = 'alena_addr_lat';
    const SESS_LNG = 'alena_addr_lng';

    public function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue'], 30);
        add_action('wp_ajax_alena_addr_coords',        [$this, 'ajax_store_coords']);
        add_action('wp_ajax_nopriv_alena_addr_coords', [$this, 'ajax_store_coords']);
        add_action('wp_ajax_alena_ship_debug',         [$this, 'ajax_ship_debug']);
    }

    /** Browser-restricted key; falls back to the server key if that is all there is. */
    public static function browser_key(): string {
        $k = (string) get_option('alena_dz_google_key', '');
        if ($k === '') $k = (string) get_option('alena_dz_google_server_key', '');
        return trim($k);
    }

    public function enqueue() {
        if (!function_exists('is_checkout')) return;
        if (!(is_checkout() || is_cart())) return;

        $key = self::browser_key();
        if ($key === '') return;   // no key configured — leave the plain field alone

        wp_enqueue_style(
            'alena-dz-address',
            ALENA_DZ_URL . 'assets/address-autocomplete.css',
            [],
            ALENA_DZ_VERSION
        );

        // Maps is NOT enqueued here. Another plugin already loads it, and two
        // copies on one page make the API throw; the script below loads it on
        // demand only when it is genuinely missing.
        wp_enqueue_script(
            'alena-dz-address',
            ALENA_DZ_URL . 'assets/address-autocomplete.js',
            ['jquery'],
            ALENA_DZ_VERSION,
            true
        );

        wp_localize_script('alena-dz-address', 'AlenaAddr', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_addr'),
            'key'     => $key,
            // Bias results to the restaurant so nearby streets rank first.
            'center'  => [
                'lat' => (float) get_option('alena_dz_center_lat', 31.9730),
                'lng' => (float) get_option('alena_dz_center_lng', 34.7925),
            ],
        ]);
    }

    /**
     * Stores the coordinates of the picked address on the WC session, so the
     * shipping method can match a zone without a second geocode round trip.
     */
    public function ajax_store_coords() {
        check_ajax_referer('alena_addr', 'nonce');
        if (!function_exists('WC') || !WC()->session) wp_send_json_error('no_session', 500);

        $lat = isset($_POST['lat']) ? (float) $_POST['lat'] : 0;
        $lng = isset($_POST['lng']) ? (float) $_POST['lng'] : 0;
        if (!$lat || !$lng) {
            WC()->session->set(self::SESS_LAT, null);
            WC()->session->set(self::SESS_LNG, null);
            wp_send_json_success(['cleared' => true]);
        }

        WC()->session->set(self::SESS_LAT, $lat);
        WC()->session->set(self::SESS_LNG, $lng);
        wp_send_json_success(['lat' => $lat, 'lng' => $lng]);
    }

    /**
     * Walks the same decisions calculate_shipping() makes and reports where a
     * rate stops being possible. Admin-only; exists to answer "why is there no
     * delivery option" without server log access.
     */
    public function ajax_ship_debug() {
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);

        $out = [];
        $out['wc'] = function_exists('WC');
        if (!function_exists('WC')) wp_send_json_success($out);

        $cust = WC()->customer;
        $out['destination'] = $cust ? [
            'country' => $cust->get_shipping_country(),
            'state'   => $cust->get_shipping_state(),
            'city'    => $cust->get_shipping_city(),
            'address' => $cust->get_shipping_address(),
        ] : null;

        $out['session_coords'] = self::session_coords();
        $out['cart_subtotal']  = WC()->cart ? (float) WC()->cart->get_subtotal() : null;
        $out['needs_shipping'] = WC()->cart ? WC()->cart->needs_shipping() : null;

        // Which zone does WooCommerce match this customer to, and what methods
        // does that zone actually expose?
        if (class_exists('WC_Shipping_Zones')) {
            $packages = WC()->cart ? WC()->cart->get_shipping_packages() : [];
            $pkg = $packages ? reset($packages) : [];
            $zone = $pkg ? WC_Shipping_Zones::get_zone_matching_package($pkg) : null;
            $out['zone'] = $zone ? [
                'id'   => $zone->get_id(),
                'name' => $zone->get_zone_name(),
                'methods' => array_map(function ($m) {
                    return [
                        'id'       => $m->id,
                        'instance' => $m->get_instance_id(),
                        'enabled'  => $m->is_enabled(),
                        'title'    => $m->get_title(),
                    ];
                }, $zone->get_shipping_methods(false)),
            ] : 'no_zone_match';
        }

        // Resolve coordinates exactly as the shipping method would, then report
        // which polygon (if any) contains them.
        $coords = self::session_coords();
        $out['coord_source'] = $coords ? 'session' : null;
        if (!$coords && $cust) {
            $addr = trim(implode(', ', array_filter([
                $cust->get_shipping_address(), $cust->get_shipping_city(), 'Israel',
            ])));
            $out['geocode_input'] = $addr;
            $coords = $addr ? Alena_DZ_Geocoder::geocode($addr) : null;
            $out['coord_source'] = $coords ? 'geocoder' : 'none';
        }
        $out['coords'] = $coords;

        if ($coords && class_exists('Alena_DZ_Polygon_Store')) {
            $poly = Alena_DZ_Polygon_Store::find_containing($coords['lat'], $coords['lng']);
            $out['polygon'] = $poly ? [
                'name' => $poly['name'],
                'fee'  => $poly['delivery_fee'],
                'min'  => $poly['min_order'],
            ] : 'no_polygon_contains_point';
            $all = Alena_DZ_Polygon_Store::all();
            $out['polygon_count'] = count($all);
            $out['first_vertex']  = $all ? ($all[0]['coords'][0] ?? null) : null;
        }

        // Where the shipping method itself last stopped — the one thing the
        // reconstruction above cannot tell us.
        $out['last_trace'] = get_transient('alena_dz_ship_trace') ?: 'never_ran';

        wp_send_json_success($out);
    }

    /** Coordinates chosen by the customer this session, if any. */
    public static function session_coords(): ?array {
        if (!function_exists('WC') || !WC()->session) return null;
        $lat = WC()->session->get(self::SESS_LAT);
        $lng = WC()->session->get(self::SESS_LNG);
        if (!$lat || !$lng) return null;
        return ['lat' => (float) $lat, 'lng' => (float) $lng];
    }
}
