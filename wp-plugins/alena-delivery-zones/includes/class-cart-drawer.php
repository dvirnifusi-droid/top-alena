<?php
if (!defined('ABSPATH')) exit;

/**
 * Side drawer cart — Wolt-style.
 *
 * Renders a fixed right-side drawer that slides in when the customer clicks
 * the floating bottom cart bar or the top nav "הסל שלי" button. Lists items
 * with steppers, suggests cross-sell items ("מומלץ עבורך"), and CTAs to the
 * full /cart page or directly to /checkout. The full /cart page remains as
 * a fallback for power users / direct URL hits.
 */
class Alena_DZ_Cart_Drawer {

    public function __construct() {
        add_action('wp_footer',          [$this, 'render']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);
        add_action('wp_ajax_alena_cart_drawer',        [$this, 'ajax_render']);
        add_action('wp_ajax_nopriv_alena_cart_drawer', [$this, 'ajax_render']);
        // Quantity / removal. The drawer used to POST to ?wc-ajax=update_cart_item_qty,
        // which is not a WooCommerce endpoint — it answered 200 with the shop page, so
        // every change looked successful and silently did nothing.
        add_action('wp_ajax_alena_cart_set_qty',        [$this, 'ajax_set_qty']);
        add_action('wp_ajax_nopriv_alena_cart_set_qty', [$this, 'ajax_set_qty']);
        // Sweep de-listed dishes out of open carts once per request, so no page
        // — not just the drawer — can trip over an invalid line.
        add_action('woocommerce_cart_loaded_from_session', [__CLASS__, 'purge_stale_items'], 20);
    }

    public function enqueue() {
        if (is_admin()) return;
        wp_enqueue_style('alena-cart-drawer',  ALENA_DZ_URL . 'assets/cart-drawer.css', [], ALENA_DZ_VERSION);
        wp_enqueue_script('alena-cart-drawer', ALENA_DZ_URL . 'assets/cart-drawer.js', ['jquery'], ALENA_DZ_VERSION, true);
        wp_localize_script('alena-cart-drawer', 'AlenaCartDrawer', [
            'ajaxUrl'  => admin_url('admin-ajax.php'),
            'nonce'    => wp_create_nonce('alena_cart_drawer'),
            'cartUrl'  => function_exists('wc_get_cart_url') ? wc_get_cart_url() : '/cart/',
            'checkoutUrl' => function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : '/checkout/',
        ]);
    }

    public function render() {
        if (is_admin()) return;
        ?>
        <div id="alena-drawer-backdrop" class="alena-drawer-backdrop" hidden></div>
        <aside id="alena-drawer" class="alena-drawer" hidden role="dialog" aria-modal="true" aria-label="סל הקניות">
          <div class="alena-drawer-head">
            <button type="button" class="alena-drawer-close" id="alena-drawer-close" aria-label="סגור">×</button>
            <h2 class="alena-drawer-title">ההזמנה שלך</h2>
          </div>
          <div class="alena-drawer-body" id="alena-drawer-body">
            <div class="alena-drawer-skeleton">טוען…</div>
          </div>
        </aside>
        <?php
    }

    /**
     * Drops cart lines whose product no longer exists or was taken off the menu.
     *
     * A menu import can trash a dish that customers already have in an open cart.
     * WooCommerce leaves the line in place with an invalid `data` product, and
     * anything that renders it then fatals — which is how the drawer ended up
     * stuck on "טוען…" forever. Core only revalidates on the cart/checkout
     * pages, so the shop-page drawer has to do it itself.
     *
     * @return int number of lines removed
     */
    public static function purge_stale_items(\WC_Cart $cart): int {
        $removed = 0;
        foreach ($cart->get_cart() as $key => $item) {
            $product = $item['data'] ?? null;
            $alive = $product instanceof \WC_Product
                && $product->get_id()
                && $product->exists()
                && $product->is_purchasable();
            if ($alive) continue;
            $cart->remove_cart_item($key);
            $removed++;
        }
        if ($removed) $cart->calculate_totals();
        return $removed;
    }

