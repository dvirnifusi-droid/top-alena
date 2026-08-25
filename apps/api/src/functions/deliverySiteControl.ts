// Control the alenabepita.co.il delivery site from inside TOP ALENA.
//
// The WordPress plugin exposes an authenticated bridge
// (/wp-json/alena/v1/control/settings, header X-Alena-Control-Key). The owner
// pastes the endpoint + key once (from the WP "מרכז שליטה" page); we keep them
// in IntegrationSecret, server-side only, and never hand the key to the browser.
// From then on the app READS and WRITES the club/benefits + feature settings.
//
// Owner-only: this changes the live storefront.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { resolveUserTier } from '../lib/pagePermissions.js';

const URL_KEY = 'ALENA_WP_CONTROL_URL';   // stores the full settings endpoint
const KEY_KEY = 'ALENA_WP_CONTROL_KEY';

async function requireOwner(user: any): Promise<void> {
  if (!user) throw new Error('forbidden');
  const t = await resolveUserTier(user).catch(() => null);
  if (!t?.is_owner) throw new Error('forbidden');
}

async function getSecret(key: string): Promise<string> {
  try {
    const r = await prisma.integrationSecret.findFirst({ where: { key } });
    if (r?.value) return r.value;
  } catch {}
  return process.env[key] || '';
}

async function saveSecret(key: string, value: string, note: string): Promise<void> {
  const existing = await prisma.integrationSecret.findFirst({ where: { key } });
  if (existing) {
    await prisma.integrationSecret.update({ where: { id: existing.id }, data: { value, note, updated_at: new Date() } });
  } else {
    await prisma.integrationSecret.create({ data: { key, value, note, updated_at: new Date() } });
  }
}

// The delivery site sits behind an aggressive nginx cache that keys on URL and
// ignores our auth header — it would serve a stale 401 to an authorised call.
// A unique query param per request guarantees a cache miss → the real response.
function bust(u: string): string {
  return u + (u.includes('?') ? '&' : '?') + '_=' + Date.now();
}

async function callWp(method: 'GET' | 'POST', payload?: any): Promise<any> {
  const url = await getSecret(URL_KEY);
  const key = await getSecret(KEY_KEY);
  if (!url || !key) return { connected: false };
  const res = await fetch(bust(url), {
    method,
    headers: {
      'X-Alena-Control-Key': key,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw new Error('שגיאת חיבור לאתר (HTTP ' + res.status + ')');
  const data: any = await res.json();
  return { connected: true, ...data };
}

// Read the current delivery-site settings (or report not-connected).
registerFn('getDeliverySiteControl', async ({ user }) => {
  await requireOwner(user);
  const url = await getSecret(URL_KEY);
  const key = await getSecret(KEY_KEY);
  if (!url || !key) return { connected: false };
  try {
    const r = await callWp('GET');
    return { connected: true, endpoint: url, settings: r.settings || null };
  } catch (e: any) {
    return { connected: true, endpoint: url, error: e?.message || 'החיבור נכשל' };
  }
});

// Write changed settings back to the site.
registerFn('setDeliverySiteControl', async ({ user, body }) => {
  await requireOwner(user);
  const payload = (body as any)?.settings ?? body ?? {};
  const r = await callWp('POST', payload);
  return r;
});

// Save (and verify) the connection details the owner pasted from WordPress.
registerFn('connectDeliverySite', async ({ user, body }) => {
  await requireOwner(user);
  let url = String((body as any)?.url || '').trim().replace(/\/+$/, '');
  const key = String((body as any)?.key || '').trim();
  if (!url || !key) throw new Error('חסרים כתובת או מפתח');

  // Accept either the site root or the full endpoint URL.
  const endpoint = /\/wp-json\//.test(url) ? url : (url + '/wp-json/alena/v1/control/settings');

  try {
    const res = await fetch(bust(endpoint), { headers: { 'X-Alena-Control-Key': key } });
    if (!res.ok) return { connected: false, error: 'המפתח או הכתובת שגויים (HTTP ' + res.status + ')' };
    const data: any = await res.json();
    // Only persist once we know they work.
    await saveSecret(URL_KEY, endpoint, 'Alena delivery-site control endpoint');
    await saveSecret(KEY_KEY, key, 'Alena delivery-site control key');
    return { connected: true, settings: data.settings || null };
  } catch (e: any) {
    return { connected: false, error: e?.message || 'החיבור נכשל' };
  }
});

// ---- The menu itself (WooCommerce products) ----
async function productsBase(): Promise<{ base: string; key: string } | null> {
  const url = await getSecret(URL_KEY);
  const key = await getSecret(KEY_KEY);
  if (!url || !key) return null;
  return { base: url.replace(/\/settings.*$/, ''), key };  // .../alena/v1/control
}

registerFn('getDeliverySiteProducts', async ({ user }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/products'), { headers: { 'X-Alena-Control-Key': c.key } });
  if (!res.ok) throw new Error('שגיאת טעינת תפריט (HTTP ' + res.status + ')');
  const data: any = await res.json();
  return { connected: true, products: data.products || [] };
});

registerFn('setDeliverySiteProduct', async ({ user, body }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/product'), {
    method: 'POST',
    headers: { 'X-Alena-Control-Key': c.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('שמירת מנה נכשלה (HTTP ' + res.status + ')');
  return await res.json();
});

registerFn('setDeliverySiteProductImage', async ({ user, body }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/product-image'), {
    method: 'POST',
    headers: { 'X-Alena-Control-Key': c.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('העלאת תמונה נכשלה (HTTP ' + res.status + ')');
  return await res.json();
});

// ---- Coupons ----
registerFn('getDeliverySiteCoupons', async ({ user }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/coupons'), { headers: { 'X-Alena-Control-Key': c.key } });
  if (!res.ok) throw new Error('שגיאת טעינת קופונים (HTTP ' + res.status + ')');
  const data: any = await res.json();
  return { connected: true, coupons: data.coupons || [] };
});

registerFn('setDeliverySiteCoupon', async ({ user, body }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/coupon'), {
    method: 'POST',
    headers: { 'X-Alena-Control-Key': c.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('שמירת קופון נכשלה (HTTP ' + res.status + ')');
  return await res.json();
});

// ---- Today's orders (read-only) ----
registerFn('getDeliverySiteOrdersToday', async ({ user }) => {
  await requireOwner(user);
  const c = await productsBase();
  if (!c) return { connected: false };
  const res = await fetch(bust(c.base + '/orders-today'), { headers: { 'X-Alena-Control-Key': c.key } });
  if (!res.ok) throw new Error('שגיאת טעינת הזמנות (HTTP ' + res.status + ')');
  const data: any = await res.json();
  return { connected: true, ...data };
});

// Let the owner disconnect (clears the stored key).
registerFn('disconnectDeliverySite', async ({ user }) => {
  await requireOwner(user);
  await saveSecret(KEY_KEY, '', 'Alena delivery-site control key (cleared)');
  return { connected: false };
});
