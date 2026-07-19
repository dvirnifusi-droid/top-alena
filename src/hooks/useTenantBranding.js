import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Cached branding — one lookup per app load. Falls back to "TOP APOLLO".
// The tenant subdomain container fetches its own RestaurantProfile from
// its own schema, so no cross-tenant leakage.
//
// D2 extension: also carries logo_url, brand_colors {primary/secondary/accent},
// brand_font. These drive the whole app's visual identity via CSS vars set in
// Layout.jsx.
let _cache = null;
let _fetchPromise = null;

const DEFAULT_BRANDING = {
  name: 'TOP APOLLO',
  logo_url: null,
  cover_photo_url: null,
  brand_colors: null,
  brand_font: null,
  address: null,
  cuisine: null,
  opening_hours: null,
  phone: null,
  is_default: true,
};

async function fetchBranding() {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = (async () => {
    // Public pages don't have an auth token; RestaurantProfile is whitelisted
    // as a public-read entity so we fall through to asServiceRole for them.
    // Authenticated pages use the regular entities client.
    const hasToken = typeof window !== 'undefined' && !!window.localStorage.getItem('auth_token');
    const client = hasToken
      ? base44?.entities?.RestaurantProfile
      : base44?.asServiceRole?.entities?.RestaurantProfile;
    if (!client) {
      _cache = { ...DEFAULT_BRANDING };
      return _cache;
    }
    try {
      const rows = await client.list();
      const profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      _cache = {
        // restaurant_name is the canonical column; the old code read `name`
        // which was always undefined → always fell back to 'TOP APOLLO'.
        name: profile?.restaurant_name || profile?.name || 'TOP APOLLO',
        logo_url: profile?.logo_url || null,
        cover_photo_url: profile?.cover_photo_url || null, // hero background photo
        brand_colors: profile?.brand_colors || null, // {primary, secondary, accent} or null
        brand_font: profile?.brand_font || null,
        address: profile?.address || null,
        cuisine: profile?.cuisine_style || profile?.cuisine || null,
        opening_hours: profile?.opening_hours || null,
        // Public contact number. Deliberately NOT manager_whatsapp_phone —
        // that is a staff member's personal line, not a customer-facing one.
        phone: profile?.phone || null,
        is_default: !profile,
      };
      return _cache;
    } catch {
      _cache = { ...DEFAULT_BRANDING };
      return _cache;
    }
  })();
  return _fetchPromise.catch(() => ({ ...DEFAULT_BRANDING }));
}

// Force a re-fetch (e.g. after saving on /Branding page).
export function invalidateBrandingCache() {
  _cache = null;
  _fetchPromise = null;
}

export function useTenantBranding() {
  const [branding, setBranding] = useState(_cache || { ...DEFAULT_BRANDING });

  const load = useCallback(() => {
    let alive = true;
    fetchBranding().then((b) => { if (alive) setBranding(b); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return load();
  }, [load]);

  const refresh = useCallback(() => {
    invalidateBrandingCache();
    fetchBranding().then(setBranding);
  }, []);

  return { ...branding, refresh };
}
