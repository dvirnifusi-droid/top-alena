// App Builder (Wix-model) config — per-tenant owner customizations that EVERY
// user must see (hidden pages + overridden page titles/labels). Loaded once and
// cached module-wide, like useTenantModules. The default is always "what we
// built" — this only carries the owner's overrides on top.
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

let _cache = null;          // { business_type, hidden_pages, page_config }
let _inflight = null;
const _subs = new Set();

async function _load(force = false) {
  if (_cache && !force) return _cache;
  if (_inflight && !force) return _inflight;
  _inflight = (async () => {
    try {
      const res = await base44.functions.getAppConfig({});
      const d = res?.data || res || {};
      _cache = {
        business_type: d.business_type || null,
        hidden_pages: Array.isArray(d.hidden_pages) ? d.hidden_pages : [],
        page_config: (d.page_config && typeof d.page_config === 'object') ? d.page_config : {},
        verticals: Array.isArray(d.verticals) ? d.verticals : [],
      };
    } catch {
      _cache = { business_type: null, hidden_pages: [], page_config: {}, verticals: [] };
    }
    _inflight = null;
    _subs.forEach((fn) => { try { fn(_cache); } catch { /* */ } });
    return _cache;
  })();
  return _inflight;
}

export function refreshAppConfig() { return _load(true); }

export function useAppConfig() {
  const [cfg, setCfg] = useState(_cache);
  useEffect(() => {
    let alive = true;
    const sub = (c) => { if (alive) setCfg({ ...c }); };
    _subs.add(sub);
    _load().then((c) => { if (alive) setCfg({ ...c }); });
    return () => { alive = false; _subs.delete(sub); };
  }, []);
  const isHidden = useCallback((page) => !!(cfg?.hidden_pages || []).includes(page), [cfg]);
  const pageTitle = useCallback((page, fallback) => (cfg?.page_config?.[page]?.title) || fallback, [cfg]);
  const label = useCallback((page, key, fallback) => (cfg?.page_config?.[page]?.labels?.[key]) || fallback, [cfg]);
  const sectionHidden = useCallback((page, sec) => !!(cfg?.page_config?.[page]?.hidden_sections || []).includes(sec), [cfg]);
  return {
    businessType: cfg?.business_type || null,
    hiddenPages: cfg?.hidden_pages || [],
    pageConfig: cfg?.page_config || {},
    verticals: cfg?.verticals || [],
    loading: !cfg,
    isHidden, pageTitle, label, sectionHidden,
    refresh: refreshAppConfig,
  };
}
