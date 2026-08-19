<?php
if (!defined('ABSPATH')) exit;

/**
 * The /order landing page + its QR code, and the brand tag on cart lines.
 *
 * Phase 4 of docs/ZOHARA-SECOND-BRAND-SPEC.md. The page shows both kitchens
 * with a live open/closed status and sends the customer into the shared menu.
 *
 * Why the barcode points here and not at a menu: a printed flyer is forever.
 * With the QR aimed at a page we control, everything behind it -- a third
 * brand, a promo, a new design -- can change without reprinting. A QR straight
 * to /shop would lock the flyer to today's menu.
 */
class Alena_DZ_Order_Landing {

    const SLUG = 'order';

    public function __construct() {
        add_action('init', [$this, 'add_rewrite']);
        add_filter('query_vars', [$this, 'query_var']);
        // Priority 1: the entry gate and the /order + /zohara handling must run
        // BEFORE the site's home-page landing redirect. When a plugin update
        // drops the /order rewrite, WordPress resolves /order as the home page,
        // and the landing (registered earlier, default priority) would otherwise
        // swallow it. Running first — and matching /order by path — makes this
        // immune to the rewrite cache.
        add_action('template_redirect', [$this, 'maybe_render'], 1);
        add_action('admin_menu', [$this, 'menu']);

        // Where each line came from, on the cart and checkout summary.
        add_filter('woocommerce_cart_item_name', [$this, 'brand_tag'], 20, 3);
    }

    public function menu() {
        add_submenu_page(
            'alena-delivery-zones',
            'דף הזמנה + ברקוד',
            'דף הזמנה + ברקוד',
            'manage_options',
            'alena-order-qr',
            [$this, 'render_qr_admin']
        );
    }

    public function render_qr_admin() {
        // Two codes. The pretty /zohara URL is intercepted before our code runs
        // (WordPress 404 URL-guessing, or the proxy, bounces it to the home
        // page and no plugin hook could stop it), so the Zohara code points at
        // the direct /shop/?brand=zohara -- which renders the fully branded
        // Zohara menu. A flyer QR is scanned, never typed, so the longer URL
        // costs nothing.
        $both   = home_url('/' . self::SLUG);
        $zohara = home_url('/shop/') . '?brand=zohara';
        wp_enqueue_script('alena-qrcode', ALENA_DZ_URL . 'assets/qrcode.min.js', [], ALENA_DZ_VERSION, true);
        ?>
        <div class="wrap" dir="rtl">
          <h1>ברקודים לפלייר</h1>
          <p>כל ברקוד מפנה לדף שאנחנו שולטים בו — אפשר לשנות הכל אחריו (מבצע, עיצוב, מותג) <strong>בלי להדפיס מחדש</strong>.</p>
          <div style="display:flex;gap:36px;flex-wrap:wrap">
            <div>
              <h2>שתי המסעדות</h2>
              <p><a href="<?php echo esc_url($both); ?>" target="_blank"><code><?php echo esc_html($both); ?></code></a></p>
              <div id="qr-both" data-url="<?php echo esc_attr($both); ?>" data-file="alena-zohara-order-qr.png"
                   style="background:#fff;padding:16px;display:inline-block;border-radius:12px"></div>
              <p><button class="button" data-dl="qr-both">הורדה (PNG)</button></p>
            </div>
            <div>
              <h2>חומוס זוהרה בלבד</h2>
              <p><a href="<?php echo esc_url($zohara); ?>" target="_blank"><code><?php echo esc_html($zohara); ?></code></a></p>
              <div id="qr-zohara" data-url="<?php echo esc_attr($zohara); ?>" data-file="zohara-qr.png"
                   style="background:#fff;padding:16px;display:inline-block;border-radius:12px"></div>
              <p><button class="button" data-dl="qr-zohara">הורדה (PNG)</button></p>
            </div>
          </div>
          <script>
          (function () {
            function draw(){
              document.querySelectorAll('[id^="qr-"]').forEach(function(box){
                new QRCode(box, { text: box.dataset.url, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });
              });
              document.querySelectorAll('[data-dl]').forEach(function(btn){
                btn.addEventListener('click', function(){
                  var box = document.getElementById(btn.dataset.dl);
                  var img = box.querySelector('img') || box.querySelector('canvas');
                  var src = img.tagName === 'IMG' ? img.src : img.toDataURL('image/png');
                  var a = document.createElement('a'); a.href = src; a.download = box.dataset.file; a.click();
                });
              });
            }
            (function wait(){ if (typeof QRCode!=='undefined') draw(); else setTimeout(wait,60); })();
          })();
          </script>
        </div>
        <?php
    }

