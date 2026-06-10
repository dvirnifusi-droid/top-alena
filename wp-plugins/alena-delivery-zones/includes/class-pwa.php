<?php
if (!defined('ABSPATH')) exit;

/**
 * Basic PWA (Progressive Web App) setup:
 *   - Manifest at /alena-manifest.json (served via rewrite handler)
 *   - Service worker at /alena-sw.js
 *   - <link rel="manifest"> in head
 *
 * Lets customers "Add to Home Screen" on mobile and use the site offline-first.
 */
class Alena_DZ_PWA {

    public function __construct() {
        add_action('init',            [$this, 'add_rewrites']);
        add_action('parse_request',   [$this, 'handle_pwa_requests']);
        add_action('wp_head',         [$this, 'inject_head']);
    }

    public function add_rewrites() {
        add_rewrite_rule('^alena-manifest\.json$', 'index.php?alena_pwa=manifest', 'top');
        add_rewrite_rule('^alena-sw\.js$',         'index.php?alena_pwa=sw',       'top');
        add_filter('query_vars', function ($v) { $v[] = 'alena_pwa'; return $v; });
    }

    public function handle_pwa_requests($wp) {
        $type = $wp->query_vars['alena_pwa'] ?? '';
        if (!$type) return;
        if ($type === 'manifest') {
            header('Content-Type: application/manifest+json');
            echo wp_json_encode($this->manifest(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if ($type === 'sw') {
            header('Content-Type: application/javascript');
            echo $this->service_worker_js();
            exit;
        }
    }

    private function manifest(): array {
        return [
            'name'             => 'עלינא בפיתה',
            'short_name'       => 'עלינא',
            'description'      => 'מטבח ים-תיכוני שמח וצבעוני · כשר',
            'start_url'        => home_url('/shop/'),
            'display'          => 'standalone',
            'orientation'      => 'portrait',
            'background_color' => '#faf6f1',
            'theme_color'      => '#f4a895',
            'lang'             => 'he',
            'dir'              => 'rtl',
            'icons'            => [
                ['src' => $this->icon_url(192), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'],
                ['src' => $this->icon_url(512), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'],
            ],
        ];
    }

    private function icon_url(int $size): string {
        // Fall back to the site icon if PWA icons not provided
        $custom = get_site_icon_url($size);
        return $custom ?: (admin_url('images/wordpress-logo.svg'));
    }

    private function service_worker_js(): string {
        return <<<JS
const CACHE_NAME = 'alena-v1';
const ESSENTIAL = [ '/shop/' ];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ESSENTIAL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => { self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).catch(() => caches.match('/shop/')))
  );
});
JS;
    }

    public function inject_head() {
        if (is_admin()) return;
        echo '<link rel="manifest" href="' . esc_url(home_url('/alena-manifest.json')) . '">';
        echo '<meta name="theme-color" content="#f4a895">';
        echo '<meta name="apple-mobile-web-app-capable" content="yes">';
        echo '<meta name="apple-mobile-web-app-status-bar-style" content="default">';
        echo '<meta name="apple-mobile-web-app-title" content="עלינא">';
        echo '<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("' . esc_url(home_url('/alena-sw.js')) . '").catch(()=>{});</script>';
    }
}
