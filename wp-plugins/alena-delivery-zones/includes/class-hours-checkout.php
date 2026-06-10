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
