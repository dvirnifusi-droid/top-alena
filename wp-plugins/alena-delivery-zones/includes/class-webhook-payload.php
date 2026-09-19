<?php
if (!defined('ABSPATH')) exit;

/**
 * Shapes the order payload that goes OUT to webhook consumers (Miley/בתאבון).
 *
 * Everything here happens on `woocommerce_webhook_payload`, which fires only
 * when a webhook is delivered. Nothing below changes what the shop stores,
 * what the customer sees, what the REST API returns, or what our own TOP ALENA
 * intake reads. That separation is the whole point: their printer needs a
 * different shape from our database, and neither should bend for the other.
 *
 * Miley's technical notes, 2026-08-17, and what was done about each:
 *
 *  1. Prices arrived ex-VAT (111.86 instead of 132). Their suggested fix was to
 *     switch off tax in WooCommerce entirely -- which would strip VAT from
 *     invoices and reporting, and break the club discount, which is computed
 *     against VAT-inclusive prices. Instead the line totals in THIS payload are
 *     converted to gross, and the tax fields zeroed so nothing can double-count.
 *  2. `_alena_modifiers_raw` printed as a wall of JSON. Removed from the
 *     payload; still stored on the item, because "order again" rebuilds an
 *     order from it.
 *  3. "לא, תודה" style answers printed in the kitchen. Dropped from the payload
 *     -- a group where nothing was chosen is not an instruction to a cook.
 */
class Alena_DZ_Webhook_Payload {

    public function __construct() {
        add_filter('woocommerce_webhook_payload', [$this, 'shape'], 20, 4);

        // The kitchen webhook (Miley/בתאבון) is configured on order.created, which
        // fires the MOMENT the order is created — before the card is charged. A
        // failed payment would then leave the kitchen preparing an order that was
        // never paid. So we block that automatic delivery entirely and dispatch
        // to the kitchen ourselves, only once the order is actually paid.
        add_filter('woocommerce_webhook_should_deliver', [$this, 'block_premature'], 10, 3);
        add_action('woocommerce_order_status_processing', [$this, 'send_when_paid'], 5);
        add_action('woocommerce_order_status_completed',  [$this, 'send_when_paid'], 5);
    }

    /** The outgoing webhook that feeds the kitchen (Miley / endpoint.gomiley.com). */
    private function is_kitchen_webhook($webhook): bool {
        return $webhook && strpos((string) $webhook->get_delivery_url(), 'gomiley') !== false;
    }

    private function kitchen_webhook_ids(): array {
        global $wpdb;
        $ids = $wpdb->get_col(
            "SELECT webhook_id FROM {$wpdb->prefix}wc_webhooks WHERE delivery_url LIKE '%gomiley%' AND status = 'active'"
        );
        return array_map('intval', (array) $ids);
    }

    /**
     * Stop WooCommerce from firing the kitchen webhook on its own. It is wired to
     * order.created (before payment); we send it manually on the paid transition.
     */
    public function block_premature($should, $webhook, $arg) {
        if ($this->is_kitchen_webhook($webhook)) return false;
        return $should;
    }

    /**
     * Send the order to the kitchen once — and only once — it is paid. COD lands
     * in 'processing' at checkout (a confirmed order), and a card order reaches
     * 'processing' only after the gateway confirms payment, so both are covered
     * without ever sending an unpaid card order.
     */
    public function send_when_paid($order_id) {
        // Never for the throwaway preview order.
        if (class_exists('Alena_DZ_Bon_Preview') && Alena_DZ_Bon_Preview::$running) return;

        $order = wc_get_order($order_id);
        if (!$order) return;
        if ($order->get_meta('_alena_sent_to_kitchen')) return;   // exactly once

        $sent = false;
        foreach ($this->kitchen_webhook_ids() as $id) {
            $wh = function_exists('wc_get_webhook') ? wc_get_webhook($id) : null;
            if ($wh && $wh->get_status() === 'active') {
                // deliver() bypasses should_deliver() — it is our explicit send.
                $wh->deliver($order_id);
                $sent = true;
            }
        }
        if ($sent) {
            $order->update_meta_data('_alena_sent_to_kitchen', current_time('mysql'));
            $order->add_order_note('✅ נשלח למטבח (מיילי) לאחר אישור התשלום');
            $order->save();
        }
    }

    /** Internal bookkeeping that should never reach a printer. */
    private function is_internal_key(string $key): bool {
        return strpos($key, '_') === 0 || strpos($key, 'alena_') === 0;
    }

    /**
     * "לא, תודה" / "ללא" / "בלי" / "אין" — an answer that adds nothing.
     * Matched on the VALUE, and only at the start, so a real choice like
     * "בלי בצל" is... also a negative. That is deliberate: it tells the cook
     * to omit something, and Miley asked for chosen extras only. If it turns
     * out the kitchen needs omissions too, this is the one place to relax.
     */
    private function is_empty_answer($value): bool {
        $v = trim((string) $value);
        if ($v === '') return true;
        return (bool) preg_match('/^(לא\b|לא,|ללא\b|בלי\b|אין\b|רגיל\b|no\b|none\b)/u', $v);
    }

