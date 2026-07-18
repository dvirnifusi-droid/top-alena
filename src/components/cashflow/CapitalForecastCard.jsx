import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingDown, AlertTriangle, Info, ChevronDown } from 'lucide-react';

const ils = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
const signed = (n) => `${n >= 0 ? '+' : '−'}${ils(Math.abs(n))}`;
const CONF = { high: 'ודאות גבוהה', medium: 'ודאות בינונית', low: 'הערכה' };
const CONF_CLS = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

// צפי הון — the balance day by day, built from real obligations plus the
// rhythms learned from the owner's own bank history.
export default function CapitalForecastCard() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [openDay, setOpenDay] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const r = await base44.functions.getCapitalForecast({ days: d });
      setData((r?.data ?? r) || null);
    } catch (e) {
      if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  if (denied) return null;

  return (
    <Card dir="rtl" className="mb-6 border-indigo-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">📈 צפי הון</span>
          <div className="flex gap-1">
            {[30, 60, 90].map((d) => (
              <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'}
                className={`h-7 px-2.5 text-xs ${days === d ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
                onClick={() => setDays(d)}>{d} יום</Button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : !data ? (
          <p className="text-sm text-slate-500 text-center py-4">לא הצלחתי לטעון את הצפי</p>
        ) : !data.has_data ? (
          <p className="text-sm text-slate-600 text-center py-4">{data.reason}</p>
        ) : (
          <>
            {/* headline */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label={`יתרה היום (${data.opening.date})`} value={data.opening.balance} />
              <Kpi label={`צפי בעוד ${data.horizon} יום`} value={data.closing.balance} big />
              <Kpi label={`הנקודה הנמוכה — ${data.min_point.date}`} value={data.min_point.balance}
                warn={data.min_point.balance < 0} />
              <Kpi label="תנועה נטו בתקופה" value={data.net} />
            </div>

            {/* the thing an owner actually needs to know */}
            {data.first_beyond_credit ? (
              <Alarm tone="red" icon={AlertTriangle}
                title={`חריגה ממסגרת האשראי ב-${data.first_beyond_credit}`}
                body={`המסגרת שלך היא ${ils(data.credit_line)}. לפי הצפי הנוכחי היא נגמרת בתאריך הזה — זה התאריך שצריך לעבוד לאחור ממנו.`} />
            ) : data.first_negative ? (
              <Alarm tone="amber" icon={TrendingDown}
                title={`היתרה נכנסת למינוס ב-${data.first_negative}`}
                body={data.credit_line ? `עדיין בתוך המסגרת (${ils(data.credit_line)}), אבל מכאן אתה על אשראי.` : 'שים לב — מכאן החשבון במינוס.'} />
            ) : (
              <Alarm tone="emerald" icon={Info} title="החשבון נשאר חיובי לאורך כל התקופה"
                body="לפי הדפוסים שנלמדו והחשבוניות הפתוחות." />
            )}

            <BalanceChart days={data.days} creditLine={data.credit_line} />

            {/* drivers */}
            <div>
              <h4 className="text-sm font-semibold mb-2">מה מזיז את הכסף ב-{data.horizon} הימים</h4>
              <div className="space-y-1">
                {data.drivers.slice(0, 9).map((d) => {
                  const max = Math.max(...data.drivers.map((x) => Math.abs(x.total))) || 1;
                  const pct = Math.round((Math.abs(d.total) / max) * 100);
                  return (
                    <div key={d.category} className="text-xs">
                      <div className="flex justify-between">
                        <span>{d.label}</span>
                        <span className={`tabular-nums font-medium ${d.total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {signed(d.total)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded mt-0.5">
                        <div className={`h-1.5 rounded ${d.total >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* how much of this is guesswork */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800">
                {data.known_invoices} חשבוניות עם מועד תשלום ידוע
              </span>
              {data.overdue_invoices > 0 && (
                <span className="rounded-full px-2 py-0.5 bg-red-50 border border-red-200 text-red-800">
                  {data.overdue_invoices} באיחור · {ils(data.overdue_amount)}
                </span>
              )}
              <span className="rounded-full px-2 py-0.5 bg-slate-100 border text-slate-600">
                {data.estimate_share}% מהיציאות הן הערכה ולא חשבונית
              </span>
            </div>

            {(data.warnings || []).map((w, i) => (
              <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                ⚠ {w}
              </p>
            ))}

            {/* transparency: what was learned, and from what */}
            <div>
              <button className="text-xs text-indigo-700 flex items-center gap-1"
                onClick={() => setShowPatterns((s) => !s)}>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPatterns ? 'rotate-180' : ''}`} />
                מה למדתי מהעו"ש שלך ({data.patterns.length} דפוסים)
              </button>
              {showPatterns && (
                <div className="mt-2 space-y-1.5">
                  {data.patterns.map((p) => (
                    <div key={p.category} className="text-xs border rounded-lg p-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-medium">{p.dir === 'in' ? '↓ ' : '↑ '}{p.label}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className={`rounded-full px-1.5 py-0.5 border text-[10px] ${CONF_CLS[p.confidence]}`}>
                            {CONF[p.confidence]}
                          </span>
                          <span className="tabular-nums font-semibold">{ils(p.monthly_total)}/חודש</span>
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5">{p.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* upcoming days with real movement */}
            <div>
              <h4 className="text-sm font-semibold mb-2">הימים הקרובים</h4>
              <div className="space-y-1">
                {data.days.filter((d) => d.events.length > 0).slice(0, 14).map((d) => (
                  <div key={d.date} className="text-xs border rounded-lg overflow-hidden">
                    <button className="w-full flex justify-between items-center p-2 hover:bg-slate-50"
                      onClick={() => setOpenDay(openDay === d.date ? null : d.date)}>
                      <span className="font-medium">{d.date}</span>
                      <span className="flex items-center gap-2">
                        {d.in > 0 && <span className="text-emerald-700">+{ils(d.in)}</span>}
                        {d.out > 0 && <span className="text-red-600">−{ils(d.out)}</span>}
                        <span className={`font-bold tabular-nums ${d.balance < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                          {ils(d.balance)}
                        </span>
                      </span>
                    </button>
                    {openDay === d.date && (
                      <div className="bg-slate-50 p-2 space-y-1 border-t">
                        {d.events.map((e, i) => (
                          <div key={i}>
                            <div className="flex justify-between">
                              <span>{e.label}</span>
                              <span className={e.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}>{signed(e.amount)}</span>
                            </div>
                            <p className="text-[10px] text-slate-500">{e.source}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, big, warn }) {
  const neg = Number(value) < 0;
  return (
    <div className={`rounded-lg border p-2.5 ${warn ? 'border-red-200 bg-red-50' : 'bg-white'}`}>
      <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
      <p className={`${big ? 'text-lg' : 'text-base'} font-bold tabular-nums ${neg ? 'text-red-600' : 'text-emerald-700'}`}>
        {ils(value)}
      </p>
    </div>
  );
}

function Alarm({ tone, icon: Icon, title, body }) {
  const cls = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-90">{body}</p>
      </div>
    </div>
  );
}

// Balance over time. Zero and the credit line are drawn as reference lines
// because they are the only two numbers on this chart with consequences.
function BalanceChart({ days, creditLine }) {
  if (!days?.length) return null;
  const W = 720, H = 170, PAD = 4;
  const vals = days.map((d) => d.balance);
  const lo = Math.min(...vals, 0, creditLine ? -creditLine : 0);
  const hi = Math.max(...vals, 0);
  const range = (hi - lo) || 1;
  const x = (i) => PAD + (i / Math.max(1, days.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - lo) / range) * (H - PAD * 2);

  const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join('');
  const area = `${line}L${x(days.length - 1).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" style={{ height: H }}>
        <defs>
          <linearGradient id="cfg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {lo < 0 && (
          <rect x={PAD} y={y(0)} width={W - PAD * 2} height={Math.max(0, H - PAD - y(0))}
            fill="#fee2e2" opacity="0.5" />
        )}
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
        {creditLine > 0 && (
          <line x1={PAD} x2={W - PAD} y1={y(-creditLine)} y2={y(-creditLine)}
            stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5 3" />
        )}
        <path d={area} fill="url(#cfg)" />
        <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="flex gap-3 text-[10px] text-slate-500 justify-end">
        <span>{days[0].date}</span>
        <span>←</span>
        <span>{days[days.length - 1].date}</span>
        {creditLine > 0 && <span className="text-red-600">— — קו מסגרת האשראי</span>}
      </div>
    </div>
  );
}
