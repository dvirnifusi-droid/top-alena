<?php
if (!defined('ABSPATH')) exit;

/**
 * Admin screen for editing the hours config.
 * Loaded under "אזורי חלוקה → שעות פעילות" submenu.
 */
class Alena_DZ_Hours_Admin {

    public function __construct() {
        add_action('admin_menu',                    [$this, 'menu'], 20);
        add_action('wp_ajax_alena_dz_hours_save',   [$this, 'ajax_save']);
        add_action('admin_enqueue_scripts',         [$this, 'enqueue']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'שעות פעילות',
            'שעות פעילות',
            'manage_woocommerce',
            'alena-delivery-hours',
            [$this, 'render']
        );
    }

    public function enqueue($hook) {
        if ($hook !== 'אזורי-חלוקה_page_alena-delivery-hours' &&
            strpos((string) $hook, 'alena-delivery-hours') === false) {
            return;
        }
        wp_enqueue_style('alena-dz-hours-admin', ALENA_DZ_URL . 'assets/hours-admin.css', [], ALENA_DZ_VERSION);
    }

    private function days_he(): array {
        return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    }

    public function render() {
        $engine = Alena_DZ_Hours_Engine::get();
        $config = $engine->get_config();
        $days   = $this->days_he();
        $nonce  = wp_create_nonce('alena_dz_hours');
        ?>
        <div class="wrap" dir="rtl">
          <h1>שעות פעילות</h1>
          <p>שעות לכל יום ולכל שירות (משלוח / איסוף).
            לזמן "אחרי שבת" — השתמש ב-<code>motzash+30</code> (30 דקות אחרי צאת שבת).
            שעות שעוברות חצות (למשל <code>01:55</code>) מטופלות אוטומטית.
            סינון קטגוריה בשישי: הוסף "קטגוריה" לשורה.</p>

          <table class="alena-dz-hours-table widefat">
            <thead>
              <tr>
                <th>יום</th>
                <th>שירות</th>
                <th>פתיחה</th>
                <th>סגירה</th>
                <th>קטגוריה (אופציונלי)</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach (['delivery' => 'משלוח', 'pickup' => 'איסוף'] as $svc_key => $svc_label): ?>
                <?php for ($d = 0; $d < 7; $d++):
                  $ranges = $config[$svc_key][(string) $d] ?? [];
                  if (!$ranges) $ranges = [['', '']];
                  foreach ($ranges as $idx => $range):
                    $open  = $range[0] ?? '';
                    $close = $range[1] ?? '';
                    $cat   = isset($range[2]['category_slug'])
                      ? (is_array($range[2]['category_slug']) ? implode(',', $range[2]['category_slug']) : $range[2]['category_slug'])
                      : '';
                ?>
                  <tr data-service="<?php echo esc_attr($svc_key); ?>" data-day="<?php echo $d; ?>">
                    <td><?php echo $idx === 0 ? esc_html($days[$d]) : ''; ?></td>
                    <td><?php echo $idx === 0 ? esc_html($svc_label) : ''; ?></td>
                    <td><input type="text" class="alena-dz-time" name="open" value="<?php echo esc_attr($open); ?>" placeholder="11:00 / motzash+30" /></td>
                    <td><input type="text" class="alena-dz-time" name="close" value="<?php echo esc_attr($close); ?>" placeholder="23:00 / 01:55" /></td>
                    <td><input type="text" class="alena-dz-cat" name="category" value="<?php echo esc_attr($cat); ?>" placeholder="chumosia-zohara" /></td>
                  </tr>
                <?php endforeach; endfor; ?>
              <?php endforeach; ?>
            </tbody>
          </table>

          <p><button id="alena-dz-hours-save" class="button button-primary">שמור שעות</button>
             <span id="alena-dz-hours-status" style="margin-right:10px;color:#666"></span></p>
        </div>

        <script>
        (function ($) {
          $('#alena-dz-hours-save').on('click', function () {
            const config = { delivery: {}, pickup: {} };
            $('.alena-dz-hours-table tbody tr').each(function () {
              const $r = $(this);
              const svc = $r.data('service');
              const day = String($r.data('day'));
              const open  = $r.find('input[name="open"]').val().trim();
              const close = $r.find('input[name="close"]').val().trim();
              const cat   = $r.find('input[name="category"]').val().trim();
              if (!open || !close) return;
              if (!config[svc][day]) config[svc][day] = [];
              const range = [open, close];
              if (cat) range.push({ category_slug: cat.split(',').map(s => s.trim()).filter(Boolean) });
              config[svc][day].push(range);
            });
            $.post(ajaxurl, {
              action: 'alena_dz_hours_save',
              nonce: '<?php echo esc_js($nonce); ?>',
              config: JSON.stringify(config),
            }, function (r) {
              $('#alena-dz-hours-status').text(r.success ? 'נשמר ✓' : 'שגיאה: ' + (r.data || ''));
            });
          });
        })(jQuery);
        </script>
        <?php
    }

    public function ajax_save() {
        check_ajax_referer('alena_dz_hours', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
        $raw = isset($_POST['config']) ? wp_unslash($_POST['config']) : '';
        $config = json_decode($raw, true);
        if (!is_array($config) || empty($config['delivery']) || empty($config['pickup'])) {
            wp_send_json_error('bad_config', 400);
        }
        if (Alena_DZ_Hours_Engine::get()->save_config($config)) {
            wp_send_json_success(['ok' => true]);
        }
        wp_send_json_error('save_failed', 500);
    }
}
