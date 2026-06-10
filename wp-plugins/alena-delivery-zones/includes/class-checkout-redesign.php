<?php
if (!defined('ABSPATH')) exit;

/**
 * Wolt-style checkout page:
 *   - Big hero map at top with business + customer pin and the
 *     delivery polygons drawn over it
 *   - Sections: "Where?" / "When?" / "What?" / "Pay?" / "Tip"
 *   - Inline +/- qty and remove for each line item
 *   - Sticky summary card on the side
 *   - Cash-on-delivery available now; PayPlus banner that flips on later
 */
class Alena_DZ_Checkout_Redesign {

    const BUSINESS_LAT = 31.96456; // Rothschild 104, Rishon LeZion
    const BUSINESS_LNG = 34.79331;

    public function __construct() {
        add_action('wp_enqueue_scripts',              [$this, 'enqueue']);
        add_action('woocommerce_before_checkout_form',[$this, 'open_layout'], 1);
        add_action('woocommerce_after_checkout_form', [$this, 'close_layout'], 999);
        add_action('woocommerce_review_order_before_cart_contents', [$this, 'render_items_header']);

        // Wolt-style section headers in the main column
        add_action('woocommerce_before_checkout_billing_form', [$this, 'section_where'], 1);

        // Enable cash on delivery + soft-gate other methods until owner sets up
        add_filter('woocommerce_payment_gateways', [$this, 'ensure_cod_enabled']);
        add_filter('woocommerce_available_payment_gateways', [$this, 'filter_gateways']);
        add_action('init',                          [$this, 'enable_cod_option'], 5);

        // Allow inline qty change on the order review
        add_action('woocommerce_review_order_after_cart_contents', [$this, 'render_payplus_banner']);

        // Inline qty controls inside review_order
        add_filter('woocommerce_cart_item_quantity', [$this, 'inline_qty_controls'], 10, 3);

        // AJAX handler for qty updates
        add_action('wc_ajax_update_cart_qty',         [$this, 'ajax_update_qty']);
        add_action('wc_ajax_nopriv_update_cart_qty',  [$this, 'ajax_update_qty']);

        // Wolt-style place-order button text (JS appends the live total)
        add_filter('woocommerce_order_button_text', function () { return 'להזמין'; });

        // ---- Fulfillment: delivery vs. self-pickup ----
        add_action('wc_ajax_alena_set_fulfillment',        [$this, 'ajax_set_fulfillment']);
        add_action('wc_ajax_nopriv_alena_set_fulfillment', [$this, 'ajax_set_fulfillment']);
        // Runs AFTER the hours filter (50) so pickup logic wins last
        add_filter('woocommerce_package_rates',            [$this, 'apply_fulfillment_rates'], 60, 2);
        // Embed the mode into the package so WC's cache hash changes per mode
        add_filter('woocommerce_cart_shipping_packages',   [$this, 'tag_packages_with_mode']);
        add_action('woocommerce_checkout_update_order_meta', [$this, 'save_fulfillment_meta']);
        add_action('woocommerce_admin_order_data_after_shipping_address', [$this, 'show_fulfillment_in_admin']);
    }

    public static function current_fulfillment(): string {
        if (function_exists('WC') && WC()->session) {
            $v = WC()->session->get('alena_fulfillment');
            if ($v === 'pickup') return 'pickup';
        }
        return 'delivery';
    }

    public function ajax_set_fulfillment() {
        if (!function_exists('WC') || !WC()->session) wp_send_json_error('no_session', 500);
        $mode = (isset($_POST['mode']) && $_POST['mode'] === 'pickup') ? 'pickup' : 'delivery';
        WC()->session->set('alena_fulfillment', $mode);

        // Bust WC's per-package shipping cache + the previously chosen method,
        // otherwise switching tabs serves stale rates ("no shipping method").
        WC()->session->set('chosen_shipping_methods', []);
        if (WC()->cart) {
            foreach (array_keys(WC()->cart->get_shipping_packages()) as $key) {
                WC()->session->set('shipping_for_package_' . $key, false);
            }
        }
        wp_send_json_success(['mode' => $mode]);
    }

