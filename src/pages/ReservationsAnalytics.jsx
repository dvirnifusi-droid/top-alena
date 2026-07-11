import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, subDays, startOfMonth, differenceInCalendarDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, TrendingUp, TrendingDown, Users, CalendarCheck, UserX, RefreshCw, BarChart3 } from 'lucide-react';

// Source key → label + emoji. Falls back to the raw key for anything unmapped.
const SOURCE_META = {
  'ישיר': { label: 'ישיר / אורגני', emoji: '🔗' },
  instagram: { label: 'אינסטגרם', emoji: '📸' },
  facebook: { label: 'פייסבוק', emoji: '👍' },
  tiktok: { label: 'טיקטוק', emoji: '🎵' },
  google: { label: 'גוגל', emoji: '🔍' },
  whatsapp: { label: 'וואטסאפ', emoji: '💬' },
  qr: { label: 'קוד QR', emoji: '📱' },
  sms: { label: 'SMS', emoji: '✉️' },
  email: { label: 'אימייל', emoji: '📧' },
  other: { label: 'אחר', emoji: '🌐' },
};
const srcMeta = (k) => SOURCE_META[k] || { label: k, emoji: '🌐' };

const STATUS_L = { confirmed: 'מאושר', seated: 'ישב', completed: 'הושלם', pending: 'ממתין', cancelled: 'בוטל', no_show: 'הבריז', standby: 'המתנה', request: 'בקשה' };
const STATUS_COLOR = {
  confirmed: 'bg-emerald-100 text-emerald-700', seated: 'bg-green-100 text-green-700', completed: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700', cancelled: 'bg-gray-100 text-gray-500', no_show: 'bg-rose-100 text-rose-700', standby: 'bg-yellow-100 text-yellow-700',
};

const PRESETS = [
  { key: '7', label: '7 ימים' },
  { key: '30', label: '30 ימים' },
  { key: '90', label: '90 ימים' },
  { key: 'month', label: 'החודש' },
];

function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

function Delta({ now, was }) {
  if (was == null) return null;
  const diff = now - was;
  if (was === 0 && now === 0) return <span className="text-[11px] text-gray-400">—</span>;
  const p = was === 0 ? 100 : Math.round((diff / was) * 100);
  const up = diff >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{p}%
    </span>
  );
}

