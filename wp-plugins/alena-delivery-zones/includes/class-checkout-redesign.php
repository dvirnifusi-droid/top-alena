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
    }

    public function section_where() {
        echo '<h2 class="alena-co-h">📍 איפה?</h2>';
    }

    public function enqueue() {
        if (!function_exists('is_checkout') || !is_checkout() || is_wc_endpoint_url('order-received')) return;
        wp_enqueue_style('alena-dz-checkout-redesign', ALENA_DZ_URL . 'assets/checkout-redesign.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-checkout-redesign', ALENA_DZ_URL . 'assets/checkout-redesign.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-dz-checkout-redesign', 'AlenaDZCheckoutR', [
            'business' => ['lat' => self::BUSINESS_LAT, 'lng' => self::BUSINESS_LNG],
            'polygons' => class_exists('Alena_DZ_Polygon_Store') ? Alena_DZ_Polygon_Store::all() : [],
            'ajaxUrl'  => admin_url('admin-ajax.php'),
        ]);
    }

    /* ===========================================================
       Layout
       =========================================================== */

    public function open_layout() {
        echo '<div class="alena-checkout-wrap">';
        echo '<div class="alena-checkout-hero">';
        echo '<div id="alena-checkout-overview-map"></div>';
        echo '<div class="alena-checkout-hero-overlay">';
        echo '<h1>מעבר לתשלום</h1>';
        echo '<p class="alena-checkout-hero-sub">עוד רגע אתה אצלנו 💚</p>';
        echo '</div>';
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
