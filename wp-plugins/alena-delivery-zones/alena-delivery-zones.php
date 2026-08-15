<?php
/**
 * Plugin Name: Alena Delivery Zones
 * Description: Google Maps polygon-based delivery zones for WooCommerce. Owner draws delivery polygons on a map; the plugin adds a WC shipping method that geocodes the customer address and matches it to the right polygon (fee, min-order).
 * Version: 0.53.0
 * Author: Alena / TOPALENA
 * Requires PHP: 7.4
 * Requires at least: 6.5
 * WC tested up to: 9.9
 * Text Domain: alena-dz
 */

if (!defined('ABSPATH')) exit;

define('ALENA_DZ_VERSION', '0.53.0');
define('ALENA_DZ_PATH', plugin_dir_path(__FILE__));
define('ALENA_DZ_URL',  plugin_dir_url(__FILE__));

require_once ALENA_DZ_PATH . 'includes/class-polygon-store.php';
require_once ALENA_DZ_PATH . 'includes/class-geocoder.php';
require_once ALENA_DZ_PATH . 'includes/class-admin.php';
require_once ALENA_DZ_PATH . 'includes/class-checkout-fields.php';
require_once ALENA_DZ_PATH . 'includes/class-checkout-map.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-engine.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-admin.php';
require_once ALENA_DZ_PATH . 'includes/class-hours-checkout.php';
require_once ALENA_DZ_PATH . 'includes/class-wolt-importer.php';
require_once ALENA_DZ_PATH . 'includes/class-shop-styling.php';
require_once ALENA_DZ_PATH . 'includes/class-menu-order.php';
require_once ALENA_DZ_PATH . 'includes/class-option-groups.php';
require_once ALENA_DZ_PATH . 'includes/class-menu-manager.php';
require_once ALENA_DZ_PATH . 'includes/class-address-autocomplete.php';
require_once ALENA_DZ_PATH . 'includes/class-modifiers.php';
require_once ALENA_DZ_PATH . 'includes/class-combos.php';
require_once ALENA_DZ_PATH . 'includes/class-cart-enhancements.php';
require_once ALENA_DZ_PATH . 'includes/class-mobile-ux.php';
require_once ALENA_DZ_PATH . 'includes/class-thank-you.php';
require_once ALENA_DZ_PATH . 'includes/class-order-scheduling.php';
require_once ALENA_DZ_PATH . 'includes/class-pwa.php';
require_once ALENA_DZ_PATH . 'includes/class-cart-redesign.php';
require_once ALENA_DZ_PATH . 'includes/class-checkout-redesign.php';
require_once ALENA_DZ_PATH . 'includes/class-top-nav.php';
require_once ALENA_DZ_PATH . 'includes/class-recent-orders.php';
require_once ALENA_DZ_PATH . 'includes/class-club.php';
require_once ALENA_DZ_PATH . 'includes/class-phone-auth.php';
require_once ALENA_DZ_PATH . 'includes/class-welcome.php';
require_once ALENA_DZ_PATH . 'includes/class-cart-drawer.php';
require_once ALENA_DZ_PATH . 'includes/class-order-alerts.php';
require_once ALENA_DZ_PATH . 'includes/class-order-rating.php';
// PayPlus — using the official PayPlus Payment Gateway plugin (maintained
// by PayPlus themselves, with signed digital invoices). Our native
// implementation is left in the codebase as reference but NOT loaded.
// require_once ALENA_DZ_PATH . 'includes/class-payplus.php';

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p><strong>Alena Delivery Zones</strong> requires WooCommerce to be active.</p></div>';
        });
        return;
    }
    new Alena_DZ_Admin();
    new Alena_DZ_Manager();
    new Alena_DZ_Checkout_Fields();
    new Alena_DZ_Checkout_Map();
    new Alena_DZ_Hours_Admin();
    new Alena_DZ_Hours_Checkout();
    new Alena_DZ_Wolt_Importer();
    new Alena_DZ_Shop_Styling();
    new Alena_DZ_Menu_Order();
    new Alena_DZ_Option_Groups();
    new Alena_DZ_Menu_Manager();
    new Alena_DZ_Address_Autocomplete();
    new Alena_DZ_Modifiers();
    new Alena_DZ_Combos();
    new Alena_DZ_Cart_Enhancements();
    new Alena_DZ_Mobile_UX();
    new Alena_DZ_Thank_You();
    new Alena_DZ_Order_Scheduling();
    new Alena_DZ_PWA();
    new Alena_DZ_Cart_Redesign();
    new Alena_DZ_Checkout_Redesign();
    new Alena_DZ_Top_Nav();
    new Alena_DZ_Recent_Orders();
    new Alena_DZ_Club();
    new Alena_DZ_Phone_Auth();
    new Alena_DZ_Welcome();
    new Alena_DZ_Cart_Drawer();
    new Alena_DZ_Order_Alerts();
    new Alena_DZ_Order_Rating();
    // Alena_DZ_PayPlus disabled — official PayPlus plugin handles checkout.
});

