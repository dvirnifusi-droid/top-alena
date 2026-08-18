<?php
if (!defined('ABSPATH')) exit;

/**
 * One-click import of the Zohara menu (data/zohara-menu.json) into WooCommerce.
 *
 * The file was built from Wolt's public venue API — see
 * docs/zohara/build-from-wolt.py. Re-running this is safe: every product is
 * matched on its Wolt id, so a second run UPDATES instead of duplicating. That
 * matters because menus change and the alternative is 46 products created
 * twice.
 *
 * Owner's decisions, 2026-08-17:
 *   - no alcohol on the site
 *   - dishes Wolt marks unavailable come in as out of stock, not skipped:
 *     they are seasonal (the Friday challah), and deleting them would mean
 *     rebuilding them by hand later.
 */
class Alena_DZ_Zohara_Import {

    const WOLT_ID_META = '_alena_wolt_id';
    const BRAND_SLUG   = 'zohara';

    public function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_post_alena_zohara_import', [$this, 'run']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'ייבוא תפריט זוהרה',
            'ייבוא תפריט זוהרה',
            'manage_options',
            'alena-zohara-import',
            [$this, 'render']
        );
    }

    private function data(): array {
        $path = ALENA_DZ_PATH . 'data/zohara-menu.json';
        if (!file_exists($path)) return [];
        $json = json_decode(file_get_contents($path), true);
        return is_array($json) ? ($json['dishes'] ?? []) : [];
    }

    public function render() {
        $dishes = $this->data();
        $existing = 0;
        foreach ($dishes as $d) {
            if ($this->find_by_wolt_id($d['wolt_id'] ?? '')) $existing++;
        }
        $alcohol = count(array_filter($dishes, fn($d) => ($d['alcohol_pct'] ?? 0) > 0));
        $unavail = count(array_filter($dishes, fn($d) => empty($d['enabled'])));
        ?>
        <div class="wrap" dir="rtl">
          <h1>ייבוא תפריט זוהרה</h1>
          <p>מקור: <code>docs/zohara/zohara-wolt-menu.json</code> — נבנה מה-API הציבורי של וולט.</p>
          <table class="widefat" style="max-width:640px">
            <tr><td>מנות בקובץ</td><td><strong><?php echo count($dishes); ?></strong></td></tr>
            <tr><td>כבר קיימות באתר</td><td><strong><?php echo $existing; ?></strong> (יעודכנו, לא ישוכפלו)</td></tr>
            <tr><td>אלכוהול — <em>לא ייובא</em></td><td><strong><?php echo $alcohol; ?></strong></td></tr>
            <tr><td>מסומנות "אין כרגע" — ייובאו כאזל במלאי</td><td><strong><?php echo $unavail; ?></strong></td></tr>
          </table>
          <p><strong>התמונות אינן יורדות בשלב הזה.</strong> 42 תמונות בבקשה אחת חורגות מזמן הריצה של PHP;
             הן נמשכות בהרצה נפרדת אחרי הייבוא.</p>
          <?php
          $rep = get_transient('alena_zohara_report');
          if (is_array($rep)) {
              echo '<div class="notice notice-info"><p>דוח אחרון: ' . esc_html(wp_json_encode($rep, JSON_UNESCAPED_UNICODE)) . '</p></div>';
          }
          $ie = get_transient('alena_zohara_imgerr');
          if ($ie) {
              echo '<div class="notice notice-warning"><p>שגיאת תמונה אחרונה: ' . esc_html($ie) . '</p></div>';
          }
          $withimg = 0; $zt = get_term_by('slug', self::BRAND_SLUG, 'alena_brand');
          if ($zt && !is_wp_error($zt)) {
              $q = get_posts(['post_type'=>'product','posts_per_page'=>-1,'fields'=>'ids',
                  'tax_query'=>[['taxonomy'=>'alena_brand','field'=>'term_id','terms'=>$zt->term_id]]]);
              foreach ($q as $pid) if (get_post_thumbnail_id($pid)) $withimg++;
              echo '<div class="notice notice-success"><p>מנות זוהרה עם תמונה כרגע: <strong>' . (int) $withimg . '</strong> מתוך ' . count($q) . '</p></div>';
          }
          ?>
          <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="alena_zohara_import">
            <?php wp_nonce_field('alena_zohara_import'); ?>
            <p>
              <button class="button button-primary" name="mode" value="products">ייבוא/עדכון מנות</button>
              <button class="button" name="mode" value="images">משיכת תמונות (עד 12 בכל הרצה)</button>
            </p>
          </form>
        </div>
        <?php
    }

    private function find_by_wolt_id(string $wolt_id) {
        if (!$wolt_id) return 0;
        $q = get_posts([
            'post_type'   => 'product',
            'post_status' => 'any',
            'numberposts' => 1,
            'fields'      => 'ids',
            'meta_key'    => self::WOLT_ID_META,
            'meta_value'  => $wolt_id,
        ]);
        return $q ? (int) $q[0] : 0;
    }

    private function category_id(string $name): int {
        $name = trim($name);
        if ($name === '') return 0;
        $term = get_term_by('name', $name, 'product_cat');
        if ($term && !is_wp_error($term)) return (int) $term->term_id;
        $new = wp_insert_term($name, 'product_cat');
        return is_wp_error($new) ? 0 : (int) $new['term_id'];
    }

    public function run() {
        if (!current_user_can('manage_options')) wp_die('forbidden');
        check_admin_referer('alena_zohara_import');
        $mode = $_POST['mode'] ?? 'products';

        $report = $mode === 'images' ? $this->import_images() : $this->import_products();

        set_transient('alena_zohara_report', $report, 300);
        wp_safe_redirect(admin_url('admin.php?page=alena-zohara-import&done=1'));
        exit;
    }

    private function import_products(): array {
        $created = 0; $updated = 0; $skipped = 0; $oos = 0;

        foreach ($this->data() as $d) {
            if (($d['alcohol_pct'] ?? 0) > 0) { $skipped++; continue; }   // owner: no alcohol

            $wolt_id = (string) ($d['wolt_id'] ?? '');
            $id = $this->find_by_wolt_id($wolt_id);
            $product = $id ? wc_get_product($id) : new WC_Product_Simple();
            if (!$product) continue;

            $product->set_name((string) $d['name']);
            $product->set_regular_price((string) ($d['price'] ?? 0));
            $product->set_description((string) ($d['desc'] ?? ''));
            $product->set_short_description((string) ($d['desc'] ?? ''));
            $product->set_status('publish');
            $product->set_catalog_visibility('visible');

            // Unavailable on Wolt -> out of stock here. Kept, not dropped: the
            // Friday challah is seasonal, and deleting it means rebuilding it.
            $in_stock = !empty($d['enabled']);
            $product->set_stock_status($in_stock ? 'instock' : 'outofstock');
            if (!$in_stock) $oos++;

            $cat = $this->category_id((string) ($d['category'] ?? ''));
            if ($cat) $product->set_category_ids([$cat]);

            $new_id = $product->save();
            if (!$new_id) continue;

            update_post_meta($new_id, self::WOLT_ID_META, $wolt_id);
            wp_set_object_terms($new_id, self::BRAND_SLUG, 'alena_brand', false);

            // The plugin's own modifier format is the same shape Wolt uses:
            // a list of groups, each with min/max and named priced values.
            $groups = [];
            foreach ((array) ($d['option_groups'] ?? []) as $g) {
                $values = [];
                foreach ((array) ($g['values'] ?? []) as $v) {
                    $values[] = [
                        'name'  => (string) $v['name'],
                        'price' => (float) ($v['price'] ?? 0),
                    ];
                }
                if (!$values) continue;   // a group with no choices is noise
                $groups[] = [
                    'name'   => (string) $g['name'],
                    'min'    => (int) ($g['min'] ?? 0),
                    'max'    => (int) ($g['max'] ?? 0),
                    'values' => $values,
                ];
            }
            update_post_meta($new_id, '_alena_modifiers', wp_json_encode($groups));

            $id ? $updated++ : $created++;
        }

        return compact('created', 'updated', 'skipped', 'oos');
    }

    /** Images in batches — 42 downloads in one request outlives PHP's timeout. */
    private function import_images(): array {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $done = 0; $failed = 0; $remaining = 0;
        foreach ($this->data() as $d) {
            if (($d['alcohol_pct'] ?? 0) > 0) continue;
            $url = $d['image'] ?? '';
            if (!$url) continue;
            $id = $this->find_by_wolt_id((string) ($d['wolt_id'] ?? ''));
            if (!$id) continue;
            if (get_post_thumbnail_id($id)) continue;   // already has one

            if ($done >= 12) { $remaining++; continue; }

            $att = $this->sideload_extensionless($url, $id, (string) $d['name']);
            if (is_wp_error($att) || !$att) { $failed++; continue; }
            set_post_thumbnail($id, $att);
            $done++;
        }
        return compact('done', 'failed', 'remaining');
    }

    /**
     * media_sideload_image refused every Wolt URL: they carry no file
     * extension (imageproxy.wolt.com/assets/<id>), and it validates on the
     * extension in the URL, not on the bytes. So download by hand, read the
     * real type from the Content-Type header, and write the file with a name
     * WordPress will accept.
     */
    private function sideload_extensionless(string $url, int $post_id, string $title) {
        $resp = wp_remote_get($url, [
            'timeout'    => 25,
            'user-agent' => 'Mozilla/5.0 (compatible; AlenaImporter/1.0)',
            'headers'    => ['Referer' => 'https://wolt.com/'],
        ]);
        if (is_wp_error($resp)) { set_transient('alena_zohara_imgerr', $resp->get_error_message(), 300); return $resp; }
        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code !== 200) { set_transient('alena_zohara_imgerr', 'HTTP ' . $code . ' from ' . $url, 300); return false; }

        $body = wp_remote_retrieve_body($resp);
        if ($body === '') return false;

        $type = strtolower(wp_remote_retrieve_header($resp, 'content-type'));
        $ext  = strpos($type, 'png') !== false ? 'png'
              : (strpos($type, 'webp') !== false ? 'webp' : 'jpg');   // Wolt serves mostly jpeg

        $slug = sanitize_title($title) ?: ('zohara-' . $post_id);
        $file = wp_upload_bits($slug . '-' . $post_id . '.' . $ext, null, $body);
        if (!empty($file['error'])) return false;

        $filetype = wp_check_filetype($file['file']);
        $attach_id = wp_insert_attachment([
            'post_mime_type' => $filetype['type'] ?: ('image/' . $ext),
            'post_title'     => $title,
            'post_status'    => 'inherit',
        ], $file['file'], $post_id);
        if (is_wp_error($attach_id) || !$attach_id) return false;

        $meta = wp_generate_attachment_metadata($attach_id, $file['file']);
        wp_update_attachment_metadata($attach_id, $meta);
        return $attach_id;
    }
}
