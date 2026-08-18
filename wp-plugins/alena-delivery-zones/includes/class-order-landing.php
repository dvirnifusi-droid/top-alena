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
        $url = home_url('/' . self::SLUG);
        wp_enqueue_script('alena-qrcode', ALENA_DZ_URL . 'assets/qrcode.min.js', [], ALENA_DZ_VERSION, true);
        ?>
        <div class="wrap" dir="rtl">
          <h1>דף הזמנה + ברקוד לפלייר</h1>
          <p>הדף הציבורי: <a href="<?php echo esc_url($url); ?>" target="_blank"><code><?php echo esc_html($url); ?></code></a></p>
          <p>הברקוד מפנה לדף הזה — לא לתפריט מסוים. כך אפשר לשנות הכל אחריו (מבצע, מותג נוסף, עיצוב) <strong>בלי להדפיס מחדש</strong> את הפלייר.</p>
          <div id="alena-qr" style="background:#fff;padding:16px;display:inline-block;border-radius:12px"></div>
          <p><button class="button button-primary" id="alena-qr-dl">הורדת הברקוד (PNG)</button></p>
          <script>
          (function () {
            function draw(){
            new QRCode(document.getElementById('alena-qr'), {
              text: <?php echo wp_json_encode($url); ?>,
              width: 320, height: 320, correctLevel: QRCode.CorrectLevel.M
            });
            document.getElementById('alena-qr-dl').addEventListener('click', function () {
              var img = document.querySelector('#alena-qr img') || document.querySelector('#alena-qr canvas');
              var src = img.tagName === 'IMG' ? img.src : img.toDataURL('image/png');
              var a = document.createElement('a');
              a.href = src; a.download = 'zohara-alena-order-qr.png'; a.click();
            });
            }
            // qrcode.min.js is enqueued in the footer, so this body script runs
            // first; wait for the library rather than racing it.
            (function wait(){ if (typeof QRCode!=='undefined') draw(); else setTimeout(wait,60); })();
          })();
          </script>
        </div>
        <?php
    }

    public function add_rewrite() {
        add_rewrite_rule('^' . self::SLUG . '/?$', 'index.php?alena_order_page=1', 'top');
        // Self-heal: flush once so /order resolves without visiting Permalinks.
        if (get_option('alena_order_rewrite_v') !== '2') {
            flush_rewrite_rules(false);
            update_option('alena_order_rewrite_v', '2');
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

    public function maybe_render() {
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
