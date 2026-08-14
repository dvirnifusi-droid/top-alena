<?php
if (!defined('ABSPATH')) exit;

/**
 * Shared option-group library — the Wolt model.
 *
 * Until now every dish carried its own copy of its modifier groups in the
 * _alena_modifiers post meta. The Wolt feed shows why that hurts: 53 dishes make
 * 157 group attachments but reference only 30 distinct groups — "תוספת ציפס
 * אמיתי" alone is used by 19 dishes. Changing its price meant editing 19 dishes.
 *
 * Model (mirrors Wolt):
 *   library  option ALENA_DZ_GROUPS  — [{id, name, type, values:[{id,name,price}]}]
 *   per dish meta   _alena_option_refs — [{group_id, label, min, max, max_single, free}]
 *
 * _alena_modifiers is still written on every save, compiled from library+refs,
 * so the modal, cart and order code keep reading exactly what they read before.
 * The library is the source of truth; the meta is a build artifact.
 */
class Alena_DZ_Option_Groups {

    const OPT_LIBRARY = 'alena_dz_option_groups';
    const META_REFS   = '_alena_option_refs';
    const META_COMPILED = '_alena_modifiers';

    public function __construct() {
        add_action('admin_menu', [$this, 'menu'], 27);
        add_action('wp_ajax_alena_og_save_group',  [$this, 'ajax_save_group']);
        add_action('wp_ajax_alena_og_delete_group',[$this, 'ajax_delete_group']);
        add_action('wp_ajax_alena_og_dish',        [$this, 'ajax_dish']);
        add_action('wp_ajax_alena_og_save_refs',   [$this, 'ajax_save_refs']);
        add_action('wp_ajax_alena_og_migrate',     [$this, 'ajax_migrate']);
    }

    /* ------------------------------------------------------------- library */

    public static function library(): array {
        $raw = get_option(self::OPT_LIBRARY, []);
        return is_array($raw) ? $raw : [];
    }

    private static function save_library(array $groups): void {
        update_option(self::OPT_LIBRARY, array_values($groups), false);
    }

    public static function group(string $id): ?array {
        foreach (self::library() as $g) {
            if (($g['id'] ?? '') === $id) return $g;
        }
        return null;
    }

    /** Stable identity for de-duplication: name + its value names/prices. */
    private static function fingerprint(array $group): string {
        $vals = [];
        foreach (($group['values'] ?? []) as $v) {
            $vals[] = trim((string) ($v['name'] ?? '')) . '|' . (float) ($v['price'] ?? 0);
        }
        sort($vals);
        return md5(trim((string) ($group['name'] ?? '')) . '::' . implode(';', $vals));
    }

    /* ------------------------------------------------------------- compile */

    /**
     * Rebuilds _alena_modifiers for one dish from the library + its refs.
     * Output shape is byte-for-byte what the importer used to write, so nothing
     * downstream needs to change.
     */
    public static function compile(int $product_id): void {
        $refs = get_post_meta($product_id, self::META_REFS, true);
        $refs = is_array($refs) ? $refs : [];
        if (!$refs) {
            delete_post_meta($product_id, self::META_COMPILED);
            return;
        }

        $out = [];
        foreach ($refs as $ref) {
            $g = self::group((string) ($ref['group_id'] ?? ''));
            if (!$g) continue;                       // group deleted — drop the ref
            $values = [];
            foreach (($g['values'] ?? []) as $v) {
                $values[] = [
                    'id'    => (string) ($v['id'] ?? ''),
                    'name'  => (string) ($v['name'] ?? ''),
                    'price' => (float) ($v['price'] ?? 0),
                ];
            }
            if (!$values) continue;
            $out[] = [
                'id'         => (string) $g['id'],
                'name'       => (string) (($ref['label'] ?? '') !== '' ? $ref['label'] : $g['name']),
                'type'       => ($g['type'] ?? 'single') === 'multi' ? 'Multichoice' : 'Choice',
                'min'        => max(0, (int) ($ref['min'] ?? 0)),
                'max'        => max(0, (int) ($ref['max'] ?? 0)),
                'max_single' => max(1, (int) ($ref['max_single'] ?? 1)),
                'free'       => max(0, (int) ($ref['free'] ?? 0)),
                'values'     => $values,
            ];
        }
        update_post_meta($product_id, self::META_COMPILED, wp_json_encode($out, JSON_UNESCAPED_UNICODE));
    }

