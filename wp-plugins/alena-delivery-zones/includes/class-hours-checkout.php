<?php
if (!defined('ABSPATH')) exit;

/**
 * Blocks checkout shipping option when delivery is outside hours, and
 * shows a clear message at the top of the checkout. Also exposes the same
 * info via shortcode for the homepage banner.
 */
class Alena_DZ_Hours_Checkout {

    public function __construct() {
        add_action('woocommerce_before_checkout_form',  [$this, 'render_notice'], 5);
        add_filter('woocommerce_package_rates',         [$this, 'maybe_remove_delivery'], 50, 2);
        // WooCommerce blames the customer's address for the missing method.
        // When the real reason is that we are closed, say that instead.
        add_filter('woocommerce_no_shipping_available_html',      [$this, 'no_shipping_message']);
        add_filter('woocommerce_cart_no_shipping_available_html', [$this, 'no_shipping_message']);
        add_shortcode('alena_open_status',              [$this, 'shortcode_open_status']);
    }

    private function cart_category_slugs(): array {
        $slugs = [];
        if (!function_exists('WC') || !WC()->cart) return $slugs;
        foreach (WC()->cart->get_cart() as $item) {
            $product_id = $item['product_id'] ?? 0;
            if (!$product_id) continue;
            $terms = get_the_terms($product_id, 'product_cat');
            if (is_array($terms)) {
                foreach ($terms as $t) $slugs[] = $t->slug;
            }
        }
        return array_values(array_unique($slugs));
    }

    public function render_notice() {
        $engine = Alena_DZ_Hours_Engine::get();
        $now    = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $cats   = $this->cart_category_slugs();
        $delivery = $engine->status('delivery', $now, $cats);
        $pickup   = $engine->status('pickup',   $now, $cats);

        if (!$delivery['open'] && !$pickup['open']) {
            wc_print_notice(
                'המסעדה סגורה כעת. אתה יכול להזמין — ההזמנה תתוזמן לפתיחה הקרובה.',
                'notice'
            );
        } elseif (!$delivery['open'] && $pickup['open']) {
            wc_print_notice(
                'משלוחים סגורים כרגע (' . esc_html($delivery['reason'] ?? '') . '). איסוף עצמי פתוח.',
                'notice'
            );
        }
    }

    public function maybe_remove_delivery($rates, $package) {
        $engine = Alena_DZ_Hours_Engine::get();
        $now    = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $cats   = $this->cart_category_slugs();
        $status = $engine->status('delivery', $now, $cats);
        if ($status['open']) return $rates;

        // Remove the polygon delivery method when delivery is closed
        foreach ($rates as $id => $rate) {
            if (strpos($id, 'alena_polygon:') === 0) {
                unset($rates[$id]);
            }
        }
        return $rates;
    }

    /**
     * The default text — "check the address was entered correctly" — sends a
     * customer hunting for a mistake they did not make, when the only reason
     * delivery vanished is that the kitchen is shut. Only replaced when that is
     * genuinely the cause; a real out-of-zone address still gets the original.
     */
    public function no_shipping_message($html) {
        // Under the zone minimum is a different situation from closed, and it
        // is the customer's to fix -- so it is said first, with the number.
        if (function_exists('WC') && WC()->session) {
            $under = WC()->session->get('alena_dz_under_min');
            if (is_array($under) && !empty($under['min'])) {
                return '<span class="alena-dz-under-min">🛒 <strong>מינימום הזמנה למשלוח לאזור "'
                     . esc_html($under['zone']) . '" הוא ₪' . number_format((float) $under['min'], 0)
                     . '</strong><br>חסרים עוד <strong>₪' . number_format((float) $under['need'], 0)
                     . '</strong> כדי שנוכל לשלוח אליך. אפשר להוסיף עוד משהו לסל, '
                     . 'או לבחור <strong>איסוף עצמי</strong> ללא מינימום.</span>';
            }
        }
        try {
            $engine = Alena_DZ_Hours_Engine::get();
            $now    = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
            $status = $engine->status('delivery', $now, $this->cart_category_slugs());
            if (!empty($status['open'])) return $html;

            $reason = trim((string) ($status['reason'] ?? ''));
            return '<span class="alena-dz-closed-shipping">🕒 <strong>המשלוחים סגורים כרגע'
                 . ($reason ? ' — ' . esc_html($reason) : '')
                 . '</strong><br>אפשר להשלים את ההזמנה עכשיו והיא תצא בפתיחה הקרובה, '
                 . 'או לבחור <strong>איסוף עצמי</strong>. הכתובת שלך תקינה.</span>';
        } catch (\Throwable $e) {
            return $html;
        }
    }

    public function shortcode_open_status($atts = []) {
        $atts = shortcode_atts(['service' => 'delivery'], $atts);
        $svc  = in_array($atts['service'], ['delivery', 'pickup'], true) ? $atts['service'] : 'delivery';
        $now  = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
        $status = Alena_DZ_Hours_Engine::get()->status($svc, $now);
        $label = ($svc === 'delivery') ? 'משלוחים' : 'איסוף עצמי';
        return $status['open']
            ? '<span class="alena-open">' . esc_html($label) . ' פתוחים עכשיו ✓</span>'
            : '<span class="alena-closed">' . esc_html($label) . ' סגורים: ' . esc_html($status['reason'] ?? '') . '</span>';
    }
}
