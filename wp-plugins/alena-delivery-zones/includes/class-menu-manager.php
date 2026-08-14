<?php
if (!defined('ABSPATH')) exit;

/**
 * Listing Manager — a Wolt-shaped editor for the menu.
 *
 * Mirrors the merchant portal the owner already works in: a filtered list of
 * dishes grouped by category, and a dish editor with three tabs
 * (בסיס / מתקדם / אפשרויות). Options come from the shared library in
 * Alena_DZ_Option_Groups, so a topping is still edited once for every dish.
 *
 * Everything writes through core WooCommerce fields, so the storefront, the
 * importer and the order pipeline keep working unchanged.
 */
class Alena_DZ_Menu_Manager {

    const META_AVAILABILITY = '_alena_availability';   // always | hours | window
    const META_VISIBLE_FROM = '_alena_visible_from';
    const META_VISIBLE_TO   = '_alena_visible_to';

    public function __construct() {
        add_action('admin_menu', [$this, 'menu'], 24);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('wp_ajax_alena_mm_list',      [$this, 'ajax_list']);
        add_action('wp_ajax_alena_mm_get',       [$this, 'ajax_get']);
        add_action('wp_ajax_alena_mm_save',      [$this, 'ajax_save']);
        add_action('wp_ajax_alena_mm_duplicate', [$this, 'ajax_duplicate']);
        add_action('wp_ajax_alena_mm_status',    [$this, 'ajax_status']);
    }

