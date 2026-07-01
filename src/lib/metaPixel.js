// Meta Pixel — thin wrapper around fbq. Idempotent: initMetaPixel() safe to
// call from multiple mounts, script + fbq('init') run once. No-op when the
// env var is missing so dev builds don't ping Meta.

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

let initialized = false;

function loadFbEvents() {
  if (typeof window === 'undefined' || window.fbq) return;
  // Snippet copied verbatim from Meta's install code, translated to JS-only.
  const n = (window.fbq = function () {
    n.callMethod
      ? n.callMethod.apply(n, arguments)
      : n.queue.push(arguments);
  });
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const t = document.createElement('script');
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(t, s);
}

export function initMetaPixel() {
  if (!PIXEL_ID || initialized) return;
  loadFbEvents();
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
  initialized = true;
}

export function trackLead(params) {
  if (!PIXEL_ID || !window.fbq) return;
  window.fbq('track', 'Lead', params || {});
}
