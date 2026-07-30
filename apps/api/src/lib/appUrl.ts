// The public origin for THIS tenant's app.
//
// Alena is the ROOT domain — https://topalena.com — NOT alena.topalena.com.
// Every OTHER tenant lives on https://<slug>.topalena.com. An explicit
// PUBLIC_BASE_URL / APP_BASE_URL always wins; otherwise we derive the origin
// from TENANT_SLUG, special-casing alena (and the historical 'topalena' default,
// which used to produce the broken https://topalena.topalena.com) to the bare
// root. This is the single source of truth — every deep-link builder should use
// it so Alena never emits alena.topalena.com again.
export function appBaseUrl(): string {
  const explicit = (process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  if (explicit) return explicit;
  const slug = (process.env.TENANT_SLUG || '').trim().toLowerCase();
  return !slug || slug === 'alena' || slug === 'topalena'
    ? 'https://topalena.com'
    : `https://${slug}.topalena.com`;
}
