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
        // Dark theme: last in the queue, and gated by a body class.
        add_action('wp_enqueue_scripts',                  [$this, 'enqueue_dark_mobile'], 999);
        add_filter('body_class',                          [$this, 'dark_mobile_body_class']);
        // Old "💚🥑 ברוכים הבאים" promo popup — superseded by Alena_DZ_Welcome (the full split-screen landing).
        // add_action('wp_footer',                           [$this, 'render_promo_popup']);
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
        // Heebo carries Hebrew at every weight; display=swap so a slow font
        // never delays first paint.
        wp_enqueue_style(
            'alena-dz-font',
            'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap',
            [],
            null
        );
        // Brand tokens first — the component sheets below consume its variables.
        wp_enqueue_style('alena-dz-brand', ALENA_DZ_URL . 'assets/brand.css', ['alena-dz-font'], ALENA_DZ_VERSION);
        wp_enqueue_style('alena-dz-shop', ALENA_DZ_URL . 'assets/shop.css', ['alena-dz-brand'], ALENA_DZ_VERSION);
        wp_enqueue_style('alena-dz-modern', ALENA_DZ_URL . 'assets/modern-design.css', ['alena-dz-shop'], ALENA_DZ_VERSION);
        // Loaded LAST so it settles the menu-card layout for good
        wp_enqueue_style('alena-dz-menu-cards', ALENA_DZ_URL . 'assets/menu-cards.css', ['alena-dz-modern'], ALENA_DZ_VERSION);

        // The dark mobile theme is enqueued separately, at priority 999 — see
        // enqueue_dark_mobile(). It has to print after every other storefront
        // sheet, which is not something a fixed dependency list can promise.

        // Cart/checkout page shell — also last, for the same reason.
        if (is_cart() || is_checkout()) {
            wp_enqueue_style('alena-dz-cart-polish', ALENA_DZ_URL . 'assets/cart-polish.css', ['alena-dz-menu-cards'], ALENA_DZ_VERSION);
        }

        // Product modal — only on shop / category pages
        if (is_shop() || is_product_category() || is_product_taxonomy()) {
            wp_enqueue_style('alena-dz-product-modal', ALENA_DZ_URL . 'assets/product-modal.css', ['alena-dz-shop'], ALENA_DZ_VERSION);
            wp_enqueue_style('alena-dz-modal-polish', ALENA_DZ_URL . 'assets/modal-polish.css', ['alena-dz-product-modal', 'alena-dz-menu-cards'], ALENA_DZ_VERSION);
            wp_enqueue_script('alena-dz-product-modal', ALENA_DZ_URL . 'assets/product-modal.js', ['jquery'], ALENA_DZ_VERSION, true);
            // The modal fetches its dish payload from admin-ajax; give it the
            // real URL rather than letting it fall back to a hardcoded path.
            wp_localize_script('alena-dz-product-modal', 'AlenaDishModal', [
                'ajaxUrl' => admin_url('admin-ajax.php'),
            ]);
        }
    }

    /** Fulfilment options, shared by the header button and the chooser sheet. */
    private function fulfilment_labels() {
        return [
            'delivery' => ['icon' => '🛵', 'label' => 'משלוח',      'eta' => '35-45 דק׳'],
            'pickup'   => ['icon' => '🥡', 'label' => 'איסוף עצמי', 'eta' => '15-25 דק׳'],
        ];
    }

    private function current_fulfilment_mode() {
        if (function_exists('WC') && WC()->session) {
            $m = WC()->session->get('alena_fulfillment_mode');
            if (in_array($m, ['delivery', 'pickup'], true)) return $m;
        }
        return 'delivery';
    }

    /**
     * The dark theme covers the menu pages only. Cart, checkout and the account
     * area are still light — converting them is a separate piece of work, and
     * shipping half a conversion is what forced the revert last time.
     */
    private function is_dark_mobile_page() {
        if (!function_exists('is_woocommerce')) return false;
        // Checkout is still light: it hosts the PayPlus frame, which we do not
        // control and cannot restyle from here.
        return is_shop() || is_product_category() || is_product_taxonomy() || is_cart();
    }

    public function dark_mobile_body_class($classes) {
        if ($this->is_dark_mobile_page()) $classes[] = 'alena-dark-mobile';
        return $classes;
    }

    /**
     * Enqueued at priority 999 so every other storefront sheet is already in the
     * queue and can be named as a dependency — that is what forces this file to
     * print last.
     *
     * The list is built rather than hardcoded on purpose. Eleven sheets paint
     * these same surfaces with !important, and when two rules tie on specificity
     * the later one wins. The first rollout of this theme lost the whole dish
     * modal for exactly that reason: modal-polish.css was enqueued after it and
     * repainted .alena-dz-mod-group white again. A fixed dependency list would
     * go stale the next time a sheet is added; this cannot.
     */
    public function enqueue_dark_mobile() {
        if (!$this->is_dark_mobile_page()) return;
        if (!wp_style_is('alena-dz-menu-cards', 'enqueued')) return;

        $deps = [];
        foreach (wp_styles()->queue as $handle) {
            if (strpos($handle, 'alena') === 0) $deps[] = $handle;
        }

        wp_enqueue_style(
            'alena-dz-dark-mobile',
            ALENA_DZ_URL . 'assets/dark-mobile.css',
            $deps,
            ALENA_DZ_VERSION
        );
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

        // Welcome gate — if customer hasn't picked delivery/pickup yet, show the
        // welcome screen INSTEAD of the menu. After they pick and continue,
        // /shop reloads and renders the menu normally.
        if (class_exists('Alena_DZ_Welcome') && Alena_DZ_Welcome::should_show()) {
            (new Alena_DZ_Welcome())->render();
            return;
        }

        // Render hero + club banner + search + recent orders + featured + nav + per-category sections
        $this->render_shop_hero();
        if (class_exists('Alena_DZ_Club')) {
            (new Alena_DZ_Club())->render_shop_banner();
        }
        $this->render_search_bar();
        if (class_exists('Alena_DZ_Recent_Orders')) {
            (new Alena_DZ_Recent_Orders())->render_section();
        }
        $this->render_sticky_catnav();
        $this->render_featured_section();
        $this->render_grouped_products();
        $this->render_inline_script();
    }

    public function render_promo_popup() {
        if (is_admin()) return;
        if (!(function_exists('is_shop') && is_shop()) && !is_front_page()) return;
        $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        ?>
        <div class="alena-promo-overlay" id="alena-promo">
          <div class="alena-promo-box">
            <button class="alena-promo-close" id="alena-promo-close" aria-label="סגור">✕</button>
            <div class="alena-promo-emoji">🥙💚</div>
            <h2>ברוכים הבאים לעלינא!</h2>
            <p>מטבח ים-תיכוני שמח וצבעוני · כשר · משלוחים לראשון לציון והסביבה</p>
            <a class="alena-promo-cta" href="<?php echo esc_url($shop_url); ?>" id="alena-promo-cta">לתפריט המלא →</a>
          </div>
        </div>
        <script>
        (function(){
          try {
            if (sessionStorage.getItem('alena_promo_seen')) return;
            var ov = document.getElementById('alena-promo');
            if (!ov) return;
            setTimeout(function(){ ov.classList.add('open'); }, 1200);
            function close(){ ov.classList.remove('open'); sessionStorage.setItem('alena_promo_seen','1'); }
            document.getElementById('alena-promo-close').addEventListener('click', close);
            document.getElementById('alena-promo-cta').addEventListener('click', function(){ sessionStorage.setItem('alena_promo_seen','1'); });
            ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
          } catch(e){}
        })();
        </script>
        <?php
    }

    public function render_shop_hero() {
        // Pick a hero image: first featured product image, else first product image
        $hero_url = $this->find_hero_image_url();
        // Photo only. The darkening that used to be baked in here now lives on
        // .alena-dz-hero::before, so the phone layout — where the text sits on a
        // panel below the photo rather than over it — gets the picture at full
        // brightness, the way Wolt shows it.
        $hero_style = $hero_url ? sprintf('style="background-image: url(%s)"', esc_url($hero_url)) : '';

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
        // A real box for the photo on phones. As a background on the section
        // itself, `cover` sizes the image against the section's whole height —
        // photo window plus the text panel below it — so the visible strip was
        // a crop of an image scaled for a box twice its size. Its own element
        // gets cropped against its own height. Hidden on desktop, where the
        // section background is still the right thing.
        // The URL travels as a custom property, not as background-image: the
        // site's lazy-loader rewrites any inline background-image into a
        // data-back attribute and empties the style, which left this element
        // blank until its script happened to run. It ignores custom properties.
        $slides = $this->find_hero_image_urls(5);
        if (!$slides && $hero_url) $slides = [$hero_url];
        if ($slides) {
            echo '<div class="alena-dz-hero-photo" aria-hidden="true">';
            foreach ($slides as $i => $url) {
                printf(
                    '<span class="alena-dz-hero-slide%s" style="--alena-hero-photo: url(%s)"></span>',
                    $i === 0 ? ' is-active' : '',
                    esc_url($url)
                );
            }
            echo '</div>';
        }
        echo '<div class="alena-dz-hero-inner">';
        echo '<h1 class="alena-dz-hero-title">עלינא בפיתה</h1>';
        echo '<p class="alena-dz-hero-sub">מטבח ים-תיכוני שמח וצבעוני · כשר</p>';
        echo '<div class="alena-dz-hero-info">';
        echo '<span class="alena-dz-hero-chip">' . esc_html($status) . '</span>';
        echo '<span class="alena-dz-hero-chip">📍 רוטשילד 104, ראשון לציון</span>';
        echo '<span class="alena-dz-hero-chip">🚚 משלוחים מ-₪17</span>';
        echo '<span class="alena-dz-hero-chip">💰 מינ׳ הזמנה ₪70</span>';
        echo '</div>';

        // Phone header, Wolt-shaped: the same facts as one dotted line instead of
        // four pills, and the fulfilment choice as something you can actually
        // tap rather than a label. Hidden on desktop (see shop.css).
        // Status gets its own line with a colour-coded dot — it is the one fact
        // a customer needs before anything else, and it was previously buried
        // mid-sentence between the minimum order and the address.
        $is_open = (strpos($status, '🟢') !== false);
        printf(
            '<p class="alena-dz-hero-status%s"><span class="alena-dz-hero-status-dot" aria-hidden="true"></span>%s</p>',
            $is_open ? ' is-open' : ' is-closed',
            esc_html(trim(str_replace(['🟢', '🔴', '⏰'], '', $status)))
        );

        $meta = [
            'מינימום הזמנה ₪70',
            'משלוח מ-₪17',
            'רוטשילד 104, ראשון לציון',
        ];
        echo '<ul class="alena-dz-hero-meta">';
        foreach ($meta as $line) {
            echo '<li>' . esc_html($line) . '</li>';
        }
        echo '</ul>';

        $modes = $this->fulfilment_labels();
        $mode  = $this->current_fulfilment_mode();

        echo '<div class="alena-dz-hero-actions">';
        printf(
            '<button type="button" class="alena-dz-mode-switch" id="alena-mode-switch" data-mode="%s"'
            . ' aria-haspopup="dialog" aria-expanded="false">'
            . '<span class="alena-dz-mode-label">%s %s · %s</span>'
            . '<span class="alena-dz-mode-caret" aria-hidden="true">⌄</span></button>',
            esc_attr($mode),
            $modes[$mode]['icon'],
            esc_html($modes[$mode]['label']),
            esc_html($modes[$mode]['eta'])
        );
        echo '<button type="button" class="alena-dz-hero-act" id="alena-hero-share" aria-label="שיתוף">↗</button>';
        echo '</div>';
        echo '<p class="alena-dz-mode-hint">רוצים לאסוף לבד? לחצו על הכפתור כדי להחליף בין משלוח לאיסוף עצמי</p>';
        echo '</div>';
        echo '</section>';

        // The chooser. A button that silently flipped to the other mode gave no
        // clue what it would do or what the options even were; this shows both,
        // marks the current one, and never reloads the page.
        echo '<div class="alena-dz-mode-sheet" id="alena-mode-sheet" hidden>';
        echo '<div class="alena-dz-mode-sheet-backdrop" data-close="1"></div>';
        echo '<div class="alena-dz-mode-sheet-panel" role="dialog" aria-modal="true" aria-label="איך לקבל את ההזמנה">';
        echo '<span class="alena-dz-mode-sheet-grip" aria-hidden="true"></span>';
        echo '<h3 class="alena-dz-mode-sheet-title">איך לקבל את ההזמנה?</h3>';
        foreach ($modes as $key => $m) {
            printf(
                '<button type="button" class="alena-dz-mode-opt%s" data-mode="%s">'
                . '<span class="alena-dz-mode-opt-icon" aria-hidden="true">%s</span>'
                . '<span class="alena-dz-mode-opt-body">'
                . '<span class="alena-dz-mode-opt-label">%s</span>'
                . '<span class="alena-dz-mode-opt-sub">%s</span>'
                . '</span>'
                . '<span class="alena-dz-mode-opt-check" aria-hidden="true">✓</span>'
                . '</button>',
                $key === $mode ? ' is-active' : '',
                esc_attr($key),
                $m['icon'],
                esc_html($m['label']),
                esc_html($m['eta'])
            );
        }
        echo '</div>';
        echo '</div>';
    }

    /** Categories that must never supply the hero — this is the shop window. */
    const HERO_EXCLUDED_CATEGORIES = [
        'שתייה קלה', 'בירות | קוקטייל', 'קינוחים', 'תוספות',
        'סכו״ם ורטבים 🍴', 'שימו 💙',
    ];

    /** Up to $limit hero photos, best first — the phone header cycles them. */
    private function find_hero_image_urls(int $limit = 5): array {
        $exclude = [];
        foreach (self::HERO_EXCLUDED_CATEGORIES as $name) {
            $t = get_term_by('name', $name, 'product_cat');
            if ($t) $exclude[] = (int) $t->term_id;
        }
        $query = [
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => 24,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'fields'         => 'ids',
            'meta_query'     => [['key' => '_thumbnail_id', 'compare' => 'EXISTS']],
        ];
        if ($exclude) {
            $query['tax_query'] = [[
                'taxonomy' => 'product_cat',
                'field'    => 'term_id',
                'terms'    => $exclude,
                'operator' => 'NOT IN',
            ]];
        }
        $candidates = get_posts($query);
        $featured   = array_values(array_intersect(wc_get_featured_product_ids(), $candidates));
        // Featured first, then the rest — so a short featured list still fills
        // the carousel instead of leaving it with one slide.
        $ordered = array_values(array_unique(array_merge($featured, $candidates)));

        $urls = [];
        foreach ($ordered as $pid) {
            $img = wp_get_attachment_image_url(get_post_thumbnail_id($pid), 'large');
            if ($img && !in_array($img, $urls, true)) $urls[] = $img;
            if (count($urls) >= $limit) break;
        }
        return $urls;
    }

    private function find_hero_image_url(): ?string {
        // The hero used to pick a random product, which is how a bottle of
        // mineral water ended up as the first thing a customer sees. Draw from
        // main dishes only, newest first so a fresh photo surfaces on its own.
        $exclude = [];
        foreach (self::HERO_EXCLUDED_CATEGORIES as $name) {
            $t = get_term_by('name', $name, 'product_cat');
            if ($t) $exclude[] = (int) $t->term_id;
        }

        $query = [
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => 12,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'fields'         => 'ids',
            'meta_query'     => [['key' => '_thumbnail_id', 'compare' => 'EXISTS']],
        ];
        if ($exclude) {
            $query['tax_query'] = [[
                'taxonomy' => 'product_cat',
                'field'    => 'term_id',
                'terms'    => $exclude,
                'operator' => 'NOT IN',
            ]];
        }
        $candidates = get_posts($query);

        // Featured dishes still win when the owner has marked any.
        $featured = array_values(array_intersect(wc_get_featured_product_ids(), $candidates));
        if ($featured) $candidates = $featured;
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
        // Emitted straight into the markup rather than read off AlenaWelcome:
        // that object is localized on a footer script, so it does not exist yet
        // when this inline block runs in the body. Guarding on it meant the
        // fulfilment switch never bound a click handler at all.
        $labels = [];
        foreach ($this->fulfilment_labels() as $key => $m) {
            $labels[$key] = $m['icon'] . ' ' . $m['label'] . ' · ' . $m['eta'];
        }
        $mode_cfg = wp_json_encode([
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('alena_welcome'),
            'labels'  => $labels,
        ]);
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

        // Header fulfilment switch. Posts to alena_set_mode, which touches the
        // mode only — ajax_welcome_save would have cleared the saved address.
        (function () {
          const cfg   = <?php echo $mode_cfg; ?>;
          const btn   = document.getElementById('alena-mode-switch');
          const sheet = document.getElementById('alena-mode-sheet');

          if (btn && sheet) {
            const label = btn.querySelector('.alena-dz-mode-label');
            const opts  = sheet.querySelectorAll('.alena-dz-mode-opt');

            function open() {
              sheet.hidden = false;
              // A timer rather than requestAnimationFrame: rAF does not fire in a
              // tab that is not painting, and without `is-open` the sheet stays
              // fully transparent while still covering the screen — invisible,
              // and swallowing every tap.
              setTimeout(() => sheet.classList.add('is-open'), 16);
              btn.setAttribute('aria-expanded', 'true');
            }
            function close() {
              sheet.classList.remove('is-open');
              btn.setAttribute('aria-expanded', 'false');
              setTimeout(() => { sheet.hidden = true; }, 200);
            }

            btn.addEventListener('click', open);
            sheet.addEventListener('click', e => { if (e.target.dataset.close) close(); });
            document.addEventListener('keydown', e => {
              if (e.key === 'Escape' && !sheet.hidden) close();
            });

            opts.forEach(opt => {
              opt.addEventListener('click', () => {
                const next = opt.dataset.mode;
                if (next === btn.dataset.mode) { close(); return; }

                // Update and close straight away. The page does not reload: the
                // menu looks the same either way, and the cart reads the mode
                // from the session when the customer gets there. Reloading here
                // is what made the switch feel like it had jammed.
                opts.forEach(o => o.classList.toggle('is-active', o === opt));
                btn.dataset.mode = next;
                if (label && cfg.labels[next]) label.textContent = cfg.labels[next];
                close();

                fetch(cfg.ajaxUrl, {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    action: 'alena_set_mode',
                    nonce: cfg.nonce,
                    mode: next
                  })
                }).catch(() => {});
              });
            });
          }

          // Header photo carousel. Cross-fade only — no layout movement, and it
          // stops entirely for anyone who asked for reduced motion.
          const slides = document.querySelectorAll('.alena-dz-hero-slide');
          if (slides.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            let i = 0;
            setInterval(function () {
              slides[i].classList.remove('is-active');
              i = (i + 1) % slides.length;
              slides[i].classList.add('is-active');
            }, 4500);
          }

          const share = document.getElementById('alena-hero-share');
          if (share) {
            share.addEventListener('click', function () {
              const data = { title: document.title, url: location.href };
              if (navigator.share) navigator.share(data).catch(() => {});
              else if (navigator.clipboard) navigator.clipboard.writeText(location.href);
            });
          }
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

    /**
     * "המוזמנים ביותר" — top 6 by total_sales meta. Wolt-style horizontal
     * scrollable row at the top of the menu, before the regular categories.
     */
    public function render_popular_section() {
        $products = wc_get_products([
            'status'   => 'publish',
            'limit'    => 6,
            'orderby'  => 'meta_value_num',
            'meta_key' => 'total_sales',
            'order'    => 'DESC',
            'meta_query' => [
                ['key' => 'total_sales', 'value' => 0, 'compare' => '>'],
            ],
        ]);
        $products = array_filter($products, function ($p) {
            $price = $p->get_price();
            return $price !== '' && (float) $price > 0;
        });
        if (count($products) < 3) return; // not enough signal

        echo '<section class="alena-dz-cat-section alena-dz-cat-section-popular" id="alena-cat-popular">';
        echo '<h2 class="alena-dz-cat-title">🔥 המוזמנים ביותר</h2>';
        echo '<ul class="alena-dz-products alena-dz-products-popular">';
        foreach ($products as $product) {
            $this->render_product_card($product);
        }
        echo '</ul>';
        echo '</section>';
    }

    public function render_grouped_products() {
        $terms = $this->ordered_visible_terms();
        if (!$terms) {
            echo '<p>אין מוצרים זמינים כרגע.</p>';
            return;
        }
        echo '<div class="alena-dz-shop-sections">';
        $this->render_popular_section();
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
        // 18 words overflowed the 2-line clamp and cut mid-sentence; 12 fits.
        $desc    = wp_trim_words(strip_tags($desc), 12, '…');
        $img     = $product->get_image('woocommerce_thumbnail', ['class' => 'alena-dz-card-img']);
        $url     = get_permalink($id);
        $add_url = '?add-to-cart=' . $id;
        $is_featured = $product->is_featured();

        // Detect if the product has any REQUIRED (min ≥ 1) modifier group —
        // if not, the card can use a one-tap stepper instead of opening the modal.
        $has_required_mods = false;
        if (class_exists('Alena_DZ_Modifiers')) {
            try {
                $mods = Alena_DZ_Modifiers::get_modifiers($id);
                foreach ((array) $mods as $g) {
                    if ((int) ($g['min'] ?? 0) >= 1) { $has_required_mods = true; break; }
                }
            } catch (\Throwable $e) { /* swallow */ }
        }
        $card_classes = 'alena-dz-card';
        if (!$has_required_mods) $card_classes .= ' alena-dz-card-stepperable';
        ?>
        <li class="<?php echo esc_attr($card_classes); ?>" data-product-id="<?php echo (int) $id; ?>">
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

        // Owner-defined order (wp-admin → סדר התפריט) wins when one exists.
        // CATEGORY_DISPLAY_ORDER stays as the seed for a site that never set one.
        if (class_exists('Alena_DZ_Menu_Order') && Alena_DZ_Menu_Order::cat_order()) {
            return Alena_DZ_Menu_Order::sort_terms($terms);
        }

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
