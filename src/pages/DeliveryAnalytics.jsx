import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, BarChart3, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, LineChart, PieChart, Pie, Cell,
} from 'recharts';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const HUMMUS = '#b8442e';
const nis = (n) => '₪' + Number(n || 0).toLocaleString('en-US');
const nisShort = (n) => (Math.abs(n) >= 1000 ? '₪' + Math.round(n / 100) / 10 + 'k' : '₪' + Math.round(n));

const RANGES = [
  { k: '7', label: '7 ימים' },
  { k: '30', label: '30 ימים' },
  { k: 'custom', label: 'טווח' },
];

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export default function DeliveryAnalytics() {
  const [rangeKey, setRangeKey] = useState('7');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return ymd(d); });
  const [to, setTo] = useState(() => ymd(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = rangeKey === 'custom' ? { from, to } : { days: Number(rangeKey) };
      const d = (await base44.functions.getDeliverySiteAnalytics(params))?.data || {};
      if (d.connected === false) { setConnected(false); return; }
      setConnected(true); setData(d);
    } catch (e) {
      setError(e?.message || 'טעינת האנליטיקה נכשלה');
    } finally { setLoading(false); }
  }, [rangeKey, from, to]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};
  const kpis = [
    { label: 'הזמנות', value: t.orders ?? '–' },
    { label: 'מחזור', value: t.revenue != null ? nis(t.revenue) : '–', color: HUMMUS },
    { label: 'ערך ממוצע', value: t.avgOrder != null ? nis(t.avgOrder) : '–' },
    { label: 'זמן הכנה ממ׳', value: t.avgPrep ? t.avgPrep + '׳' : '–' },
    { label: 'בזמן', value: t.onTimePct != null ? t.onTimePct + '%' : '–', tone: t.onTimePct >= 80 ? 'ok' : t.onTimePct >= 50 ? 'warn' : t.onTimePct != null ? 'bad' : '' },
    { label: 'לקוחות חוזרים', value: t.returningPct != null ? t.returningPct + '%' : '–' },
    { label: 'ביטולים', value: t.cancelPct != null ? t.cancelPct + '%' : '–', tone: t.cancelPct > 10 ? 'bad' : '' },
    { label: 'דירוג ממוצע', value: t.ratingAvg != null ? '⭐ ' + t.ratingAvg : '–' },
  ];
  const toneCls = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' };

  const pieData = [
    { name: 'משלוח', value: t.delivery || 0, color: HUMMUS },
    { name: 'איסוף', value: t.pickup || 0, color: '#1D9E75' },
  ];
  const ratingBars = data?.ratingDist ? [5, 4, 3, 2, 1].map((s) => ({ star: '★'.repeat(s), n: data.ratingDist[s] || 0 })) : [];

  const Section = ({ title, sub, children }) => (
    <Card><CardContent className="p-3.5">
      <div className="mb-2">
        <div className="text-sm font-bold text-slate-800">{title}</div>
        {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      </div>
      {children}
    </CardContent></Card>
  );

  return (
    <PageGuard pageName="DeliveryAnalytics" pageTitle="אנליטיקת משלוחים">
      <PageShell>
        <PageHeader
          title="אנליטיקת משלוחים"
          subtitle="מגמות לאורך זמן — מחזור, עומסים, לקוחות ומנות"
          icon={BarChart3}
          action={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>}
        />

        {!connected ? (
          <Card className="max-w-lg mx-auto"><CardContent className="p-6 text-center" dir="rtl">
            <p className="text-slate-600">אתר המשלוחים לא מחובר. חברו אותו קודם בעמוד "אתר משלוחים".</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto" dir="rtl">

            {/* Range */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                {RANGES.map((r) => (
                  <button key={r.k} onClick={() => setRangeKey(r.k)}
                    className={`text-sm font-bold px-3 py-1.5 rounded-lg transition ${rangeKey === r.k ? 'text-white shadow-sm' : 'text-slate-500'}`}
                    style={rangeKey === r.k ? { background: HUMMUS } : undefined}>{r.label}</button>
                ))}
              </div>
              {rangeKey === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
                  <span className="text-slate-400">–</span>
                  <Input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
                </div>
              )}
            </div>

            {data?.capped && (
              <p className="text-xs text-amber-600">מוצגות עד 300 הזמנות אחרונות בטווח — לנתונים מלאים בטווח גדול, בחרו טווח קצר יותר.</p>
            )}
            {error && <p className="text-sm font-semibold text-rose-600 text-center">{error}</p>}

            {loading && !data ? (
              <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען…</div>
            ) : (
              <>
                {/* KPI grid */}
                <div className="grid grid-cols-4 gap-2">
                  {kpis.map((k) => (
                    <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
                      <div className={`text-lg font-extrabold leading-none ${k.tone ? toneCls[k.tone] : 'text-slate-800'}`} style={!k.tone && k.color ? { color: k.color } : undefined}>{k.value}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue + orders by day */}
                <Section title="מחזור והזמנות לפי יום" sub="עמודות = מחזור · קו = מס׳ הזמנות">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={data?.byDay || []} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={nisShort} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v, n) => (n === 'מחזור' ? nis(v) : v)} labelStyle={{ direction: 'rtl' }} />
                      <Bar yAxisId="l" dataKey="revenue" name="מחזור" fill={HUMMUS} radius={[4, 4, 0, 0]} maxBarSize={34} />
                      <Line yAxisId="r" dataKey="orders" name="הזמנות" stroke="#185FA5" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Section>

                {/* By hour */}
                <Section title="הזמנות לפי שעה" sub="לזהות את שעות העומס — לתכנון כוח אדם">
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={data?.byHour || []} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v) => [v, 'הזמנות']} labelFormatter={(l) => l + ':00'} />
                      <Bar dataKey="orders" fill="#7F77DD" radius={[3, 3, 0, 0]} maxBarSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>

                {/* Pickup vs delivery + on-time trend */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Section title="איסוף מול משלוח">
                    <div className="flex items-center gap-3">
                      <ResponsiveContainer width={130} height={130}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={2}>
                            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="text-sm space-y-1.5">
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full inline-block" style={{ background: HUMMUS }} /> 🛵 משלוח · {t.delivery || 0}</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#1D9E75' }} /> 🥡 איסוף · {t.pickup || 0}</div>
                      </div>
                    </div>
                  </Section>

                  <Section title="% בזמן לאורך הימים">
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={(data?.byDay || []).filter((d) => d.onTimePct != null)} margin={{ top: 6, right: 6, left: -26, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => v + '%'} />
                        <Tooltip formatter={(v) => [v + '%', 'בזמן']} />
                        <Line dataKey="onTimePct" stroke="#1D9E75" strokeWidth={2.5} dot={{ r: 2.5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Section>
                </div>

                {/* Top items + top customers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Section title="מנות מובילות" sub="לפי כמות שנמכרה">
                    <div className="divide-y divide-slate-100">
                      {(data?.topItems || []).length === 0 ? <div className="text-sm text-slate-400 py-4 text-center">אין נתונים</div> :
                        (data.topItems).map((it, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                            <span className="truncate"><span className="text-slate-400 ml-1">{i + 1}.</span>{it.name}</span>
                            <span className="font-bold text-slate-700 flex-shrink-0">{it.qty}</span>
                          </div>
                        ))}
                    </div>
                  </Section>

                  <Section title="לקוחות מובילים" sub="לפי סכום בטווח">
                    <div className="divide-y divide-slate-100">
                      {(data?.topCustomers || []).length === 0 ? <div className="text-sm text-slate-400 py-4 text-center">אין נתונים</div> :
                        (data.topCustomers).map((c, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                            <span className="truncate"><span className="text-slate-400 ml-1">{i + 1}.</span>{c.name} <span className="text-slate-400 text-xs">· {c.orders} הז׳</span></span>
                            <span className="font-bold flex-shrink-0" style={{ color: HUMMUS }}>{nis(c.spend)}</span>
                          </div>
                        ))}
                    </div>
                  </Section>
                </div>

                {/* Ratings */}
                {t.ratingCount > 0 && (
                  <Section title="דירוגים" sub={`${t.ratingCount} דירוגים · ממוצע ${t.ratingAvg}`}>
                    <div className="space-y-1.5">
                      {ratingBars.map((r) => {
                        const max = Math.max(1, ...ratingBars.map((x) => x.n));
                        return (
                          <div key={r.star} className="flex items-center gap-2 text-sm">
                            <span className="text-amber-500 w-20 flex-shrink-0">{r.star}</span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: (r.n / max * 100) + '%', background: '#f59e0b' }} /></div>
                            <span className="text-slate-500 w-6 text-left flex-shrink-0">{r.n}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}
              </>
            )}
          </div>
        )}
      </PageShell>
    </PageGuard>
  );
}
