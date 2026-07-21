// Network HQ — the "layer above the restaurants" for a chain. Group tenants
// (branches) into a Chain and see a network-wide view + per-branch KPIs.
// Platform-owner only (rendered inside PlatformLayout). D.1 of Apollo-for-chains.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Network, RefreshCw } from 'lucide-react';

const ils = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;

function ChainCard({ chain, available, onChanged }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addSlug, setAddSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMetrics = async () => {
    setLoading(true);
    try { const r = await base44.functions.getChainMetrics({ chain_id: chain.id }); setMetrics(r?.data || r || {}); }
    catch { setMetrics(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadMetrics(); }, [chain.id, (chain.members || []).length]);

  const memberSlugs = new Set((chain.members || []).map((m) => m.slug));
  const addable = (available || []).filter((a) => !memberSlugs.has(a.slug));

  const addBranch = async () => {
    if (!addSlug) return;
    setBusy(true);
    try {
      const a = addable.find((x) => x.slug === addSlug);
      await base44.functions.addBranchToChain({ chain_id: chain.id, slug: addSlug, name: a?.name || addSlug });
      setAddSlug(''); onChanged && onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };
  const removeBranch = async (slug) => {
    setBusy(true);
    try { await base44.functions.removeBranchFromChain({ chain_id: chain.id, slug }); onChanged && onChanged(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  const t = metrics?.totals;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Network className="w-5 h-5 text-amber-400" /> {chain.name}</h3>
        <span className="text-xs text-slate-400">{(chain.members || []).length} סניפים</span>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">עובדים פעילים</div><div className="text-xl font-bold text-white">{t.employees}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">במשמרת עכשיו</div><div className="text-xl font-bold text-emerald-400">{t.active_shifts}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">חוזי אירועים</div><div className="text-xl font-bold text-white">{ils(t.contract_revenue)}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">חשבוניות לא שולמו</div><div className="text-xl font-bold text-amber-400">{t.unpaid_invoices}</div></div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-300 whitespace-nowrap">
            <thead><tr className="text-slate-500 text-right text-xs"><th className="p-2">סניף</th><th className="p-2">עובדים</th><th className="p-2">במשמרת</th><th className="p-2">חוזים</th><th className="p-2">חוב חשבוניות</th><th></th></tr></thead>
            <tbody>
              {(metrics?.per_branch || []).map((b) => (
                <tr key={b.slug} className="border-t border-slate-800">
                  <td className="p-2 font-medium text-white">{b.name}{b.error && <span className="text-[10px] text-red-400"> · לא זמין</span>}</td>
                  <td className="p-2">{b.employees}</td>
                  <td className="p-2">{b.active_shifts}</td>
                  <td className="p-2">{ils(b.contract_revenue)}</td>
                  <td className="p-2">{b.unpaid_invoices}</td>
                  <td className="p-2"><button onClick={() => removeBranch(b.slug)} disabled={busy} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              {(metrics?.per_branch || []).length === 0 && <tr><td colSpan={6} className="p-3 text-center text-slate-500 text-xs">אין סניפים ברשת עדיין — הוסף למטה.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <select value={addSlug} onChange={(e) => setAddSlug(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white">
          <option value="">הוסף סניף…</option>
          {addable.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>
        <button onClick={addBranch} disabled={busy || !addSlug} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"><Plus className="w-4 h-4 inline" /> הוסף</button>
      </div>
    </div>
  );
}

export default function NetworkHQ() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.listChains({}); setData(r?.data || r || {}); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createChain = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try { await base44.functions.createChain({ name: newName.trim() }); setNewName(''); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setCreating(false); }
  };

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><Network className="w-6 h-6 text-amber-400" /> מטה רשתות</h1>
        <button onClick={load} className="text-slate-400 hover:text-white"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <p className="text-sm text-slate-400">קבץ סניפים לרשת אחת וראה תמונת-על של כל הסניפים במקום אחד.</p>

      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-xl p-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם רשת חדשה" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
        <button onClick={createChain} disabled={creating || !newName.trim()} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg px-4 py-2 text-sm disabled:opacity-50">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'צור רשת'}</button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="space-y-4">
          {(data?.chains || []).map((c) => <ChainCard key={c.id} chain={c} available={data.available} onChanged={load} />)}
          {(data?.chains || []).length === 0 && <div className="text-center text-slate-500 py-10">אין רשתות עדיין. צור אחת למעלה.</div>}
        </div>
      )}
    </div>
  );
}
