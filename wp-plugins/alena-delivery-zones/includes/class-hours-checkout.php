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
        add_filter('gettext',                                     [$this, 'rewrite_no_method_notice'], 20, 3);
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

        // Delivery closed → drop the polygon delivery method.
        if (empty($engine->status('delivery', $now, $cats)['open'])) {
            foreach ($rates as $id => $rate) {
                if (strpos($id, 'alena_polygon:') === 0) unset($rates[$id]);
            }
        }

        // Pickup closed → drop the pickup method too. This was never enforced,
        // so a customer could place a collection order at any hour, even when the
        // kitchen is shut.
        if (empty($engine->status('pickup', $now, $cats)['open'])) {
            foreach ($rates as $id => $rate) {
                $mid = method_exists($rate, 'get_method_id') ? $rate->get_method_id() : '';
                if (strpos($id, 'local_pickup') !== false || strpos($id, 'pickup') !== false
                    || strpos((string) $mid, 'local_pickup') !== false || strpos((string) $mid, 'pickup') !== false) {
                    unset($rates[$id]);
                }
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
    /**
     * WooCommerce's submit-time error for a missing shipping method reads
     * "check your address again" -- which blames the customer for something
     * that is usually the cart total or the zone. Replaced with the actual
     * reason, the same way the empty-shipping box is.
     */
    public function rewrite_no_method_notice($translated, $text, $domain) {
        if ($domain !== 'woocommerce') return $translated;
        if (strpos($text, 'No shipping method has been selected') === false) return $translated;

        if (function_exists('WC') && WC()->session) {
            $under = WC()->session->get('alena_dz_under_min');
            if (is_array($under) && !empty($under['min'])) {
                return 'מינימום הזמנה למשלוח לאזור "' . $under['zone'] . '" הוא ₪'
                     . number_format((float) $under['min'], 0) . '. חסרים עוד ₪'
                     . number_format((float) $under['need'], 0)
                     . ' — אפשר להוסיף עוד משהו לסל, או לעבור לאיסוף עצמי.';
            }
        }
        return 'לא נמצאה שיטת משלוח לכתובת הזו. ייתכן שהיא מחוץ לאזורי החלוקה שלנו, '
             . 'או שהמשלוחים סגורים כרגע. אפשר לבחור איסוף עצמי, או להתקשר אלינו '
             . (class_exists('Alena_DZ_Store_Controls') ? Alena_DZ_Store_Controls::phone() : '03-6228055') . '.';
    }

    /**
     * Light items priced to close a shortfall. Drinks and sides first, cheapest
     * that still clears the gap -- a customer ₪54 short should be offered a way
     * out, not just told the number.
     */
    /** Resolve the owner's real category names to slugs -- guessing slugs got
     *  it wrong once already ("שתייה" instead of "משקאות"), so match by name. */
    private function topup_category_slugs(): array {
        // Substring, not equality: the live names are "שתייה קלה" and "סלט",
        // so an exact list would have matched only "תוספות" -- which is how
        // this shipped empty the first time.
        // ONLY add-ons. Pulling in 'סלט' dragged main-course salads
        // (סלט שוק פרגית ₪68) into a list meant for light extras.
        // 'שתייה' as a substring catches the live name "שתייה קלה".
        $wanted = ['תוספות', 'שתייה', 'קינוח', 'ביניים'];
        $slugs  = [];
        $terms  = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => true]);
        if (is_wp_error($terms) || !$terms) return [];
        foreach ($terms as $t) {
            $name = trim($t->name);
            foreach ($wanted as $w) {
                if (mb_strpos($name, $w) !== false) { $slugs[] = $t->slug; break; }
            }
        }
        return $slugs;
    }

    /** Light items, cheapest first, from the owner's add-on categories. */
    private function topup_pool(): array {
        if (!function_exists('wc_get_products')) return [];
        $slugs = $this->topup_category_slugs();
        if (!$slugs) return [];
        $pool = [];
        foreach (wc_get_products([
            'status' => 'publish', 'limit' => 60, 'orderby' => 'price', 'order' => 'ASC',
            'category' => $slugs,
        ]) as $p) {
            $price = (float) $p->get_price();
            if ($price <= 0 || !$p->is_purchasable() || !$p->is_in_stock()) continue;
            $pool[$p->get_id()] = ['id' => $p->get_id(), 'name' => $p->get_name(), 'price' => $price];
        }
        return array_values($pool);
    }

    /**
     * Deals that actually close the gap. A single item when one does it; other-
     * wise the cheapest PAIR that clears it, because telling someone ₪54 short
     * to add a ₪12 drink just moves the wall.
     */
    private function topup_suggestions(float $need, int $limit = 4): array {
        $pool = $this->topup_pool();
        if (!$pool) return [];
        usort($pool, function ($a, $b) { return $a['price'] <=> $b['price']; });

        $out = [];
        foreach ($pool as $it) {
            if ($it['price'] >= $need) {
                $out[] = ['ids' => [$it['id']], 'label' => $it['name'], 'price' => $it['price'], 'closes' => true];
                if (count($out) >= 2) break;
            }
        }
        // Cheapest pair over the line -- pool is ascending, so the first hit wins.
        $bestPair = null;
        for ($i = 0; $i < count($pool) && !$bestPair; $i++) {
            for ($j = $i + 1; $j < count($pool); $j++) {
                $sum = $pool[$i]['price'] + $pool[$j]['price'];
                if ($sum >= $need) {
                    $bestPair = ['ids' => [$pool[$i]['id'], $pool[$j]['id']],
                                 'label' => $pool[$i]['name'] . ' + ' . $pool[$j]['name'],
                                 'price' => $sum, 'closes' => true];
                    break;
                }
            }
        }
        if ($bestPair) $out[] = $bestPair;

        foreach ($pool as $it) {
            if (count($out) >= $limit) break;
            $out[] = ['ids' => [$it['id']], 'label' => $it['name'], 'price' => $it['price'], 'closes' => false];
        }
        return array_slice($out, 0, $limit);
    }

    private function topup_html(float $need): string {
        $items = $this->topup_suggestions($need);
        $cart  = function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/';
        $out   = '<div class="alena-topup">';
        if ($items) {
            $out .= '<div class="alena-topup-title">להשלמה מהירה:</div><div class="alena-topup-list">';
            foreach ($items as $it) {
                $closes = !empty($it['closes']) ? ' data-closes="1"' : '';
                // Every product in the deal gets its photo -- a combo showing one
                // dish hides half of what is being offered.
                $thumb = '';
                if (function_exists('wc_get_product')) {
                    foreach ($it['ids'] as $pid) {
                        $prod = wc_get_product($pid);
                        if ($prod) $thumb .= $prod->get_image('woocommerce_gallery_thumbnail', ['class' => 'alena-topup-img']);
                    }
                }
                $out .= '<a class="alena-topup-item" href="#"'
                      . ' data-ids="' . esc_attr(implode(',', $it['ids'])) . '"' . $closes . '>'
                      . $thumb
                      . '<span class="alena-topup-name">' . esc_html($it['label']) . '</span>'
                      . '<span class="alena-topup-price">₪' . number_format($it['price'], 0) . '</span>'
                      . '</a>';
            }
            $out .= '</div>';
        }
        $out .= '<a class="alena-topup-cart" href="' . esc_url($cart) . '">← חזרה לסל</a>';
        return $out . '</div>';
    }

    public function no_shipping_message($html) {
        // Under the zone minimum is a different situation from closed, and it
        // is the customer's to fix -- so it is said first, with the number.
        if (function_exists('WC') && WC()->session) {
            $under = WC()->session->get('alena_dz_under_min');
            if (is_array($under) && !empty($under['min'])) {
                $need = (float) $under['need'];
                return '<span class="alena-dz-under-min">🛒 <strong>מינימום הזמנה למשלוח לאזור "'
                     . esc_html($under['zone']) . '" הוא ₪' . number_format((float) $under['min'], 0)
                     . '</strong><br>חסרים עוד <strong>₪' . number_format($need, 0)
                     . '</strong> כדי שנוכל לשלוח אליך, או לבחור <strong>איסוף עצמי</strong> ללא מינימום.'
                     . $this->topup_html($need) . '</span>';
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
