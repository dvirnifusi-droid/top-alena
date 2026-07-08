// Which tenant is this browser on? Derived from the subdomain, e.g.
// juiceph.topalena.com → "juiceph". The flagship Alena is served from
// alena.topalena.com, the apex topalena.com, www, or localhost in dev.
//
// Used to gate Alena-specific hardcoded content (reservation page, delivery
// procedures) so that OTHER tenants get their own settings / a clean empty
// state instead of Alena's copy.
export function getTenantSlug() {
  try {
    const host = String(window.location.hostname || '').toLowerCase();
    const parts = host.split('.');
    if (parts.length < 3) return 'alena';            // topalena.com / localhost
    const sub = parts[0];
    if (['www', 'topalena', 'app', 'admin', ''].includes(sub)) return 'alena';
    return sub;
  } catch {
    return 'alena';
  }
}

// Is this the flagship Alena app (the only place Alena-specific hardcoded
// content should render)?
export function isMainAlena() {
  return getTenantSlug() === 'alena';
}
