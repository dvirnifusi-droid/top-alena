<?php
if (!defined('ABSPATH')) exit;

/**
 * Restyles the shop / category / single-product pages to match the Alena
 * brand (coral sidebar, dark serif title font, dark green CTA buttons).
 *
 * Strategy:
 *   - Enqueue a global stylesheet on every WC page (shop, category, single,
 *     cart, checkout).
 *   - Hide "merch" and "uncategorized" categories from the shop loop.
 *   - Show category headers grouping products on the main shop page.
 *   - Add an order-by-category quick-nav at the top of the shop.
 */
class Alena_DZ_Shop_Styling {

    const HIDDEN_CATEGORY_SLUGS = [
        'uncategorized',
        'general',          // 'כללי' WC default
        'kllli',
        'merch',
    ];
    const HIDDEN_CATEGORY_NAMES = [
        'חולצות עלינא X גולדסטאר',
        'כללי',
    ];

    public function __construct() {
        add_action('wp_enqueue_scripts',                  [$this, 'enqueue']);
        add_filter('woocommerce_product_query_tax_query', [$this, 'hide_merch_in_query'], 10, 2);
        add_filter('woocommerce_show_page_title',         '__return_true');
        add_filter('woocommerce_sale_flash',              [$this, 'sale_flash']);
        add_filter('woocommerce_catalog_orderby',         [$this, 'simplify_sort']);
        add_filter('loop_shop_columns',                   function() { return 3; });
        add_filter('loop_shop_per_page',                  function() { return 100; });

        // Replace the default shop loop with our grouped-by-category render
        add_action('woocommerce_before_main_content',     [$this, 'start_buffer_on_shop'], 1);
        add_action('woocommerce_after_main_content',      [$this, 'flush_buffer_on_shop'], 999);
    }

    public function enqueue() {
        if (!function_exists('is_woocommerce')) return;
        if (!(is_woocommerce() || is_cart() || is_checkout() || is_account_page())) return;
        wp_enqueue_style('alena-dz-shop', ALENA_DZ_URL . 'assets/shop.css', [], ALENA_DZ_VERSION);
    }

    public function hide_merch_in_query($tax_query, $query) {
        // Only on the main shop archive (not on category pages — user may
        // still browse to "חולצות" via direct link)
        if (!is_shop()) return $tax_query;
        $hidden = [];
        foreach (self::HIDDEN_CATEGORY_NAMES as $name) {
            $term = get_term_by('name', $name, 'product_cat');
            if ($term) $hidden[] = (int) $term->term_id;
        }
        if (!$hidden) return $tax_query;
        $tax_query[] = [
            'taxonomy' => 'product_cat',
            'field'    => 'term_id',
            'terms'    => $hidden,
            'operator' => 'NOT IN',
        ];
        return $tax_query;
    }

    /* ---------------- Custom shop layout: grouped by category ---------------- */

    public function start_buffer_on_shop() {
        if (!is_shop()) return;
        ob_start();
    }

    public function flush_buffer_on_shop() {
        if (!is_shop()) {
            return;
        }
        $original = ob_get_clean();
        // Render hero + category nav + per-category sections
        $this->render_shop_hero();
        $this->render_sticky_catnav();
        $this->render_grouped_products();
    }

    public function render_shop_hero() {
        echo '<section class="alena-dz-hero">';
        echo '<h1 class="alena-dz-hero-title">עלינא בפיתה</h1>';
        echo '<p class="alena-dz-hero-sub">מטבח ישראלי שמח וצבעוני · כשר</p>';
        echo '<div class="alena-dz-hero-info">';
        echo '<span>⏰ פתוח 11:00 – 23:00</span>';
        echo '<span>📍 רוטשילד 104, ראשון לציון</span>';
        echo '<span>🚚 משלוחים מ-₪17</span>';
        echo '</div>';
        echo '</section>';
    }

