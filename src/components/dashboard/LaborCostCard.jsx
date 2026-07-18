import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Loader2, Users2, ArrowLeft, AlertTriangle } from 'lucide-react';

const ils = (n) => `₪${Number(n || 0).toLocaleString()}`;

// Sunday-start week key for a given offset (-1 last, 0 this, +1 next).
function weekStartFor(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PERIODS = [
  { off: -1, label: 'שבוע שעבר' },
  { off: 0, label: 'השבוע' },
  { off: 1, label: 'שבוע הבא' },
];

// Labor cost straight from the SCHEDULE — the exact same engine the schedule
// grid uses (getScheduleLaborCost), so the dashboard can never disagree with
// what the owner sees while building the roster. Owner-only: a 403 hides the
// card entirely rather than showing an empty shell.
export default function LaborCostCard() {
  const [off, setOff] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    base44.functions.getScheduleLaborCost({ week_start: weekStartFor(off) })
      .then((r) => { if (alive) { setData((r?.data ?? r) || {}); setLoading(false); } })
      .catch((e) => {
        if (!alive) return;
        if (/forbidden|unauthorized/i.test(String(e?.message || ''))) setForbidden(true);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [off]);

  if (forbidden) return null;

  const total = data?.total ?? 0;
  const hours = data?.hours ?? 0;
  const budget = data?.budget ?? null;
  const detail = data?.detail || {};
  // Shifts that blew their target — the "brief alert" the owner asked for.
  const overShifts = Object.values(detail).filter((d) => d?.over).length;
  const otPeople = Object.values(detail)
    .reduce((n, d) => n + (d?.staff || []).filter((s) => s.overtime_hours > 0).length, 0);
  const overBudget = budget != null && total > budget;
  const pctOfBudget = budget ? Math.round((total / budget) * 100) : null;
  const hasData = total > 0;

  return (
    <div className="rounded-2xl border bg-white p-4 h-full" style={{ borderColor: '#E8D9B5' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EAF3E1' }}>
            <Users2 style={{ color: '#4b7a2b', width: 18, height: 18 }} />
          </span>
          <span className="text-[13px] font-bold text-slate-700">עלות עבודה</span>
        </div>
        <div className="flex gap-0.5">
          {PERIODS.map((p) => (
            <button key={p.off} onClick={() => setOff(p.off)}
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold transition ${off === p.off ? 'bg-[#44512C] text-white' : 'text-slate-400 hover:text-slate-600'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
      ) : !hasData ? (
        <>
          <div className="text-2xl font-black text-slate-400">—</div>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {data?.has_rates === false ? 'צריך תעריפי שכר' : 'אין סידור לשבוע הזה'}
          </p>
        </>
      ) : (
        <>
          <div className="text-2xl font-black" style={{ color: overBudget ? '#dc2626' : '#4b7a2b' }}>{ils(total)}</div>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {hours} שעות{budget != null ? ` · תקציב ${ils(budget)} (${pctOfBudget}%)` : ''}
          </p>
          {(overShifts > 0 || overBudget || otPeople > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {overBudget && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-50 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> חריגה מתקציב
                </span>
              )}
              {overShifts > 0 && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-orange-50 text-orange-700">
                  {overShifts} משמרות מעל היעד
                </span>
              )}
              {otPeople > 0 && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                  {otPeople} בשעות נוספות
                </span>
              )}
            </div>
          )}
        </>
      )}

      <Link to={createPageUrl('WorkScheduling')} className="mt-2 text-[11px] font-bold flex items-center gap-1" style={{ color: '#44512C' }}>
        לסידור ולפירוט <ArrowLeft className="w-3 h-3" />
      </Link>
    </div>
  );
}
