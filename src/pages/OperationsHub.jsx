// Operations HQ — the operations pillar dashboard. Live ops KPIs + a ranked
// "needs attention" list, assembled server-side from getOwnerDashboard +
// getOwnerInsights. Mirrors the Marketing HQ pattern.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LayoutGrid, RefreshCw, ExternalLink } from 'lucide-react';

function KpiTile({ label, value, sub, tone }) {
  const toneCls = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-800';
  return (
    <div className="bg-white rounded-xl border p-3 flex-1 min-w-[120px]">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function OperationsHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const r = await base44.functions.getOperationsHQ({});
      setData(r?.data || r || {});
    } catch (e) { setErr(e?.message || 'שגיאה בטעינת מטה התפעול'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const k = data?.kpis || {};
  const cl = k.checklists || { done: 0, total: 0 };
  const clPct = cl.total > 0 ? Math.round((cl.done / cl.total) * 100) : null;
  const actions = data?.actions || [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <PageHeader
        title="מטה תפעול"
        subtitle="תמונת מצב תפעולית חיה + מה דורש את תשומת הלב שלך"
        icon={LayoutGrid}
        action={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן</Button>}
      />

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : err ? (
        <div className="p-4 text-red-600 text-sm">{err}</div>
      ) : (
        <>
          {data?.headline && (
            <Card className="p-4 bg-gradient-to-l from-[#44512c] to-[#333d21] text-white border-0">
              <div className="text-base leading-relaxed">{data.headline}</div>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <KpiTile label="אירועים פתוחים" value={k.incidents_open ?? 0} tone={(k.incidents_open ?? 0) > 0 ? 'bad' : 'good'} />
            <KpiTile label="צ׳קליסטים היום" value={clPct != null ? `${clPct}%` : '—'} sub={cl.total > 0 ? `${cl.done}/${cl.total} הושלמו` : 'אין ריצות'} tone={clPct != null && clPct < 100 ? 'warn' : 'good'} />
            <KpiTile label="הזמנות היום" value={k.reservations_today ?? 0} />
            <KpiTile label="הכנסה היום" value={`₪${(k.revenue_today ?? 0).toLocaleString('he-IL')}`} />
            <KpiTile label="עלות עבודה" value={k.labor_pct != null ? `${k.labor_pct}%` : '—'} tone={k.labor_pct != null && k.labor_pct > 32 ? 'bad' : k.labor_pct != null ? 'good' : ''} />
            <KpiTile label="פוד-קוסט ממוצע" value={k.food_cost_pct != null ? `${k.food_cost_pct}%` : '—'} tone={k.food_cost_pct != null && k.food_cost_pct > 35 ? 'bad' : k.food_cost_pct != null ? 'good' : ''} />
          </div>

          <div>
            <div className="text-base font-bold mb-2 text-[#44512C]">🎯 דורש תשומת לב</div>
            {actions.length === 0 ? (
              <Card className="p-6 text-center text-slate-500 text-sm">אין דברים דחופים כרגע. הכל תחת שליטה 🌿</Card>
            ) : (
              <div className="space-y-2">
                {actions.map((a) => (
                  <Card key={a.id} className="p-3 flex items-center gap-3">
                    <div className="text-2xl flex-shrink-0">{a.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{a.title}{a.count ? ` (${a.count})` : ''}</div>
                      {a.why && <div className="text-xs text-slate-500">{a.why}</div>}
                    </div>
                    <a href={a.link || '#'} className="flex-shrink-0"><Button size="sm" variant="outline"><ExternalLink className="w-4 h-4 ml-1" /> פתח</Button></a>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
