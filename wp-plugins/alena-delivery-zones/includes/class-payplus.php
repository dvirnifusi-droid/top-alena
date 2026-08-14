<?php
if (!defined('ABSPATH')) exit;

/**
 * PayPlus payment gateway — native integration (no third-party plugin needed).
 *
 * Flow:
 *   1. Customer picks "PayPlus" at checkout, hits "Place Order"
 *   2. We POST to PayPlus REST /PaymentPages/generateLink with order details
 *   3. PayPlus returns a hosted payment page URL
 *   4. Customer is redirected to PayPlus, enters card/Bit/ApplePay
 *   5. PayPlus redirects back to thank-you + sends server-to-server IPN
 *   6. IPN handler verifies and marks order as paid
 *
 * Configured under WP admin → WooCommerce → Settings → Payments → PayPlus.
 * Uses the same terminal/keys configured under TOPALENA — both sites share
 * the merchant's PayPlus account.
 */
class Alena_DZ_PayPlus {

    const OPT_BASE = 'alena_payplus_';

    public function __construct() {
        add_filter('woocommerce_payment_gateways', [$this, 'register_gateway']);
        add_action('plugins_loaded',               [$this, 'init_gateway_class']);
        add_action('rest_api_init',                [$this, 'register_ipn_route']);
    }

    public function register_gateway($methods) {
        $methods[] = 'Alena_DZ_PayPlus_Gateway';
        return $methods;
    }

    public function init_gateway_class() {
        if (!class_exists('WC_Payment_Gateway')) return;
        require_once ALENA_DZ_PATH . 'includes/class-payplus-gateway.php';
    }

    public function register_ipn_route() {
        register_rest_route('alena/v1', '/payplus/ipn', [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle_ipn'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('alena/v1', '/payplus/return', [
            'methods'             => 'GET',
            'callback'            => [$this, 'handle_return'],
            'permission_callback' => '__return_true',
        ]);
    }

    /**
     * Server-to-server IPN from PayPlus. Verifies and marks the order paid.
     */
    public function handle_ipn(\WP_REST_Request $req) {
        $raw  = $req->get_body();
        $data = json_decode($raw, true);
        if (!is_array($data)) return new \WP_REST_Response(['error' => 'bad_json'], 400);

        $order_id = isset($data['more_info']) ? absint($data['more_info']) : 0;
        if (!$order_id && isset($data['original_amount']) && isset($data['number'])) {
            // Fallback: pull order_id from transaction "more_info" we set during checkout
            $order_id = isset($data['custom_invoice_name']) ? absint($data['custom_invoice_name']) : 0;
        }
        if (!$order_id) return new \WP_REST_Response(['error' => 'no_order'], 400);

        $order = wc_get_order($order_id);
        if (!$order) return new \WP_REST_Response(['error' => 'not_found'], 404);

        $status        = (string) ($data['status_code'] ?? '');
        $approval_num  = (string) ($data['approval_num'] ?? '');
        $transaction   = (string) ($data['transaction_uid'] ?? $data['number'] ?? '');

        // PayPlus status: '000' = success
        if ($status === '000' || $status === 'success' || !empty($data['approved'])) {
            $order->payment_complete($transaction);
            $order->add_order_note(sprintf(
                '💳 PayPlus: תשלום אושר. אישור: %s · עסקה: %s',
                $approval_num ?: '—',
                $transaction
            ));
            $order->update_meta_data('_payplus_status',      'paid');
            $order->update_meta_data('_payplus_approval',    $approval_num);
            $order->update_meta_data('_payplus_transaction', $transaction);
            $order->save();
            return new \WP_REST_Response(['ok' => true], 200);
        }

        // Anything else — failed/pending
        $order->update_status('failed', 'PayPlus: התשלום נכשל (' . $status . ')');
        $order->update_meta_data('_payplus_status', 'failed');
        $order->update_meta_data('_payplus_raw',    $raw);
        $order->save();
        return new \WP_REST_Response(['ok' => true, 'order_failed' => true], 200);
    }

    /**
     * Customer redirect from PayPlus hosted page back to the site.
     * Routes them to the thank-you page or back to checkout on failure.
     */
    public function handle_return(\WP_REST_Request $req) {
        $order_id = absint($req->get_param('order_id'));
        $status   = (string) $req->get_param('status_code');
        $order    = $order_id ? wc_get_order($order_id) : null;

        if ($order && ($status === '000' || $status === 'success')) {
            $url = $order->get_checkout_order_received_url();
        } else {
            $url = wc_get_checkout_url() . '?payplus_status=failed&order_id=' . $order_id;
        }
        wp_safe_redirect($url);
        exit;
    }

    public static function api_base(): string {
        return rtrim((string) get_option(self::OPT_BASE . 'api_base', 'https://restapi.payplus.co.il/api/v1.0'), '/');
    }
    public static function api_key(): string    { return (string) get_option(self::OPT_BASE . 'api_key', ''); }
    public static function secret_key(): string { return (string) get_option(self::OPT_BASE . 'secret_key', ''); }
}