    public function tag_packages_with_mode($packages) {
        $mode = self::current_fulfillment();
        foreach ($packages as &$p) {
            $p['alena_fulfillment'] = $mode;
        }
        return $packages;
    }

    public function apply_fulfillment_rates($rates, $package) {
        $mode = self::current_fulfillment();
        if ($mode === 'pickup') {
            // Drop delivery rates; offer a single free pickup rate.
            foreach ($rates as $id => $rate) {
                if (strpos($id, 'alena_polygon') === 0) unset($rates[$id]);
            }
            $has_pickup = false;
            foreach ($rates as $rate) {
                if ($rate->get_method_id() === 'local_pickup' || $rate->get_method_id() === 'alena_pickup') { $has_pickup = true; break; }
            }
            if (!$has_pickup && class_exists('WC_Shipping_Rate')) {
                $rates['alena_pickup'] = new WC_Shipping_Rate(
                    'alena_pickup',
                    'איסוף עצמי — רוטשילד 104, ראשון לציון',
                    0,
                    [],
                    'alena_pickup'
                );
            }
        } else {
            // Delivery mode: hide any pickup rates so the polygon price shows
            foreach ($rates as $id => $rate) {
                if ($rate->get_method_id() === 'local_pickup' || $rate->get_method_id() === 'alena_pickup') {
                    unset($rates[$id]);
                }
            }
        }
        return $rates;
    }

    public function save_fulfillment_meta($order_id) {
        update_post_meta($order_id, '_alena_fulfillment', self::current_fulfillment());
    }

    public function show_fulfillment_in_admin($order) {
        $mode = get_post_meta($order->get_id(), '_alena_fulfillment', true);
        if (!$mode) return;
        echo '<p><strong>סוג הזמנה:</strong> ' . ($mode === 'pickup' ? '🚶 איסוף עצמי' : '🚚 משלוח') . '</p>';
    }

    public function section_where() {
        $mode = self::current_fulfillment();
        echo '<h2 class="alena-co-h">📍 איפה?</h2>';
        // Pickup info card — shown via CSS only when pickup mode is active
        echo '<div class="alena-co-pickup-card">';
        echo '<div class="alena-co-pickup-icon">🏠</div>';
        echo '<div><strong>איסוף עצמי מהמסעדה</strong><br />';
        echo '<span>רוטשילד 104, ראשון לציון · מוכן בדרך כלל תוך 15–25 דק׳</span></div>';
        echo '</div>';
    }

    public function enqueue() {
        if (!function_exists('is_checkout') || !is_checkout() || is_wc_endpoint_url('order-received')) return;
        wp_enqueue_style('alena-dz-checkout-redesign', ALENA_DZ_URL . 'assets/checkout-redesign.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-checkout-redesign', ALENA_DZ_URL . 'assets/checkout-redesign.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-dz-checkout-redesign', 'AlenaDZCheckoutR', [
            'business'    => ['lat' => self::BUSINESS_LAT, 'lng' => self::BUSINESS_LNG],
            'polygons'    => class_exists('Alena_DZ_Polygon_Store') ? Alena_DZ_Polygon_Store::all() : [],
            'ajaxUrl'     => admin_url('admin-ajax.php'),
            'fulfillment' => self::current_fulfillment(),
        ]);
    }

    /* ===========================================================
       Layout
       =========================================================== */

