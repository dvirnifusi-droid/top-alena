// TOP APOLLO service worker: Web Push + offline app shell.
// Bump CACHE on any deploy that must purge stale clients — activate deletes
// every cache whose name !== CACHE, so a version bump force-refreshes assets
// for every browser (fixes stale bundles cached by an older SW).
const CACHE = 'topapollo-v6';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png?v=3', '/icons/icon-512.png?v=3'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache API calls — always go to network.
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigations: ALWAYS fetch fresh HTML (no-store) so a new deploy's
  // index.html — which references the new content-hashed bundle — is never
  // served from a stale HTTP/SW cache. Falls back to cached shell only offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('/').then((r) => r || caches.match(req))),
    );
    return;
  }

  // Content-hashed build assets + icons: cache-first (filenames change on deploy).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Only cache successful responses — caching a 404 (e.g. an asset that
            // was briefly missing mid-deploy) would pin the broken state on the
            // client forever. Never store a non-OK response.
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'עלינא', body: event.data && event.data.text ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'עלינא', {
      body: data.body || data.message || '',
      icon: '/icons/icon-192.png?v=1',
      badge: '/icons/icon-192.png?v=1',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || '/QueueJoin' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/QueueJoin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(target); return w.focus(); }
      }
      return clients.openWindow(target);
    }),
  );
});
