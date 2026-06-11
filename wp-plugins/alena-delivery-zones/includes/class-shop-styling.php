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

    // Display order for the shop page — restaurant menu logic, not alphabet.
    // Categories not in this list are appended at the end alphabetically.
    const CATEGORY_DISPLAY_ORDER = [
        'פיתות עלינא',
        'פיתות שף',
        'בצלחת',
        'בשרים',
        'המבורגר',
        'ראשונות',
        'פרנה',
        'סלט',
        'הסלטייה שלנו',
        'מנות ילדים',
        'תוספות',
        'שתייה קלה',
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

        // Product modal — only on shop / category pages
        if (is_shop() || is_product_category() || is_product_taxonomy()) {
            wp_enqueue_style('alena-dz-product-modal', ALENA_DZ_URL . 'assets/product-modal.css', ['alena-dz-shop'], ALENA_DZ_VERSION);
            wp_enqueue_script('alena-dz-product-modal', ALENA_DZ_URL . 'assets/product-modal.js', ['jquery'], ALENA_DZ_VERSION, true);
        }
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
        // Render hero + search + featured + nav + per-category sections
        $this->render_shop_hero();
        $this->render_search_bar();
        $this->render_sticky_catnav();
        $this->render_featured_section();
        $this->render_grouped_products();
        $this->render_inline_script();
    }

    public function render_shop_hero() {
        // Pick a hero image: first featured product image, else first product image
        $hero_url = $this->find_hero_image_url();
        $hero_style = $hero_url ? sprintf('style="background-image: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(%s)"', esc_url($hero_url)) : '';

        // Open / closed status from Hours Engine
        $status = '⏰ פתוח';
        if (class_exists('Alena_DZ_Hours_Engine')) {
            try {
                $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
                $s   = Alena_DZ_Hours_Engine::get()->status('delivery', $now);
                $status = $s['open'] ? '🟢 פתוח עכשיו' : '🔴 סגור · ' . ($s['reason'] ?? '');
            } catch (Exception $e) { /* ignore */ }
        }

        echo '<section class="alena-dz-hero" ' . $hero_style . '>';
        echo '<div class="alena-dz-hero-inner">';
        echo '<h1 class="alena-dz-hero-title">עלינא בפיתה</h1>';
        echo '<p class="alena-dz-hero-sub">מטבח ים-תיכוני שמח וצבעוני · כשר</p>';
        echo '<div class="alena-dz-hero-info">';
        echo '<span class="alena-dz-hero-chip">' . esc_html($status) . '</span>';
        echo '<span class="alena-dz-hero-chip">📍 רוטשילד 104, ראשון לציון</span>';
        echo '<span class="alena-dz-hero-chip">🚚 משלוחים מ-₪17</span>';
        echo '<span class="alena-dz-hero-chip">💰 מינ׳ הזמנה ₪70</span>';
        echo '</div>';
        echo '</div>';
        echo '</section>';
    }

    private function find_hero_image_url(): ?string {
        // Try featured products first
        $featured = wc_get_featured_product_ids();
        $candidates = !empty($featured) ? array_slice($featured, 0, 6) : [];

        // Else random visible products with images
        if (empty($candidates)) {
            $candidates = get_posts([
                'post_type'      => 'product',
                'posts_per_page' => 20,
                'orderby'        => 'rand',
                'fields'         => 'ids',
                'meta_query'     => [['key' => '_thumbnail_id', 'compare' => 'EXISTS']],
            ]);
        }
        foreach ($candidates as $pid) {
            $img = wp_get_attachment_image_url(get_post_thumbnail_id($pid), 'large');
            if ($img) return $img;
        }
        return null;
    }

    public function render_search_bar() {
        echo '<div class="alena-dz-search">';
        echo '<input type="search" id="alena-dz-search-input" placeholder="🔍 חיפוש מנה — חומוס, פיתה, סלט…" autocomplete="off" />';
        echo '<button type="button" id="alena-dz-search-clear" aria-label="נקה" style="display:none">✕</button>';
        echo '</div>';
        echo '<p id="alena-dz-search-empty" class="alena-dz-empty" style="display:none">לא מצאנו מנה שתואמת לחיפוש שלך 😅</p>';
    }

    public function render_featured_section() {
        $featured_ids = wc_get_featured_product_ids();
        // Only render this section if the owner has explicitly marked
        // products as "featured" in WC — otherwise it's noise.
        if (empty($featured_ids)) return;

        $visible = [];
        foreach ($featured_ids as $pid) {
            $p = wc_get_product($pid);
            if ($p && $p->is_visible() && $p->get_image_id()) {
                $visible[] = $p;
            }
            if (count($visible) >= 6) break;
        }
        if (!$visible) return;

        echo '<section class="alena-dz-cat-section alena-dz-featured-section" id="alena-featured">';
        echo '<h2 class="alena-dz-cat-title">המוזמנים ביותר 💙</h2>';
        echo '<p class="alena-dz-cat-desc">מנות שאהבנו, ושותפינו אהבו</p>';
        echo '<ul class="alena-dz-products">';
        foreach ($visible as $p) $this->render_product_card($p);
        echo '</ul>';
        echo '</section>';
    }

    public function render_inline_script() {
        ?>
        <script>
        (function () {
          const input = document.getElementById('alena-dz-search-input');
          const clearBtn = document.getElementById('alena-dz-search-clear');
          const empty = document.getElementById('alena-dz-search-empty');
          const sections = document.querySelectorAll('.alena-dz-cat-section');
          if (!input) return;

          function normalize(t) { return (t || '').toLowerCase().trim(); }

          function applyFilter(q) {
            q = normalize(q);
            let anyVisible = false;
            sections.forEach(section => {
              let sectionHasMatch = false;
              section.querySelectorAll('.alena-dz-card').forEach(card => {
                const text = normalize(card.textContent);
                const match = !q || text.includes(q);
                card.style.display = match ? '' : 'none';
                if (match) sectionHasMatch = true;
              });
              section.style.display = sectionHasMatch ? '' : 'none';
              if (sectionHasMatch) anyVisible = true;
            });
            empty.style.display = (q && !anyVisible) ? '' : 'none';
            clearBtn.style.display = q ? '' : 'none';
          }

          input.addEventListener('input', e => applyFilter(e.target.value));
          clearBtn.addEventListener('click', () => { input.value = ''; applyFilter(''); input.focus(); });
        })();
        </script>
        <?php
    }

    public function render_sticky_catnav() {
        $terms = $this->ordered_visible_terms();
        if (!$terms) return;
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
        $terms = $this->ordered_visible_terms();
        if (!$terms) {
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
            // Hide products with no price (placeholder / incomplete imports)
            $products = array_filter($products, function ($p) {
                $price = $p->get_price();
                return $price !== '' && (float) $price > 0;
            });
            if (!$products) continue;

            printf('<section class="alena-dz-cat-section" id="alena-cat-%d">', (int) $term->term_id);
            printf('<h2 class="alena-dz-cat-title">%s</h2>', esc_html($term->name));
            if ($term->description) {
                printf('<p class="alena-dz-cat-desc">%s</p>', esc_html($term->description));
            }

            echo '<ul class="alena-dz-products">';
            foreach ($products as $product) {
                $this->render_product_card($product);
            }
            echo '</ul>';
            echo '</section>';
        }
        echo '</div>';
    }

    private function render_product_card($product) {
        $id      = $product->get_id();
        $name    = $product->get_name();
        $price   = $product->get_price_html();
        $desc    = $product->get_short_description() ?: $product->get_description();
        $desc    = wp_trim_words(strip_tags($desc), 18, '…');
        $img     = $product->get_image('woocommerce_thumbnail', ['class' => 'alena-dz-card-img']);
        $url     = get_permalink($id);
        $add_url = '?add-to-cart=' . $id;
        $is_featured = $product->is_featured();
        ?>
        <li class="alena-dz-card">
          <?php if ($is_featured): ?>
            <span class="alena-dz-popular-badge">פופולרי</span>
          <?php endif; ?>
          <a class="alena-dz-card-imgwrap" href="<?php echo esc_url($url); ?>">
            <?php echo $img; ?>
            <span class="alena-dz-card-add" data-product_id="<?php echo $id; ?>" aria-label="הוסף לסל">+</span>
          </a>
          <div class="alena-dz-card-body">
            <a class="alena-dz-card-title" href="<?php echo esc_url($url); ?>"><?php echo esc_html($name); ?></a>
            <?php if ($desc): ?>
              <p class="alena-dz-card-desc"><?php echo esc_html($desc); ?></p>
            <?php endif; ?>
            <div class="alena-dz-card-bottom">
              <span class="alena-dz-card-price"><?php echo $price; ?></span>
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

    /**
     * Returns visible product categories sorted by the brand's menu order
     * (pitot first, drinks last), with anything unrecognized appended.
     */
    private function ordered_visible_terms(): array {
        $terms = get_terms([
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
            'exclude'    => $this->hidden_term_ids(),
        ]);
        if (is_wp_error($terms) || !$terms) return [];

        $by_name = [];
        foreach ($terms as $t) $by_name[$t->name] = $t;

        $ordered = [];
        foreach (self::CATEGORY_DISPLAY_ORDER as $name) {
            if (isset($by_name[$name])) {
                $ordered[] = $by_name[$name];
                unset($by_name[$name]);
            }
        }
        // Append any unrecognized categories at the end
        foreach ($by_name as $t) $ordered[] = $t;
        return $ordered;
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
