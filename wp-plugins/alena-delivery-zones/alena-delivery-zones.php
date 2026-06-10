<?php
/**
 * Plugin Name: Alena Delivery Zones
 * Description: Google Maps polygon-based delivery zones for WooCommerce. Owner draws delivery polygons on a map; the plugin adds a WC shipping method that geocodes the customer address and matches it to the right polygon (fee, min-order).
 * Version: 0.6.0
 * Author: Alena / TOPALENA
 * Requires PHP: 7.4
 * Requires at least: 6.5
 * WC tested up to: 9.9
 * Text Domain: alena-dz
 */

if (!defined('ABSPATH')) exit;

define('ALENA_DZ_VERSION', '0.6.0');
define('ALENA_DZ_PATH', plugin_dir_path(__FILE__));
define('ALENA_DZ_URL',  plugin_dir_url(__FILE__));

require_once ALENA_DZ_PATH . 'includes/class-polygon-store.php';
require_once ALENA_DZ_PATH . 'includes/class-geocoder.php';
require_once ALENA_DZ_PATH . 'includes/class-admin.php';
require_once ALENA_DZ_PATH . 'includes/class-checkout-fields.php';
require_once ALENA_DZ_PATH . 'includes/class-checkout-map.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-engine.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-admin.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-checkout.php';
require_once ALENA_DZ_PATH . 'includes/class-wolt-importer.php';

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p><strong>Alena Delivery Zones</strong> requires WooCommerce to be active.</p></div>';
        });
        return;
    }
    new Alena_DZ_Admin();
    new Alena_DZ_Checkout_Fields();
    new Alena_DZ_Checkout_Map();
    new Alena_DZ_Hours_Admin();
    new Alena_DZ_Hours_Checkout();
    new Alena_DZ_Wolt_Importer();
});

// Shipping method (class loads only after WC is ready)
add_action('woocommerce_shipping_init', function () {
    require_once ALENA_DZ_PATH . 'includes/class-shipping-method.php';
});

add_filter('woocommerce_shipping_methods', function ($methods) {
    $methods['alena_polygon'] = 'Alena_DZ_Shipping_Method';
    return $methods;
});

// Register the Google API key options for settings_fields()
add_action('admin_init', function () {
    register_setting('alena_dz', 'alena_dz_google_key', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('alena_dz', 'alena_dz_google_server_key', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
});