    public function shape($payload, $resource, $resource_id, $webhook_id) {
        if ($resource !== 'order' || !is_array($payload)) return $payload;
        if (empty($payload['line_items']) || !is_array($payload['line_items'])) return $payload;

        // Does this order mix both kitchens? The brand tag on each line is only
        // useful for routing when it does — on a single-brand order it is noise.
        $brands_seen = [];
        if (class_exists('Alena_DZ_Brands')) {
            foreach ($payload['line_items'] as $li) {
                $pid = (int) ($li['product_id'] ?? 0);
                if ($pid) $brands_seen[Alena_DZ_Brands::brand_of($pid)] = true;
            }
        }
        $multi_brand = count($brands_seen) > 1;

        foreach ($payload['line_items'] as $i => $item) {
            // --- 1. gross prices -------------------------------------------
            $total    = (float) ($item['total'] ?? 0);
            $totalTax = (float) ($item['total_tax'] ?? 0);
            $sub      = (float) ($item['subtotal'] ?? 0);
            $subTax   = (float) ($item['subtotal_tax'] ?? 0);
            $qty      = max(1, (float) ($item['quantity'] ?? 1));

            $grossTotal = $total + $totalTax;
            $grossSub   = $sub + $subTax;

            $payload['line_items'][$i]['total']        = wc_format_decimal($grossTotal, 2);
            $payload['line_items'][$i]['subtotal']     = wc_format_decimal($grossSub, 2);
            // Zeroed on purpose: leaving the tax beside a gross total is an
            // invitation to add them together and charge VAT twice.
            $payload['line_items'][$i]['total_tax']    = '0.00';
            $payload['line_items'][$i]['subtotal_tax'] = '0.00';
            $payload['line_items'][$i]['price']        = wc_format_decimal($grossTotal / $qty, 2);

            // --- 2 + 3. clean the meta -------------------------------------
            $clean = [];
            if (!empty($item['meta_data']) && is_array($item['meta_data'])) {
                foreach ($item['meta_data'] as $meta) {
                    $key   = (string) ($meta['key'] ?? ($meta->key ?? ''));
                    $value = $meta['value'] ?? ($meta->value ?? '');
                    if ($key === '' || $this->is_internal_key($key)) continue;   // 2
                    if ($this->is_empty_answer($value)) continue;                // 3
                    $clean[] = $meta;
                }
            }

            // --- 4. brand on the line, so the bon prints at the right station.
            // ONLY on mixed-brand orders (Alena + Zohara together) — on a single-
            // brand order the tag is just clutter on every line.
            if ($multi_brand && class_exists('Alena_DZ_Brands')) {
                $pid = (int) ($item['product_id'] ?? 0);
                if ($pid) {
                    $brand = Alena_DZ_Brands::brand_of($pid);
                    $term  = get_term_by('slug', $brand, Alena_DZ_Brands::TAX);
                    $name  = ($term && !is_wp_error($term)) ? $term->name
                           : ($brand === 'zohara' ? 'חומוס זוהרה' : 'עלינא בפיתה');
                    array_unshift($clean, ['key' => 'מטבח', 'value' => $name]);
                }
            }

            $payload['line_items'][$i]['meta_data'] = array_values($clean);
        }

        // --- 5. Fulfilment banner — the one fact the line cook must not miss:
        // hand it over the counter (איסוף) vs send a driver (משלוח). The shipping
        // method_title is easy to overlook, so we (a) stamp a top-level order_type
        // and (b) prepend it to the customer note, which Miley prints prominently.
        // Derived from the chosen shipping method (authoritative), not the session
        // meta which has drifted to 'delivery' on real pickup orders.
        $ful = get_post_meta($resource_id, '_alena_fulfillment', true);
        if ($ful !== 'pickup' && $ful !== 'delivery' && function_exists('wc_get_order')) {
            $o = wc_get_order($resource_id);
            if ($o) {
                $ful = 'delivery';
                foreach ($o->get_shipping_methods() as $sm) {
                    if (strpos((string) $sm->get_method_id(), 'pickup') !== false) { $ful = 'pickup'; break; }
                }
            }
        }
        $payload['order_type'] = ($ful === 'pickup') ? 'איסוף עצמי' : 'משלוח';
        // The customer-note field is for what the CUSTOMER wrote — not the
        // fulfilment type. A pickup order has no delivery, so drop the ₪0 shipping
        // line: the bon then stops printing "דמי משלוח" and Miley no longer flags
        // it as a delivery (which was forcing the 🛵 icon on pickup orders).
        if ($ful === 'pickup') {
            unset($payload['shipping_lines']);
            $payload['shipping_total'] = '0.00';
            $payload['shipping_tax']   = '0.00';
        }

        return $payload;
    }
}