    /** The image picker uses wp.media and the option list is drag-sortable. */
    public function enqueue($hook) {
        if (strpos((string) $hook, 'alena-menu-manager') === false) return;
        wp_enqueue_media();
        wp_enqueue_script('jquery-ui-sortable');
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'ניהול תפריט',
            'ניהול תפריט',
            'manage_woocommerce',
            'alena-menu-manager',
            [$this, 'render']
        );
    }

    private function guard() {
        check_ajax_referer('alena_mm', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
    }

    /* ---------------------------------------------------------------- list */

    public function ajax_list() {
        $this->guard();
        $search = trim((string) ($_POST['search'] ?? ''));
        $filter = (string) ($_POST['filter'] ?? 'all');   // all|inactive|uncategorised
        $term   = (int) ($_POST['term'] ?? 0);

        $args = [
            'post_type'      => 'product',
            'post_status'    => ['publish', 'draft', 'pending', 'private'],
            'posts_per_page' => -1,
            'orderby'        => 'menu_order title',
            'order'          => 'ASC',
        ];
        if ($search !== '') $args['s'] = $search;
        if ($term)          $args['tax_query'] = [['taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => [$term]]];

        $ids = get_posts($args + ['fields' => 'ids']);

        $rows = [];
        foreach ($ids as $pid) {
            $p = wc_get_product($pid);
            if (!$p) continue;
            $status = get_post_status($pid);
            $cats   = wp_get_post_terms($pid, 'product_cat', ['fields' => 'all']);
            if ($filter === 'inactive'      && $status === 'publish') continue;
            if ($filter === 'uncategorised' && $cats)                 continue;

            $refs = get_post_meta($pid, Alena_DZ_Option_Groups::META_REFS, true);
            $rows[] = [
                'id'       => $pid,
                'name'     => $p->get_name(),
                'desc'     => wp_trim_words(strip_tags($p->get_description() ?: ''), 16, '…'),
                'price'    => (float) $p->get_price(),
                'status'   => $status,
                'img'      => wp_get_attachment_image_url($p->get_image_id(), 'thumbnail') ?: '',
                'cat'      => $cats ? $cats[0]->name : '',
                'cat_id'   => $cats ? (int) $cats[0]->term_id : 0,
                'opts'     => is_array($refs) ? count($refs) : 0,
            ];
        }

        wp_send_json_success(['rows' => $rows, 'counts' => $this->counts()]);
    }

    private function counts(): array {
        $all = get_posts([
            'post_type' => 'product', 'post_status' => ['publish','draft','pending','private'],
            'posts_per_page' => -1, 'fields' => 'ids',
        ]);
        $inactive = 0; $uncat = 0;
        foreach ($all as $pid) {
            if (get_post_status($pid) !== 'publish') $inactive++;
            if (!wp_get_post_terms($pid, 'product_cat', ['fields' => 'ids'])) $uncat++;
        }
        return [
            'all'      => count($all),
            'options'  => count(Alena_DZ_Option_Groups::library()),
            'inactive' => $inactive,
            'uncat'    => $uncat,
        ];
    }

    /* ----------------------------------------------------------- read dish */

    public function ajax_get() {
        $this->guard();
        $pid = (int) ($_POST['id'] ?? 0);
        $p   = $pid ? wc_get_product($pid) : null;
        if (!$p) wp_send_json_error('not_found', 404);

        $cats = wp_get_post_terms($pid, 'product_cat', ['fields' => 'ids']) ?: [];
        $refs = get_post_meta($pid, Alena_DZ_Option_Groups::META_REFS, true);

        wp_send_json_success([
            'id'            => $pid,
            'name'          => $p->get_name(),
            'description'   => $p->get_description(),
            'status'        => get_post_status($pid),
            'price'         => (string) $p->get_regular_price(),
            'sale_price'    => (string) $p->get_sale_price(),
            'primary_cat'   => $cats ? (int) $cats[0] : 0,
            'extra_cats'    => array_map('intval', array_slice($cats, 1)),
            'image_id'      => (int) $p->get_image_id(),
            'image_url'     => wp_get_attachment_image_url($p->get_image_id(), 'medium') ?: '',
            'stock'         => $p->is_in_stock(),
            'availability'  => get_post_meta($pid, self::META_AVAILABILITY, true) ?: 'always',
            'visible_from'  => get_post_meta($pid, self::META_VISIBLE_FROM, true) ?: '',
            'visible_to'    => get_post_meta($pid, self::META_VISIBLE_TO, true) ?: '',
            'refs'          => is_array($refs) ? $refs : [],
            'library'       => Alena_DZ_Option_Groups::library(),
        ]);
    }

    /* ---------------------------------------------------------- save dish */

    public function ajax_save() {
        $this->guard();
        $d = json_decode(wp_unslash($_POST['dish'] ?? ''), true);
        if (!is_array($d)) wp_send_json_error('bad_payload', 400);

        $pid = (int) ($d['id'] ?? 0);
        if (!$pid || !get_post($pid)) wp_send_json_error('not_found', 404);
        if (trim((string) ($d['name'] ?? '')) === '') wp_send_json_error('name_required', 400);

        wp_update_post([
            'ID'           => $pid,
            'post_title'   => sanitize_text_field($d['name']),
            'post_content' => wp_kses_post($d['description'] ?? ''),
            'post_excerpt' => wp_kses_post($d['description'] ?? ''),
            'post_status'  => in_array($d['status'] ?? '', ['publish','draft','private'], true) ? $d['status'] : 'publish',
        ]);

        $regular = $d['price'] !== '' ? wc_format_decimal($d['price']) : '';
        $sale    = ($d['sale_price'] ?? '') !== '' ? wc_format_decimal($d['sale_price']) : '';
        update_post_meta($pid, '_regular_price', $regular);
        if ($sale !== '' && (float) $sale > 0 && (float) $sale < (float) $regular) {
            update_post_meta($pid, '_sale_price', $sale);
            update_post_meta($pid, '_price', $sale);
        } else {
            delete_post_meta($pid, '_sale_price');
            update_post_meta($pid, '_price', $regular);
        }
        update_post_meta($pid, '_stock_status', !empty($d['stock']) ? 'instock' : 'outofstock');

        // Primary category first — the storefront groups by the first term.
        $cats = [];
        if (!empty($d['primary_cat'])) $cats[] = (int) $d['primary_cat'];
        foreach ((array) ($d['extra_cats'] ?? []) as $c) {
            $c = (int) $c;
            if ($c && !in_array($c, $cats, true)) $cats[] = $c;
        }
        wp_set_object_terms($pid, $cats, 'product_cat');

        if (!empty($d['image_id'])) set_post_thumbnail($pid, (int) $d['image_id']);

        update_post_meta($pid, self::META_AVAILABILITY, sanitize_text_field($d['availability'] ?? 'always'));
        update_post_meta($pid, self::META_VISIBLE_FROM, sanitize_text_field($d['visible_from'] ?? ''));
        update_post_meta($pid, self::META_VISIBLE_TO,   sanitize_text_field($d['visible_to'] ?? ''));

        // Option refs go through the library so _alena_modifiers stays generated.
        if (isset($d['refs']) && is_array($d['refs'])) {
            $clean = [];
            foreach ($d['refs'] as $r) {
                $gid = (string) ($r['group_id'] ?? '');
                if (!$gid || !Alena_DZ_Option_Groups::group($gid)) continue;
                $clean[] = [
                    'group_id'   => $gid,
                    'label'      => trim((string) ($r['label'] ?? '')),
                    'min'        => max(0, (int) ($r['min'] ?? 0)),
                    'max'        => max(0, (int) ($r['max'] ?? 0)),
                    'max_single' => max(1, (int) ($r['max_single'] ?? 1)),
                    'free'       => max(0, (int) ($r['free'] ?? 0)),
                ];
            }
            update_post_meta($pid, Alena_DZ_Option_Groups::META_REFS, $clean);
            Alena_DZ_Option_Groups::compile($pid);
        }

        wc_delete_product_transients($pid);
        wp_send_json_success(['id' => $pid]);
    }

    /* ---------------------------------------------------------- duplicate */

    public function ajax_duplicate() {
        $this->guard();
        $pid = (int) ($_POST['id'] ?? 0);
        $src = $pid ? get_post($pid) : null;
        if (!$src) wp_send_json_error('not_found', 404);

        // Created as a draft: a copy is a starting point, not something that
        // should reach customers before it has been edited.
        $new_id = wp_insert_post([
            'post_type'    => 'product',
            'post_status'  => 'draft',
            'post_title'   => $src->post_title . ' (עותק)',
            'post_content' => $src->post_content,
            'post_excerpt' => $src->post_excerpt,
            'menu_order'   => $src->menu_order,
        ], true);
        if (is_wp_error($new_id)) wp_send_json_error($new_id->get_error_message(), 500);

        wp_set_object_terms($new_id, wp_get_post_terms($pid, 'product_cat', ['fields' => 'ids']), 'product_cat');
        wp_set_object_terms($new_id, ['simple'], 'product_type');

        foreach (['_regular_price','_sale_price','_price','_stock_status','_virtual','_visibility',
                  self::META_AVAILABILITY, self::META_VISIBLE_FROM, self::META_VISIBLE_TO] as $k) {
            $v = get_post_meta($pid, $k, true);
            if ($v !== '') update_post_meta($new_id, $k, $v);
        }
        $thumb = get_post_thumbnail_id($pid);
        if ($thumb) set_post_thumbnail($new_id, $thumb);

        // Copy option refs, then rebuild the modifier artifact for the copy.
        $refs = get_post_meta($pid, Alena_DZ_Option_Groups::META_REFS, true);
        if (is_array($refs) && $refs) {
            update_post_meta($new_id, Alena_DZ_Option_Groups::META_REFS, $refs);
            Alena_DZ_Option_Groups::compile($new_id);
        }

        wp_send_json_success(['id' => $new_id, 'name' => get_the_title($new_id)]);
    }

    public function ajax_status() {
        $this->guard();
        $pid = (int) ($_POST['id'] ?? 0);
        if (!$pid || !get_post($pid)) wp_send_json_error('not_found', 404);
        $to = get_post_status($pid) === 'publish' ? 'draft' : 'publish';
        wp_update_post(['ID' => $pid, 'post_status' => $to]);
        wp_send_json_success(['status' => $to]);
    }

    public function render() {
        $nonce = wp_create_nonce('alena_mm');
        $terms = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);
        if (is_wp_error($terms)) $terms = [];
        if (class_exists('Alena_DZ_Menu_Order')) $terms = Alena_DZ_Menu_Order::sort_terms($terms);
        $library = Alena_DZ_Option_Groups::library();
        require ALENA_DZ_PATH . 'includes/views/menu-manager-admin.php';
    }
}
