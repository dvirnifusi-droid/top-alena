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
        add_action('template_redirect', [$this, 'maybe_render']);
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
        // /zohara is Zohara's front door: same shop, pinned to its brand. A
        // redirect keeps all the shop machinery and one shared cart, so a
        // customer can still cross over to Alena in the same order.
        add_rewrite_rule('^zohara/?$', 'index.php?alena_zohara_entry=1', 'top');
        // Self-heal: flush once so /order resolves without visiting Permalinks.
        if (get_option('alena_order_rewrite_v') !== '3') {
            flush_rewrite_rules(false);
            update_option('alena_order_rewrite_v', '3');
        }
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
        if ($path === 'zohara' || get_query_var('alena_zohara_entry')) {
            wp_safe_redirect(home_url('/shop/') . '?brand=zohara', 302);
            exit;
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

        get_header();
        ?>
        <div class="alena-order-landing" dir="rtl">
          <div class="alena-order-head">
            <h1>מה בא לכם היום?</h1>
            <p>שתי מסעדות, סל אחד — אפשר להזמין משתיהן יחד</p>
          </div>

          <div class="alena-order-cards">
            <?php
            $this->card('עלינא בפיתה', 'מטבח ים-תיכוני שמח וצבעוני', $alena_img, $alena, $shop . '?brand=alena');
            $this->card('חומוס זוהרה', 'זאת לא עוד חומוסייה, זו זוהרה', $zohara_img, $zohara, $shop . '?brand=zohara');
            ?>
          </div>

          <a class="alena-order-both" href="<?php echo esc_url($shop); ?>">להזמין משתיהן יחד →</a>
        </div>
        <?php
        get_footer();
        exit;
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
