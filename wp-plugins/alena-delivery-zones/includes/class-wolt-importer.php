<?php
if (!defined('ABSPATH')) exit;

/**
 * One-click importer from Wolt:
 *   1. Fetches the venue's menu JSON from Wolt's public consumer API.
 *   2. Creates WooCommerce product categories.
 *   3. Creates WooCommerce simple products with name, description,
 *      regular price, category, and the image URL (sideloaded to the
 *      media library).
 *
 * Idempotent: re-running the importer matches existing products by name
 * and updates their price/description, rather than creating duplicates.
 */
class Alena_DZ_Wolt_Importer {

    const VENUE_ID = '60c8a2b23aacef7487e78a20';
    const MENU_URL = 'https://restaurant-api.wolt.com/v4/venues/60c8a2b23aacef7487e78a20/menu';

    const SKIP_CATEGORIES = [
        'שימו 💙',
        '‫סכו״ם ורטבים 🍴',
        'חולצות עלינא X גולדסטאר',
    ];

    public function __construct() {
        add_action('admin_menu',                       [$this, 'menu'], 25);
        add_action('wp_ajax_alena_dz_wolt_import',     [$this, 'ajax_import']);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'ייבוא תפריט מ-Wolt',
            'ייבוא מ-Wolt',
            'manage_woocommerce',
            'alena-wolt-importer',
            [$this, 'render']
        );
    }

    public function render() {
        $nonce = wp_create_nonce('alena_dz_wolt');
        ?>
        <div class="wrap" dir="rtl">
          <h1>ייבוא תפריט מ-Wolt</h1>
          <p><strong>מקור:</strong> <code><?php echo esc_html(self::MENU_URL); ?></code></p>

          <h2 style="margin-top:24px">מצב ייבוא</h2>
          <table class="form-table" role="presentation"><tbody>
            <tr>
              <td style="padding-right:0">
                <label style="display:block;margin-bottom:10px">
                  <input type="radio" name="alena-wolt-mode" value="update" checked>
                  <strong>עדכון (בטוח)</strong> — מוסיף מנות חדשות ומעדכן קיימות. מנות שכבר לא בוולט <em>נשארות</em> באתר.
                </label>
                <label style="display:block">
                  <input type="radio" name="alena-wolt-mode" value="replace">
                  <strong>דריסה מלאה</strong> — התפריט באתר יהיה <em>זהה</em> לוולט: מחירים, תיאורים, תמונות ותוספות נדרסים,
                  ומנות שלא קיימות בוולט מועברות ל<strong>פח</strong> (ניתן לשחזור).
                </label>
              </td>
            </tr>
          </tbody></table>

          <p><button id="alena-dz-wolt-go" class="button button-primary button-hero">התחל ייבוא</button></p>
          <pre id="alena-dz-wolt-log" style="background:#fff;border:1px solid #ddd;padding:12px;max-height:480px;overflow:auto;white-space:pre-wrap;direction:ltr"></pre>
        </div>
        <script>
        (function ($) {
          const $log = $('#alena-dz-wolt-log');
          function log(line) {
            $log.append(line + "\n");
            $log[0].scrollTop = $log[0].scrollHeight;
          }
          $('#alena-dz-wolt-go').on('click', function () {
            const mode = $('input[name="alena-wolt-mode"]:checked').val();
            if (mode === 'replace' && !window.confirm(
                'דריסה מלאה:\n\nכל מנה שלא קיימת בוולט תועבר לפח, וכל המחירים/התיאורים/התמונות ידרסו.\n\nלהמשיך?')) {
              return;
            }
            $(this).prop('disabled', true).text('מייבא…');
            $log.empty();
            log('-- starting (' + mode + ') --');
            $.post(ajaxurl, { action: 'alena_dz_wolt_import', nonce: '<?php echo esc_js($nonce); ?>', mode: mode }, function (r) {
              if (r.success) {
                log(r.data.summary);
                (r.data.lines || []).forEach(log);
                log('-- done --');
              } else {
                log('ERROR: ' + (r.data || ''));
              }
              $('#alena-dz-wolt-go').prop('disabled', false).text('הרץ שוב');
            }).fail(function (xhr) {
              log('NETWORK ERROR: HTTP ' + xhr.status);
              $('#alena-dz-wolt-go').prop('disabled', false).text('נסה שוב');
            });
          });
        })(jQuery);
        </script>
        <?php
    }

    public function ajax_import() {
        check_ajax_referer('alena_dz_wolt', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);

        @set_time_limit(300);
        $lines   = [];
        $replace = (($_POST['mode'] ?? 'update') === 'replace');
        // Every product the Wolt feed still contains. In replace mode anything
        // outside this set is stale and gets trashed at the end.
        $seen_ids = [];

        $resp = wp_remote_get(self::MENU_URL, ['timeout' => 25, 'headers' => ['User-Agent' => 'Alena DZ Importer']]);
        if (is_wp_error($resp)) wp_send_json_error('fetch_failed: ' . $resp->get_error_message(), 500);
        $code = wp_remote_retrieve_response_code($resp);
        if ($code !== 200) wp_send_json_error("fetch_status_$code", 500);
        $menu = json_decode(wp_remote_retrieve_body($resp), true);
        if (!is_array($menu) || empty($menu['items'])) wp_send_json_error('bad_menu_json', 500);

        // Build a lookup of option groups by id (top-level menu.options[])
        $options_lookup = [];
        foreach (($menu['options'] ?? []) as $o) {
            if (!isset($o['id'])) continue;
            $options_lookup[$o['id']] = $o;
        }

        // 1. Categories
        $cat_lookup = [];
        $cat_created = 0;
        $cat_existing = 0;
        foreach ($menu['categories'] as $c) {
            if (in_array($c['name'], self::SKIP_CATEGORIES, true)) continue;
            $term = term_exists($c['name'], 'product_cat');
            if (!$term) {
                $term = wp_insert_term($c['name'], 'product_cat', ['slug' => $this->slugify($c['name'])]);
                if (is_wp_error($term)) {
                    $lines[] = 'cat-error: ' . $c['name'] . ' :: ' . $term->get_error_message();
                    continue;
                }
                $cat_created++;
                $lines[] = '+ category: ' . $c['name'];
            } else {
                $cat_existing++;
            }
            $cat_lookup[$c['id']] = (int) (is_array($term) ? $term['term_id'] : $term);

            // Optional: attach a category image if Wolt provides one (skipped for speed)
        }

        // 2. Products
        $prod_created = 0;
        $prod_updated = 0;
        $prod_skipped = 0;
        $images_attached = 0;

        foreach ($menu['items'] as $it) {
            $price_agorot = (int) ($it['baseprice'] ?? 0);
            if ($price_agorot <= 0) { $prod_skipped++; continue; }
            $cat_id = $it['category'] ?? null;
            if (!$cat_id || !isset($cat_lookup[$cat_id])) { $prod_skipped++; continue; }

            $name        = trim($it['name'] ?? '');
            if ($name === '') { $prod_skipped++; continue; }
            $description = trim($it['description'] ?? '');
            $price       = (string) round($price_agorot / 100, 2);
            $image_url   = $it['image'] ?? ($it['images'][0]['url'] ?? '');

            $wolt_id = (string) ($it['id'] ?? '');

            // Match by Wolt id first (survives renames), then by exact title.
            $product_id = $wolt_id ? $this->find_by_wolt_id($wolt_id) : 0;
            if (!$product_id) $product_id = $this->find_by_title($name);

            if ($product_id) {
                // A same-named dish is REPLACED in place — never duplicated.
                wp_update_post([
                    'ID'           => $product_id,
                    'post_title'   => $name,
                    'post_excerpt' => $description,
                    'post_content' => $description,
                    'post_status'  => 'publish',
                ]);
                update_post_meta($product_id, '_regular_price', $price);
                update_post_meta($product_id, '_price', $price);
                update_post_meta($product_id, '_stock_status', 'instock');
                wp_set_object_terms($product_id, [$cat_lookup[$cat_id]], 'product_cat');
                $prod_updated++;
            } else {
                $product_id = wp_insert_post([
                    'post_type'    => 'product',
                    'post_status'  => 'publish',
                    'post_title'   => $name,
                    'post_content' => $description,
                    'post_excerpt' => $description,
                ]);
                if (is_wp_error($product_id)) {
                    $lines[] = 'prod-error: ' . $name . ' :: ' . $product_id->get_error_message();
                    continue;
                }
                update_post_meta($product_id, '_regular_price', $price);
                update_post_meta($product_id, '_price', $price);
                update_post_meta($product_id, '_stock_status', 'instock');
                update_post_meta($product_id, '_virtual', 'no');
                update_post_meta($product_id, '_visibility', 'visible');
                wp_set_object_terms($product_id, ['simple'], 'product_type');
                wp_set_object_terms($product_id, [$cat_lookup[$cat_id]], 'product_cat');
                $prod_created++;
                $lines[] = '+ product: ' . $name . ' ₪' . $price;
            }

            $seen_ids[] = (int) $product_id;
            if ($wolt_id) update_post_meta($product_id, '_alena_wolt_id', $wolt_id);

            // Image: pull when missing, and re-pull whenever Wolt's source URL
            // changed (the old "skip if a thumbnail exists" rule meant a photo
            // swapped in Wolt never reached the site).
            $prev_src = (string) get_post_meta($product_id, '_alena_wolt_image_src', true);
            $needs_image = $image_url && (!has_post_thumbnail($product_id) || $prev_src !== $image_url);
            if ($needs_image) {
                $att_id = $this->sideload_image($image_url, $product_id, $name);
                if ($att_id) {
                    set_post_thumbnail($product_id, $att_id);
                    update_post_meta($product_id, '_alena_wolt_image_src', $image_url);
                    $images_attached++;
                }
            }

            // Modifiers: walk item.options, resolve via parent against options_lookup
            $modifiers = [];
            foreach (($it['options'] ?? []) as $ref) {
                $parent_id = $ref['parent'] ?? null;
                $group = $parent_id ? ($options_lookup[$parent_id] ?? null) : null;
                if (!$group) continue;
                $vals = [];
                foreach (($group['values'] ?? []) as $v) {
                    $vals[] = [
                        'id'    => $v['id'] ?? '',
                        'name'  => $v['name'] ?? '',
                        'price' => isset($v['price']) ? (float)$v['price'] / 100 : 0,
                    ];
                }
                if (!$vals) continue;
                $modifiers[] = [
                    'id'       => $ref['id'] ?? $parent_id,
                    'name'     => $ref['name'] ?? ($group['name'] ?? ''),
                    'type'     => $group['type'] ?? 'Choice',  // "Choice" = radio, "Multichoice" = checkbox
                    'min'      => (int)($ref['minimum_total_selections'] ?? 0),
                    'max'      => (int)($ref['maximum_total_selections'] ?? 0),
                    'max_single' => (int)($ref['maximum_single_selections'] ?? 1),
                    'free'     => (int)($ref['free_selections'] ?? 0),
                    'values'   => $vals,
                ];
            }
            update_post_meta($product_id, '_alena_modifiers', wp_json_encode($modifiers, JSON_UNESCAPED_UNICODE));
        }

        // Replace mode: anything the feed no longer lists is stale. Trash (never
        // force-delete) so a mis-fired import stays recoverable from the bin.
        $prod_trashed = 0;
        if ($replace) {
            $all = get_posts([
                'post_type'      => 'product',
                'post_status'    => ['publish', 'draft', 'pending', 'private'],
                'posts_per_page' => -1,
                'fields'         => 'ids',
            ]);
            foreach ($all as $pid) {
                if (in_array((int) $pid, $seen_ids, true)) continue;
                wp_trash_post((int) $pid);
                $prod_trashed++;
                $lines[] = '- trashed: ' . get_the_title($pid);
            }

            // Drop product categories left with nothing in them.
            foreach (get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]) as $t) {
                if (is_wp_error($t) || !empty($t->count)) continue;
                if (in_array($t->term_id, $cat_lookup, true)) continue;
                wp_delete_term($t->term_id, 'product_cat');
                $lines[] = '- removed empty category: ' . $t->name;
            }
        }

        $summary = sprintf(
            "mode: %s | categories: %d created, %d existed | products: %d created, %d updated, %d trashed, %d skipped | images: %d attached",
            $replace ? 'REPLACE' : 'update',
            $cat_created, $cat_existing, $prod_created, $prod_updated, $prod_trashed, $prod_skipped, $images_attached
        );

        wp_send_json_success([
            'summary' => $summary,
            'lines'   => array_slice($lines, 0, 200),
        ]);
    }

    /** Product previously imported from this Wolt item, if any. */
    private function find_by_wolt_id(string $wolt_id): int {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p
               JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
              WHERE p.post_type = 'product'
                AND p.post_status IN ('publish','draft','pending','private')
                AND m.meta_key = '_alena_wolt_id' AND m.meta_value = %s
              LIMIT 1",
            $wolt_id
        ));
    }

    /** Exact-title match — WP_Query's `title` arg is unreliable across installs. */
    private function find_by_title(string $name): int {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts}
              WHERE post_type = 'product'
                AND post_status IN ('publish','draft','pending','private')
                AND post_title = %s
              LIMIT 1",
            $name
        ));
    }

    private function slugify(string $text): string {
        $text = strtolower(trim($text));
        $text = preg_replace('~\s+~', '-', $text);
        $text = preg_replace('~[^\p{Hebrew}\p{L}\p{N}\-]+~u', '', $text);
        return $text ?: 'cat-' . substr(md5($text . time()), 0, 8);
    }

    private function sideload_image(string $url, int $product_id, string $name): ?int {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $tmp = download_url($url, 20);
        if (is_wp_error($tmp)) return null;

        $file_array = [
            'name'     => sanitize_file_name(substr(md5($url), 0, 12) . '.jpg'),
            'tmp_name' => $tmp,
        ];
        $id = media_handle_sideload($file_array, $product_id, $name);
        if (is_wp_error($id)) {
            @unlink($tmp);
            return null;
        }
        return (int) $id;
    }
}
