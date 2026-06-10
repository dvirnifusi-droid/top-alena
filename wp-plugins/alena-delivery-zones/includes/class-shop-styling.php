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
        add_action('woocommerce_before_shop_loop',        [$this, 'render_category_nav'], 15);
        add_filter('woocommerce_show_page_title',         '__return_true');
        // Replace default sale flash with nothing
        add_filter('woocommerce_sale_flash',              [$this, 'sale_flash']);
        // Hide "Default sorting" dropdown
        add_filter('woocommerce_catalog_orderby',         [$this, 'simplify_sort']);
        // 3 columns
        add_filter('loop_shop_columns',                   function() { return 3; });
        // 18 per page
        add_filter('loop_shop_per_page',                  function() { return 18; });
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

    public function render_category_nav() {
        if (!is_shop()) return;
        $terms = get_terms([
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
            'exclude'    => $this->hidden_term_ids(),
        ]);
        if (is_wp_error($terms) || !$terms) return;
        echo '<nav class="alena-dz-catnav">';
        foreach ($terms as $t) {
            printf(
                '<a class="alena-dz-catnav-item" href="%s">%s <span class="count">(%d)</span></a>',
                esc_url(get_term_link($t)),
                esc_html($t->name),
                (int) $t->count
            );
        }
        echo '</nav>';
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
