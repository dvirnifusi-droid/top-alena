<?php
if (!defined('ABSPATH')) exit;

/**
 * Remote control bridge — lets the TOP ALENA app read and change the delivery
 * site's settings without anyone logging into WordPress.
 *
 * Direction: the app's BACKEND calls these endpoints with a shared secret
 * (X-Alena-Control-Key). The key lives in WordPress (auto-generated once) and is
 * copied into the app; it is never exposed to a browser. WordPress stays the
 * source of truth for its own settings — the app is a remote for them.
 *
 * Phase 2 of "control the delivery site from TOP ALENA". This first slice covers
 * the settings the owner changes most: the club benefits (member discount,
 * join incentive, point values) and the feature on/off switches. Hours, menu
 * and payment come in later slices.
 */
class Alena_DZ_Control_API {

    const OPT_KEY = 'alena_control_key';

    public function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
        add_action('admin_init',    [$this, 'ensure_key']);
        // Notify the customer their order is ready/out however it gets completed
        // (app "מוכן לאיסוף/יצא למשלוח", WC admin, or an automation). Deduped inside.
        add_action('woocommerce_order_status_completed', [$this, 'on_order_completed'], 20, 2);
        // A new PAID order → alert the owner (web push in TOP ALENA), so they know
        // even when nothing is open. Deduped; fires on the paid transition.
        add_action('woocommerce_order_status_processing', [$this, 'on_order_paid'], 20, 2);
    }

    /** New paid order → push the owner an alert through TOP ALENA (once). */
    public function on_order_paid($order_id, $order = null): void {
        if (!$order) $order = function_exists('wc_get_order') ? wc_get_order($order_id) : null;
        if (!$order || $order->get_meta('_alena_owner_alerted')) return;
        $order->update_meta_data('_alena_owner_alerted', current_time('mysql'));
        $order->save();

        $otp = trim((string) get_option('alena_otp_relay_url', 'https://topalena.com/api/delivery/send-otp'));
        $url = preg_replace('#/send-otp/?$#', '/new-order', $otp);
        if ($url === $otp) $url = rtrim($otp, '/') . '/new-order';
        $key = self::key();
        if (!$url || !$key) return;

        $ful = 'delivery';
        foreach ($order->get_shipping_methods() as $sm) {
            if (strpos((string) $sm->get_method_id(), 'pickup') !== false) { $ful = 'pickup'; break; }
        }
        $items = 0;
        foreach ($order->get_items() as $it) { $items += (int) $it->get_quantity(); }

        wp_remote_post($url, [
            'timeout'  => 8,
            'blocking' => false,
            'headers'  => ['X-Alena-Control-Key' => $key, 'Content-Type' => 'application/json'],
            'body'     => wp_json_encode([
                'number'      => $order->get_order_number(),
                'total'       => (float) $order->get_total(),
                'fulfillment' => $ful,
                'items'       => $items,
                'customer'    => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
            ]),
        ]);
    }

    /** WC completed transition → notify the customer (self-guarded / deduped). */
    public function on_order_completed($order_id, $order = null): void {
        if (!$order) $order = function_exists('wc_get_order') ? wc_get_order($order_id) : null;
        if ($order) $this->notify_customer_ready($order);
    }

    /** One durable secret, created the first time and kept. */
    public function ensure_key(): void {
        if (!get_option(self::OPT_KEY)) {
            update_option(self::OPT_KEY, wp_generate_password(48, false, false));
        }
    }

    public static function key(): string {
        return (string) get_option(self::OPT_KEY, '');
    }

    public function routes(): void {
        register_rest_route('alena/v1', '/control/settings', [
            ['methods' => 'GET',  'callback' => [$this, 'get_settings'], 'permission_callback' => [$this, 'auth']],
            ['methods' => 'POST', 'callback' => [$this, 'set_settings'], 'permission_callback' => [$this, 'auth']],
        ]);
        // The menu itself — WooCommerce products (name/price/desc/availability/image).
        register_rest_route('alena/v1', '/control/products', [
            ['methods' => 'GET', 'callback' => [$this, 'get_products'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/product', [
            ['methods' => 'POST', 'callback' => [$this, 'set_product'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/product-image', [
            ['methods' => 'POST', 'callback' => [$this, 'set_product_image'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Coupons — list, create/update/toggle, delete.
        register_rest_route('alena/v1', '/control/coupons', [
            ['methods' => 'GET', 'callback' => [$this, 'get_coupons'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/coupon', [
            ['methods' => 'POST', 'callback' => [$this, 'set_coupon'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Today's orders — count + revenue (read-only dashboard).
        register_rest_route('alena/v1', '/control/orders-today', [
            ['methods' => 'GET', 'callback' => [$this, 'get_orders_today'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Live orders feed + status control (the app's order-management screen).
        register_rest_route('alena/v1', '/control/orders', [
            ['methods' => 'GET', 'callback' => [$this, 'get_orders'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/order-status', [
            ['methods' => 'POST', 'callback' => [$this, 'set_order_status'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Bulk: accept many orders at once (rush hour).
        register_rest_route('alena/v1', '/control/orders-status', [
            ['methods' => 'POST', 'callback' => [$this, 'set_orders_status'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Analytics: server-side per-day rollup over a range (no 300-order cap).
        register_rest_route('alena/v1', '/control/orders-summary', [
            ['methods' => 'GET', 'callback' => [$this, 'orders_summary'], 'permission_callback' => [$this, 'auth']],
        ]);
        // PUBLIC live order tracking — no control key; the customer proves access
        // with the order's own WC key (the same secret in their order-received URL).
        register_rest_route('alena/v1', '/track', [
            ['methods' => 'GET', 'callback' => [$this, 'track_order'], 'permission_callback' => '__return_true'],
        ]);
        // Create a brand-new product.
        register_rest_route('alena/v1', '/control/product-create', [
            ['methods' => 'POST', 'callback' => [$this, 'create_product'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Option groups (shared modifier library) + per-dish attachment.
        register_rest_route('alena/v1', '/control/option-groups', [
            ['methods' => 'GET',  'callback' => [$this, 'get_option_groups'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/option-group', [
            ['methods' => 'POST', 'callback' => [$this, 'set_option_group'], 'permission_callback' => [$this, 'auth']],
        ]);
        register_rest_route('alena/v1', '/control/product-options', [
            ['methods' => 'GET',  'callback' => [$this, 'get_product_options'], 'permission_callback' => [$this, 'auth']],
            ['methods' => 'POST', 'callback' => [$this, 'set_product_options'], 'permission_callback' => [$this, 'auth']],
        ]);
        // Payment gateways — enable/disable.
        register_rest_route('alena/v1', '/control/payment-gateways', [
            ['methods' => 'GET',  'callback' => [$this, 'get_payment_gateways'], 'permission_callback' => [$this, 'auth']],
            ['methods' => 'POST', 'callback' => [$this, 'set_payment_gateway'],  'permission_callback' => [$this, 'auth']],
        ]);
    }

    /* ----------------------- New product ----------------------- */

    public function create_product(\WP_REST_Request $req): \WP_REST_Response {
        if (!function_exists('wc_get_product')) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        $b    = $req->get_json_params();
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר שם מנה']));

        $p = new \WC_Product_Simple();
        $p->set_name($name);
        $p->set_status('publish');
        $p->set_catalog_visibility('visible');
        if (array_key_exists('price', $b) && $b['price'] !== '') $p->set_regular_price((string) (float) $b['price']);
        if (isset($b['description'])) { $desc = wp_kses_post((string) $b['description']); $p->set_description($desc); $p->set_short_description($desc); }
        $p->set_stock_status(!empty($b['in_stock']) || !isset($b['in_stock']) ? 'instock' : 'outofstock');

        // Category by id or by name (create if missing when a name is given).
        $cat_id = (int) ($b['category_id'] ?? 0);
        if (!$cat_id && !empty($b['category'])) {
            $term = get_term_by('name', (string) $b['category'], 'product_cat');
            if ($term) $cat_id = (int) $term->term_id;
        }
        if ($cat_id) $p->set_category_ids([$cat_id]);

        $id = $p->save();
        if (!$id) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'יצירת המנה נכשלה']));

        return $this->no_cache(rest_ensure_response(['ok' => true, 'id' => $id, 'name' => $name]));
    }

    /* ----------------------- Option groups (modifiers) ----------------------- */

    public function get_option_groups(): \WP_REST_Response {
        if (!class_exists('Alena_DZ_Option_Groups')) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מודול האופציות לא פעיל']));
        $groups = [];
        foreach (Alena_DZ_Option_Groups::library() as $g) {
            $used = Alena_DZ_Option_Groups::dishes_using((string) ($g['id'] ?? ''));
            $groups[] = [
                'id'      => (string) ($g['id'] ?? ''),
                'name'    => (string) ($g['name'] ?? ''),
                'type'    => (string) ($g['type'] ?? 'single'),
                'values'  => array_map(function ($v) {
                    return ['id' => (string) ($v['id'] ?? ''), 'name' => (string) ($v['name'] ?? ''), 'price' => (float) ($v['price'] ?? 0)];
                }, (array) ($g['values'] ?? [])),
                'used_by' => count($used),
            ];
        }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'groups' => $groups]));
    }

    public function set_option_group(\WP_REST_Request $req): \WP_REST_Response {
        if (!class_exists('Alena_DZ_Option_Groups')) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מודול האופציות לא פעיל']));
        $b   = $req->get_json_params();
        $lib = Alena_DZ_Option_Groups::library();
        $id  = (string) ($b['id'] ?? '');

        // Delete (guard: not while attached to dishes).
        if (!empty($b['delete'])) {
            if ($id && Alena_DZ_Option_Groups::dishes_using($id)) {
                return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'הקבוצה משויכת למנות — הסירו אותה מהן קודם']));
            }
            $lib = array_values(array_filter($lib, function ($g) use ($id) { return ($g['id'] ?? '') !== $id; }));
            update_option(Alena_DZ_Option_Groups::OPT_LIBRARY, $lib, false);
            return $this->no_cache(rest_ensure_response(['ok' => true, 'deleted' => $id]));
        }

        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר שם קבוצה']));

        $values = [];
        foreach ((array) ($b['values'] ?? []) as $v) {
            $vn = trim((string) ($v['name'] ?? ''));
            if ($vn === '') continue;
            $values[] = [
                'id'    => (string) ($v['id'] ?? '') ?: 'v_' . substr(md5($vn . microtime(true) . count($values)), 0, 10),
                'name'  => $vn,
                'price' => round((float) ($v['price'] ?? 0), 2),
            ];
        }
        if (!$values) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'צריך לפחות אפשרות אחת']));

        $group = [
            'id'     => $id ?: 'g_' . substr(md5($name . microtime(true)), 0, 12),
            'name'   => $name,
            'type'   => ($b['type'] ?? 'single') === 'multi' ? 'multi' : 'single',
            'values' => $values,
        ];
        $found = false;
        foreach ($lib as $i => $g) {
            if (($g['id'] ?? '') === $group['id']) { $lib[$i] = $group; $found = true; break; }
        }
        if (!$found) $lib[] = $group;
        update_option(Alena_DZ_Option_Groups::OPT_LIBRARY, array_values($lib), false);

        $touched = Alena_DZ_Option_Groups::recompile_users_of($group['id']);
        return $this->no_cache(rest_ensure_response(['ok' => true, 'id' => $group['id'], 'dishes_updated' => $touched]));
    }

    public function get_product_options(\WP_REST_Request $req): \WP_REST_Response {
        if (!class_exists('Alena_DZ_Option_Groups')) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מודול האופציות לא פעיל']));
        $pid  = (int) $req->get_param('id');
        if (!$pid) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר מזהה מנה']));
        $refs = get_post_meta($pid, Alena_DZ_Option_Groups::META_REFS, true);
        return $this->no_cache(rest_ensure_response(['ok' => true, 'refs' => is_array($refs) ? $refs : []]));
    }

    public function set_product_options(\WP_REST_Request $req): \WP_REST_Response {
        if (!class_exists('Alena_DZ_Option_Groups')) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מודול האופציות לא פעיל']));
        $b   = $req->get_json_params();
        $pid = (int) ($b['id'] ?? 0);
        if (!$pid) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר מזהה מנה']));
        $clean = [];
        foreach ((array) ($b['refs'] ?? []) as $r) {
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
        return $this->no_cache(rest_ensure_response(['ok' => true, 'saved' => count($clean)]));
    }

    /* ----------------------- Payment gateways ----------------------- */

    public function get_payment_gateways(): \WP_REST_Response {
        if (!function_exists('WC') || !WC()->payment_gateways()) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        $out = [];
        foreach (WC()->payment_gateways()->payment_gateways() as $id => $gw) {
            $out[] = [
                'id'      => (string) $id,
                'title'   => (string) ($gw->get_title() ?: $gw->get_method_title()),
                'enabled' => ($gw->enabled === 'yes'),
            ];
        }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'gateways' => $out]));
    }

    public function set_payment_gateway(\WP_REST_Request $req): \WP_REST_Response {
        $b  = $req->get_json_params();
        $id = sanitize_text_field((string) ($b['id'] ?? ''));
        if ($id === '') return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר מזהה']));
        $opt = 'woocommerce_' . $id . '_settings';
        $s   = get_option($opt, []);
        if (!is_array($s)) $s = [];
        $s['enabled'] = !empty($b['enabled']) ? 'yes' : 'no';
        update_option($opt, $s);
        return $this->no_cache(rest_ensure_response(['ok' => true, 'id' => $id, 'enabled' => $s['enabled'] === 'yes']));
    }

    /* ----------------------- Coupons ----------------------- */

    private const COUPON_TYPES = ['percent', 'fixed_cart', 'fixed_product'];

    /** All coupons, active + disabled (drafts). */
    public function get_coupons(): \WP_REST_Response {
        $posts = get_posts([
            'post_type' => 'shop_coupon', 'post_status' => ['publish', 'draft', 'pending', 'private'],
            'numberposts' => 200, 'orderby' => 'date', 'order' => 'DESC',
        ]);
        $out = [];
        foreach ($posts as $post) {
            $c = new \WC_Coupon($post->ID);
            $out[] = [
                'id'             => $post->ID,
                'code'           => $c->get_code(),
                'discount_type'  => $c->get_discount_type(),
                'amount'         => $c->get_amount(),
                'minimum_amount' => $c->get_minimum_amount(),
                'free_shipping'  => $c->get_free_shipping(),
                'description'    => $c->get_description(),
                'expiry_date'    => $c->get_date_expires() ? $c->get_date_expires()->date('Y-m-d') : '',
                'usage_count'    => $c->get_usage_count(),
                'usage_limit'    => $c->get_usage_limit(),
                'enabled'        => ($post->post_status === 'publish'),
            ];
        }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'coupons' => $out]));
    }

    /** Create / update / toggle / delete one coupon. */
    public function set_coupon(\WP_REST_Request $req): \WP_REST_Response {
        $b    = $req->get_json_params();
        $code = trim((string) ($b['code'] ?? ''));
        $id   = (int) ($b['id'] ?? 0);

        if (!$id && $code === '') return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'חסר קוד קופון']));

        // Resolve existing by id or code.
        if (!$id && $code !== '') {
            $existing = wc_get_coupon_id_by_code($code);
            if ($existing) $id = (int) $existing;
        }

        // Delete.
        if (!empty($b['delete'])) {
            if ($id) wp_delete_post($id, true);
            return $this->no_cache(rest_ensure_response(['ok' => true, 'deleted' => true]));
        }

        $c = $id ? new \WC_Coupon($id) : new \WC_Coupon();
        if ($code !== '') $c->set_code($code);

        if (isset($b['discount_type']) && in_array($b['discount_type'], self::COUPON_TYPES, true)) {
            $c->set_discount_type($b['discount_type']);
        }
        if (array_key_exists('amount', $b) && $b['amount'] !== '')      $c->set_amount((string) (float) $b['amount']);
        if (array_key_exists('minimum_amount', $b))                     $c->set_minimum_amount($b['minimum_amount'] === '' ? '' : (string) (float) $b['minimum_amount']);
        if (isset($b['free_shipping']))                                 $c->set_free_shipping(!empty($b['free_shipping']));
        if (isset($b['description']))                                   $c->set_description(sanitize_text_field((string) $b['description']));
        if (array_key_exists('usage_limit', $b))                        $c->set_usage_limit($b['usage_limit'] === '' ? 0 : (int) $b['usage_limit']);
        if (array_key_exists('expiry_date', $b)) {
            $c->set_date_expires(!empty($b['expiry_date']) ? strtotime((string) $b['expiry_date']) : null);
        }
        $c->save();
        $id = $c->get_id();

        // Enable/disable = publish/draft (WooCommerce only applies published coupons).
        if (array_key_exists('enabled', $b) && $id) {
            wp_update_post(['ID' => $id, 'post_status' => !empty($b['enabled']) ? 'publish' : 'draft']);
        }

        return $this->no_cache(rest_ensure_response(['ok' => true, 'id' => $id]));
    }

    /* ----------------------- Today's orders ----------------------- */

    public function get_orders_today(): \WP_REST_Response {
        if (!function_exists('wc_get_orders')) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        }
        $tz    = new \DateTimeZone('Asia/Jerusalem');
        $start = (new \DateTimeImmutable('today', $tz))->getTimestamp();

        $orders = wc_get_orders([
            'limit'        => -1,
            'date_created' => '>=' . $start,
            'status'       => ['processing', 'completed', 'on-hold'],
            'type'         => 'shop_order',
        ]);
        $count = 0; $revenue = 0.0; $delivery = 0; $pickup = 0;
        foreach ($orders as $o) {
            $count++;
            $revenue += (float) $o->get_total();
            // Fulfilment method, if our checkout saved it.
            $ful = $o->get_meta('_alena_fulfillment') ?: $o->get_meta('alena_fulfillment');
            if ($ful === 'pickup') $pickup++; elseif ($ful === 'delivery') $delivery++;
        }
        return $this->no_cache(rest_ensure_response([
            'ok'       => true,
            'count'    => $count,
            'revenue'  => round($revenue, 2),
            'avg'      => $count ? round($revenue / $count, 2) : 0,
            'delivery' => $delivery,
            'pickup'   => $pickup,
            'currency' => get_woocommerce_currency(),
        ]));
    }

    /** Live orders feed for the app's order-management screen. */
    public function get_orders(\WP_REST_Request $req): \WP_REST_Response {
        if (!function_exists('wc_get_orders')) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        }
        $limit = min(150, max(1, (int) ($req->get_param('limit') ?: 40)));
        $args = ['limit' => $limit, 'orderby' => 'date', 'order' => 'DESC', 'type' => 'shop_order'];

        // Status filter: 'active' (live), 'all', or a csv of WC statuses.
        $status = trim((string) $req->get_param('status'));
        if ($status === 'active') {
            $args['status'] = ['pending', 'processing', 'on-hold'];
        } elseif ($status !== '' && $status !== 'all') {
            $args['status'] = array_map('trim', explode(',', $status));
        }

        // Date range (YYYY-MM-DD, Israel time) → inclusive.
        $tz   = new \DateTimeZone('Asia/Jerusalem');
        $from = trim((string) $req->get_param('from'));
        $to   = trim((string) $req->get_param('to'));
        $fromTs = $from ? (\DateTimeImmutable::createFromFormat('!Y-m-d', $from, $tz) ?: null) : null;
        $toTs   = $to   ? (\DateTimeImmutable::createFromFormat('!Y-m-d', $to, $tz) ?: null) : null;
        if ($fromTs && $toTs) {
            $args['date_created'] = $fromTs->getTimestamp() . '...' . ($toTs->getTimestamp() + 86399);
        } elseif ($fromTs) {
            $args['date_created'] = '>=' . $fromTs->getTimestamp();
        } elseif ($toTs) {
            $args['date_created'] = '<=' . ($toTs->getTimestamp() + 86399);
        }

        $rating_f = trim((string) $req->get_param('rating')); // '', 'rated', 'low'
        $search   = trim((string) $req->get_param('search'));

        $orders = wc_get_orders($args);
        $out = [];
        foreach ($orders as $o) {
            $rating = (int) $o->get_meta('_alena_rating');
            // Post-fetch filters (rating + free-text search).
            if ($rating_f === 'rated' && $rating <= 0) continue;
            if ($rating_f === 'low' && !($rating > 0 && $rating <= 3)) continue;
            if ($search !== '') {
                $hay = $o->get_order_number() . ' ' . $o->get_billing_first_name() . ' ' . $o->get_billing_last_name() . ' ' . $o->get_billing_phone();
                if (mb_stripos($hay, $search) === false) continue;
            }
            $items = [];
            foreach ($o->get_items() as $it) {
                $meta = [];
                foreach ($it->get_formatted_meta_data('_', true) as $m) {
                    $line = trim(wp_strip_all_tags($m->display_value));
                    if ($line !== '') $meta[] = $line;
                }
                $items[] = [
                    'name' => $it->get_name(),
                    'qty'  => $it->get_quantity(),
                    'meta' => $meta,
                ];
            }
            $ful  = $o->get_meta('_alena_fulfillment') ?: $o->get_meta('alena_fulfillment');
            // The chosen shipping method is authoritative — the session-derived
            // meta has been seen to save 'delivery' on a genuine pickup order.
            foreach ($o->get_shipping_methods() as $sm) {
                $mid = $sm->get_method_id();
                if (strpos($mid, 'local_pickup') !== false || strpos($mid, 'pickup') !== false) { $ful = 'pickup'; break; }
                if (strpos($mid, 'alena_polygon') !== false || strpos($mid, 'flat_rate') !== false) { $ful = 'delivery'; }
            }
            $addr = '';
            if ($ful !== 'pickup') {
                $addr = trim($o->get_shipping_address_1() . ' ' . $o->get_shipping_city());
                if ($addr === '') $addr = trim($o->get_billing_address_1() . ' ' . $o->get_billing_city());
            }
            $created   = $o->get_date_created();
            $completed = $o->get_date_completed();
            // Returning-customer signal — phone-login customers carry a user id,
            // so this is WC-cached and cheap. Guests (uid 0) → 0 (no VIP badge).
            $uid = $o->get_customer_id();
            $cust_orders = $uid ? (int) wc_get_customer_order_count($uid) : 0;
            $out[] = [
                'id'           => $o->get_id(),
                'number'       => $o->get_order_number(),
                'status'       => $o->get_status(),
                'status_label' => wc_get_order_status_name($o->get_status()),
                'total'        => (float) $o->get_total(),
                'created'      => $created ? $created->getTimestamp() : 0,
                'fulfillment'  => $ful ?: '',
                'customer'     => trim($o->get_billing_first_name() . ' ' . $o->get_billing_last_name()) ?: $o->get_formatted_billing_full_name(),
                'phone'        => $o->get_billing_phone(),
                'address'      => $addr,
                'note'         => $o->get_customer_note(),
                'payment'      => $o->get_payment_method_title(),
                'rating'       => $rating,
                'rating_comment' => (string) $o->get_meta('_alena_rating_comment'),
                'prep_minutes' => (int) $o->get_meta('_alena_prep_minutes'),
                'ready_at'     => (int) $o->get_meta('_alena_ready_at'),
                'completed_at' => $completed ? $completed->getTimestamp() : 0,
                'notified'     => (bool) $o->get_meta('_alena_customer_notified'),
                'customer_orders' => $cust_orders,
                'items'        => $items,
            ];
        }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'orders' => $out, 'server_ts' => time()]));
    }

    /** Change one order's status from the app (received → preparing → done). */
    public function set_order_status(\WP_REST_Request $req): \WP_REST_Response {
        if (!function_exists('wc_get_order')) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        }
        $b      = $req->get_json_params();
        $id     = (int) ($b['id'] ?? 0);
        $status = sanitize_text_field((string) ($b['status'] ?? ''));
        $prep   = array_key_exists('prep_minutes', $b) ? max(0, min(600, (int) $b['prep_minutes'])) : null;
        $allowed = ['pending', 'processing', 'on-hold', 'completed', 'cancelled'];

        $o = wc_get_order($id);
        if (!$o) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'הזמנה לא נמצאה']));

        // Prep time (minutes) → also stamp a target "ready at" the customer sees.
        if ($prep !== null) {
            $o->update_meta_data('_alena_prep_minutes', $prep);
            $o->update_meta_data('_alena_ready_at', $prep > 0 ? (time() + $prep * 60) : 0);
            $o->save();
        }

        if ($status !== '') {
            if (!in_array($status, $allowed, true)) {
                return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'סטטוס לא תקין']));
            }
            $o->update_status($status, 'שונה מאפליקציית TOP ALENA');
            // Tell the customer their order is ready / on the way — once (deduped inside).
            if ($status === 'completed') $this->notify_customer_ready($o);
        } elseif ($prep === null) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'לא נשלח סטטוס או זמן הכנה']));
        }

        return $this->no_cache(rest_ensure_response([
            'ok' => true, 'id' => $id, 'status' => $o->get_status(), 'status_label' => wc_get_order_status_name($o->get_status()),
            'prep_minutes' => (int) $o->get_meta('_alena_prep_minutes'), 'ready_at' => (int) $o->get_meta('_alena_ready_at'),
        ]));
    }

    /** Bulk status change — accept several orders at once (rush hour), one HTTP call.
     *  Body: { ids: [int], status?, prep_minutes? }. Same rules as set_order_status. */
    public function set_orders_status(\WP_REST_Request $req): \WP_REST_Response {
        if (!function_exists('wc_get_order')) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        }
        $b      = $req->get_json_params();
        $ids    = array_slice(array_filter(array_map('intval', (array) ($b['ids'] ?? []))), 0, 100);
        $status = sanitize_text_field((string) ($b['status'] ?? ''));
        $prep   = array_key_exists('prep_minutes', $b) ? max(0, min(600, (int) $b['prep_minutes'])) : null;
        $silent = !empty($b['silent']); // cleanup: complete WITHOUT texting the customer
        $allowed = ['pending', 'processing', 'on-hold', 'completed', 'cancelled'];
        if (empty($ids)) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'לא נשלחו הזמנות']));
        if ($status !== '' && !in_array($status, $allowed, true)) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'סטטוס לא תקין']));
        }

        // Silent cleanup must NOT fire WooCommerce's OWN order emails (a batch
        // complete of old orders was flooding the owner's inbox). Disable the
        // relevant WC emails for the duration of this request only.
        $email_filters = ['woocommerce_email_enabled_customer_completed_order', 'woocommerce_email_enabled_customer_on_hold_order', 'woocommerce_email_enabled_customer_processing_order', 'woocommerce_email_enabled_cancelled_order', 'woocommerce_email_enabled_customer_refunded_order'];
        if ($silent) { foreach ($email_filters as $f) add_filter($f, '__return_false', 999); }

        $updated = [];
        foreach ($ids as $id) {
            $o = wc_get_order($id);
            if (!$o) continue;
            if ($prep !== null) {
                $o->update_meta_data('_alena_prep_minutes', $prep);
                $o->update_meta_data('_alena_ready_at', $prep > 0 ? (time() + $prep * 60) : 0);
                $o->save();
            }
            if ($status !== '') {
                // Silent cleanup: pre-stamp the dedupe meta so the completed-hook
                // notify is suppressed — a days-old order must not text "מוכן!".
                if ($status === 'completed' && $silent) { $o->update_meta_data('_alena_customer_notified', current_time('mysql')); $o->save(); }
                $o->update_status($status, 'שונה מאפליקציית TOP ALENA (כמות)');
                if ($status === 'completed' && !$silent) $this->notify_customer_ready($o);
            }
            $updated[] = [
                'id' => $id, 'status' => $o->get_status(), 'status_label' => wc_get_order_status_name($o->get_status()),
                'prep_minutes' => (int) $o->get_meta('_alena_prep_minutes'), 'ready_at' => (int) $o->get_meta('_alena_ready_at'),
            ];
        }
        if ($silent) { foreach ($email_filters as $f) remove_filter($f, '__return_false', 999); }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'updated' => $updated, 'count' => count($updated)]));
    }

    /** Server-side analytics rollup over a date range — no per-request order cap.
     *  Returns compact building blocks (counters + per-day/hour/item/customer maps)
     *  that the app assembles into the analytics view + previous-period deltas. */
    public function orders_summary(\WP_REST_Request $req): \WP_REST_Response {
        if (!function_exists('wc_get_orders')) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'WooCommerce לא פעיל']));
        }
        $from = sanitize_text_field((string) $req->get_param('from'));
        $to   = sanitize_text_field((string) $req->get_param('to'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'טווח לא תקין']));
        }
        // Query a day wider on each side (site TZ is a fixed offset that ignores
        // DST), then bucket precisely by Israel date in PHP.
        $lo = strtotime($from . ' 00:00:00') - 86400;
        $hi = strtotime($to . ' 23:59:59') + 86400;
        $orders = wc_get_orders([
            'limit'        => 5000,
            'status'       => array_keys(wc_get_order_statuses()),
            'date_created' => $lo . '...' . $hi,
            'orderby'      => 'date', 'order' => 'ASC',
        ]);
        $tz = new \DateTimeZone('Asia/Jerusalem');

        $liveN = 0; $rev = 0.0; $pk = 0; $dl = 0; $cx = 0;
        $prepSum = 0; $prepN = 0; $otNum = 0; $otDen = 0; $ret = 0; $rsum = 0; $rn = 0;
        $byDay = []; $byHour = array_fill(0, 24, 0); $items = []; $customers = []; $ratings = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $cust_count_cache = []; $count = 0;

        foreach ($orders as $o) {
            $created = $o->get_date_created();
            if (!$created) continue;
            $ts = $created->getTimestamp();
            try { $d = new \DateTime('@' . $ts); $d->setTimezone($tz); } catch (\Exception $e) { continue; }
            $ymd = $d->format('Y-m-d');
            if ($ymd < $from || $ymd > $to) continue; // outside the real range
            $count++;
            $status = $o->get_status();
            $cancelled = ($status === 'cancelled');
            if ($cancelled) { $cx++; continue; }
            $liveN++;
            $total = (float) $o->get_total();
            $rev += $total;
            $hour = (int) $d->format('G');
            $byHour[$hour]++;
            if (!isset($byDay[$ymd])) $byDay[$ymd] = ['orders' => 0, 'revenue' => 0.0, 'acc' => 0, 'ontime' => 0];
            $byDay[$ymd]['orders']++; $byDay[$ymd]['revenue'] += $total;

            $ful = 'delivery';
            foreach ($o->get_shipping_methods() as $sm) { if (strpos((string) $sm->get_method_id(), 'pickup') !== false) { $ful = 'pickup'; break; } }
            if ($ful === 'pickup') $pk++; else $dl++;

            $prep = (int) $o->get_meta('_alena_prep_minutes');
            if ($prep > 0) { $prepSum += $prep; $prepN++; }
            $ready = (int) $o->get_meta('_alena_ready_at');
            $completed = $o->get_date_completed();
            if ($status === 'completed' && $ready > 0 && $completed) {
                $otDen++; $byDay[$ymd]['acc']++;
                if ($completed->getTimestamp() <= $ready + 120) { $otNum++; $byDay[$ymd]['ontime']++; }
            }

            $uid = $o->get_customer_id();
            if ($uid) {
                if (!isset($cust_count_cache[$uid])) $cust_count_cache[$uid] = (int) wc_get_customer_order_count($uid);
                if ($cust_count_cache[$uid] >= 2) $ret++;
            }

            $rating = (int) $o->get_meta('_alena_rating');
            if ($rating >= 1 && $rating <= 5) { $ratings[$rating]++; $rsum += $rating; $rn++; }

            foreach ($o->get_items() as $it) {
                $n = trim($it->get_name());
                if ($n !== '') $items[$n] = ($items[$n] ?? 0) + (int) $it->get_quantity();
            }
            $phone = $o->get_billing_phone();
            if ($phone) {
                if (!isset($customers[$phone])) $customers[$phone] = ['name' => trim($o->get_billing_first_name() . ' ' . $o->get_billing_last_name()) ?: $phone, 'orders' => 0, 'spend' => 0.0];
                $customers[$phone]['orders']++; $customers[$phone]['spend'] += $total;
            }
        }

        // Trim the big maps to the top entries (keeps payload small).
        arsort($items); $items = array_slice($items, 0, 30, true);
        uasort($customers, function ($a, $b) { return $b['spend'] <=> $a['spend']; });
        $customers = array_slice($customers, 0, 20, true);
        foreach ($customers as &$c) { $c['spend'] = round($c['spend']); } unset($c);

        return $this->no_cache(rest_ensure_response([
            'ok' => true, 'count' => $count,
            'totals' => [
                'orders' => $liveN, 'revenue' => round($rev), 'pickup' => $pk, 'delivery' => $dl, 'cancelled' => $cx,
                'prep_sum' => $prepSum, 'prep_n' => $prepN, 'ontime_num' => $otNum, 'ontime_den' => $otDen,
                'returning' => $ret, 'rating_sum' => $rsum, 'rating_n' => $rn,
            ],
            'by_day' => $byDay, 'by_hour' => $byHour, 'items' => $items, 'customers' => $customers, 'ratings' => $ratings,
        ]));
    }

    /** PUBLIC live tracking for one order. Access proven by the order's WC key
     *  (unguessable; same secret in the customer's order-received URL). */
    public function track_order(\WP_REST_Request $req): \WP_REST_Response {
        $id  = (int) $req->get_param('order');
        $key = (string) $req->get_param('key');
        $o   = ($id && function_exists('wc_get_order')) ? wc_get_order($id) : null;
        if (!$o || $key === '' || !hash_equals((string) $o->get_order_key(), $key)) {
            return $this->no_cache(rest_ensure_response(['ok' => false]));
        }
        $status = $o->get_status();
        $dead   = in_array($status, ['cancelled', 'failed', 'refunded'], true);
        $stage  = 1;
        if ($status === 'processing') $stage = 2;
        if ($status === 'completed')  $stage = 3;
        $is_pickup = false;
        foreach ($o->get_shipping_methods() as $sm) {
            if (strpos((string) $sm->get_method_id(), 'pickup') !== false) { $is_pickup = true; break; }
        }
        $ready_at = (int) $o->get_meta('_alena_ready_at');
        $ready_hhmm = '';
        if ($ready_at > 0) {
            try { $d = new \DateTime('@' . $ready_at); $d->setTimezone(new \DateTimeZone('Asia/Jerusalem')); $ready_hhmm = $d->format('H:i'); }
            catch (\Exception $e) { $ready_hhmm = date('H:i', $ready_at); }
        }
        return $this->no_cache(rest_ensure_response([
            'ok' => true, 'status' => $status, 'stage' => $stage, 'dead' => $dead, 'refunded' => ($status === 'refunded'),
            'is_pickup' => $is_pickup, 'ready_at' => $ready_at, 'ready_hhmm' => $ready_hhmm, 'server_ts' => time(),
        ]));
    }

    /** SMS/WhatsApp the customer that their order is ready (pickup) or out (delivery).
     *  Sent through TOP ALENA's /api/delivery/notify (same Twilio pipeline + key). */
    private function notify_customer_ready($order): void {
        // Fire once per order, whoever completes it.
        if ($order->get_meta('_alena_customer_notified')) return;
        $phone = $order->get_billing_phone();
        if (!$phone) return;
        // Stamp the dedup meta up-front so a second completed-hook in the same
        // request can't double-send while this non-blocking POST is in flight.
        $order->update_meta_data('_alena_customer_notified', current_time('mysql'));
        $order->save();

        // Notify endpoint = the OTP relay base with /notify.
        $otp = trim((string) get_option('alena_otp_relay_url', 'https://topalena.com/api/delivery/send-otp'));
        $url = preg_replace('#/send-otp/?$#', '/notify', $otp);
        if ($url === $otp) $url = rtrim($otp, '/') . '/notify';
        $key = class_exists('Alena_DZ_Control_API') ? self::key() : (string) get_option('alena_control_key', '');
        if (!$url || !$key) return;

        // Fulfilment from the chosen shipping method (authoritative).
        $ful = 'delivery';
        foreach ($order->get_shipping_methods() as $sm) {
            if (strpos((string) $sm->get_method_id(), 'pickup') !== false) { $ful = 'pickup'; break; }
        }
        $addr = class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::address_full() : 'רוטשילד 104, ראשון לציון';
        $num  = $order->get_order_number();
        if ($ful === 'pickup') {
            $text = "🥡 הזמנה #{$num} מוכנה לאיסוף! מחכים לך ב{$addr}. תודה שהזמנת מעלינא 💚";
        } else {
            $text = "🛵 הזמנה #{$num} יצאה למשלוח ובדרך אליך! תודה שהזמנת מעלינא 💚";
        }

        wp_remote_post($url, [
            'timeout'  => 12,
            'blocking' => false, // don't hold up the status-change response
            'headers'  => ['X-Alena-Control-Key' => $key, 'Content-Type' => 'application/json'],
            'body'     => wp_json_encode(['phone' => $phone, 'text' => $text]),
        ]);
    }

    /** Replace a dish's photo from a base64 image the app sends (already resized). */
    public function set_product_image(\WP_REST_Request $req): \WP_REST_Response {
        $b  = $req->get_json_params();
        $id = (int) ($b['id'] ?? 0);
        if (!$id || !get_post($id)) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מנה לא נמצאה']));

        $data = (string) ($b['data'] ?? '');
        if (strpos($data, 'base64,') !== false) $data = substr($data, strpos($data, 'base64,') + 7);
        $bytes = base64_decode($data, true);
        if (!$bytes) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'תמונה לא תקינה']));

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $fn = sanitize_file_name((string) ($b['filename'] ?? ('dish-' . $id . '.jpg')));
        if (!preg_match('/\.(jpe?g|png|webp)$/i', $fn)) $fn .= '.jpg';

        $up = wp_upload_bits($fn, null, $bytes);
        if (!empty($up['error'])) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => $up['error']]));

        $ft  = wp_check_filetype($up['file']);
        $att = wp_insert_attachment([
            'post_mime_type' => $ft['type'] ?: 'image/jpeg',
            'post_title'     => get_the_title($id),
            'post_status'    => 'inherit',
        ], $up['file'], $id);
        if (is_wp_error($att) || !$att) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'שמירת התמונה נכשלה']));

        wp_update_attachment_metadata($att, wp_generate_attachment_metadata($att, $up['file']));
        set_post_thumbnail($id, $att);

        return $this->no_cache(rest_ensure_response(['ok' => true, 'image' => wp_get_attachment_image_url($att, 'thumbnail') ?: '']));
    }

    /** The whole menu, grouped-friendly: one row per dish. */
    public function get_products(): \WP_REST_Response {
        $ids = get_posts([
            'post_type' => 'product', 'post_status' => 'publish',
            'numberposts' => -1, 'fields' => 'ids', 'orderby' => 'title', 'order' => 'ASC',
        ]);
        $out = [];
        foreach ($ids as $id) {
            $p = function_exists('wc_get_product') ? wc_get_product($id) : null;
            if (!$p) continue;
            $cats = get_the_terms($id, 'product_cat');
            $out[] = [
                'id'          => (int) $id,
                'name'        => $p->get_name(),
                'price'       => $p->get_regular_price(),
                'description' => $p->get_description(),
                'in_stock'    => $p->get_stock_status() === 'instock',
                'image'       => get_the_post_thumbnail_url($id, 'thumbnail') ?: '',
                'category'    => ($cats && !is_wp_error($cats)) ? $cats[0]->name : '',
                'brand'       => class_exists('Alena_DZ_Brands') ? Alena_DZ_Brands::brand_of($id) : 'alena',
            ];
        }
        // Category list for the "add dish" picker.
        $cats = [];
        $terms = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);
        if (!is_wp_error($terms)) {
            foreach ($terms as $t) $cats[] = ['id' => (int) $t->term_id, 'name' => $t->name, 'slug' => $t->slug];
        }
        return $this->no_cache(rest_ensure_response(['ok' => true, 'products' => $out, 'categories' => $cats]));
    }

    /** Update one dish — only the fields sent. */
    public function set_product(\WP_REST_Request $req): \WP_REST_Response {
        $b = $req->get_json_params();
        $id = (int) ($b['id'] ?? 0);
        $p  = ($id && function_exists('wc_get_product')) ? wc_get_product($id) : null;
        if (!$p) return $this->no_cache(rest_ensure_response(['ok' => false, 'error' => 'מנה לא נמצאה']));

        if (isset($b['name']))        $p->set_name(sanitize_text_field((string) $b['name']));
        if (isset($b['description'])) { $desc = wp_kses_post((string) $b['description']); $p->set_description($desc); $p->set_short_description($desc); }
        if (array_key_exists('price', $b) && $b['price'] !== '') $p->set_regular_price((string) (float) $b['price']);
        if (isset($b['in_stock']))    $p->set_stock_status(!empty($b['in_stock']) ? 'instock' : 'outofstock');
        $p->save();

        return $this->no_cache(rest_ensure_response([
            'ok' => true,
            'product' => [
                'id' => $id, 'name' => $p->get_name(), 'price' => $p->get_regular_price(),
                'description' => $p->get_description(), 'in_stock' => $p->get_stock_status() === 'instock',
            ],
        ]));
    }

    /** Constant-time key check. */
    public function auth(\WP_REST_Request $req): bool {
        $sent = (string) $req->get_header('x-alena-control-key');
        $key  = self::key();
        return $key !== '' && $sent !== '' && hash_equals($key, $sent);
    }

    /** An auth-gated endpoint must never be cached — the server's nginx cache
     *  otherwise serves a stale 401/200 by URL and ignores the key header. */
    private function no_cache(\WP_REST_Response $r): \WP_REST_Response {
        nocache_headers();
        $r->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return $r;
    }

    public function get_settings(): \WP_REST_Response {
        return $this->no_cache(rest_ensure_response(['ok' => true, 'settings' => $this->snapshot()]));
    }

    public function set_settings(\WP_REST_Request $req): \WP_REST_Response {
        $b = $req->get_json_params();
        if (!is_array($b)) $b = [];

        // --- Club / benefits (whitelisted) ---
        $club = $b['club'] ?? [];
        if (isset($club['member_discount_pct'])) {
            update_option('alena_club_member_discount_pct', max(0, min(90, (float) $club['member_discount_pct'])));
        }
        if (array_key_exists('join_incentive', $club)) {
            update_option('alena_club_join_incentive', sanitize_text_field((string) $club['join_incentive']));
        }
        if (isset($club['coin_value'])) {
            update_option('alena_club_coin_value', max(0, (float) $club['coin_value']));
        }
        if (isset($club['earn_per'])) {
            update_option('alena_club_earn_per', max(1, (float) $club['earn_per']));
        }

        // --- Feature switches (only known slugs) ---
        if (isset($b['features']) && is_array($b['features']) && class_exists('Alena_DZ_Features')) {
            $saved = get_option(Alena_DZ_Features::OPT, []);
            if (!is_array($saved)) $saved = [];
            foreach (array_keys(Alena_DZ_Features::all()) as $slug) {
                if (array_key_exists($slug, $b['features'])) {
                    $saved[$slug] = !empty($b['features'][$slug]) ? 1 : 0;
                }
            }
            update_option(Alena_DZ_Features::OPT, $saved);
        }

        // --- Delivery zones: update fee/min/name by id, PRESERVE the coords ---
        if (isset($b['zones']) && is_array($b['zones'])) {
            $poly = self::jopt('alena_delivery_polygons', []);
            if ($poly) {
                $byId = [];
                foreach ($b['zones'] as $z) if (!empty($z['id'])) $byId[(string) $z['id']] = $z;
                foreach ($poly as &$z) {
                    $id = (string) ($z['id'] ?? '');
                    if (!isset($byId[$id])) continue;
                    if (isset($byId[$id]['delivery_fee'])) $z['delivery_fee'] = max(0, (float) $byId[$id]['delivery_fee']);
                    if (isset($byId[$id]['min_order']))    $z['min_order']    = max(0, (float) $byId[$id]['min_order']);
                    if (isset($byId[$id]['name']))         $z['name']         = sanitize_text_field((string) $byId[$id]['name']);
                    if (isset($byId[$id]['eta_max']))      $z['eta_max']      = max(0, (int) $byId[$id]['eta_max']);
                    if (array_key_exists('enabled', $byId[$id])) $z['disabled'] = empty($byId[$id]['enabled']) ? 1 : 0;
                }
                unset($z);
                update_option('alena_delivery_polygons', wp_json_encode($poly, JSON_UNESCAPED_UNICODE));
                // WooCommerce caches calculated shipping rates per cart session;
                // without bumping the shipping transient version an edited fee/min
                // would not show until the cart or address changed. This makes zone
                // edits take effect on the very next page load.
                if (class_exists('WC_Cache_Helper')) {
                    WC_Cache_Helper::get_transient_version('shipping', true);
                }
            }
        }

        // --- Brand images (Media Library URLs) ---
        if (isset($b['brand_images']) && is_array($b['brand_images'])) {
            foreach (['alena', 'zohara'] as $brand) {
                if (array_key_exists($brand, $b['brand_images'])) {
                    update_option('alena_brand_img_' . $brand, esc_url_raw((string) $b['brand_images'][$brand]));
                }
            }
        }

        // --- Cart ETA + fixed tax rate ---
        if (isset($b['cart_eta']) && is_array($b['cart_eta'])) update_option('alena_cart_eta', $b['cart_eta']);
        if (array_key_exists('tax_fixed', $b))                 update_option('alena_dz_tax_fixed', $b['tax_fixed']);

        // --- Advanced JSON blocks: hours / specials / note chips ---
        if (isset($b['hours']) && is_array($b['hours']))          update_option('alena_hours_config', wp_json_encode($b['hours'], JSON_UNESCAPED_UNICODE));
        if (isset($b['specials']) && is_array($b['specials']))    update_option('alena_item_schedule', $b['specials']);
        if (isset($b['note_chips']) && is_array($b['note_chips'])) update_option('alena_dz_note_chips', $b['note_chips']);

        // --- Live operational controls ---
        if (isset($b['store_status']) && is_array($b['store_status'])) {
            $ss   = $b['store_status'];
            $mode = in_array(($ss['mode'] ?? 'open'), ['open', 'closed', 'delivery_only', 'pickup_only'], true) ? $ss['mode'] : 'open';
            update_option(Alena_DZ_Store_Controls::OPT_STATUS, [
                'mode'           => $mode,
                'busy_extra_min' => max(0, min(240, (int) ($ss['busy_extra_min'] ?? 0))),
                'message'        => sanitize_text_field((string) ($ss['message'] ?? '')),
            ]);
        }
        if (isset($b['announcement']) && is_array($b['announcement'])) {
            update_option(Alena_DZ_Store_Controls::OPT_ANNOUNCE, [
                'enabled' => !empty($b['announcement']['enabled']) ? 1 : 0,
                'text'    => wp_kses((string) ($b['announcement']['text'] ?? ''), ['a' => ['href' => [], 'target' => []], 'strong' => [], 'b' => []]),
            ]);
        }
        if (array_key_exists('free_delivery_over', $b)) {
            update_option(Alena_DZ_Store_Controls::OPT_FREE, max(0, (float) $b['free_delivery_over']));
        }
        if (isset($b['date_overrides']) && is_array($b['date_overrides'])) {
            // Sanitise: only valid Y-m-d keys, and {mode:closed} or per-service ranges.
            $clean = [];
            foreach ($b['date_overrides'] as $date => $entry) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date) || !is_array($entry)) continue;
                if (($entry['mode'] ?? '') === 'closed') { $clean[$date] = ['mode' => 'closed']; continue; }
                $row = [];
                foreach (['delivery', 'pickup'] as $svc) {
                    if (isset($entry[$svc]) && is_array($entry[$svc])) $row[$svc] = $entry[$svc];
                }
                if ($row) $clean[$date] = $row;
            }
            update_option(Alena_DZ_Store_Controls::OPT_DATES, $clean);
        }

        // --- Business info ---
        if (isset($b['business']) && is_array($b['business']) && class_exists('Alena_DZ_Store_Controls')) {
            $bi = $b['business'];
            if (isset($bi['phone']))   update_option(Alena_DZ_Store_Controls::OPT_PHONE,   sanitize_text_field((string) $bi['phone']));
            if (isset($bi['address'])) update_option(Alena_DZ_Store_Controls::OPT_ADDRESS, sanitize_text_field((string) $bi['address']));
            if (isset($bi['city']))    update_option(Alena_DZ_Store_Controls::OPT_CITY,    sanitize_text_field((string) $bi['city']));
            if (isset($bi['rating']))  update_option(Alena_DZ_Store_Controls::OPT_RATING,  sanitize_text_field((string) $bi['rating']));
            if (isset($bi['tip_presets'])) update_option(Alena_DZ_Store_Controls::OPT_TIPS, sanitize_text_field((string) $bi['tip_presets']));
        }

        // --- Auth / OTP ---
        if (isset($b['auth']) && is_array($b['auth'])) {
            $a = $b['auth'];
            if (isset($a['provider']) && in_array($a['provider'], ['console', 'topalena', 'whatsapp_cloud', 'twilio_sms'], true)) {
                update_option('alena_otp_provider', $a['provider']);
            }
            if (array_key_exists('test_mode', $a)) update_option('alena_otp_test_mode', !empty($a['test_mode']) ? 1 : 0);
            if (isset($a['relay_url'])) update_option('alena_otp_relay_url', esc_url_raw((string) $a['relay_url']));
            if (isset($a['wa_template'])) update_option('alena_otp_wa_template', sanitize_text_field((string) $a['wa_template']));
            if (isset($a['twilio_from'])) update_option('alena_otp_twilio_from', sanitize_text_field((string) $a['twilio_from']));
            // Secrets: only overwrite when a NON-EMPTY value is sent (the app shows
            // them masked and sends blank to mean "leave unchanged").
            foreach ([
                'wa_token'     => 'alena_otp_wa_token',
                'wa_phone_id'  => 'alena_otp_wa_phone_id',
                'twilio_sid'   => 'alena_otp_twilio_sid',
                'twilio_token' => 'alena_otp_twilio_token',
            ] as $field => $opt) {
                if (isset($a[$field]) && trim((string) $a[$field]) !== '') {
                    update_option($opt, sanitize_text_field((string) $a[$field]));
                }
            }
        }

        return $this->no_cache(rest_ensure_response(['ok' => true, 'settings' => $this->snapshot()]));
    }

    private static function jopt(string $key, $default = []) {
        $v = get_option($key, null);
        if ($v === null) return $default;
        if (is_string($v)) { $d = json_decode($v, true); return is_array($d) ? $d : $default; }
        return is_array($v) ? $v : $default;
    }

    /** The current settings, shaped for the app. */
    private function snapshot(): array {
        $club = [
            'member_discount_pct' => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::member_discount_pct() : 0,
            'join_incentive'      => (string) get_option('alena_club_join_incentive', ''),
            'join_incentive_effective' => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '',
            'coin_value'          => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::coin_value_ils() : 4,
            'earn_per'            => class_exists('Alena_DZ_Club') ? Alena_DZ_Club::earn_per_ils() : 100,
        ];

        $features = [];
        if (class_exists('Alena_DZ_Features')) {
            foreach (Alena_DZ_Features::all() as $slug => $meta) {
                $features[$slug] = ['label' => $meta[0], 'desc' => $meta[1], 'enabled' => Alena_DZ_Features::on($slug)];
            }
        }

        // Delivery zones — the frequently-edited fields (fee/min/name); coords
        // (the drawn shape) travel as a count only, edited on the WP map.
        $zones = [];
        foreach (self::jopt('alena_delivery_polygons', []) as $z) {
            if (!is_array($z)) continue;
            $zones[] = [
                'id'           => (string) ($z['id'] ?? ''),
                'name'         => (string) ($z['name'] ?? ''),
                'delivery_fee' => (float) ($z['delivery_fee'] ?? 0),
                'min_order'    => (float) ($z['min_order'] ?? 0),
                'eta_max'      => (int) ($z['eta_max'] ?? 0),
                'enabled'      => empty($z['disabled']),
                'points'       => is_array($z['coords'] ?? null) ? count($z['coords']) : 0,
            ];
        }

        return [
            'site'         => ['name' => 'עלינא בפיתה', 'url' => home_url('/order')],
            'club'         => $club,
            'features'     => $features,
            'zones'        => $zones,
            // Effective config (falls back to the engine's default if unset), so
            // the app edits the real schedule — including the special tokens
            // (motzash+30, per-range category_slug) which the app must round-trip.
            'hours'        => (class_exists('Alena_DZ_Hours_Engine')
                                ? Alena_DZ_Hours_Engine::get()->get_config()
                                : self::jopt('alena_hours_config', [])),
            'brand_hours'  => self::jopt('alena_dz_brand_hours', []),
            'specials'     => self::jopt('alena_item_schedule', []),
            'note_chips'   => self::jopt('alena_dz_note_chips', []),
            'cart_eta'     => self::jopt('alena_cart_eta', []),
            'brand_images' => [
                'alena'  => (string) get_option('alena_brand_img_alena', ''),
                'zohara' => (string) get_option('alena_brand_img_zohara', ''),
            ],
            'tax_fixed'    => get_option('alena_dz_tax_fixed', ''),
            // Live operational controls (open/closed, announcement, free-delivery, holidays).
            'store_status'  => class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::status() : ['mode' => 'open', 'busy_extra_min' => 0, 'message' => ''],
            'announcement'  => class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::announcement() : ['enabled' => false, 'text' => ''],
            'free_delivery_over' => class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::free_delivery_over() : 0,
            'date_overrides' => class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::date_overrides() : [],
            // Business info (phone/address/etc.) surfaced across the storefront.
            'business' => class_exists('Alena_DZ_Store_Controls') ? [
                'phone'         => Alena_DZ_Store_Controls::phone(),
                'address'       => Alena_DZ_Store_Controls::address(),
                'city'          => Alena_DZ_Store_Controls::city(),
                'rating'        => Alena_DZ_Store_Controls::rating(),
                'tip_presets'   => implode(',', Alena_DZ_Store_Controls::tip_presets()),
                'served_cities' => Alena_DZ_Store_Controls::served_cities_text(),
            ] : [],
            // Auth / OTP. Secrets are NOT sent back — only whether each is configured.
            'auth' => [
                'provider'          => (string) get_option('alena_otp_provider', 'console'),
                'test_mode'         => (bool) get_option('alena_otp_test_mode', 0),
                'relay_url'         => (string) get_option('alena_otp_relay_url', 'https://topalena.com/api/delivery/send-otp'),
                'wa_template'       => (string) get_option('alena_otp_wa_template', ''),
                'twilio_from'       => (string) get_option('alena_otp_twilio_from', ''),
                'wa_configured'     => get_option('alena_otp_wa_token', '') !== '' && get_option('alena_otp_wa_phone_id', '') !== '',
                'twilio_configured' => get_option('alena_otp_twilio_sid', '') !== '' && get_option('alena_otp_twilio_token', '') !== '',
            ],
        ];
    }
}