    /**
     * Sets a line's quantity, or removes the line when the quantity reaches 0.
     * Responds with the fresh cart count/total so the caller can update without
     * a second round trip.
     */
    public function ajax_set_qty() {
        check_ajax_referer('alena_cart_drawer', 'nonce');
        if (!function_exists('WC') || !WC()->cart) {
            wp_send_json_error(['message' => 'cart_unavailable'], 500);
        }

        $key = isset($_POST['cart_item_key']) ? wc_clean(wp_unslash($_POST['cart_item_key'])) : '';
        $qty = isset($_POST['quantity']) ? (int) $_POST['quantity'] : -1;
        if ($key === '' || $qty < 0) {
            wp_send_json_error(['message' => 'bad_request'], 400);
        }

        $cart = WC()->cart;
        if (!$cart->get_cart_item($key)) {
            wp_send_json_error(['message' => 'item_not_found'], 404);
        }

        if ($qty === 0) {
            $cart->remove_cart_item($key);
        } else {
            $cart->set_quantity($key, $qty, true);
        }
        $cart->calculate_totals();

        wp_send_json_success([
            'count' => $cart->get_cart_contents_count(),
            'total' => $cart->get_cart_total(),
            'empty' => $cart->is_empty(),
        ]);
    }

    /**
     * Server-renders the drawer body — cart items + cross-sell + summary.
     * Returns HTML directly (innerHTML target).
     */
    public function ajax_render() {
        check_ajax_referer('alena_cart_drawer', 'nonce');
        if (!function_exists('WC') || !WC()->cart) {
            wp_send_json_success(['html' => '<div class="alena-drawer-empty">השרת לא מוכן</div>']);
            return;
        }
        $cart = WC()->cart;
        self::purge_stale_items($cart);
        ob_start();

        if ($cart->is_empty()) {
            ?>
            <div class="alena-drawer-empty">
              <div class="alena-drawer-empty-emoji">🥙</div>
              <p>הסל שלך ריק כרגע</p>
              <a class="alena-drawer-empty-cta" href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>">לתפריט המלא ←</a>
            </div>
            <?php
            wp_send_json_success(['html' => ob_get_clean()]);
            return;
        }

        // get_subtotal() is EXCLUSIVE of tax while get_total() includes it, so
        // the two rows were quoting ₪403.42 against ₪472 with the ₪68.58 of VAT
        // sitting between them unlabelled — it read as a hidden surcharge. Menu
        // prices are shown inclusive, so the subtotal must be too.
        $subtotal = $cart->get_subtotal() + $cart->get_subtotal_tax();
        $total    = $cart->get_total('raw');
        ?>
        <ul class="alena-drawer-items">
          <?php foreach ($cart->get_cart() as $key => $item):
            $product = $item['data'] ?? null;
            if (!$product instanceof \WC_Product) continue;   // belt-and-braces
            $qty     = (int) $item['quantity'];
            $name    = $product->get_name();
            $img     = wp_get_attachment_image_url($product->get_image_id(), 'thumbnail');
            $line    = wc_price($product->get_price() * $qty);
            ?>
            <li class="alena-drawer-item" data-key="<?php echo esc_attr($key); ?>" data-product-id="<?php echo (int) $product->get_id(); ?>">
              <?php if ($img): ?>
                <img class="alena-drawer-item-img" src="<?php echo esc_url($img); ?>" alt="" />
              <?php else: ?>
                <div class="alena-drawer-item-img alena-drawer-item-img-fallback">🍽️</div>
              <?php endif; ?>
              <div class="alena-drawer-item-body">
                <strong class="alena-drawer-item-name"><?php echo esc_html($name); ?></strong>
                <?php if (!empty($item['alena_modifiers']) && is_array($item['alena_modifiers'])): ?>
                  <div class="alena-drawer-item-mods">
                    <?php foreach ($item['alena_modifiers'] as $m):
                      if (empty($m['name'])) continue; ?>
                      <span class="alena-drawer-item-mod"><?php echo esc_html($m['name']); ?></span>
                    <?php endforeach; ?>
                  </div>
                <?php endif; ?>
                <?php if (!empty($item['alena_item_note'])): ?>
                  <div class="alena-drawer-item-note">📝 <?php echo esc_html($item['alena_item_note']); ?></div>
                <?php endif; ?>
              </div>
              <div class="alena-drawer-item-actions">
                <span class="alena-drawer-item-price"><?php echo wp_kses_post($line); ?></span>
                <div class="alena-drawer-item-stepper">
                  <button type="button" class="alena-drawer-step-minus" aria-label="הפחת">–</button>
                  <span class="alena-drawer-step-qty"><?php echo $qty; ?></span>
                  <button type="button" class="alena-drawer-step-plus" aria-label="הוסף">+</button>
                </div>
                <button type="button" class="alena-drawer-item-remove" aria-label="הסר מהסל" title="הסר מהסל">🗑</button>
              </div>
            </li>
          <?php endforeach; ?>
        </ul>

        <?php $cross = $this->get_cross_sell_items($cart); if (!empty($cross)): ?>
        <div class="alena-drawer-cross">
          <h3 class="alena-drawer-cross-title">מומלץ עבורך</h3>
          <div class="alena-drawer-cross-row">
            <?php foreach ($cross as $p):
              $pimg = get_the_post_thumbnail_url($p->get_id(), 'thumbnail');
              ?>
              <button type="button" class="alena-drawer-cross-card" data-product-id="<?php echo (int) $p->get_id(); ?>">
                <?php if ($pimg): ?>
                  <img src="<?php echo esc_url($pimg); ?>" alt="" />
                <?php endif; ?>
                <strong><?php echo esc_html($p->get_name()); ?></strong>
                <span class="alena-drawer-cross-price"><?php echo wp_kses_post($p->get_price_html()); ?></span>
                <span class="alena-drawer-cross-add">+</span>
              </button>
            <?php endforeach; ?>
          </div>
        </div>
        <?php endif; ?>

        <div class="alena-drawer-note">
          <label for="alena-drawer-note-input">📝 הערה למסעדה / שליח</label>
          <div class="alena-drawer-note-chips">
            <button type="button" class="alena-drawer-chip" data-text="ללא בצל">ללא בצל</button>
            <button type="button" class="alena-drawer-chip" data-text="בלי חריף">בלי חריף</button>
            <button type="button" class="alena-drawer-chip" data-text="ללא גלוטן">ללא גלוטן</button>
            <button type="button" class="alena-drawer-chip" data-text="להשאיר ליד הדלת">ליד הדלת</button>
            <button type="button" class="alena-drawer-chip" data-text="להתקשר כשמגיעים">להתקשר כשמגיעים</button>
          </div>
          <textarea id="alena-drawer-note-input" placeholder="אלרגיות, מגבלות, הוראות מיוחדות…" rows="2"></textarea>
        </div>

        <div class="alena-drawer-summary">
          <div class="alena-drawer-summary-row">
            <span>סכום ביניים</span>
            <span><?php echo wc_price($subtotal); ?></span>
          </div>
          <?php foreach ($cart->get_fees() as $fee): ?>
            <div class="alena-drawer-summary-row">
              <span><?php echo esc_html($fee->name); ?></span>
              <span><?php echo wc_price($fee->amount); ?></span>
            </div>
          <?php endforeach; ?>
          <?php $shipping_total = $cart->get_shipping_total(); if ($shipping_total > 0): ?>
            <div class="alena-drawer-summary-row">
              <span>משלוח</span>
              <span><?php echo wc_price($shipping_total); ?></span>
            </div>
          <?php endif; ?>
          <div class="alena-drawer-summary-row alena-drawer-summary-row-total">
            <span>סה״כ לתשלום</span>
            <span><?php echo wc_price($total); ?></span>
          </div>
        </div>

        <a class="alena-drawer-cta" href="<?php echo esc_url(wc_get_checkout_url()); ?>">
          מעבר לתשלום
          <span class="alena-drawer-cta-amount"><?php echo wc_price($total); ?></span>
        </a>
        <a class="alena-drawer-cta-secondary" href="<?php echo esc_url(wc_get_cart_url()); ?>">
          לעריכה מלאה של הסל →
        </a>
        <?php

        wp_send_json_success(['html' => ob_get_clean()]);
    }

    /**
     * Pick 3 cross-sell suggestions: WC cross-sells if set on items, then top
     * sellers, excluding what's already in cart.
     */
    private function get_cross_sell_items(\WC_Cart $cart): array {
        $in_cart_ids = array_map(fn($i) => $i['product_id'], $cart->get_cart());

        $cross_ids = [];
        foreach ($cart->get_cart() as $item) {
            $cross_ids = array_merge($cross_ids, $item['data']->get_cross_sell_ids());
        }
        $cross_ids = array_filter(array_diff(array_unique($cross_ids), $in_cart_ids));

        if (count($cross_ids) < 3) {
            $top = wc_get_products([
                'status' => 'publish',
                'limit'  => 8,
                'orderby' => 'meta_value_num',
                'meta_key' => 'total_sales',
                'order' => 'DESC',
            ]);
            foreach ($top as $p) {
                if (in_array($p->get_id(), $in_cart_ids, true)) continue;
                if (in_array($p->get_id(), $cross_ids, true)) continue;
                $cross_ids[] = $p->get_id();
                if (count($cross_ids) >= 3) break;
            }
        }
        $cross_ids = array_slice($cross_ids, 0, 3);
        return array_map('wc_get_product', $cross_ids);
    }
}