    public function render_sticky_catnav() {
        $terms = get_terms([
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
            'exclude'    => $this->hidden_term_ids(),
            'orderby'    => 'count',
            'order'      => 'DESC',
        ]);
        if (is_wp_error($terms) || !$terms) return;
        echo '<nav class="alena-dz-catnav alena-dz-catnav-sticky">';
        echo '<div class="alena-dz-catnav-inner">';
        foreach ($terms as $t) {
            printf(
                '<a class="alena-dz-catnav-item" href="#alena-cat-%d">%s</a>',
                (int) $t->term_id,
                esc_html($t->name)
            );
        }
        echo '</div>';
        echo '</nav>';
    }

    public function render_grouped_products() {
        $terms = get_terms([
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
            'exclude'    => $this->hidden_term_ids(),
            'orderby'    => 'count',
            'order'      => 'DESC',
        ]);
        if (is_wp_error($terms) || !$terms) {
            echo '<p>אין מוצרים זמינים כרגע.</p>';
            return;
        }
        echo '<div class="alena-dz-shop-sections">';
        foreach ($terms as $term) {
            $products = wc_get_products([
                'category' => [$term->slug],
                'status'   => 'publish',
                'limit'    => -1,
                'orderby'  => 'menu_order title',
                'order'    => 'ASC',
            ]);
            if (!$products) continue;

            printf('<section class="alena-dz-cat-section" id="alena-cat-%d">', (int) $term->term_id);
            printf('<h2 class="alena-dz-cat-title">%s</h2>', esc_html($term->name));
            if ($term->description) {
                printf('<p class="alena-dz-cat-desc">%s</p>', esc_html($term->description));
            }

            echo '<ul class="alena-dz-products products">';
            foreach ($products as $product) {
                $this->render_product_card($product);
            }
            echo '</ul>';
            echo '</section>';
        }
        echo '</div>';
    }

    private function render_product_card($product) {
        $id     = $product->get_id();
        $name   = $product->get_name();
        $price  = $product->get_price_html();
        $desc   = $product->get_short_description() ?: $product->get_description();
        $desc   = wp_trim_words(strip_tags($desc), 18, '…');
        $img    = $product->get_image('woocommerce_thumbnail', ['class' => 'alena-dz-card-img']);
        $url    = get_permalink($id);
        $add_url = '?add-to-cart=' . $id;
        ?>
        <li class="alena-dz-card">
          <a class="alena-dz-card-imgwrap" href="<?php echo esc_url($url); ?>"><?php echo $img; ?></a>
          <div class="alena-dz-card-body">
            <a class="alena-dz-card-title" href="<?php echo esc_url($url); ?>"><?php echo esc_html($name); ?></a>
            <?php if ($desc): ?>
              <p class="alena-dz-card-desc"><?php echo esc_html($desc); ?></p>
            <?php endif; ?>
            <div class="alena-dz-card-bottom">
              <span class="alena-dz-card-price"><?php echo $price; ?></span>
              <a class="alena-dz-card-add"
                 href="<?php echo esc_url($add_url); ?>"
                 data-product_id="<?php echo $id; ?>"
                 data-quantity="1"
                 rel="nofollow">+</a>
            </div>
          </div>
        </li>
        <?php
    }

    private function hidden_term_ids(): array {
        $ids = [];
        foreach (self::HIDDEN_CATEGORY_NAMES as $name) {
            $t = get_term_by('name', $name, 'product_cat');
            if ($t) $ids[] = (int) $t->term_id;
        }
        return $ids;
    }

    public function sale_flash($html) {
        // Replace default "Sale!" banner with brand-styled version
        return '<span class="alena-dz-flash">🔥 מבצע</span>';
    }

    public function simplify_sort($opts) {
        // Drop confusing options, keep popularity + newest + price
        return [
            'menu_order' => 'מומלץ',
            'popularity' => 'הכי נמכרים',
            'date'       => 'חדשים',
            'price'      => 'מחיר: זול לתחילה',
            'price-desc' => 'מחיר: יקר לתחילה',
        ];
    }
}