register_activation_hook(__FILE__, function () {
    // Flush rewrites so the PWA manifest/SW endpoints are reachable
    flush_rewrite_rules();
});

// Force the WooCommerce "Coming Soon" gate OFF — the shop must be public for customers.
// Intercept the option READ so it always returns 'no', regardless of what's stored in DB.
// Also overwrite the DB value once on plugin load so admin UI reflects reality.
add_filter('pre_option_woocommerce_coming_soon',     function () { return 'no'; });
add_filter('pre_option_woocommerce_store_pages_only', function () { return 'no'; });
add_filter('pre_option_woocommerce_private_link',     function () { return 'no'; });
add_action('plugins_loaded', function () {
    update_option('woocommerce_coming_soon',      'no');
    update_option('woocommerce_store_pages_only', 'no');
    update_option('woocommerce_private_link',     'no');
}, 1);

// Shipping method (class loads only after WC is ready)
add_action('woocommerce_shipping_init', function () {
    require_once ALENA_DZ_PATH . 'includes/class-shipping-method.php';
});

add_filter('woocommerce_shipping_methods', function ($methods) {
    $methods['alena_polygon'] = 'Alena_DZ_Shipping_Method';
    return $methods;
});

// Footer credit line the owner asked to remove. Emitted site-wide because
// brand.css only loads on WooCommerce pages, and the credit is in the theme
// footer on every page. Targets the one Elementor widget, not the whole footer.
add_action('wp_head', function () {
    if (is_admin()) return;
    echo '<style id="alena-hide-credit">.elementor-element-4fff1ffa{display:none !important}</style>' . "\n";
}, 99);

// SEO: consolidate brand authority around alena.topalena.com (showcase site)
add_action('wp_head', function () {
    echo "\n" . '<link rel="me" href="https://alena.topalena.com" />' . "\n";
    echo '<meta property="og:see_also" content="https://alena.topalena.com" />' . "\n";
}, 1);

// Force the brand name shown in Google to be "עלינא" (not "עלינא בפיתה").
// Overrides WP's blogname across the board — <title>, og:site_name, schema.
const ALENA_BRAND_NAME = 'עלינא';
add_filter('pre_option_blogname', function () { return ALENA_BRAND_NAME; });
add_filter('document_title_parts', function ($parts) {
    if (isset($parts['site']))  $parts['site']  = ALENA_BRAND_NAME;
    if (isset($parts['title']) && $parts['title'] === 'עלינא בפיתה') $parts['title'] = ALENA_BRAND_NAME;
    return $parts;
});
add_filter('document_title_separator', function ($sep) { return '·'; });

// Structured data + OG overrides so Google rebuilds the rich snippet cleanly
add_action('wp_head', function () {
    if (is_admin()) return;
    $home = home_url('/');
    $logo = get_site_icon_url(512) ?: '';
    ?>
    <meta property="og:site_name" content="עלינא" />
    <meta name="application-name" content="עלינא" />
    <meta name="apple-mobile-web-app-title" content="עלינא" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "name": "עלינא",
      "alternateName": ["עלינא בפיתה"],
      "url": "<?php echo esc_url($home); ?>",
      "logo": "<?php echo esc_url($logo); ?>",
      "image": "<?php echo esc_url($logo); ?>",
      "servesCuisine": ["מטבח ים-תיכוני", "כשר"],
      "priceRange": "₪₪",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "רוטשילד 104",
        "addressLocality": "ראשון לציון",
        "addressCountry": "IL"
      },
      "sameAs": [
        "https://alena.topalena.com",
        "https://alenabepita.co.il"
      ]
    }
    </script>
    <?php
}, 2);

