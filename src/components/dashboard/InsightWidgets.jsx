// The owner "decision KPIs" row — six cards, each backed by REAL data from
// getOwnerInsights (labor%, cash flow, churn, tomorrow's demand, price drift,
// menu profitability). When a source has no data yet (no pay rates, analysis
// not run) the card shows an honest call-to-action, never a fabricated number.
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useOwnerInsights } from '@/hooks/useOwnerInsights';
import LaborCostCard from './LaborCostCard';
import { Loader2, Users2, Wallet, UserMinus, TrendingUp, PackageSearch, Utensils, ArrowLeft } from 'lucide-react';

const ils = (n) => `₪${Number(n || 0).toLocaleString()}`;

function Shell({ to, icon: Icon, tone, title, children, cta }) {
  return (
    <Link to={to} className="block group">
      <div className="rounded-2xl border bg-white p-4 h-full transition-all hover:shadow-md" style={{ borderColor: '#E8D9B5' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: tone.bg }}>
              <Icon className="w-4.5 h-4.5" style={{ color: tone.fg, width: 18, height: 18 }} />
            </span>
            <span className="text-sm font-bold text-slate-700">{title}</span>
          </div>
          <ArrowLeft className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </div>
        <div>{children}</div>
        {cta && <div className="text-[11px] font-semibold mt-1.5" style={{ color: tone.fg }}>{cta}</div>}
      </div>
    </Link>
  );
}

const Big = ({ children, color }) => <div className="text-2xl font-black tabular-nums leading-none" style={{ color: color || '#1F1B17' }}>{children}</div>;
const Sub = ({ children }) => <div className="text-xs text-slate-500 mt-1 leading-snug">{children}</div>;

// A trend has {series:[numbers], delta_pct, good:'higher'|'lower', points}. The
// delta colour reflects DESIRABILITY, not sign: a rising food-cost% is red even
// though it went "up". Both sparkline and badge appear only once ≥2 days exist.
const isGoodMove = (t) => t?.delta_pct == null ? null : (t.good === 'higher' ? t.delta_pct > 0 : t.delta_pct < 0);

function Sparkline({ trend }) {
  if (!trend || !Array.isArray(trend.series) || trend.series.length < 2) return null;
  const s = trend.series, w = 66, h = 20, pad = 2;
  const min = Math.min(...s), max = Math.max(...s), span = (max - min) || 1;
  const step = (w - pad * 2) / (s.length - 1);
  const xy = (v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / span)];
  const pts = s.map((v, i) => xy(v, i).map((n) => n.toFixed(1)).join(',')).join(' ');
  const good = isGoodMove(trend);
  const stroke = good == null ? '#94a3b8' : good ? '#16a34a' : '#ef4444';
  const [lx, ly] = xy(s[s.length - 1], s.length - 1);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="1.8" fill={stroke} />
    </svg>
  );
}

function TrendRow({ trend }) {
  if (!trend || !(trend.points >= 2) || trend.delta_pct == null) return null;
  const d = trend.delta_pct, good = isGoodMove(trend);
  const color = d === 0 ? '#94a3b8' : good ? '#15803d' : '#dc2626';
  const arrow = d === 0 ? '→' : d > 0 ? '▲' : '▼';
  return (
    <div className="flex items-center gap-2 mt-2">
      <Sparkline trend={trend} />
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{arrow} {d > 0 ? '+' : ''}{d}%</span>
      <span className="text-[10px] text-slate-400">מ-7 ימים</span>
    </div>
  );
}

