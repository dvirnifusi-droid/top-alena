<?php
if (!defined('ABSPATH')) exit;

class Alena_DZ_Admin {
    public function __construct() {
        add_action('admin_menu',            [$this, 'menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('wp_ajax_alena_dz_save', [$this, 'ajax_save']);
        add_action('wp_ajax_alena_dz_load', [$this, 'ajax_load']);
    }

    public function menu() {
        add_menu_page(
            'אזורי חלוקה',
            'אזורי חלוקה',
            'manage_woocommerce',
            'alena-delivery-zones',
            [$this, 'render'],
            'dashicons-location-alt',
            56
        );
    }

    public function enqueue($hook) {
        if ($hook !== 'toplevel_page_alena-delivery-zones') return;
        $api_key = get_option('alena_dz_google_key', '');
        if (!$api_key) return; // Render will show key-entry form.

        wp_enqueue_script(
            'alena-dz-google-maps',
            "https://maps.googleapis.com/maps/api/js?key={$api_key}&libraries=drawing,geometry&language=he",
            [],
            null,
            true
        );
        wp_enqueue_script(
            'alena-dz-admin',
            ALENA_DZ_URL . 'assets/admin.js',
            ['alena-dz-google-maps', 'jquery'],
            ALENA_DZ_VERSION,
            true
        );
        wp_localize_script('alena-dz-admin', 'AlenaDZ', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_dz'),
            'center'  => ['lat' => 31.9637, 'lng' => 34.8044], // Rishon LeZion
        ]);
        wp_enqueue_style(
            'alena-dz-admin',
            ALENA_DZ_URL . 'assets/admin.css',
            [],
            ALENA_DZ_VERSION
        );
    }

    public function render() {
        $api_key = get_option('alena_dz_google_key', '');
        echo '<div class="wrap" dir="rtl"><h1>אזורי חלוקה</h1>';

        if (!$api_key) {
            echo '<div class="notice notice-warning"><p>חסר מפתח Google Maps API. הזן אותו כדי לטעון את המפה.</p></div>';
            echo '<form method="post" action="options.php" style="margin:20px 0">';
            settings_fields('alena_dz');
            echo '<input type="text" name="alena_dz_google_key" style="width:420px" placeholder="AIza..." />';
            submit_button('שמור מפתח');
            echo '</form></div>';
            return;
        }

        echo '<p>צייר פוליגון על המפה כדי להוסיף אזור חלוקה חדש. לכל פוליגון: שם, דמי משלוח, מינ׳ הזמנה.</p>';
        echo '<div id="alena-dz-map" style="height:600px;width:100%;border:1px solid #ccc;border-radius:6px"></div>';
        echo '<div id="alena-dz-list" style="margin-top:16px"></div>';
        echo '<button id="alena-dz-save-all" class="button button-primary" style="margin-top:12px">שמור את כל הפוליגונים</button>';
        echo ' <span id="alena-dz-status" style="margin-right:10px;color:#666"></span>';
        echo '<details style="margin-top:20px"><summary>החלפת מפתח Google Maps</summary>';
        echo '<form method="post" action="options.php" style="margin-top:10px">';
        settings_fields('alena_dz');
        echo '<input type="text" name="alena_dz_google_key" value="' . esc_attr($api_key) . '" style="width:420px" />';
        submit_button('שמור');
        echo '</form></details>';
        echo '</div>';
    }

    public function ajax_load() {
        check_ajax_referer('alena_dz', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
        wp_send_json_success(Alena_DZ_Polygon_Store::all());
    }

    public function ajax_save() {
        check_ajax_referer('alena_dz', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
        $raw = isset($_POST['polygons']) ? wp_unslash($_POST['polygons']) : '[]';
        $payload = json_decode($raw, true);
        if (!is_array($payload)) wp_send_json_error('bad_payload', 400);
        if (Alena_DZ_Polygon_Store::save($payload)) {
            wp_send_json_success(['count' => count($payload)]);
        }
        wp_send_json_error('save_failed', 500);
    }
}
