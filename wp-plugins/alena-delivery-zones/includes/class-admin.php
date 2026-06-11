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

        // Maps JS without the deprecated drawing package. Polygon drawing is
        // implemented manually in admin.js using click handlers on the map.
        wp_enqueue_script(
            'alena-dz-google-maps',
            "https://maps.googleapis.com/maps/api/js?key={$api_key}&libraries=geometry&language=he&loading=async",
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
        $server_key = get_option('alena_dz_google_server_key', '');
        echo '<details style="margin-top:20px"><summary>מפתחות Google Maps</summary>';
        echo '<form method="post" action="options.php" style="margin-top:10px">';
        settings_fields('alena_dz');
        echo '<p><label><strong>מפתח דפדפן (Browser)</strong> — להצגת המפה. מוגבל ל-HTTP referrers.<br />';
        echo '<input type="text" name="alena_dz_google_key" value="' . esc_attr($api_key) . '" style="width:420px;direction:ltr" />';
        echo '</label></p>';
        echo '<p><label><strong>מפתח שרת (Server)</strong> — ל-Geocoding בקופה. <em>חייב</em> להיות לא מוגבל ל-referrer (השתמש ב-IP restriction או None).<br />';
        echo '<input type="text" name="alena_dz_google_server_key" value="' . esc_attr($server_key) . '" style="width:420px;direction:ltr" placeholder="AIza..." />';
        echo '</label></p>';
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

/**
 * Standalone front-end manager dashboard — rendered via [alena_manager]
 * shortcode on a dedicated page (alenabepita.co.il/ניהול). No wp-admin
 * chrome. Gated by manage_woocommerce.
 */
class Alena_DZ_Manager {

    public function __construct() {
        add_shortcode('alena_manager',             [$this, 'render']);
        add_action('wp_ajax_alena_mgr_save_eta',    [$this, 'save_eta']);
        add_action('wp_ajax_alena_mgr_save_upsell', [$this, 'save_upsell']);
        add_action('wp_ajax_alena_mgr_save_zones',  [$this, 'save_zones']);
    }

    private function can() { return current_user_can('manage_woocommerce'); }

    public function render() {
        if (!is_user_logged_in()) {
            return '<div class="alena-mgr-gate">נא להתחבר כדי לגשת לניהול. <a href="' . esc_url(wp_login_url(home_url('/manage'))) . '">התחברות</a></div>';
        }
        if (!$this->can()) {
            return '<div class="alena-mgr-gate">אין לך הרשאה לצפות בעמוד זה.</div>';
        }

        $eta    = get_option('alena_cart_eta', []);
        $dmin   = isset($eta['delivery_min']) ? (int)$eta['delivery_min'] : 40;
        $dmax   = isset($eta['delivery_max']) ? (int)$eta['delivery_max'] : 60;
        $pmin   = isset($eta['pickup_min'])   ? (int)$eta['pickup_min']   : 15;
        $pmax   = isset($eta['pickup_max'])   ? (int)$eta['pickup_max']   : 25;
        $upsell = esc_attr((string) get_option('alena_cart_upsell', ''));
        $zones  = class_exists('Alena_DZ_Polygon_Store') ? Alena_DZ_Polygon_Store::all() : [];
        $nonce  = wp_create_nonce('alena_mgr');
        $zones_admin_url = admin_url('admin.php?page=alena-delivery-zones');
        $hours_admin_url = admin_url('admin.php?page=alena-delivery-hours');

        ob_start();
        ?>
        <div class="alena-mgr" data-nonce="<?php echo esc_attr($nonce); ?>" dir="rtl">
          <div class="alena-mgr-head">
            <h1>ניהול עלינא 🥙</h1>
            <p>שליטה מהירה — זמני אספקה, דמי משלוח לכל אזור, והצעות מכר. שינויים נשמרים מיידית.</p>
          </div>

          <section class="alena-mgr-card">
            <h2>⏱️ זמני אספקה משוערים</h2>
            <div class="alena-mgr-grid">
              <label>משלוח — מ-<input type="number" id="mgr-dmin" value="<?php echo $dmin; ?>" min="0"> דק׳</label>
              <label>משלוח — עד<input type="number" id="mgr-dmax" value="<?php echo $dmax; ?>" min="0"> דק׳</label>
              <label>איסוף — מ-<input type="number" id="mgr-pmin" value="<?php echo $pmin; ?>" min="0"> דק׳</label>
              <label>איסוף — עד<input type="number" id="mgr-pmax" value="<?php echo $pmax; ?>" min="0"> דק׳</label>
            </div>
            <button class="alena-mgr-btn" data-act="eta">שמירת זמני אספקה</button>
            <span class="alena-mgr-status" data-for="eta"></span>
          </section>

          <section class="alena-mgr-card">
            <h2>🚚 דמי משלוח לפי אזור</h2>
            <?php if (!$zones): ?>
              <p>עדיין לא הוגדרו אזורים. <a href="<?php echo esc_url($zones_admin_url); ?>" target="_blank">צייר אזורים על המפה ←</a></p>
            <?php else: ?>
              <table class="alena-mgr-zones">
                <thead><tr><th>אזור</th><th>דמי משלוח (₪)</th><th>מינ׳ הזמנה (₪)</th></tr></thead>
                <tbody>
                <?php foreach ($zones as $z): ?>
                  <tr data-id="<?php echo esc_attr($z['id']); ?>">
                    <td><?php echo esc_html($z['name']); ?></td>
                    <td><input type="number" class="mgr-zone-fee" value="<?php echo (float)$z['delivery_fee']; ?>" min="0"></td>
                    <td><input type="number" class="mgr-zone-min" value="<?php echo (float)$z['min_order']; ?>" min="0"></td>
                  </tr>
                <?php endforeach; ?>
                </tbody>
              </table>
              <button class="alena-mgr-btn" data-act="zones">שמירת אזורים</button>
              <span class="alena-mgr-status" data-for="zones"></span>
              <p class="alena-mgr-hint">להוספה/מחיקה/ציור מחדש: <a href="<?php echo esc_url($zones_admin_url); ?>" target="_blank">מסך המפה ←</a></p>
            <?php endif; ?>
          </section>

          <section class="alena-mgr-card">
            <h2>😋 הצעות מכר ("אולי תרצו להוסיף?")</h2>
            <p>מזהי מוצרים מופרדים בפסיק שיוצעו בסל ובקופה.</p>
            <input type="text" id="mgr-upsell" value="<?php echo $upsell; ?>" placeholder="לדוגמה: 2455,2467,2491" style="width:100%">
            <button class="alena-mgr-btn" data-act="upsell">שמירת הצעות מכר</button>
            <span class="alena-mgr-status" data-for="upsell"></span>
          </section>

          <section class="alena-mgr-card alena-mgr-links">
            <h2>🔧 עוד</h2>
            <a class="alena-mgr-link" href="<?php echo esc_url($hours_admin_url); ?>" target="_blank">⏰ שעות פעילות</a>
            <a class="alena-mgr-link" href="<?php echo esc_url($zones_admin_url); ?>" target="_blank">🗺️ ציור אזורי משלוח</a>
            <a class="alena-mgr-link" href="<?php echo esc_url(admin_url('edit.php?post_type=product')); ?>" target="_blank">🍽️ ניהול מנות</a>
            <a class="alena-mgr-link" href="<?php echo esc_url(admin_url('edit.php?post_type=shop_order')); ?>" target="_blank">📦 הזמנות</a>
          </section>
        </div>

        <style>
        .alena-mgr { max-width:820px; margin:30px auto; padding:0 16px; }
        .alena-mgr-gate { max-width:520px; margin:60px auto; text-align:center; font-size:18px; }
        .alena-mgr-head h1 { font-family:"Frank Ruhl Libre",serif; font-size:36px; font-weight:800; margin:0 0 4px; }
        .alena-mgr-head p { color:#6a5a4d; margin:0 0 20px; }
        .alena-mgr-card { background:#fff; border:1px solid #eee3d4; border-radius:16px; padding:22px; margin-bottom:16px; box-shadow:0 2px 10px rgba(0,0,0,0.04); }
        .alena-mgr-card h2 { font-size:20px; font-weight:800; margin:0 0 14px; color:#1c1c1c; }
        .alena-mgr-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
        .alena-mgr-grid label { display:flex; align-items:center; gap:8px; font-size:14px; color:#4a4a4a; }
        .alena-mgr-grid input, .alena-mgr-zones input { padding:9px 11px; border:1px solid #eadfd1; border-radius:8px; width:90px; font-size:15px; }
        #mgr-upsell { padding:9px 11px; border:1px solid #eadfd1; border-radius:8px; width:100%; box-sizing:border-box; font-size:15px; }
        .alena-mgr-zones { width:100%; border-collapse:collapse; margin-bottom:12px; }
        .alena-mgr-zones th { text-align:right; font-size:12px; color:#6a5a4d; padding:8px; border-bottom:2px solid #eadfd1; }
        .alena-mgr-zones td { padding:8px; border-bottom:1px solid #f5edde; font-size:14px; }
        .alena-mgr-zones td:first-child { font-weight:700; }
        .alena-mgr-btn { background:#1e4a3a; color:#fff; border:none; border-radius:999px; padding:11px 26px; font-weight:700; font-size:15px; cursor:pointer; transition:all .15s ease; }
        .alena-mgr-btn:hover { background:#2e6850; transform:translateY(-1px); }
        .alena-mgr-status { margin-right:12px; font-weight:700; font-size:14px; }
        .alena-mgr-status.ok { color:#198754; } .alena-mgr-status.err { color:#c83a3a; }
        .alena-mgr-hint { font-size:12px; color:#9a8a7a; margin:10px 0 0; }
        .alena-mgr-links { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
        .alena-mgr-links h2 { width:100%; }
        .alena-mgr-link { background:#faf6f1; border:1px solid #eadfd1; border-radius:999px; padding:10px 18px; text-decoration:none; color:#1c1c1c; font-weight:600; font-size:14px; }
        .alena-mgr-link:hover { background:#1e4a3a; color:#fff; }
        @media(max-width:560px){ .alena-mgr-grid{grid-template-columns:1fr;} }
        </style>
        <script>
        (function($){
          var nonce = $('.alena-mgr').data('nonce');
          function status(act, ok, msg){ $('.alena-mgr-status[data-for="'+act+'"]').text(msg).attr('class','alena-mgr-status '+(ok?'ok':'err')); }
          $('.alena-mgr-btn').on('click', function(){
            var act = $(this).data('act'), data = { _wpnonce: nonce };
            if (act==='eta'){ data.action='alena_mgr_save_eta'; data.dmin=$('#mgr-dmin').val(); data.dmax=$('#mgr-dmax').val(); data.pmin=$('#mgr-pmin').val(); data.pmax=$('#mgr-pmax').val(); }
            else if (act==='upsell'){ data.action='alena_mgr_save_upsell'; data.upsell=$('#mgr-upsell').val(); }
            else if (act==='zones'){ data.action='alena_mgr_save_zones'; var z=[]; $('.alena-mgr-zones tbody tr').each(function(){ z.push({id:$(this).data('id'), fee:$(this).find('.mgr-zone-fee').val(), min:$(this).find('.mgr-zone-min').val()}); }); data.zones=JSON.stringify(z); }
            status(act,true,'שומר…');
            $.post(window.ajaxurl||'/wp-admin/admin-ajax.php', data, function(r){ status(act, r.success, r.success?'נשמר ✓':'שגיאה'); });
          });
        })(jQuery);
        </script>
        <?php
        return ob_get_clean();
    }

    public function save_eta() {
        check_ajax_referer('alena_mgr');
        if (!$this->can()) wp_send_json_error('forbidden', 403);
        update_option('alena_cart_eta', [
            'delivery_min' => max(0,(int)($_POST['dmin']??40)),
            'delivery_max' => max(0,(int)($_POST['dmax']??60)),
            'pickup_min'   => max(0,(int)($_POST['pmin']??15)),
            'pickup_max'   => max(0,(int)($_POST['pmax']??25)),
        ]);
        wp_send_json_success();
    }

    public function save_upsell() {
        check_ajax_referer('alena_mgr');
        if (!$this->can()) wp_send_json_error('forbidden', 403);
        update_option('alena_cart_upsell', sanitize_text_field(wp_unslash($_POST['upsell'] ?? '')));
        wp_send_json_success();
    }

    public function save_zones() {
        check_ajax_referer('alena_mgr');
        if (!$this->can()) wp_send_json_error('forbidden', 403);
        if (!class_exists('Alena_DZ_Polygon_Store')) wp_send_json_error('no_store', 500);
        $edits = json_decode(wp_unslash($_POST['zones'] ?? '[]'), true);
        if (!is_array($edits)) wp_send_json_error('bad', 400);
        $byId = [];
        foreach ($edits as $e) { if (!empty($e['id'])) $byId[$e['id']] = $e; }
        $zones = Alena_DZ_Polygon_Store::all();
        foreach ($zones as &$z) {
            if (isset($byId[$z['id']])) {
                $z['delivery_fee'] = max(0, (float) $byId[$z['id']]['fee']);
                $z['min_order']    = max(0, (float) $byId[$z['id']]['min']);
            }
        }
        unset($z);
        Alena_DZ_Polygon_Store::save($zones);
        wp_send_json_success();
    }
}
