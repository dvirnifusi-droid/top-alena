import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Megaphone, Pause, Play, Wallet, AlertTriangle, RefreshCw } from 'lucide-react';

// Live control over the Meta ad campaigns: see spend / leads / cost-per-lead
// for the last 7 days, and pause / resume / change the daily budget without
// leaving the app. Closes the loop the optimizer opens — a wasteful campaign
// (spending with zero leads) is flagged in red and one click stops the bleed.
export default function LiveCampaigns() {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState({}); // id -> true while an action runs
  const [editing, setEditing] = useState(null); // id being budget-edited
  const [budgetInput, setBudgetInput] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await base44.functions.listMetaCampaigns({});
      const d = res?.data || res || {};
      setConfigured(d.configured !== false);
      setCampaigns(Array.isArray(d.campaigns) ? d.campaigns : []);
      setLoaded(true);
    } catch (e) {
      setErr(e?.message || 'שגיאה בטעינת הקמפיינים');
    } finally { setLoading(false); }
  };

  const runAction = async (id, fn, payload) => {
    setBusy(b => ({ ...b, [id]: true })); setErr('');
    try {
      await base44.functions[fn](payload);
      await load();
    } catch (e) {
      setErr(e?.message || 'הפעולה נכשלה');
    } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const pause = (id) => runAction(id, 'pauseMetaCampaign', { campaign_id: id });
  const resume = (id) => runAction(id, 'resumeMetaCampaign', { campaign_id: id });
  const saveBudget = async (id) => {
    const v = Number(budgetInput);
    if (!Number.isFinite(v) || v < 5) { setErr('תקציב יומי חייב להיות לפחות ₪5'); return; }
    setEditing(null);
    await runAction(id, 'setMetaCampaignDailyBudget', { campaign_id: id, daily_budget_ils: v });
  };

  const isActive = (c) => (c.effective_status || c.status) === 'ACTIVE';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-fuchsia-500" />
          <h3 className="font-bold text-slate-800">🎛️ קמפיינים חיים במטא</h3>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {loaded ? 'רענן' : 'טען קמפיינים'}
        </button>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{err}</div>}

      {!loaded ? (
        <p className="text-sm text-slate-500">צפה בכל הקמפיינים החיים — הוצאה, לידים ועלות לליד ב-7 ימים — ועצור / הפעל / שנה תקציב יומי בלחיצה, בלי להיכנס ל-Meta Ads Manager.</p>
      ) : !configured ? (
        <p className="text-sm text-slate-500">חשבון המודעות של מטא לא מחובר. הגדר <span className="font-bold">META_ADS_ACCESS_TOKEN</span> במסך מפתחות ה-API.</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-500">לא נמצאו קמפיינים בחשבון המודעות.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const active = isActive(c);
            const working = !!busy[c.id];
            return (
              <div key={c.id} className={`rounded-xl border p-3 ${c.wasteful ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="font-bold text-sm text-slate-800 truncate flex-1 min-w-[120px]">{c.name}</span>
                  {c.wasteful && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> מבזבז — 0 לידים
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-slate-400">{active ? 'פעיל' : 'מושהה'}</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600 mt-1.5 mr-4">
                  <span className="tabular-nums">₪{(c.spend_7d || 0).toLocaleString()} <span className="text-slate-400">הוצאה/7ימ׳</span></span>
                  <span className="tabular-nums text-emerald-700">{c.leads_7d || 0} <span className="text-slate-400">לידים</span></span>
                  {c.cost_per_lead != null && <span className="tabular-nums">₪{c.cost_per_lead} <span className="text-slate-400">לליד</span></span>}
                  {c.daily_budget_ils != null && <span className="tabular-nums">₪{c.daily_budget_ils} <span className="text-slate-400">תקציב יומי</span></span>}
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-2 mr-4">
                  {active ? (
                    <button onClick={() => pause(c.id)} disabled={working} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg disabled:opacity-50">
                      {working ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />} השהה
                    </button>
                  ) : (
                    <button onClick={() => resume(c.id)} disabled={working} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg disabled:opacity-50">
                      {working ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} הפעל
                    </button>
                  )}

                  {editing === c.id ? (
                    <div className="inline-flex items-center gap-1">
                      <span className="text-xs text-slate-500">₪</span>
                      <input
                        type="number" min="5" value={budgetInput} autoFocus
                        onChange={(e) => setBudgetInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(c.id); if (e.key === 'Escape') setEditing(null); }}
                        className="w-20 text-xs border border-slate-300 rounded-lg px-2 py-1 tabular-nums"
                        placeholder="תקציב יומי"
                      />
                      <button onClick={() => saveBudget(c.id)} disabled={working} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded-lg disabled:opacity-50">שמור</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-slate-500 px-1">ביטול</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(c.id); setBudgetInput(String(c.daily_budget_ils || 40)); }} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-2.5 py-1 rounded-lg">
                      <Wallet className="w-3 h-3" /> שנה תקציב
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
