<?php
if (!defined('ABSPATH')) exit;

/**
 * מרכז שליטה — one clean, organised landing for everything behind the scenes.
 *
 * The plugin grew ~15 scattered admin screens. This gathers them into a single
 * dashboard: the settings the owner touches most up top, a live warning for the
 * one thing that blocks going live (OTP test mode), the connection details for
 * the TOP ALENA app, and an auto-built grid of every tool (read from the plugin's
 * own submenu, so a new tool appears here on its own — nothing to maintain).
 */
class Alena_DZ_Control_Center {

    public function __construct() {
        add_action('admin_menu', [$this, 'menu'], 1);
    }

    public function menu(): void {
        add_submenu_page(
            'alena-delivery-zones',
            'מרכז שליטה',
            'מרכז שליטה',
            'manage_woocommerce',
            'alena-control-center',
            [$this, 'render'],
            1
        );
    }

    private function icon_for(string $title): string {
        $map = [
            'מועדון' => '🎁', 'פיצ' => '🎛️', 'תזמון' => '🕐', 'שעות' => '🕐',
            'תפריט' => '🍽️', 'אופציות' => '🍽️', 'סדר' => '🍽️', 'זוהרה' => '⬇️',
            'Wolt' => '⬇️', 'ייבוא' => '⬇️', 'ברקוד' => '📱', 'הזמנה' => '📱',
            'בון' => '🧾', 'OTP' => '🔐', 'התחברות' => '🔐', 'הערות' => '📝',
            'התראות' => '🔔', 'קומבו' => '🏷️', 'דילים' => '🏷️', 'אזורי' => '🗺️',
            'סיכום' => '🧾',
        ];
        foreach ($map as $needle => $emoji) {
            if (mb_strpos($title, $needle) !== false) return $emoji;
        }
        return '⚙️';
    }

    public function render(): void {
        global $submenu;
        $items = $submenu['alena-delivery-zones'] ?? [];
        $otp_test = (bool) get_option('alena_otp_test_mode');
        $disc = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::member_discount_pct() : 0;
        $incentive = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '';
        $endpoint = home_url('/wp-json/alena/v1/control/settings');
        $key = class_exists('Alena_DZ_Control_API') ? Alena_DZ_Control_API::key() : '';
        ?>
        <div class="wrap" dir="rtl">
          <h1 style="display:flex;align-items:center;gap:10px">🎛️ מרכז שליטה — עלינא בפיתה</h1>
          <p style="max-width:760px;color:#555">כל מה שמאחורי הקלעים במקום אחד. ההגדרות שמשנים הכי הרבה למעלה, וכל הכלים למטה.</p>

          <?php if ($otp_test): ?>
            <div class="notice notice-error" style="border-right-width:6px">
              <p style="font-size:14px"><strong>⚠️ מצב בדיקת התחברות פעיל</strong> — קוד ההתחברות מוצג על המסך לכל מי שמזין טלפון.
                 חובה לכבות ולהגדיר ספק וואטסאפ/SMS <strong>לפני</strong> פתיחה ללקוחות.
                 <a href="<?php echo esc_url(admin_url('admin.php?page=alena-otp')); ?>">להגדרות ההתחברות ←</a></p>
            </div>
          <?php endif; ?>

          <!-- Most-changed settings, at a glance -->
          <div class="alena-cc-top" style="display:flex;gap:16px;flex-wrap:wrap;margin:18px 0">
            <div style="flex:1;min-width:260px;background:#fff;border:1px solid #e2ddd4;border-radius:14px;padding:18px">
              <h2 style="margin:0 0 10px;font-size:16px">🎁 מועדון והטבות</h2>
              <p style="margin:0 0 6px">הנחת חבר מועדון: <strong style="font-size:18px"><?php echo esc_html(rtrim(rtrim(number_format($disc,1),'0'),'.')); ?>%</strong></p>
              <p style="margin:0 0 10px;color:#666;font-size:13px">תמריץ הצטרפות: <?php echo esc_html($incentive ?: '—'); ?></p>
              <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=alena-club-settings')); ?>">עריכת מועדון והטבות</a>
            </div>
          </div>

          <!-- Connect the TOP ALENA app -->
          <div style="background:linear-gradient(135deg,#1F1B17,#44512C);color:#F4ECD8;border-radius:14px;padding:20px;margin:18px 0;max-width:820px">
            <h2 style="color:#F4ECD8;margin:0 0 8px">📲 חיבור לאפליקציית TOP ALENA</h2>
            <p style="margin:0 0 12px;color:#D9BD83">כדי לשלוט בהגדרות מהאפליקציה — הזן שם את הכתובת והמפתח הבאים (פעם אחת). המפתח סודי, אל תשתף אותו.</p>
            <p style="margin:0 0 6px"><strong>כתובת:</strong> <code style="background:rgba(255,255,255,.12);padding:3px 8px;border-radius:6px"><?php echo esc_html($endpoint); ?></code></p>
            <p style="margin:0 0 6px"><strong>מפתח שליטה:</strong>
              <code id="alena-cc-key" style="background:rgba(255,255,255,.12);padding:3px 8px;border-radius:6px;letter-spacing:1px">••••••••••••••••••••</code>
              <button type="button" class="button" id="alena-cc-reveal" style="margin-inline-start:6px">הצג</button>
              <button type="button" class="button" id="alena-cc-copy" data-key="<?php echo esc_attr($key); ?>" style="margin-inline-start:4px">העתק</button>
            </p>
            <script>
            (function(){
              var k=<?php echo wp_json_encode($key); ?>;
              document.getElementById('alena-cc-reveal').addEventListener('click',function(){document.getElementById('alena-cc-key').textContent=k;});
              document.getElementById('alena-cc-copy').addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(k);this.textContent='הועתק ✓';});
            })();
            </script>
          </div>

          <!-- All tools, auto-listed -->
          <h2 style="margin-top:24px">כל הכלים</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;max-width:1100px">
            <?php foreach ($items as $it):
                $title = wp_strip_all_tags($it[0]);
                $slug  = $it[2];
                if ($slug === 'alena-control-center') continue;
                // Build the URL: core pages use their own file, ours use admin.php?page=
                $url = (strpos($slug, '.php') !== false)
                    ? admin_url($slug)
                    : admin_url('admin.php?page=' . $slug);
                ?>
                <a href="<?php echo esc_url($url); ?>" style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2ddd4;border-radius:12px;padding:14px 16px;text-decoration:none;color:#1c1c1c;font-weight:600">
                  <span style="font-size:22px"><?php echo $this->icon_for($title); ?></span>
                  <span><?php echo esc_html($title); ?></span>
                </a>
            <?php endforeach; ?>
          </div>

          <!-- Payment lives in WooCommerce -->
          <h2 style="margin-top:24px">תשלומים</h2>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=wc-settings&tab=checkout')); ?>">אמצעי תשלום (PayPlus / מזומן)</a>
            <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=wc-settings&tab=advanced&section=webhooks')); ?>">Webhooks (מיילי/בתאבון)</a>
          </div>
        </div>
        <?php
    }
}