    /** Recompiles every dish that references a group — used after editing it. */
    public static function recompile_users_of(string $group_id): int {
        $n = 0;
        foreach (self::dishes_using($group_id) as $pid) {
            self::compile($pid);
            $n++;
        }
        return $n;
    }

    public static function dishes_using(string $group_id): array {
        global $wpdb;
        $rows = $wpdb->get_col($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta}
              WHERE meta_key = %s AND meta_value LIKE %s",
            self::META_REFS,
            '%' . $wpdb->esc_like($group_id) . '%'
        ));
        return array_map('intval', $rows ?: []);
    }

    /* ----------------------------------------------------------- migration */

    /**
     * Folds the per-dish _alena_modifiers blobs into the shared library.
     * Idempotent: groups already in the library are matched by fingerprint, and
     * a dish that already has refs is left alone.
     */
    public static function migrate(): array {
        $library = self::library();
        $byPrint = [];
        foreach ($library as $g) $byPrint[self::fingerprint($g)] = $g['id'];

        $products = get_posts([
            'post_type'      => 'product',
            'post_status'    => ['publish', 'draft', 'pending', 'private'],
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ]);

        $dishes = 0; $created = 0; $attached = 0; $skipped = 0;
        foreach ($products as $pid) {
            $existing = get_post_meta($pid, self::META_REFS, true);
            if (is_array($existing) && $existing) { $skipped++; continue; }

            $raw = get_post_meta($pid, self::META_COMPILED, true);
            $mods = $raw ? json_decode($raw, true) : null;
            if (!is_array($mods) || !$mods) continue;

            $refs = [];
            foreach ($mods as $m) {
                if (!is_array($m) || empty($m['values'])) continue;
                $group = [
                    'name'   => (string) ($m['name'] ?? 'קבוצה'),
                    'type'   => (($m['type'] ?? '') === 'Multichoice') ? 'multi' : 'single',
                    'values' => [],
                ];
                foreach ($m['values'] as $v) {
                    $group['values'][] = [
                        'id'    => (string) ($v['id'] ?? wp_generate_uuid4()),
                        'name'  => (string) ($v['name'] ?? ''),
                        'price' => (float) ($v['price'] ?? 0),
                    ];
                }
                $print = self::fingerprint($group);
                if (isset($byPrint[$print])) {
                    $gid = $byPrint[$print];
                } else {
                    $gid = 'g_' . substr(md5($print . microtime(true)), 0, 12);
                    $group['id'] = $gid;
                    $library[] = $group;
                    $byPrint[$print] = $gid;
                    $created++;
                }
                $refs[] = [
                    'group_id'   => $gid,
                    'label'      => (string) ($m['name'] ?? ''),
                    'min'        => (int) ($m['min'] ?? 0),
                    'max'        => (int) ($m['max'] ?? 0),
                    'max_single' => (int) ($m['max_single'] ?? 1),
                    'free'       => (int) ($m['free'] ?? 0),
                ];
                $attached++;
            }
            if ($refs) {
                update_post_meta($pid, self::META_REFS, $refs);
                $dishes++;
            }
        }

        self::save_library($library);
        // Recompile so the artifact matches the new source of truth exactly.
        foreach ($products as $pid) self::compile($pid);

        return [
            'dishes'    => $dishes,
            'groups'    => $created,
            'attached'  => $attached,
            'skipped'   => $skipped,
            'library'   => count($library),
        ];
    }

    /* --------------------------------------------------------------- admin */

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'אופציות ותוספות',
            'אופציות ותוספות',
            'manage_woocommerce',
            'alena-option-groups',
            [$this, 'render']
        );
    }

    private function guard() {
        check_ajax_referer('alena_og', 'nonce');
        if (!current_user_can('manage_woocommerce')) wp_send_json_error('forbidden', 403);
    }

    public function ajax_save_group() {
        $this->guard();
        $in = json_decode(wp_unslash($_POST['group'] ?? ''), true);
        if (!is_array($in) || trim((string) ($in['name'] ?? '')) === '') {
            wp_send_json_error('bad_group', 400);
        }

        $values = [];
        foreach ((array) ($in['values'] ?? []) as $v) {
            $name = trim((string) ($v['name'] ?? ''));
            if ($name === '') continue;
            $values[] = [
                'id'    => (string) ($v['id'] ?? '') ?: 'v_' . substr(md5($name . microtime(true)), 0, 10),
                'name'  => $name,
                'price' => round((float) ($v['price'] ?? 0), 2),
            ];
        }
        if (!$values) wp_send_json_error('no_values', 400);

        $group = [
            'id'     => (string) ($in['id'] ?? '') ?: 'g_' . substr(md5($in['name'] . microtime(true)), 0, 12),
            'name'   => trim((string) $in['name']),
            'type'   => ($in['type'] ?? 'single') === 'multi' ? 'multi' : 'single',
            'values' => $values,
        ];

        $library = self::library();
        $found = false;
        foreach ($library as $i => $g) {
            if (($g['id'] ?? '') === $group['id']) { $library[$i] = $group; $found = true; break; }
        }
        if (!$found) $library[] = $group;
        self::save_library($library);

        // One edit here must reach every dish that uses the group.
        $touched = self::recompile_users_of($group['id']);

        wp_send_json_success(['id' => $group['id'], 'dishes_updated' => $touched]);
    }

    public function ajax_delete_group() {
        $this->guard();
        $id = (string) ($_POST['id'] ?? '');
        $users = self::dishes_using($id);
        if ($users) {
            wp_send_json_error([
                'message' => sprintf('הקבוצה משויכת ל-%d מנות. הסירו אותה מהן קודם.', count($users)),
            ], 409);
        }
        $library = array_values(array_filter(self::library(), function ($g) use ($id) {
            return ($g['id'] ?? '') !== $id;
        }));
        self::save_library($library);
        wp_send_json_success(['deleted' => $id]);
    }

    public function ajax_dish() {
        $this->guard();
        $pid = (int) ($_POST['product_id'] ?? 0);
        if (!$pid) wp_send_json_error('no_product', 400);
        $refs = get_post_meta($pid, self::META_REFS, true);
        wp_send_json_success(['refs' => is_array($refs) ? $refs : []]);
    }

    public function ajax_save_refs() {
        $this->guard();
        $pid  = (int) ($_POST['product_id'] ?? 0);
        $refs = json_decode(wp_unslash($_POST['refs'] ?? '[]'), true);
        if (!$pid || !is_array($refs)) wp_send_json_error('bad_request', 400);

        $clean = [];
        foreach ($refs as $r) {
            $gid = (string) ($r['group_id'] ?? '');
            if (!$gid || !self::group($gid)) continue;
            $clean[] = [
                'group_id'   => $gid,
                'label'      => trim((string) ($r['label'] ?? '')),
                'min'        => max(0, (int) ($r['min'] ?? 0)),
                'max'        => max(0, (int) ($r['max'] ?? 0)),
                'max_single' => max(1, (int) ($r['max_single'] ?? 1)),
                'free'       => max(0, (int) ($r['free'] ?? 0)),
            ];
        }
        update_post_meta($pid, self::META_REFS, $clean);
        self::compile($pid);
        wp_send_json_success(['saved' => count($clean)]);
    }

    public function ajax_migrate() {
        $this->guard();
        @set_time_limit(300);
        wp_send_json_success(self::migrate());
    }

    public function render() {
        $nonce   = wp_create_nonce('alena_og');
        $library = self::library();
        $dishes  = get_posts([
            'post_type' => 'product', 'post_status' => 'publish',
            'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC',
        ]);
        require ALENA_DZ_PATH . 'includes/views/option-groups-admin.php';
    }
}