// Strip every link that points to the legacy order.alenabepita.co.il widget —
// owner is replacing that flow with /shop, no link should drive customers there.
add_action('wp_footer', function () {
    if (is_admin()) return;
    ?>
    <script>
    (function(){
      function purge() {
        document.querySelectorAll('a[href*="order.alenabepita.co.il"]').forEach(function(a){
          // Replace href + remove visual presence so nothing accidental remains
          a.href = 'https://alena.topalena.com';
          a.removeAttribute('target');
          // If the whole element is just the order button, hide its container
          var btn = a.closest('.elementor-button-wrapper, .elementor-widget-button, .wp-block-button, .wp-block-buttons');
          if (btn) btn.style.display = 'none';
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', purge);
      } else {
        purge();
      }
      // Re-run a few times in case Elementor renders late
      setTimeout(purge, 800);
      setTimeout(purge, 2400);
    })();
    </script>
    <?php
}, 99);

// Footer banner pointing to the showcase site
add_action('wp_footer', function () {
    if (is_admin()) return;
    ?>
    <a href="https://alena.topalena.com" rel="noopener" id="alena-official-link"
       style="display:block;text-align:center;padding:18px 14px;background:linear-gradient(135deg,#1F1B17,#44512C);
              color:#F4ECD8;font-family:'Heebo',sans-serif;font-size:14px;text-decoration:none;
              border-top:3px solid #B89556;letter-spacing:0.02em;line-height:1.5">
      <span style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#D9BD83;display:block;margin-bottom:4px">
        האתר הרשמי
      </span>
      <b style="color:#F4ECD8;font-size:18px">alena.topalena.com</b>
      <span style="display:block;font-size:13px;color:rgba(244,236,216,0.8);margin-top:4px">
        תפריט מלא · אירועים פרטיים · הזמנת שולחן · בלוג
      </span>
    </a>
    <?php
});

// Home page = full-screen landing pointing to alena.topalena.com.
// The shop still lives at /shop while the delivery system is being built.
// Logged-in admins keep the normal theme so they can edit.
add_action('template_redirect', function () {
    if (is_admin()) return;
    if (current_user_can('edit_posts') && !empty($_GET['edit'])) return; // ?edit=1 bypass
    if (defined('REST_REQUEST') && REST_REQUEST) return;

    // Pages that should show the landing instead of the old Elementor content
    $is_landing_page = is_front_page() || is_home();
    if (!$is_landing_page) {
        $raw_path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
        $path = trim(rawurldecode($raw_path), '/');
        $landing_slugs = ['תפריטים', 'אודות', 'זכיינות', 'אירועים', 'menus', 'about', 'franchise', 'events'];
        if (in_array($path, $landing_slugs, true)) {
            $is_landing_page = true;
        }
    }
    if (!$is_landing_page) return;

    $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '/shop/';
    $hero_url = get_site_icon_url(512);

    nocache_headers();
    ?><!doctype html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
      <title>עלינא בפיתה</title>
      <link rel="icon" href="<?php echo esc_url($hero_url ?: '/favicon.ico'); ?>">
      <meta name="theme-color" content="#1F1B17">
      <style>
        *,*::before,*::after { box-sizing: border-box; }
        html,body { margin:0; padding:0; height:100%; font-family:'Heebo','Frank Ruhl Libre',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
        body {
          background: radial-gradient(circle at 30% 20%, #44512C 0%, #1F1B17 60%, #0e0d0a 100%);
          color:#F4ECD8;
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
        }
        body::before {
          content:""; position:fixed; inset:0;
          background-image: url('<?php echo esc_url($hero_url ?: ''); ?>');
          background-size: 220px; background-repeat:no-repeat; background-position: 50% 18%;
          opacity:0.08; pointer-events:none;
        }
        .alena-land-card {
          position:relative;
          width:100%;
          max-width:520px;
          background: linear-gradient(180deg, rgba(244,236,216,0.06), rgba(244,236,216,0.02));
          border: 1px solid rgba(184,149,86,0.35);
          border-radius: 28px;
          padding: 48px 36px 40px;
          text-align:center;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 30px 80px rgba(0,0,0,0.5);
        }
        .alena-land-logo {
          width:96px; height:96px; border-radius:24px; object-fit:cover;
          margin:0 auto 18px; display:block;
          box-shadow: 0 12px 32px rgba(0,0,0,0.4);
          background:#1F1B17;
        }
        .alena-land-eyebrow {
          font-size:12px; letter-spacing:0.4em; text-transform:uppercase;
          color:#D9BD83; font-weight:700; margin-bottom:8px;
        }
        .alena-land-title {
          font-family:'Frank Ruhl Libre',serif;
          font-size:48px; font-weight:900; margin:0 0 12px;
          color:#F4ECD8; letter-spacing:-0.02em;
        }
        .alena-land-sub {
          font-size:15px; color:rgba(244,236,216,0.78); line-height:1.6; margin:0 0 32px;
          font-weight:500;
        }
        .alena-land-cta {
          display:block; width:100%;
          background: linear-gradient(135deg,#F4ECD8,#D9BD83);
          color:#1F1B17 !important;
          text-decoration:none !important;
          font-weight:900; font-size:18px;
          padding:18px 28px; border-radius:18px;
          margin-bottom:14px;
          box-shadow: 0 12px 30px rgba(217,189,131,0.35);
          transition: transform .2s ease, box-shadow .2s ease;
          letter-spacing:0.02em;
        }
        .alena-land-cta:hover { transform:translateY(-3px); box-shadow:0 16px 36px rgba(217,189,131,0.5); }
        .alena-land-cta-sub {
          display:block; font-size:11px; opacity:0.7; font-weight:600;
          letter-spacing:0.2em; text-transform:uppercase; margin-top:4px;
        }
        .alena-land-secondary {
          display:inline-flex; align-items:center; gap:6px;
          color:rgba(244,236,216,0.62) !important;
          text-decoration:none !important;
          font-size:13px; font-weight:600; padding:10px 14px;
          border-radius:999px; transition:all .15s ease;
        }
        .alena-land-secondary:hover { color:#F4ECD8 !important; background:rgba(244,236,216,0.06); }
        .alena-land-foot {
          margin-top:24px;
          font-size:11px; letter-spacing:0.2em; text-transform:uppercase;
          color:rgba(244,236,216,0.4); font-weight:600;
        }
        @media (max-width:520px) {
          .alena-land-card { padding:36px 24px 28px; border-radius:22px; }
          .alena-land-title { font-size:36px; }
          .alena-land-logo { width:80px; height:80px; }
        }
      </style>
    </head>
    <body>
      <main class="alena-land-card">
        <?php if ($hero_url): ?>
          <img src="<?php echo esc_url($hero_url); ?>" alt="עלינא" class="alena-land-logo">
        <?php endif; ?>
        <div class="alena-land-eyebrow">עלינא</div>
        <h1 class="alena-land-title">ברוכים הבאים</h1>
        <p class="alena-land-sub">
          מטבח ים-תיכוני שמח וצבעוני · כשר · רוטשילד 104, ראשון לציון
        </p>

        <a class="alena-land-cta" href="https://alena.topalena.com" rel="noopener">
          לאתר הראשי ←
          <span class="alena-land-cta-sub">תפריט · אירועים · הזמנת שולחן · בלוג</span>
        </a>

        <div class="alena-land-foot">alenabepita.co.il</div>
      </main>
    </body>
    </html>
    <?php
    exit;
});

// Register the Google API key options for settings_fields()
add_action('admin_init', function () {
    register_setting('alena_dz', 'alena_dz_google_key', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('alena_dz', 'alena_dz_google_server_key', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
});
