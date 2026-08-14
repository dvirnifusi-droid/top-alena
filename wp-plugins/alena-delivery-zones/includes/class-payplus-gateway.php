<?php
if (!defined('ABSPATH')) exit;

/**
 * WC Payment Gateway — PayPlus.
 * Settings show under WC → Settings → Payments → PayPlus.
 */
class Alena_DZ_PayPlus_Gateway extends WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'alena_payplus';
        $this->icon               = '';
        $this->has_fields         = false;
        $this->method_title       = 'PayPlus (כרטיס אשראי · Bit · Apple Pay)';
        $this->method_description = 'סליקת אשראי דרך PayPlus. משתמש באותו terminal של TOPALENA.';
        $this->supports           = ['products', 'refunds'];

        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option('title', 'כרטיס אשראי');
        $this->description = $this->get_option('description', 'תשלום מאובטח דרך PayPlus — אשראי, Bit, Apple Pay');
        $this->enabled     = $this->get_option('enabled', 'no');

        add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
        add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'sync_options_to_plugin']);
    }

    /**
     * Mirror the gateway's API keys into the plugin-level options so the IPN
     * handler in class-payplus.php can read them without instantiating the gateway.
     */
    public function sync_options_to_plugin() {
        update_option(Alena_DZ_PayPlus::OPT_BASE . 'api_key',    $this->get_option('api_key', ''));
        update_option(Alena_DZ_PayPlus::OPT_BASE . 'secret_key', $this->get_option('secret_key', ''));
        update_option(Alena_DZ_PayPlus::OPT_BASE . 'api_base',
            $this->get_option('mode') === 'sandbox'
                ? 'https://restapidev.payplus.co.il/api/v1.0'
                : 'https://restapi.payplus.co.il/api/v1.0'
        );
    }

    public function init_form_fields() {
        $this->form_fields = [
            'enabled' => [
                'title'   => 'פעיל',
                'type'    => 'checkbox',
                'label'   => 'אפשר תשלום ב-PayPlus בקופה',
                'default' => 'no',
            ],
            'title' => [
                'title'       => 'כותרת בקופה',
                'type'        => 'text',
                'description' => 'מה הלקוח רואה בקופה.',
                'default'     => 'כרטיס אשראי · Bit · Apple Pay',
            ],
            'description' => [
                'title'   => 'תיאור בקופה',
                'type'    => 'textarea',
                'default' => 'תשלום מאובטח בכרטיס אשראי, Bit, Apple Pay או Google Pay',
            ],
            'mode' => [
                'title'   => 'מצב',
                'type'    => 'select',
                'options' => [
                    'live'    => 'ייצור (Live)',
                    'sandbox' => 'בדיקות (Sandbox)',
                ],
                'default' => 'live',
            ],
            'api_key' => [
                'title'       => 'API Key',
                'type'        => 'text',
                'description' => 'מ-PayPlus dashboard → ניהול מסופים → התממשקות API.',
                'default'     => '',
            ],
            'secret_key' => [
                'title'       => 'Secret Key',
                'type'        => 'password',
                'description' => 'נשמר מוצפן ולעולם לא מוצג בעמוד הלקוח.',
                'default'     => '',
            ],
            'terminal_label' => [
                'title'       => 'תווית terminal',
                'type'        => 'text',
                'description' => 'תופיע ב-reference של עסקאות PayPlus כדי לזהות הזמנות מ-alenabepita.',
                'default'     => 'alenabepita.co.il',
            ],
            'show_payment_logos' => [
                'title'   => 'הצג לוגואים בקופה',
                'type'    => 'checkbox',
                'label'   => 'הצג סמלי Visa/Mastercard/Bit/Apple Pay ליד שם השיטה',
                'default' => 'yes',
            ],
        ];
    }

    /**
     * Trigger payment — create a PayPlus payment page and redirect the customer there.
     */
    public function process_payment($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return ['result' => 'failure'];

        $api_key    = $this->get_option('api_key');
        $secret_key = $this->get_option('secret_key');
        $api_base   = $this->get_option('mode') === 'sandbox'
            ? 'https://restapidev.payplus.co.il/api/v1.0'
            : 'https://restapi.payplus.co.il/api/v1.0';

        if (!$api_key || !$secret_key) {
            wc_add_notice('PayPlus לא הוגדר במלואו. אנא פנו למסעדה.', 'error');
            return ['result' => 'failure'];
        }

        // Build the request — PayPlus PaymentPages/generateLink format
        $items = [];
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items[] = [
                'name'     => $item->get_name(),
                'quantity' => (int) $item->get_quantity(),
                'price'    => (float) $order->get_item_total($item, false, false),
                'sku'      => $product ? (string) $product->get_sku() : '',
            ];
        }

        $payload = [
            'payment_page_uid'    => '',
            'amount'              => (float) $order->get_total(),
            'currency_code'       => $order->get_currency(),
            'sendEmailApproval'   => true,
            'sendEmailFailure'    => false,
            'language'            => 'he',
            'more_info'           => (string) $order->get_id(),
            'more_info_1'         => $this->get_option('terminal_label', 'alenabepita.co.il'),
            'customer'            => [
                'customer_name' => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
                'email'         => $order->get_billing_email(),
                'phone'         => $order->get_billing_phone(),
            ],
            'items'               => $items,
            'refURL_success'      => rest_url('alena/v1/payplus/return') . '?order_id=' . $order->get_id(),
            'refURL_failure'      => rest_url('alena/v1/payplus/return') . '?order_id=' . $order->get_id() . '&status_code=failed',
            'refURL_callback'     => rest_url('alena/v1/payplus/ipn'),
            'charge_method'       => 1, // 1 = charge, 2 = J5 (auth only)
            'create_token'        => false,
            'expiry_datetime'     => null,
        ];

        $resp = wp_remote_post($api_base . '/PaymentPages/generateLink', [
            'timeout' => 20,
            'headers' => [
                'api-key'      => $api_key,
                'secret-key'   => $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body'    => wp_json_encode($payload),
        ]);

        if (is_wp_error($resp)) {
            $order->add_order_note('PayPlus: חיבור נכשל — ' . $resp->get_error_message());
            wc_add_notice('שגיאת חיבור לסליקה. נסו שוב.', 'error');
            return ['result' => 'failure'];
        }

        $code = wp_remote_retrieve_response_code($resp);
        $body = json_decode(wp_remote_retrieve_body($resp), true);
        if ($code < 200 || $code >= 300 || empty($body['data']['payment_page_link'])) {
            $msg = $body['results']['description'] ?? ('HTTP ' . $code);
            $order->add_order_note('PayPlus: יצירת דף תשלום נכשלה — ' . $msg);
            wc_add_notice('יצירת דף תשלום נכשלה: ' . esc_html($msg), 'error');
            return ['result' => 'failure'];
        }

        $payment_url = (string) $body['data']['payment_page_link'];
        $order->update_meta_data('_payplus_page_uid', (string) ($body['data']['page_request_uid'] ?? ''));
        $order->update_status('pending', 'PayPlus: ממתין לתשלום בדף הסליקה');
        $order->save();

        return [
            'result'   => 'success',
            'redirect' => $payment_url,
        ];
    }

    public function process_refund($order_id, $amount = null, $reason = '') {
        // PayPlus refund endpoint — POST /Transactions/RefundTransaction
        $order = wc_get_order($order_id);
        if (!$order) return new WP_Error('no_order', 'order not found');
        $tx = $order->get_meta('_payplus_transaction');
        if (!$tx) return new WP_Error('no_tx', 'no PayPlus transaction on order');

        $api_key    = $this->get_option('api_key');
        $secret_key = $this->get_option('secret_key');
        $api_base   = $this->get_option('mode') === 'sandbox'
            ? 'https://restapidev.payplus.co.il/api/v1.0'
            : 'https://restapi.payplus.co.il/api/v1.0';

        $resp = wp_remote_post($api_base . '/Transactions/RefundTransaction', [
            'timeout' => 20,
            'headers' => [
                'api-key' => $api_key, 'secret-key' => $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'related_transaction' => $tx,
                'amount'              => (float) $amount,
                'more_info'           => 'WC refund: ' . $reason,
            ]),
        ]);
        if (is_wp_error($resp)) return $resp;
        $body = json_decode(wp_remote_retrieve_body($resp), true);
        if (empty($body['results']['status']) || $body['results']['status'] !== 'success') {
            return new WP_Error('refund_failed', $body['results']['description'] ?? 'unknown');
        }
        $order->add_order_note(sprintf('💸 PayPlus refund of ₪%s: %s', number_format((float) $amount, 2), $reason));
        return true;
    }
}
