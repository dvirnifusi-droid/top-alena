import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// Module-level cache so the sidebar + every PageGuard share ONE request per
// session instead of refetching on each navigation.
let _cache = null;
let _inflight = null;

export function clearMyPermissionsCache() { _cache = null; _inflight = null; }

function fetchPerms() {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = base44.functions.getMyPermissions({})
    .then((r) => { _cache = (r?.data ?? r) || {}; return _cache; })
    .catch(() => { _cache = { is_owner: false, allowed_pages: null, source: 'error' }; return _cache; })
    .finally(() => { _inflight = null; });
  return _inflight;
}

// { loading, isOwner, allowedPages (null = no per-page config → legacy behaviour),
//   can(pageName) }
export function useMyPermissions() {
  const [perms, setPerms] = useState(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let alive = true;
    if (_cache) { setPerms(_cache); setLoading(false); return () => { alive = false; }; }
    fetchPerms().then((p) => { if (alive) { setPerms(p); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const allowedPages = Array.isArray(perms?.allowed_pages) ? perms.allowed_pages : null;
  const isOwner = !!perms?.is_owner;
  // Owner sees everything; no config = legacy (allow); otherwise strict allowlist.
  const can = (pageName) => {
    if (isOwner) return true;
    if (!allowedPages) return true;
    if (!pageName) return true;
    return allowedPages.includes(pageName);
  };

  return { loading, perms, isOwner, allowedPages, tierLabel: perms?.tier_label || null, can };
}

export default useMyPermissions;
