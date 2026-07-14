// Apollo control-panel hero — sits at the top of the owner Dashboard. All data
// is REAL (getOwnerDashboard, per-tenant): freedom index, who's on shift now,
// today's pulse, what Apollo did (agent feed), and what still needs the owner.
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, RefreshCw, Brain, Target, ScanLine, Users, CalendarDays, AlertTriangle, ClipboardCheck } from 'lucide-react';

const A = {
  gold: '#C9A15A', goldHi: '#EBD08A', goldLo: '#7c5626', espresso: '#241811', espresso2: '#33241a',
  cream: '#F6ECD6', creamHi: '#FCF6E7', blue: '#2E7DFF', ink: '#2A1C12', muted: '#8A755A', good: '#5F8B3D', line: '#E3D3AC',
};

const ilTime = (iso) => { try { return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); } catch { return ''; } };
const agoText = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'עכשיו'; if (m < 60) return `לפני ${m} דק'`;
  const h = Math.round(m / 60); return h < 24 ? `לפני ${h} ש'` : ilTime(iso);
};

export default function ApolloHero() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pct, setPct] = useState(0);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const raf = useRef(0);

  const load = async () => {
    try { const r = await base44.functions.getOwnerDashboard({}); setD(r?.data || r); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Count-up to the freedom pct.
  useEffect(() => {
    const target = d?.freedom?.pct ?? 0;
    if (reduce) { setPct(target); return; }
    let n = 0; cancelAnimationFrame(raf.current);
    const step = () => { n += Math.max(1, Math.round(target / 30)); if (n >= target) { setPct(target); return; } setPct(n); raf.current = requestAnimationFrame(() => setTimeout(step, 24)); };
    step();
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.freedom?.pct]);

  if (loading) {
    return <div className="rounded-3xl p-8 mb-5 flex justify-center" style={{ background: `linear-gradient(165deg,${A.creamHi},${A.cream})`, border: `1px solid ${A.line}` }}><Loader2 className="w-6 h-6 animate-spin" style={{ color: A.gold }} /></div>;
  }
  if (!d) return null;

  const f = d.freedom || {};
  const active = d.active_shift || [];
  const R = 52, C = 2 * Math.PI * R, off = C - (C * (pct / 100));

  const tiles = [
    { icon: Users, label: 'במשמרת', value: active.length, tone: A.good },
    { icon: CalendarDays, label: 'הזמנות היום', value: d.reservations_today ?? 0, tone: A.blue },
    ...(d.sales_today != null ? [{ icon: Target, label: 'מכירות היום', value: `₪${Number(d.sales_today).toLocaleString()}`, tone: A.gold }] : []),
    { icon: ClipboardCheck, label: 'צ׳קליסטים', value: `${d.checklists?.done ?? 0}/${d.checklists?.total ?? 0}`, tone: A.goldLo },
  ];

  const attention = [
    d.incidents_open ? { icon: AlertTriangle, label: 'תקריות פתוחות', value: d.incidents_open, url: 'Incidents' } : null,
    d.candidates_pending ? { icon: Users, label: 'מועמדים לאישור', value: d.candidates_pending, url: 'RecruitmentInterviews' } : null,
    d.tips_unlocked ? { icon: Target, label: 'דוחות טיפים פתוחים', value: d.tips_unlocked, url: 'Tips' } : null,
  ].filter(Boolean);

  return (
    <div dir="rtl" className="rounded-3xl mb-5 overflow-hidden" style={{ background: `linear-gradient(168deg,${A.creamHi} 0%,${A.cream} 60%,#EEDFBF 100%)`, border: `1px solid ${A.line}`, boxShadow: '0 14px 34px rgba(36,24,17,.12)' }}>
      {/* header strip */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(160deg,${A.goldHi},${A.goldLo})` }}><Brain className="w-4.5 h-4.5" style={{ color: '#2a1c0e', width: 18, height: 18 }} /></span>
          <div>
            <div className="font-black text-[15px]" style={{ color: A.espresso, fontFamily: 'Georgia, serif', letterSpacing: '.02em' }}>TOP Apollo</div>
            <div className="text-[11px] font-semibold" style={{ color: A.good }}>● סטטוס תפעול: אוטומטי</div>
          </div>
        </div>
        <button onClick={load} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#fff8ea', border: `1px solid ${A.line}` }}><RefreshCw className="w-4 h-4" style={{ color: A.muted }} /></button>
      </div>

      {/* freedom index + what apollo did */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
          <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
            <defs><linearGradient id="apGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={A.goldHi} /><stop offset="1" stopColor={A.goldLo} /></linearGradient></defs>
            <circle cx="64" cy="64" r={R} fill="none" stroke="#E7D6AC" strokeWidth="11" />
            <circle cx="64" cy="64" r={R} fill="none" stroke="url(#apGold)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: reduce ? 'none' : 'stroke-dashoffset .3s' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-black leading-none" style={{ fontSize: 32, color: A.espresso, fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums' }}>{pct}<span style={{ fontSize: 16, color: A.goldLo }}>%</span></div>
            <div className="text-[9px] font-bold mt-1" style={{ color: A.muted }}>מדד החופש</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold" style={{ color: A.espresso }}>אפולו טיפל ב-{f.automated ?? 0} פעולות היום 🎯</div>
          <div className="text-[11.5px] mt-1 leading-relaxed" style={{ color: A.muted }}>
            {f.breakdown?.whatsapp ? `💬 ${f.breakdown.whatsapp} תגובות וואטסאפ · ` : ''}
            {f.breakdown?.reservations ? `📅 ${f.breakdown.reservations} הזמנות · ` : ''}
            {f.breakdown?.checklists ? `✅ ${f.breakdown.checklists} צ׳קליסטים` : ''}
            {!f.automated ? 'עוד לא בוצעו פעולות אוטומטיות היום.' : ''}
          </div>
          {f.pending > 0 && <div className="text-[11.5px] mt-1.5 font-semibold" style={{ color: A.goldLo }}>⚠️ {f.pending} דברים עדיין דורשים אותך (למטה)</div>}
        </div>
      </div>

      {/* live tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-2xl px-3 py-2.5 flex items-center gap-2" style={{ background: '#fffaf0', border: `1px solid ${A.line}` }}>
            <t.icon className="w-4 h-4 shrink-0" style={{ color: t.tone }} />
            <div className="min-w-0">
              <div className="font-black text-[15px] leading-none" style={{ color: A.espresso, fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
              <div className="text-[10px] font-semibold truncate" style={{ color: A.muted }}>{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Active-on-shift lives in the real ActiveEmployeesWidget rendered right
          below the hero (accurate, today-scoped, with dept tabs + close-shift). */}

      {/* agent feed */}
      {(d.feed || []).length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl p-3" style={{ background: `linear-gradient(170deg,${A.espresso2},${A.espresso})` }}>
          <div className="flex items-center gap-2 text-[11.5px] font-bold mb-2" style={{ color: '#e6d0a2' }}>
            <Brain className="w-4 h-4" style={{ color: A.blue }} /> אפולו מהוואטסאפ שלך
            <span className="ms-auto text-[10px] flex items-center gap-1" style={{ color: '#bfe0ff' }}><i style={{ width: 6, height: 6, borderRadius: 9, background: '#6FA8FF', display: 'inline-block' }} />חי</span>
          </div>
          <div className="space-y-1.5">
            {d.feed.slice(0, 3).map((m, i) => (
              <div key={i} className="rounded-xl px-2.5 py-2 text-[12px] leading-snug" style={{ background: '#f6efdd', color: A.ink }}>
                <span className="text-[10px] font-bold block mb-0.5" style={{ color: '#9a7f57' }}>🤖 {agoText(m.at)}</span>{m.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* needs attention */}
      {attention.length > 0 && (
        <div className="px-4 pt-3">
          <div className="text-[11px] font-bold mb-1.5" style={{ color: A.muted }}>דורש אותך</div>
          <div className="flex gap-2 flex-wrap">
            {attention.map((a, i) => (
              <Link key={i} to={createPageUrl(a.url)} className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold" style={{ background: '#fff1e6', color: '#9b4a1a', border: '1px solid #f0cba9' }}>
                <a.icon className="w-3.5 h-3.5" /> {a.label} <span className="rounded-full px-1.5" style={{ background: '#9b4a1a', color: '#fff', fontSize: 11 }}>{a.value}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI tools rail */}
      <div className="grid grid-cols-3 gap-2 px-4 py-4">
        <Link to={createPageUrl('AIHub')} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px]" style={{ background: `linear-gradient(160deg,${A.goldHi},${A.gold})`, color: '#2a1c0e', boxShadow: '0 6px 14px rgba(201,161,90,.35)' }}><Brain className="w-5 h-5" /> כלי AI</Link>
        <Link to={createPageUrl('RecruitmentInterviews')} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px]" style={{ background: '#fff8ea', color: A.espresso, border: `1px solid ${A.line}` }}><Target className="w-5 h-5" style={{ color: A.goldLo }} /> סוכן גיוס</Link>
        <Link to={createPageUrl('Invoices')} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px]" style={{ background: '#fff8ea', color: A.espresso, border: `1px solid ${A.line}` }}><ScanLine className="w-5 h-5" style={{ color: A.goldLo }} /> סורק AI</Link>
      </div>
    </div>
  );
}
