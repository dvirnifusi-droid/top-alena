import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// 5-min localStorage cache to avoid a network call on every page load.
// Also survives across tabs and page refreshes.
const CACHE_KEY = 'tenant_modules_v2'; // v2 adds locked/unlock_plan for paywall
const CACHE_TTL_MS = 5 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* localStorage full or blocked — ignore */
  }
}

/**
 * Loads the tenant's module catalog + enabled state.
 * Cached in localStorage for 5 minutes.
 *
 * Returns:
 *   modules      — array of { key, name_he, ..., enabled }, or null while loading
 *   loading      — true until first response returns
 *   isEnabled(k) — cheap lookup. Unknown key → true (safe default).
 *   pageEnabled(pageName) — true if the page's owning module is enabled, or
 *                           the page is core (unassigned to any module).
 *   refresh()    — force a network reload + cache write.
 */
export function useTenantModules() {
  const cached = readCache();
  const [modules, setModules] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    // Bail early when no auth token — matches the useTenantBranding pattern.
    const hasToken = typeof window !== 'undefined'
      && !!window.localStorage.getItem('auth_token');
    if (!hasToken) {
      setLoading(false);
      return;
    }
    try {
      const res = await base44.functions.getMyTenantModules({});
      const data = (res?.data || res)?.modules || [];
      setModules(data);
      writeCache(data);
    } catch (e) {
      console.error('[useTenantModules] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEnabled = useCallback(
    (key) => {
      if (!modules) return true;
      const m = modules.find((x) => x.key === key);
      return m ? m.enabled : true;
    },
    [modules],
  );

  const moduleForPage = useCallback(
    (pageName) => {
      if (!modules) return null;
      return modules.find((x) => Array.isArray(x.pages) && x.pages.includes(pageName)) || null;
    },
    [modules],
  );

  const pageEnabled = useCallback(
    (pageName) => {
      const m = moduleForPage(pageName);
      if (!m) return true; // page not attached to any module = core
      return m.enabled;
    },
    [moduleForPage],
  );

  // Locked = the page's module is not in the tenant's plan (show with a lock +
  // upsell rather than hide it). unlockPlanFor → name of the plan that unlocks.
  const isLocked = useCallback((pageName) => !!moduleForPage(pageName)?.locked, [moduleForPage]);
  const unlockPlanFor = useCallback((pageName) => moduleForPage(pageName)?.unlock_plan || null, [moduleForPage]);

  return { modules, loading, isEnabled, pageEnabled, moduleForPage, isLocked, unlockPlanFor, refresh: load };
}
