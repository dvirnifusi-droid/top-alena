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
        term_overrides: (d.term_overrides && typeof d.term_overrides === 'object') ? d.term_overrides : {},
        nav_order: Array.isArray(d.nav_order) ? d.nav_order : [],
        terms: Array.isArray(d.terms) ? d.terms : [],
        verticals: Array.isArray(d.verticals) ? d.verticals : [],
      };
    } catch {
      _cache = { business_type: null, hidden_pages: [], page_config: {}, term_overrides: {}, nav_order: [], terms: [], verticals: [] };
    }
    _inflight = null;
    _subs.forEach((fn) => { try { fn(_cache); } catch { /* */ } });
    return _cache;
  })();
  return _inflight;
}

export function refreshAppConfig() { return _load(true); }

// Pure, hook-free term substitution reading the module cache directly — so shared
// UI primitives (Button, CardTitle, Label…) can apply the owner's global term
// renames to their text children with ZERO per-component hook/subscription cost.
// No overrides (or cache not loaded yet) → returns the string unchanged instantly.
export function applyTermsGlobal(str) {
  if (typeof str !== 'string' || !str || !_cache) return str;
  const ov = _cache.term_overrides;
  if (!ov) return str;
  const cat = _cache.terms || [];
  let out = str;
  const subs = [];
  for (const t of cat) { const to = ov[t.key]; if (to && t.default && to !== t.default) subs.push([t.default, to]); }
  if (!subs.length) return str;
  subs.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of subs) out = out.split(from).join(to);
  return out;
}

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
  // term(key) — the owner's override for a canonical business term, or its default.
  const term = useCallback((key, fallback) => {
    const ov = cfg?.term_overrides?.[key];
    if (ov) return ov;
    const t = (cfg?.terms || []).find((x) => x.key === key);
    return t?.default ?? fallback ?? key;
  }, [cfg]);
  // applyTerms(str) — substitute any owner-renamed term's default word with its
  // override inside an arbitrary display string (sidebar labels, titles…).
  const applyTerms = useCallback((str) => {
    if (typeof str !== 'string' || !str) return str;
    const ov = cfg?.term_overrides || {};
    const cat = cfg?.terms || [];
    const subs = cat
      .map((t) => ({ from: t.default, to: ov[t.key] }))
      .filter((s) => s.to && s.from && s.to !== s.from)
      .sort((a, b) => b.from.length - a.from.length);
    if (!subs.length) return str;
    let out = str;
    for (const s of subs) out = out.split(s.from).join(s.to);
    return out;
  }, [cfg]);
  return {
    businessType: cfg?.business_type || null,
    hiddenPages: cfg?.hidden_pages || [],
    pageConfig: cfg?.page_config || {},
    termOverrides: cfg?.term_overrides || {},
    navOrder: cfg?.nav_order || [],
    terms: cfg?.terms || [],
    verticals: cfg?.verticals || [],
    loading: !cfg,
    isHidden, pageTitle, label, sectionHidden, term, applyTerms,
    refresh: refreshAppConfig,
  };
}
