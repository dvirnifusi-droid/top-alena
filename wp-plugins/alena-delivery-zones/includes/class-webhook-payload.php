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
            // Two kitchens on one order: without this, Miley cannot tell a
            // Zohara hummus from an Alena pita and both land at one printer.
            // Added as a visible meta pair, first, so it reads at the top.
            if (class_exists('Alena_DZ_Brands')) {
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

        return $payload;
    }
}
