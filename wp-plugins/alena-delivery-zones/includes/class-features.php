<?php
if (!defined('ABSPATH')) exit;

/**
 * On/off switches for optional storefront features.
 *
 * Exists because "remove the tip buttons for now" should not mean editing code
 * and redeploying a plugin. Anything a restaurant might reasonably want to turn
 * off for a while belongs here, defaulting to ON so behaviour never changes just
 * because a key is missing.
 *
 * Usage from anywhere:  if (!Alena_DZ_Features::on('tip')) return;
 */
class Alena_DZ_Features {

    const OPT = 'alena_dz_features';

    /** slug => [label, description] */
    public static function all() {
        return [
            'tip'            => ['טיפ לשליח',        'כפתורי ₪5 / ₪10 / ₪15 בעמוד התשלום'],
            'club_banner'    => ['באנר מועדון בתפריט', 'הכרטיס עם הנקודות והסכום לפדיון'],
            'recent_orders'  => ['"הזמינו שוב"',      'שורת ההזמנות האחרונות בראש התפריט'],
            'hero_carousel'  => ['קרוסלת תמונות',     'התמונות המתחלפות בראש התפריט'],
            'upsell'         => ['הצעות בסל',         'המלצות "אולי יתאים גם" במגירת הסל'],
        ];
    }

    public static function on(string $slug): bool {
        $saved = get_option(self::OPT, []);
        if (!is_array($saved) || !array_key_exists($slug, $saved)) return true; // default ON
        return (bool) $saved[$slug];
    }

    public function __construct() {
        add_action('admin_menu',  [$this, 'menu']);
        add_action('admin_init',  [$this, 'save']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'פיצ׳רים',
            'פיצ׳רים (הפעלה/כיבוי)',
            'manage_options',
            'alena-features',
            [$this, 'render']
        );
    }

    public function save() {
        if (!isset($_POST['alena_features_nonce'])) return;
        if (!wp_verify_nonce($_POST['alena_features_nonce'], 'alena_features')) return;
        if (!current_user_can('manage_options')) return;

        $out = [];
        foreach (array_keys(self::all()) as $slug) {
            $out[$slug] = !empty($_POST['feat'][$slug]) ? 1 : 0;
        }
        update_option(self::OPT, $out);
        add_action('admin_notices', function () {
            echo '<div class="notice notice-success is-dismissible"><p>הפיצ׳רים עודכנו.</p></div>';
        });
    }

    public function render() {
        ?>
        <div class="wrap" dir="rtl">
          <h1>פיצ׳רים — הפעלה וכיבוי</h1>
          <p>כיבוי מסתיר את הפיצ׳ר מהאתר מיד. שום נתון לא נמחק — הדלקה מחזירה אותו כמו שהיה.</p>
          <form method="post">
            <?php wp_nonce_field('alena_features', 'alena_features_nonce'); ?>
            <table class="form-table">
              <?php foreach (self::all() as $slug => $meta): ?>
                <tr>
                  <th><?php echo esc_html($meta[0]); ?></th>
                  <td>
                    <label>
                      <input type="checkbox" name="feat[<?php echo esc_attr($slug); ?>]" value="1"
                             <?php checked(self::on($slug)); ?> />
                      מופעל
                    </label>
                    <p class="description"><?php echo esc_html($meta[1]); ?></p>
                  </td>
                </tr>
              <?php endforeach; ?>
            </table>
            <?php submit_button('שמור'); ?>
          </form>
        </div>
        <?php
    }
}