export default function InsightWidgets() {
  const { data, loading } = useOwnerInsights();

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 flex justify-center" style={{ borderColor: '#E8D9B5' }}>
        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
      </div>
    );
  }

  const { labor, cashflow, churn, demand, price_drift: drift, menu } = data;
  const trends = data._trends || {};

  return (
    <section>
      <h2 className="text-2xl font-bold text-slate-900 mb-4">מדדי החלטה · המספרים שחשובים היום</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

        {/* Labor cost % */}
        {/* Reads the SCHEDULE via getScheduleLaborCost — same engine as the
            schedule grid, so the two can never show different numbers. */}
        <LaborCostCard />

        {/* Cash flow */}
        <Shell to={createPageUrl('CashFlow')} icon={Wallet} title="תזרים השבוע"
          tone={{ bg: '#E1F0EC', fg: '#0f766e' }}
          cta="לתזרים המלא →">
          {cashflow?.net == null
            ? <><Big color="#94a3b8">—</Big><Sub>אין עדיין נתוני תזרים</Sub></>
            : <><Big color={cashflow.net < 0 ? '#dc2626' : '#0f766e'}>{ils(cashflow.net)}</Big>
                <Sub>{ils(cashflow.income)} נכנס · {ils(cashflow.expense)} יוצא{cashflow.alerts ? ` · ⚠️ ${cashflow.alerts} התראות` : ''}</Sub>
                <TrendRow trend={trends.cashflow_net} /></>}
        </Shell>

        {/* Churn risk */}
        <Shell to={createPageUrl('SmartPrediction')} icon={UserMinus} title="סיכון עזיבת עובדים"
          tone={{ bg: '#F3E6F0', fg: '#9333ea' }}
          cta={churn?.last ? 'לניתוח העזיבות →' : 'הרץ ניתוח עזיבות →'}>
          {!churn?.last
            ? <><Big color="#94a3b8">—</Big><Sub>עוד לא הורץ ניתוח</Sub></>
            : churn.count === 0
              ? <><Big color="#4b7a2b">0</Big><Sub>אף עובד לא בסיכון גבוה 👍</Sub></>
              : <><Big color={churn.critical ? '#dc2626' : '#d97706'}>{churn.count}</Big>
                  <Sub>עובדים בסיכון גבוה{churn.critical ? ` · ${churn.critical} קריטי` : ''}</Sub>
                  <TrendRow trend={trends.churn_count} /></>}
        </Shell>

        {/* Tomorrow demand */}
        <Shell to={createPageUrl('SmartPrediction')} icon={TrendingUp} title="תחזית ביקוש למחר"
          tone={{ bg: '#E4EDFB', fg: '#2563eb' }}
          cta="לחיזוי המלא →">
          {demand?.covers == null
            ? <><Big color="#94a3b8">—</Big><Sub>אין מספיק היסטוריית קופה</Sub></>
            : <><Big color="#2563eb">~{demand.covers}</Big>
                <Sub>סועדים צפויים · ~{ils(demand.revenue)}{demand.based_on_days ? ` (מ-${demand.based_on_days} ימים)` : ''}</Sub>
                <TrendRow trend={trends.demand_covers} /></>}
        </Shell>

        {/* Supplier price drift */}
        <Shell to={createPageUrl('SmartPrediction')} icon={PackageSearch} title="התייקרות ספקים"
          tone={{ bg: '#FBEADF', fg: '#c2410c' }}
          cta="לניתוח ההתייקרויות →">
          {drift == null
            ? <><Big color="#94a3b8">—</Big><Sub>אין מספיק חשבוניות</Sub></>
            : drift.count === 0
              ? <><Big color="#4b7a2b">0</Big><Sub>לא זוהתה התייקרות מהותית</Sub></>
              : <><Big color="#c2410c">{drift.count}</Big>
                  <Sub>מוצרים התייקרו{drift.top ? ` · ${drift.top.product} +${drift.top.drift_pct}%` : ''}</Sub>
                  <TrendRow trend={trends.price_drift} /></>}
        </Shell>

        {/* Menu profitability — from the owner's REAL recipe food-costs
            (Recipe.food_cost_percent). Lower % = more profitable. */}
        <Shell to={createPageUrl(menu?.source === 'llm' ? 'SmartPrediction' : 'Recipes')} icon={Utensils} title="רווחיות מנות"
          tone={{ bg: '#F5ECD6', fg: '#a16207' }}
          cta={menu?.analyzed ? 'לניהול המתכונים →' : 'הזן עלויות במתכונים →'}>
          {!menu?.analyzed
            ? <><Big color="#94a3b8">—</Big><Sub>{menu?.suspect ? `${menu.suspect} מנות עם עלות חריגה — תקן במתכונים` : 'הזן מחיר מכירה + עלות מרכיבים במתכונים'}</Sub></>
            : menu.source === 'recipes'
              ? <><Big color={menu.avg_food_cost_pct > 32 ? '#e11d48' : '#15803d'}>{menu.avg_food_cost_pct}%</Big>
                  <div className="text-xs font-bold text-emerald-700 truncate">⬆ {menu.best} · {menu.best_pct}% פוד-קוסט</div>
                  <div className="text-xs font-bold text-rose-600 truncate">⬇ {menu.bottom} · {menu.bottom_pct}%</div>
                  <Sub>פוד-קוסט ממוצע · {menu.analyzed} מנות מתומחרות{menu.high_cost_count ? ` · ${menu.high_cost_count} מעל 35%` : ''}{menu.suspect ? ` · ⚠${menu.suspect} עלות חריגה` : ''}</Sub>
                  <TrendRow trend={trends.food_cost_pct} /></>
              : <><div className="text-sm font-bold text-emerald-700 truncate">⬆ {menu.top || '—'}</div>
                  <div className="text-sm font-bold text-rose-600 truncate mt-0.5">⬇ {menu.bottom || '—'}</div>
                  <Sub>הכי / הכי פחות רווחית ({menu.analyzed} מנות)</Sub></>}
        </Shell>

      </div>
    </section>
  );
}