    public function add_rewrite() {
        add_rewrite_rule('^' . self::SLUG . '/?$', 'index.php?alena_order_page=1', 'top');
        $this->ensure_zohara_page();
        // Self-heal: flush once so /order resolves without visiting Permalinks.
        if (get_option('alena_order_rewrite_v') !== '3') {
            flush_rewrite_rules(false);
            update_option('alena_order_rewrite_v', '3');
        }
    }

    /**
     * A real published page at /zohara. The rewrite-rule route was intercepted
     * by WordPress's 404 URL-guessing before any hook could redirect it; a page
     * that actually exists is never a 404, so nothing guesses it away. The page
     * itself just redirects to the branded menu (see maybe_render).
     */
    private function ensure_zohara_page() {
        if (get_option('alena_zohara_page_v') === '1') return;
        $existing = get_page_by_path('zohara');
        if (!$existing) {
            wp_insert_post([
                'post_title'   => 'חומוס זוהרה',
                'post_name'    => 'zohara',
                'post_status'  => 'publish',
                'post_type'    => 'page',
                'post_content' => '',
            ]);
        }
        update_option('alena_zohara_page_v', '1');
    }

    public function query_var($vars) {
        $vars[] = 'alena_order_page';
        return $vars;
    }

    private function brand_status(string $brand): array {
        $open = class_exists('Alena_DZ_Brands') ? Alena_DZ_Brands::is_open($brand) : true;
        $sub  = '';
        if (class_exists('Alena_DZ_Brands')) {
            $sub = $open ? Alena_DZ_Brands::open_until($brand) : Alena_DZ_Brands::closed_label($brand);
        }
        return ['open' => $open, 'sub' => $sub];
    }

