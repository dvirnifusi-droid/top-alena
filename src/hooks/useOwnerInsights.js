// One cached fetch of getOwnerInsights shared by all KPI widgets, so the six
// dashboard cards cost a single API round-trip. Refreshes on demand.
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

let _cache = null;
let _promise = null;

async function fetchInsights() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const r = await base44.functions.getOwnerInsights({});
      _cache = (r?.data ?? r) || {};
    } catch {
      _cache = {};
    }
    _promise = null;
    return _cache;
  })();
  return _promise;
}

export function useOwnerInsights() {
  const [data, setData] = useState(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let alive = true;
    fetchInsights().then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const refresh = async () => {
    _cache = null; _promise = null;
    setLoading(true);
    const d = await fetchInsights();
    setData(d); setLoading(false);
  };

  return { data: data || {}, loading, refresh };
}