function Kpi({ icon, label, value, suffix, now, was }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-400">{icon}</span>
          <Delta now={now} was={was} />
        </div>
        <div className="text-2xl font-black text-gray-900 tabular-nums">{value}{suffix}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function ReservationsAnalytics() {
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [compareOn, setCompareOn] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');            // free-text search over the detail table
  const [srcFilter, setSrcFilter] = useState(null); // click a source bar → filter detail table

  const applyPreset = (key) => {
    setPreset(key);
    const today = new Date();
    if (key === 'month') { setFrom(format(startOfMonth(today), 'yyyy-MM-dd')); setTo(format(today, 'yyyy-MM-dd')); }
    else { const n = parseInt(key); setFrom(format(subDays(today, n - 1), 'yyyy-MM-dd')); setTo(format(today, 'yyyy-MM-dd')); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let payload = { from, to };
      if (compareOn) {
        // Previous equal-length window immediately before [from, to].
        const len = differenceInCalendarDays(new Date(to), new Date(from)) + 1;
        const cTo = format(subDays(new Date(from), 1), 'yyyy-MM-dd');
        const cFrom = format(subDays(new Date(from), len), 'yyyy-MM-dd');
        payload = { ...payload, compare_from: cFrom, compare_to: cTo };
      }
      const res = await base44.functions.getReservationAnalytics(payload);
      setData(res?.data || res);
    } catch (e) {
      console.error('analytics load failed', e);
      setData(null);
    } finally { setLoading(false); }
  }, [from, to, compareOn]);

  useEffect(() => { load(); }, [load]);

  const range = data?.range;
  const cmp = data?.compare;
  const maxDaily = range?.daily?.length ? Math.max(...range.daily.map(d => d.count)) : 0;
  const maxSource = range?.by_source?.length ? Math.max(...range.by_source.map(s => s.count)) : 0;

  // Detailed drill-down rows, filtered by the source-bar click + the search box.
  const details = range?.details || [];
  const filtered = details.filter(r => {
    if (srcFilter && r.source !== srcFilter) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [r.customer_name, r.customer_phone, r.customer_email, r.campaign, r.source, r.medium]
      .some(v => String(v || '').toLowerCase().includes(s));
  });

  return (
    <div dir="rtl" className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-indigo-600" /> דאשבורד הזמנות</h1>
          <p className="text-sm text-gray-500">מאיפה מגיעות ההזמנות, כמה, ואיך זה משתנה לאורך זמן.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Controls */}
      <Card className="shadow-sm">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 h-9 rounded-lg text-xs font-bold ${preset === p.key ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="h-7 w-px bg-gray-200 hidden sm:block" />
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(''); }} className="h-9 w-auto text-xs" />
            <span>עד</span>
            <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(''); }} className="h-9 w-auto text-xs" />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer mr-auto">
            <input type="checkbox" checked={compareOn} onChange={e => setCompareOn(e.target.checked)} />
            השווה לתקופה קודמת
          </label>
        </CardContent>
      </Card>

      {loading && !range ? (
        <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען נתונים…</div>
      ) : !range ? (
        <div className="text-center text-gray-400 py-12">אין נתונים לתקופה זו.</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={<CalendarCheck className="w-5 h-5" />} label="הזמנות" value={range.total_reservations} now={range.total_reservations} was={cmp?.total_reservations} />
            <Kpi icon={<Users className="w-5 h-5" />} label="סועדים" value={range.total_guests} now={range.total_guests} was={cmp?.total_guests} />
            <Kpi icon={<Users className="w-5 h-5" />} label="ממוצע לשולחן" value={range.avg_party} now={range.avg_party} was={cmp?.avg_party} />
            <Kpi icon={<Users className="w-5 h-5" />} label="לקוחות ייחודיים" value={range.unique_customers} now={range.unique_customers} was={cmp?.unique_customers} />
            <Kpi icon={<UserX className="w-5 h-5" />} label="שיעור הברזות" value={range.no_show_rate} suffix="%" now={range.no_show_rate} was={cmp?.no_show_rate} />
          </div>

          {/* Source breakdown */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h2 className="font-black text-gray-900 mb-3">📊 מאיפה הגיעו ההזמנות</h2>
              {range.by_source.length === 0 ? <p className="text-sm text-gray-400">אין נתונים.</p> : (
                <div className="space-y-2">
                  {range.by_source.map(s => {
                    const m = srcMeta(s.key);
                    const active = srcFilter === s.key;
                    return (
                      <button key={s.key} onClick={() => setSrcFilter(active ? null : s.key)} title="לחץ כדי לסנן את הרשימה המפורטת"
                        className={`w-full flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors ${active ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-gray-50'}`}>
                        <div className="w-28 sm:w-36 shrink-0 text-sm font-bold text-gray-700 truncate text-right">{m.emoji} {m.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full flex items-center justify-end px-2" style={{ width: `${maxSource ? (s.count / maxSource) * 100 : 0}%`, minWidth: s.count ? '2rem' : 0 }}>
                            <span className="text-[11px] font-black text-white tabular-nums">{s.count}</span>
                          </div>
                        </div>
                        <div className="w-24 shrink-0 text-[11px] text-gray-500 text-left tabular-nums">{s.guests} סועדים · {pct(s.count, range.total_reservations)}%</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Campaigns */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h2 className="font-black text-gray-900 mb-3">🎯 קמפיינים (UTM)</h2>
                {range.by_campaign.filter(c => c.key !== '(ללא קמפיין)').length === 0 ? (
                  <p className="text-sm text-gray-400">אין קמפיינים מתויגים בתקופה זו. הוסף <code className="text-[11px] bg-gray-100 px-1 rounded">?utm_campaign=</code> לקישורים.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-[11px] text-gray-400 text-right"><th className="font-medium pb-1">קמפיין</th><th className="font-medium pb-1 text-left">הזמנות</th><th className="font-medium pb-1 text-left">סועדים</th></tr></thead>
                    <tbody>
                      {range.by_campaign.map(c => (
                        <tr key={c.key} className="border-t border-gray-100">
                          <td className="py-1.5 font-bold text-gray-700 truncate max-w-[160px]">{c.key}</td>
                          <td className="py-1.5 text-left tabular-nums">{c.count}</td>
                          <td className="py-1.5 text-left tabular-nums text-gray-500">{c.guests}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Status breakdown */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h2 className="font-black text-gray-900 mb-3">📋 סטטוס ההזמנות</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(range.by_status).sort((a, b) => b[1] - a[1]).map(([st, n]) => {
                    const L = { confirmed: 'מאושר', seated: 'ישב', completed: 'הושלם', pending: 'ממתין', cancelled: 'בוטל', no_show: 'הבריז', standby: 'המתנה', request: 'בקשה' }[st] || st;
                    return <span key={st} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm"><span className="font-black tabular-nums">{n}</span><span className="text-gray-500 text-xs">{L}</span></span>;
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily timeline */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h2 className="font-black text-gray-900 mb-3">📅 הזמנות לאורך התקופה</h2>
              {range.daily.length === 0 ? <p className="text-sm text-gray-400">אין נתונים.</p> : (
                <div className="flex items-end gap-0.5 h-40 overflow-x-auto pb-1" dir="ltr">
                  {range.daily.map(d => (
                    <div key={d.date} className="flex flex-col items-center justify-end shrink-0" style={{ width: `${Math.max(6, 100 / range.daily.length)}%`, minWidth: 8 }} title={`${d.date}: ${d.count} הזמנות, ${d.guests} סועדים`}>
                      <div className="w-full bg-indigo-400 hover:bg-indigo-600 rounded-t" style={{ height: `${maxDaily ? (d.count / maxDaily) * 100 : 0}%`, minHeight: d.count ? 3 : 0 }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-[10px] text-gray-400 mt-1" dir="ltr">
                <span>{range.daily[0]?.date}</span>
                <span>{range.daily[range.daily.length - 1]?.date}</span>
              </div>
            </CardContent>
          </Card>

          {/* Detailed drill-down — WHO came via WHICH campaign, per reservation */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-black text-gray-900">🔎 כל ההזמנות — מפורט <span className="text-xs font-normal text-gray-400">({filtered.length})</span></h2>
                <div className="flex items-center gap-2">
                  {srcFilter && (
                    <button onClick={() => setSrcFilter(null)} className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">
                      {srcMeta(srcFilter).emoji} {srcMeta(srcFilter).label} ✕
                    </button>
                  )}
                  <Input value={q} onChange={e => setQ(e.target.value)} placeholder="חפש שם / טלפון / קמפיין…" className="h-9 w-48 sm:w-56 text-sm" />
                </div>
              </div>
              {filtered.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">אין הזמנות תואמות.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-[11px] text-gray-400 text-right border-b border-gray-200">
                        <th className="font-medium pb-2 pr-1">לקוח</th>
                        <th className="font-medium pb-2">מתי</th>
                        <th className="font-medium pb-2 text-center">סועדים</th>
                        <th className="font-medium pb-2">סטטוס</th>
                        <th className="font-medium pb-2">מקור</th>
                        <th className="font-medium pb-2">קמפיין</th>
                        <th className="font-medium pb-2">Medium</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => {
                        const m = srcMeta(r.source);
                        return (
                          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                            <td className="py-2 pr-1">
                              <div className="font-bold text-gray-800">{r.customer_name || '—'}</div>
                              <div className="text-[11px] text-gray-400" dir="ltr">{r.customer_phone}{r.customer_email ? ` · ${r.customer_email}` : ''}</div>
                            </td>
                            <td className="py-2 whitespace-nowrap text-gray-600 text-xs">{r.date}<br />{r.time}</td>
                            <td className="py-2 text-center tabular-nums">{r.party_size}</td>
                            <td className="py-2"><span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_COLOR[r.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_L[r.status] || r.status}</span></td>
                            <td className="py-2 whitespace-nowrap">{m.emoji} {m.label}</td>
                            <td className="py-2 font-bold text-indigo-700 truncate max-w-[160px]" title={r.campaign}>{r.campaign || <span className="text-gray-300 font-normal">—</span>}</td>
                            <td className="py-2 text-gray-500 text-xs">{r.medium || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {cmp && (
            <p className="text-[11px] text-gray-400 text-center">משווה מול {cmp.from} – {cmp.to} ({cmp.total_reservations} הזמנות).</p>
          )}
        </>
      )}
    </div>
  );
}
