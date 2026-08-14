<?php
if (!defined('ABSPATH')) exit;

/**
 * Post-order rating flow.
 *
 *   - On /my-account dashboard: shows a card asking the customer to rate any
 *     completed orders that haven't been rated yet.
 *   - Customer picks 1–5 stars + optional comment + optional tip-bump.
 *   - Rating stored as order meta + aggregated to TOPALENA Customer for
 *     reputation analytics.
 *   - Restaurant sees ratings inline in WC admin order list.
 */
class Alena_DZ_Order_Rating {

    public function __construct() {
        add_action('woocommerce_account_dashboard',   [$this, 'render_rating_prompt'], 7);
        add_action('wp_enqueue_scripts',               [$this, 'enqueue']);
        add_action('wp_ajax_alena_rate_order',         [$this, 'ajax_rate']);
        add_action('wp_ajax_nopriv_alena_rate_order',  [$this, 'ajax_rate']);

        // Show rating in admin order list
        add_filter('manage_edit-shop_order_columns',                 [$this, 'add_rating_column']);
        add_action('manage_shop_order_posts_custom_column',          [$this, 'render_rating_column'], 10, 2);
        // HPOS-aware column hooks
        add_filter('manage_woocommerce_page_wc-orders_columns',      [$this, 'add_rating_column']);
        add_action('manage_woocommerce_page_wc-orders_custom_column',[$this, 'render_rating_column_hpos'], 10, 2);
    }

    public function enqueue() {
        if (function_exists('is_account_page') && is_account_page()) {
            wp_enqueue_style('alena-order-rating',  ALENA_DZ_URL . 'assets/order-rating.css', [], ALENA_DZ_VERSION);
            wp_enqueue_script('alena-order-rating', ALENA_DZ_URL . 'assets/order-rating.js', ['jquery'], ALENA_DZ_VERSION, true);
        }
    }

    public function render_rating_prompt() {
        if (!is_user_logged_in()) return;
        $orders = wc_get_orders([
            'customer_id' => get_current_user_id(),
            'limit'       => 5,
            'orderby'     => 'date',
            'order'       => 'DESC',
            'status'      => ['wc-completed'],
        ]);
        $unrated = [];
        foreach ((array) $orders as $o) {
            if (!$o->get_meta('_alena_rating')) $unrated[] = $o;
        }
        if (!$unrated) return;
        $o = $unrated[0]; // ask about the most recent unrated one
        ?>
        <div class="alena-rate-card" data-order-id="<?php echo (int) $o->get_id(); ?>">
          <div class="alena-rate-emoji">⭐</div>
          <div class="alena-rate-body">
            <strong>איך הייתה ההזמנה האחרונה שלך?</strong>
            <span>הזמנה #<?php echo (int) $o->get_id(); ?> · ₪<?php echo number_format((float) $o->get_total(), 0); ?></span>
            <div class="alena-rate-stars" role="radiogroup">
              <?php for ($i = 1; $i <= 5; $i++): ?>
                <button type="button" class="alena-rate-star" data-stars="<?php echo $i; ?>" aria-label="<?php echo $i; ?> כוכבים">★</button>
              <?php endfor; ?>
            </div>
            <textarea class="alena-rate-comment" rows="2" placeholder="הערה (אופציונלי) — אהבת? משהו לשפר?"></textarea>
            <button type="button" class="alena-rate-submit" data-nonce="<?php echo wp_create_nonce('alena_rate_' . $o->get_id()); ?>">שלח דירוג</button>
          </div>
        </div>
        <?php
    }

    public function ajax_rate() {
        $order_id = isset($_POST['order_id']) ? absint($_POST['order_id']) : 0;
        if (!$order_id) wp_send_json_error('no_order', 400);
        check_ajax_referer('alena_rate_' . $order_id, 'nonce');

        if (!is_user_logged_in()) wp_send_json_error('login_required', 403);
        $order = wc_get_order($order_id);
        if (!$order) wp_send_json_error('not_found', 404);
        if ((int) $order->get_customer_id() !== get_current_user_id()) wp_send_json_error('forbidden', 403);

        $stars   = isset($_POST['stars']) ? max(1, min(5, (int) $_POST['stars'])) : 0;
        $comment = isset($_POST['comment']) ? sanitize_textarea_field((string) $_POST['comment']) : '';
        if (!$stars) wp_send_json_error('bad_stars', 400);

        $order->update_meta_data('_alena_rating',       $stars);
        $order->update_meta_data('_alena_rating_at',    current_time('mysql'));
        if ($comment) $order->update_meta_data('_alena_rating_comment', $comment);
        $order->save();

        $order->add_order_note(sprintf('⭐ הלקוח דירג: %d/5%s', $stars, $comment ? ' · "' . $comment . '"' : ''));

        wp_send_json_success(['stars' => $stars]);
    }

    public function add_rating_column($columns) {
        $new = [];
        foreach ($columns as $k => $v) {
            $new[$k] = $v;
            if ($k === 'order_status') $new['alena_rating'] = '⭐';
        }
        return $new;
    }

    public function render_rating_column($column, $post_id) {
        if ($column !== 'alena_rating') return;
        $order = wc_get_order($post_id);
        $this->print_rating_cell($order);
    }

    public function render_rating_column_hpos($column, $order) {
        if ($column !== 'alena_rating') return;
        $this->print_rating_cell($order);
    }

    private function print_rating_cell($order) {
        if (!$order) return;
        $stars = (int) $order->get_meta('_alena_rating');
        if (!$stars) {
            echo '<span style="color:#bbb">—</span>';
            return;
        }
        echo str_repeat('★', $stars) . str_repeat('<span style="color:#ddd">★</span>', 5 - $stars);
    }
}
