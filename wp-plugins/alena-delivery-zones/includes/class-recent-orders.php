<?php
if (!defined('ABSPATH')) exit;

/**
 * "Previous orders" carousel + one-click reorder.
 *
 * Shown in two places:
 *   1. Shop page — above the products grid, so customers can reorder fast.
 *   2. My Account dashboard — also at the top.
 *
 * Clicking "הזמן שוב" sends an AJAX request that copies the order's items
 * (including modifiers + per-item notes) into the current cart, then redirects
 * to /cart.
 */
class Alena_DZ_Recent_Orders {

    public function __construct() {
        add_action('wp_ajax_alena_dz_reorder',        [$this, 'ajax_reorder']);
        add_action('wp_ajax_nopriv_alena_dz_reorder', [$this, 'ajax_reorder']);
        add_action('wp_enqueue_scripts',              [$this, 'enqueue']);

        // Inject above the WC My Account dashboard
        add_action('woocommerce_account_dashboard',   [$this, 'render_section'], 5);
    }

    public function enqueue() {
        if (!function_exists('is_woocommerce')) return;
        wp_enqueue_style('alena-dz-recent-orders', ALENA_DZ_URL . 'assets/recent-orders.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-dz-recent-orders', ALENA_DZ_URL . 'assets/recent-orders.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-dz-recent-orders', 'AlenaDZRecent', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'cartUrl' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/',
        ]);
    }

    /**
     * Returns the customer's recent orders. Empty for guests.
     */
    public function get_recent(int $limit = 5): array {
        if (!is_user_logged_in()) return [];
        $orders = wc_get_orders([
            'customer_id' => get_current_user_id(),
            'limit'       => $limit,
            'orderby'     => 'date',
            'order'       => 'DESC',
            'status'      => ['wc-completed', 'wc-processing', 'wc-on-hold'],
        ]);
        return is_array($orders) ? $orders : [];
    }

    public function render_section() {
        if (class_exists('Alena_DZ_Features') && !Alena_DZ_Features::on('recent_orders')) return;
        $orders = $this->get_recent(5);
        if (!$orders) return;
        echo '<div class="alena-recent">';
        echo '<div class="alena-recent-head">';
        echo '<h2 class="alena-recent-title">↻ הזמינו שוב את מה שאהבתם</h2>';
        echo '<span class="alena-recent-sub">לחיצה אחת ומאחורי הקלעים אנחנו מעמיסים הכל לסל</span>';
        echo '</div>';
        echo '<div class="alena-recent-row">';
        foreach ($orders as $o) {
            $this->render_card($o);
        }
        echo '</div></div>';
    }

    /**
     * True when the line's product can still be bought. A menu import can trash
     * a dish, and re-ordering it would add nothing — such lines must not be
     * advertised on the card at all.
     */
    private function is_orderable($item): bool {
        $product_id = (int) $item->get_product_id();
        if (!$product_id) return false;
        $product = wc_get_product($product_id);
        if (!$product) return false;
        // Check the status explicitly. WC_Product::is_purchasable() also passes
        // when the viewer can edit posts, so an admin saw trashed dishes that a
        // customer never would — and any fix looked broken while logged in.
        if ($product->get_status() !== 'publish') return false;
        return $product->is_purchasable() && $product->is_in_stock();
    }

    private function render_card($order): void {
        if (!$order || !is_object($order)) return;
        $id = (int) $order->get_id();
        $total_html = $order->get_formatted_order_total();

        // Only lines that are still on the menu — an order whose dishes were all
        // removed gets no card, instead of a card whose button does nothing.
        $items = array_filter($order->get_items(), [$this, 'is_orderable']);
        if (!$items) return;

        // First item's image as the card thumbnail
        $img_html = '';
        $names = [];
        foreach ($items as $item) {
            $names[] = $item->get_name();
            if (!$img_html) {
                $prod = $item->get_product();
                if ($prod) $img_html = $prod->get_image('woocommerce_thumbnail', ['class' => 'alena-recent-img']);
            }
            if (count($names) >= 2) break;
        }
        $extra = count($items) > 2 ? ' + ' . (count($items) - 2) . ' עוד' : '';
        $name_line = implode(' · ', $names) . $extra;

        $date_obj = $order->get_date_created();
        $when = '';
        if ($date_obj) {
            $when = sprintf('לפני %s', human_time_diff($date_obj->getTimestamp(), current_time('timestamp')));
        }

        $nonce = wp_create_nonce('alena_dz_reorder_' . $id);
        ?>
        <div class="alena-recent-card">
          <div class="alena-recent-card-img"><?php echo $img_html ?: '🍽️'; ?></div>
          <div class="alena-recent-card-body">
            <strong class="alena-recent-card-name"><?php echo esc_html($name_line); ?></strong>
            <span class="alena-recent-card-meta"><?php echo esc_html($when); ?> · <?php echo wp_kses_post($total_html); ?></span>
          </div>
          <button type="button"
                  class="alena-recent-card-cta"
                  data-order-id="<?php echo $id; ?>"
                  data-nonce="<?php echo esc_attr($nonce); ?>">
            הזמן שוב ↻
          </button>
        </div>
        <?php
    }

    public function ajax_reorder() {
        $order_id = isset($_POST['order_id']) ? absint($_POST['order_id']) : 0;
        if (!$order_id) wp_send_json_error('bad_order', 400);
        check_ajax_referer('alena_dz_reorder_' . $order_id, 'nonce');

        if (!is_user_logged_in()) wp_send_json_error('login_required', 403);
        $order = wc_get_order($order_id);
        if (!$order) wp_send_json_error('not_found', 404);
        if ((int) $order->get_customer_id() !== get_current_user_id()) {
            wp_send_json_error('forbidden', 403);
        }

        if (!function_exists('WC') || !WC()->cart) wp_send_json_error('no_cart', 500);

        $added = 0;
        foreach ($order->get_items() as $item) {
            $product_id = (int) $item->get_product_id();
            $qty        = (int) $item->get_quantity();
            if (!$product_id || $qty < 1) continue;

            $product = wc_get_product($product_id);
            if (!$product || !$product->is_purchasable() || !$product->is_in_stock()) continue;

            $cart_item_data = [];
            $mods_raw = $item->get_meta('_alena_modifiers_raw', true);
            if ($mods_raw) {
                $decoded = json_decode($mods_raw, true);
                if (is_array($decoded)) $cart_item_data['alena_modifiers'] = $decoded;
            }
            $note_raw = $item->get_meta('_alena_item_note_raw', true);
            if ($note_raw) $cart_item_data['alena_item_note'] = (string) $note_raw;

            if (!empty($cart_item_data)) {
                $cart_item_data['unique_key'] = md5(wp_json_encode($cart_item_data));
            }

            $key = WC()->cart->add_to_cart($product_id, $qty, 0, [], $cart_item_data);
            if ($key) $added++;
        }

        if ($added === 0) {
            // Every dish in this order is off the menu — say so rather than
            // reporting success and sending the customer to an empty cart.
            wp_send_json_error(['message' => 'המנות מההזמנה הזו כבר לא בתפריט'], 409);
        }

        wp_send_json_success([
            'added'    => $added,
            'redirect' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/',
        ]);
    }
}
