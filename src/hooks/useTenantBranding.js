import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// Cached branding — one lookup per app load. Falls back to "TOP ALENA".
// The tenant subdomain container fetches its own RestaurantProfile from
// its own schema, so no cross-tenant leakage.
let _cache = null;
let _fetchPromise = null;

async function fetchBranding() {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = (async () => {
    // Only try to fetch when we actually have an auth token — otherwise the
    // /entities/RestaurantProfile call 401s during app-boot before login and
    // that unhandled rejection crashes downstream code that assumed a resolve.
    const hasToken = typeof window !== 'undefined' && !!window.localStorage.getItem('auth_token');
    if (!hasToken || !base44?.entities?.RestaurantProfile) {
      _cache = { name: 'TOP ALENA', is_default: true };
      return _cache;
    }
    try {
      const rows = await base44.entities.RestaurantProfile.list();
      const profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      _cache = {
        name: profile?.name || 'TOP ALENA',
        address: profile?.address || null,
        cuisine: profile?.cuisine || null,
        opening_hours: profile?.opening_hours || null,
        is_default: !profile,
      };
      return _cache;
    } catch {
      _cache = { name: 'TOP ALENA', is_default: true };
      return _cache;
    }
  })();
  return _fetchPromise.catch(() => {
    // Ultimate fallback — if anything above throws synchronously, don't crash React.
    return { name: 'TOP ALENA', is_default: true };
  });
}

export function useTenantBranding() {
  const [branding, setBranding] = useState(_cache || { name: 'TOP ALENA', is_default: true });

  useEffect(() => {
    let alive = true;
    fetchBranding().then((b) => { if (alive) setBranding(b); });
    return () => { alive = false; };
  }, []);

  return branding;
}