    private function is_order_request(): bool {
        if (get_query_var('alena_order_page')) return true;
        // Rewrite flushing is fragile across plugin updates; match the path
        // directly so /order resolves regardless of the rule cache.
        $path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '', '/');
        return strtolower($path) === self::SLUG;
    }

    public function maybe_zohara_entry() {
        $path = strtolower(trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '', '/'));
        if (!get_query_var('alena_zohara_entry') && $path !== 'zohara') return;
        // wc_get_page_permalink('shop') resolved to the site root on this
        // install, which bounced /zohara to the home page. The menu is at
        // /shop/, verified working; build the target from there directly.
        $shop = home_url('/shop/');
        wp_safe_redirect($shop . '?brand=zohara', 302);
        exit;
    }

    public function maybe_render() {
        // /zohara is handled on the SAME hook that provably reaches /order.
        // The init/template_redirect variants never fired here; this one does.
        $path = strtolower(trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '', '/'));
        if ($path === 'zohara' || is_page('zohara') || get_query_var('alena_zohara_entry')) {
            wp_safe_redirect(home_url('/shop/') . '?brand=zohara', 302);
            exit;
        }

        // Entry gate: the brand chooser is the front door. A fresh visit to the
        // menu with no brand chosen is sent to /order first. Choosing a brand
        // (?brand=…) — or having chosen anytime in the last 30 days — lets the
        // menu through, so it never loops and never nags mid-session.
        if (function_exists('is_shop') && is_shop() && !is_admin()) {
            $has_brand = isset($_GET['brand']) && $_GET['brand'] !== '';
            $entered   = !empty($_COOKIE['alena_entered']);
            if ($has_brand) {
                if (!$entered && !headers_sent()) {
                    setcookie('alena_entered', '1', time() + 2592000, COOKIEPATH ?: '/');
                }
            } elseif (!$entered) {
                wp_safe_redirect(home_url('/' . self::SLUG), 302);
                exit;
            }
        }

        if (!$this->is_order_request()) return;
        // WordPress resolved /order as a 404 before we got here, so clear that
        // on the main query or the theme prints "page not found" in the title.
        global $wp_query;
        $wp_query->is_404 = false;
        status_header(200);

        $shop = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $alena  = $this->brand_status('alena');
        $zohara = $this->brand_status('zohara');

        // Owner-set brand art (Media Library), falling back to nothing rather
        // than a broken image.
        $alena_img  = get_option('alena_brand_img_alena', '');
        $zohara_img = get_option('alena_brand_img_zohara', '');

        // Reaching the chooser counts as entering, so the menu is not re-gated.
        if (!headers_sent()) {
            setcookie('alena_entered', '1', time() + 2592000, COOKIEPATH ?: '/');
        }
        // The card + club styling live in stylesheets that only auto-load on WC
        // pages. /order is not a WC page, so without these the brand cards render
        // as raw unstyled text — enqueue them here explicitly.
        wp_enqueue_style('alena-dz-dark-mobile', ALENA_DZ_URL . 'assets/dark-mobile.css', [], ALENA_DZ_VERSION);
        wp_enqueue_style('alena-club', ALENA_DZ_URL . 'assets/club.css', [], ALENA_DZ_VERSION);

        // A standalone page on purpose — NOT get_header()/get_footer(). The
        // theme's top nav and its menu block are chrome the entry page does not
        // need, and .alena-order-landing was written for a standalone page (its
        // own dark background, centred column). wp_head()/wp_footer() still fire,
        // so every enqueued style and script — cards, club banner, cart — loads.
        ?><!doctype html>
        <html <?php language_attributes(); ?>>
        <head>
          <meta charset="<?php bloginfo('charset'); ?>">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <?php wp_head(); ?>
          <style>
            /* The entry page is its own front door — no nav chrome on top of it.
               Hides the theme header/menu AND the plugin's own top nav (.alena-tn);
               the brand cards, account strip and bottom cart bar are all the
               navigation this page needs. */
            #alena-official-link, .elementor-location-header, #masthead, header#masthead,
            #site-header, .site-header, #colophon, footer.site-footer,
            .alena-tn, .alena-top-nav { display:none !important; }
            html, body { background:#0e1117; margin:0; }
            .alena-order-landing { padding-top: 40px; }
          </style>
        </head>
        <body <?php body_class('alena-order-page'); ?>>
        <div class="alena-order-landing" dir="rtl">
          <div class="alena-order-head">
            <h1>מה בא לכם היום?</h1>
            <p>שתי מסעדות, סל אחד — אפשר להזמין משתיהן יחד</p>
          </div>

          <?php $this->render_account_strip(); ?>

          <div class="alena-order-cards">
            <?php
            $this->card('עלינא בפיתה', 'מטבח ים-תיכוני שמח וצבעוני', $alena_img, $alena, $shop . '?brand=alena');
            $this->card('חומוס זוהרה', 'זאת לא עוד חומוסייה, זו זוהרה', $zohara_img, $zohara, $shop . '?brand=zohara');
            ?>
          </div>

          <a class="alena-order-both" href="<?php echo esc_url($shop . '?brand=all'); ?>">להזמין משתיהן יחד →</a>
        </div>
        <?php wp_footer(); ?>
        </body>
        </html>
        <?php
        exit;
    }

    /**
     * The account strip at the top of the entry page — this is where a known
     * customer sees their benefits up front. Logged-in members get the full
     * club banner (name, tier, points, ₪ waiting); everyone else gets one
     * prominent, skippable login button. The menu itself stays open either way.
     */
    private function render_account_strip() {
        ?>
        <style>
        .alena-order-login{display:flex;align-items:center;gap:12px;max-width:560px;margin:0 auto 18px;
          padding:14px 18px;border-radius:16px;text-decoration:none;
          background:linear-gradient(135deg,rgba(184,149,86,0.22),rgba(184,149,86,0.10));
          border:1px solid rgba(184,149,86,0.45);color:inherit;transition:transform .15s ease}
        .alena-order-login:hover{transform:translateY(-2px)}
        .alena-order-login-emoji{font-size:26px;line-height:1}
        .alena-order-login-text{flex:1;display:flex;flex-direction:column;gap:2px}
        .alena-order-login-text strong{font-size:16px;font-weight:800}
        .alena-order-login-text small{font-size:12.5px;opacity:.75}
        .alena-order-login-badge{align-self:flex-start;margin:3px 0;padding:3px 10px;border-radius:999px;
          font-size:12.5px;font-weight:800;background:#B89556;color:#1F1B17}
        .alena-order-login-arrow{font-size:22px;opacity:.6}
        .alena-order-account{max-width:560px;margin:0 auto 18px}
        .alena-order-account .alena-order-login{margin:0 0 8px}
        .alena-order-guest{display:block;text-align:center;color:#9fb0c7;text-decoration:underline;
          text-underline-offset:3px;font-size:13.5px;padding:6px}
        .alena-order-guest:hover{color:#f4ecd8}
        </style>
        <?php
        if (is_user_logged_in()) {
            if (class_exists('Alena_DZ_Club')) {
                ob_start();
                (new Alena_DZ_Club())->render_shop_banner();
                $html = ob_get_clean();
                if (trim($html) !== '') { echo $html; return; }
            }
            // Logged in but not a club member yet — invite them to join.
            $acct = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';
            $inc  = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '';
            ?>
            <a class="alena-order-login" href="<?php echo esc_url($acct); ?>">
              <span class="alena-order-login-emoji">🎁</span>
              <span class="alena-order-login-text">
                <strong>הצטרפו למועדון הלקוחות</strong>
                <?php if ($inc): ?><span class="alena-order-login-badge">🎁 <?php echo esc_html($inc); ?></span><?php endif; ?>
                <small>האיזור האישי שלך · ההזמנות וההטבות ←</small>
              </span>
              <span class="alena-order-login-arrow">←</span>
            </a>
            <?php
            return;
        }

        $acct  = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '/my-account/';
        $login = add_query_arg('next', 'order', $acct);
        $shop  = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
        $incentive = class_exists('Alena_DZ_Club') ? Alena_DZ_Club::join_incentive() : '';
        ?>
        <div class="alena-order-account">
          <a class="alena-order-login" href="<?php echo esc_url($login); ?>">
            <span class="alena-order-login-emoji">🎁</span>
            <span class="alena-order-login-text">
              <strong>התחברות / הרשמה למועדון</strong>
              <?php if ($incentive): ?>
                <span class="alena-order-login-badge">🎁 <?php echo esc_html($incentive); ?></span>
              <?php endif; ?>
              <small>טלפון + קוד · חדשים נרשמים באותו מקום, בשנייה</small>
            </span>
            <span class="alena-order-login-arrow">←</span>
          </a>
          <a class="alena-order-guest" href="<?php echo esc_url($shop . '?brand=all'); ?>">להמשיך בלי התחברות ←</a>
        </div>
        <?php
    }

    private function card($name, $tagline, $img, $status, $href) {
        $closed = empty($status['open']);
        ?>
        <a class="alena-order-card<?php echo $closed ? ' is-closed' : ''; ?>" href="<?php echo esc_url($href); ?>">
          <?php if ($img): ?>
            <span class="alena-order-card-img" style="background-image:url('<?php echo esc_url($img); ?>')"></span>
          <?php endif; ?>
          <span class="alena-order-card-body">
            <span class="alena-order-card-name"><?php echo esc_html($name); ?></span>
            <span class="alena-order-card-tag"><?php echo esc_html($tagline); ?></span>
            <span class="alena-order-card-status <?php echo $closed ? 'closed' : 'open'; ?>">
              <?php echo $closed ? '🔴 ' : '🟢 '; ?>
              <?php echo esc_html($status['sub'] ?: ($closed ? 'סגור כרגע' : 'פתוח עכשיו')); ?>
            </span>
          </span>
        </a>
        <?php
    }

    /** "· עלינא" / "· זוהרה" after a cart line, only once Zohara has products. */
    public function brand_tag($name, $cart_item, $cart_item_key) {
        if (!class_exists('Alena_DZ_Brands')) return $name;
        $pid = $cart_item['product_id'] ?? 0;
        if (!$pid) return $name;
        $brand = Alena_DZ_Brands::brand_of($pid);
        if ($brand !== 'zohara') return $name;   // Alena is the default; no tag needed
        return $name . ' <span class="alena-line-brand">· זוהרה</span>';
    }
}
