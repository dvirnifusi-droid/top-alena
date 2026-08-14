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

    /** Coordinates chosen by the customer this session, if any. */
    public static function session_coords(): ?array {
        if (!function_exists('WC') || !WC()->session) return null;
        $lat = WC()->session->get(self::SESS_LAT);
        $lng = WC()->session->get(self::SESS_LNG);
        if (!$lat || !$lng) return null;
        return ['lat' => (float) $lat, 'lng' => (float) $lng];
    }
}
