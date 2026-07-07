import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CreditCard, TrendingUp, Loader2, RefreshCw, Clock, AlertTriangle, Wallet } from 'lucide-react';

const ils = (n) => `₪${(Number(n) || 0).toLocaleString('en-IL')}`;

export default function PlatformSubscriptions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getPlatformBilling({});
      setData(res?.data || res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cards = data ? [
    { label: 'MRR פעיל', value: ils(data.active_mrr), sub: 'הכנסה חודשית משלמת', icon: Wallet, tint: 'text-emerald-400' },
    { label: 'ARR פעיל', value: ils(data.active_arr), sub: 'שנתי (×12)', icon: TrendingUp, tint: 'text-sky-400' },
    { label: 'MRR פוטנציאלי', value: ils(data.potential_mrr), sub: 'כולל ניסיונות', icon: CreditCard, tint: 'text-purple-400' },
    { label: 'בתקופת ניסיון', value: data.trialing, sub: `${data.trials_expiring_7d || 0} פגים ב-7 ימים`, icon: Clock, tint: 'text-amber-400' },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-amber-400" /> ניהול מנויים וחיוב
        </h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> רענן
        </button>
      </div>

      {/* Billing provider not connected notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2 text-sm text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          המספרים כאן מחושבים מהמחירים בחבילות × המסעדות הפעילות. <b>סליקה אמיתית (Stripe / משולם) עדיין לא מחוברת</b> —
          כדי לחייב אוטומטית, לזהות כשלי תשלום ולאפשר שדרוג בשירות עצמי, צריך לחבר חשבון סליקה. תגיד לי כשיש ואשלים.
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map(c => (
              <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <c.icon className={`w-6 h-6 ${c.tint}`} />
                <div className="text-2xl font-bold text-white mt-3">{c.value}</div>
                <div className="text-xs text-slate-400 mt-1">{c.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* By plan */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">פילוח לפי חבילה</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(data?.by_plan || []).map(p => (
                <div key={p.key} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{p.name}</span>
                    <span className="text-xs text-slate-400">{ils(p.price_monthly)}/חודש</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-400 mt-2">{p.count}</div>
                  <div className="text-[11px] text-slate-500">מסעדות · {ils(p.mrr)} MRR</div>
                </div>
              ))}
            </div>
            {data?.unassigned > 0 && (
              <p className="text-[11px] text-slate-500 mt-3">{data.unassigned} מסעדות ללא חבילה מוקצית (נספרות לפי חבילת ברירת המחדל).</p>
            )}
          </div>

          {/* Tenants */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60 text-xs text-slate-400">
                  <tr>
                    <th className="p-3 text-right">מסעדה</th>
                    <th className="p-3 text-right">חבילה</th>
                    <th className="p-3 text-center">מחיר/חודש</th>
                    <th className="p-3 text-right">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(data?.tenants || []).map(t => (
                    <tr key={t.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-white font-medium">{t.name}</td>
                      <td className="p-3 text-slate-300">{t.plan_name || <span className="text-slate-600">— ללא —</span>}</td>
                      <td className="p-3 text-center text-slate-300">{ils(t.price_monthly)}</td>
                      <td className="p-3">
                        {t.on_trial
                          ? <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">ניסיון עד {String(t.trial_ends_at).slice(0, 10)}</span>
                          : t.plan_key
                            ? <span className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">משלם</span>
                            : <span className="text-[11px] text-slate-500">ללא חבילה</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
