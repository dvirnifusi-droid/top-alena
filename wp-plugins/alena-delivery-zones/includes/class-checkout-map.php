<?php
if (!defined('ABSPATH')) exit;

/**
 * Renders the address-pin Google Map under the billing form on the checkout
 * page. The map is interactive: address fields auto-center the marker, and
 * the customer can drag the marker to a more accurate spot (e.g. side
 * entrance, parking). The chosen lat/lng is stored in WC session so the
 * shipping method can use it instead of geocoding the textual address.
 */
class Alena_DZ_Checkout_Map {

    public function __construct() {
        add_action('wp_enqueue_scripts',                     [$this, 'enqueue']);
        add_action('woocommerce_after_checkout_billing_form',[$this, 'render_map']);
        add_action('wp_ajax_nopriv_alena_dz_save_pin',       [$this, 'ajax_save_pin']);
        add_action('wp_ajax_alena_dz_save_pin',              [$this, 'ajax_save_pin']);
    }

    public function enqueue() {
        if (!function_exists('is_checkout') || !is_checkout()) return;
        $key = get_option('alena_dz_google_key', '');
        if (!$key) return;

        wp_enqueue_script(
            'alena-dz-checkout-google-maps',
            "https://maps.googleapis.com/maps/api/js?key={$key}&libraries=geometry&language=he&loading=async",
            [], null, true
        );
        wp_enqueue_script(
            'alena-dz-checkout-map',
            ALENA_DZ_URL . 'assets/checkout-map.js',
            ['alena-dz-checkout-google-maps', 'jquery'],
            ALENA_DZ_VERSION,
            true
        );
        wp_localize_script('alena-dz-checkout-map', 'AlenaDZCheckout', [
            'center'  => ['lat' => 31.9637, 'lng' => 34.8044],
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_dz_checkout'),
        ]);
        wp_enqueue_style(
            'alena-dz-checkout-map',
            ALENA_DZ_URL . 'assets/checkout-map.css',
            [],
            ALENA_DZ_VERSION
        );
    }

    public function render_map() {
        echo '<div class="alena-dz-checkout-map-wrap">';
        echo '<h3>סמן את המיקום המדויק שלך 📍</h3>';
        echo '<p>אופציונלי — תעזור לשליח למצוא אותך מהר יותר (כניסה לחנייה, שער צדדי וכו׳). הדבק את הסיכה במקום בו אתה רוצה שיגיע השליח.</p>';
        echo '<div id="alena-dz-checkout-map"></div>';
        echo '<input type="hidden" name="alena_pin_lat" id="alena_pin_lat" value="" />';
        echo '<input type="hidden" name="alena_pin_lng" id="alena_pin_lng" value="" />';
        echo '<p id="alena-dz-pin-status" class="alena-dz-pin-status"></p>';
        echo '</div>';
    }

    public function ajax_save_pin() {
        check_ajax_referer('alena_dz_checkout', 'nonce');
        $lat = isset($_POST['lat']) ? (float) $_POST['lat'] : 0.0;
        $lng = isset($_POST['lng']) ? (float) $_POST['lng'] : 0.0;
        if (!$lat || !$lng) wp_send_json_error('bad_coords', 400);
        if (function_exists('WC') && WC()->session) {
            WC()->session->set('alena_pin_lat', $lat);
            WC()->session->set('alena_pin_lng', $lng);
            // Trigger checkout to re-evaluate shipping
            WC()->cart->calculate_shipping();
            wp_send_json_success(['saved' => true]);
        }
        wp_send_json_error('no_session', 500);
    }
}