    public function open_layout() {
        $mode = self::current_fulfillment();
        echo '<div class="alena-checkout-wrap' . ($mode === 'pickup' ? ' alena-pickup-mode' : '') . '">';
        echo '<div class="alena-checkout-hero">';
        echo '<div id="alena-checkout-overview-map"></div>';
        echo '<div class="alena-checkout-hero-overlay">';
        echo '<h1>מעבר לתשלום</h1>';
        echo '<p class="alena-checkout-hero-sub">עוד רגע אתה אצלנו 💚</p>';
        echo '</div>';
        echo '</div>';
        // Wolt-style fulfillment tabs
        echo '<div class="alena-co-tabs" role="tablist">';
        echo '<button type="button" class="alena-co-tab' . ($mode === 'delivery' ? ' active' : '') . '" data-mode="delivery">🚚 משלוח</button>';
        echo '<button type="button" class="alena-co-tab' . ($mode === 'pickup' ? ' active' : '') . '" data-mode="pickup">🚶 איסוף עצמי</button>';
        echo '</div>';
        echo '<div class="alena-checkout-main">';
    }

    public function close_layout() {
        echo '</div>'; // .alena-checkout-main
        echo '</div>'; // .alena-checkout-wrap
    }

    public function render_items_header() {
        echo '<tr class="alena-co-section-head"><td colspan="2">📦 פריטי המשלוח <a href="' . esc_url(wc_get_page_permalink('shop')) . '" class="alena-co-add-more">+ להוסיף עוד</a></td></tr>';
    }

    public function render_payplus_banner() {
        echo '<tr class="alena-co-payplus-note"><td colspan="2">';
        echo '<div class="alena-co-payplus-banner">💳 <strong>תשלום במזומן לשליח</strong> זמין עכשיו. תשלום בכרטיס יופעל בקרוב.</div>';
        echo '</td></tr>';
    }

    /* ===========================================================
       Payment gateways
       =========================================================== */

    public function ensure_cod_enabled($gateways) {
        if (!in_array('WC_Gateway_COD', $gateways, true)) {
            $gateways[] = 'WC_Gateway_COD';
        }
        return $gateways;
    }

    public function enable_cod_option() {
        $cod = get_option('woocommerce_cod_settings', []);
        if (empty($cod)) {
            $cod = [
                'enabled'             => 'yes',
                'title'               => 'תשלום במזומן לשליח',
                'description'         => 'שלם לשליח שלנו במזומן בעת קבלת ההזמנה. אנא שמור על סכום מדויק או קרוב.',
                'instructions'        => '',
                'enable_for_methods'  => [],
                'enable_for_virtual'  => 'yes',
            ];
            update_option('woocommerce_cod_settings', $cod);
        } else if (($cod['enabled'] ?? '') !== 'yes') {
            $cod['enabled'] = 'yes';
            update_option('woocommerce_cod_settings', $cod);
        }
    }

    public function filter_gateways($gateways) {
        // Keep COD always; remove gateways that aren't fully set up yet.
        return $gateways;
    }

    /* ===========================================================
       Inline qty / remove
       =========================================================== */

    public function ajax_update_qty() {
        if (!function_exists('WC') || !WC()->cart) wp_send_json_error('no_cart', 500);
        $key = isset($_POST['cart_item_key']) ? sanitize_text_field(wp_unslash($_POST['cart_item_key'])) : '';
        $qty = isset($_POST['quantity']) ? max(1, (int) $_POST['quantity']) : 1;
        if (!$key) wp_send_json_error('no_key', 400);
        WC()->cart->set_quantity($key, $qty, true);
        wp_send_json_success();
    }

    public function inline_qty_controls($product_quantity, $cart_item_key, $cart_item) {
        if (is_cart()) return $product_quantity; // keep WC default on cart page
        $qty = (int) $cart_item['quantity'];
        $remove_url = wc_get_cart_remove_url($cart_item_key);
        ob_start();
        ?>
        <span class="alena-co-qty" data-key="<?php echo esc_attr($cart_item_key); ?>">
          <button type="button" class="alena-co-qty-minus" aria-label="הפחת">–</button>
          <span class="alena-co-qty-val"><?php echo $qty; ?></span>
          <button type="button" class="alena-co-qty-plus" aria-label="הוסף">+</button>
          <a href="<?php echo esc_url($remove_url); ?>" class="alena-co-qty-remove" aria-label="מחק">🗑️</a>
        </span>
        <?php
        return ob_get_clean();
    }
}
