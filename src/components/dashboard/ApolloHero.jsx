// Apollo control-panel hero — sits at the top of the owner Dashboard. All data
// is REAL (getOwnerDashboard, per-tenant): freedom index, who's on shift now,
// today's pulse, what Apollo did (agent feed), and what still needs the owner.
// The header is a cinematic cover-photo banner (per-tenant branding) so every
// business gets its own premium identity — falls back to a gold/espresso glow.
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import ActiveEmployeesWidget from './ActiveEmployeesWidget';
import { Loader2, RefreshCw, Brain, Target, ScanLine, Users, CalendarDays, AlertTriangle, ClipboardCheck, Sparkles, ChevronDown } from 'lucide-react';

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
  const branding = useTenantBranding();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pct, setPct] = useState(0);
  const [showShift, setShowShift] = useState(false);
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
  const cover = branding?.cover_photo_url;
  const brandName = branding?.name && branding.name !== 'TOP APOLLO' ? branding.name : (d.restaurant_name || '');
  const R = 46, C = 2 * Math.PI * R, off = C - (C * (pct / 100));

  const tiles = [
    { icon: Users, label: 'במשמרת', value: active.length, tone: A.good, toggle: true },
    { icon: CalendarDays, label: 'הזמנות היום', value: d.reservations_today ?? 0, tone: A.blue, to: 'Reservations' },
    ...(d.sales_today != null ? [{ icon: Target, label: 'מכירות היום', value: `₪${Number(d.sales_today).toLocaleString()}`, tone: A.gold }] : []),
    { icon: ClipboardCheck, label: 'צ׳קליסטים · בוצע/נשאר', value: `${d.checklists?.done ?? 0}/${d.checklists?.total ?? 0}`, tone: A.goldLo, to: 'Checklists' },
  ];

  const attention = [
    d.incidents_open ? { icon: AlertTriangle, label: 'תקריות פתוחות', value: d.incidents_open, url: 'Incidents' } : null,
    d.candidates_pending ? { icon: Users, label: 'מועמדים לאישור', value: d.candidates_pending, url: 'RecruitmentInterviews' } : null,
    d.tips_unlocked ? { icon: Target, label: 'דוחות טיפים פתוחים', value: d.tips_unlocked, url: 'Tips' } : null,
  ].filter(Boolean);

  return (
    <div dir="rtl" className="rounded-3xl mb-5 overflow-hidden" style={{ border: `1px solid ${A.line}`, boxShadow: '0 22px 50px rgba(36,24,17,.20)' }}>
      {/* ── CINEMATIC HERO BANNER (per-tenant cover photo) ─────────────────── */}
      <div className="relative isolate" style={{ minHeight: 210 }}>
        {cover
          ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: -2 }} />
          : <div className="absolute inset-0" style={{ zIndex: -2, background: `linear-gradient(135deg, ${A.espresso} 0%, ${A.espresso2} 48%, ${A.goldLo} 120%)` }} />}
        {/* darkening + gold-glow overlays */}
        <div className="absolute inset-0" style={{ zIndex: -1, background: cover
          ? 'linear-gradient(180deg, rgba(20,13,8,.62) 0%, rgba(20,13,8,.34) 38%, rgba(18,11,7,.92) 100%)'
          : 'radial-gradient(120% 90% at 82% 8%, rgba(235,208,138,.28), transparent 60%)' }} />

        {/* brand row */}
        <div className="relative flex items-start justify-between px-5 pt-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(160deg,${A.goldHi},${A.goldLo})`, boxShadow: '0 6px 18px rgba(201,161,90,.45)' }}>
              {branding?.logo_url ? <img src={branding.logo_url} alt="" className="w-7 h-7 object-contain rounded-lg" /> : <Brain className="w-5 h-5" style={{ color: '#2a1c0e' }} />}
            </span>
            <div className="min-w-0">
              {brandName && <div className="font-black text-[19px] leading-tight truncate" style={{ color: '#fff', fontFamily: 'Georgia, serif', textShadow: '0 2px 12px rgba(0,0,0,.55)' }}>{brandName}</div>}
              <div className="flex items-center gap-1.5 text-[11px] font-bold mt-0.5" style={{ color: A.goldHi, textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
                <Sparkles className="w-3 h-3" /> TOP Apollo · <span style={{ color: '#9be08a' }}>● סטטוס תפעול אוטומטי</span>
              </div>
            </div>
          </div>
          <button onClick={load} className="w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-sm shrink-0" style={{ background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)' }}><RefreshCw className="w-4 h-4" style={{ color: '#fff' }} /></button>
        </div>

        {/* freedom index + apollo summary, on the banner */}
        <div className="relative flex items-center gap-4 px-5 pt-3 pb-5">
          <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
            <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,.45))' }}>
              <defs><linearGradient id="apGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={A.goldHi} /><stop offset="1" stopColor={A.gold} /></linearGradient></defs>
              <circle cx="56" cy="56" r={R} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="9" />
              <circle cx="56" cy="56" r={R} fill="none" stroke="url(#apGold)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: reduce ? 'none' : 'stroke-dashoffset .35s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-black leading-none" style={{ fontSize: 30, color: '#fff', fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>{pct}<span style={{ fontSize: 15, color: A.goldHi }}>%</span></div>
              <div className="text-[9px] font-bold mt-1" style={{ color: A.goldHi }}>מדד החופש</div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-black" style={{ color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>אפולו טיפל ב-{f.automated ?? 0} פעולות היום 🎯</div>
            <div className="text-[12px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,.82)' }}>
              {f.breakdown?.whatsapp ? `💬 ${f.breakdown.whatsapp} תגובות וואטסאפ · ` : ''}
              {f.breakdown?.reservations ? `📅 ${f.breakdown.reservations} הזמנות · ` : ''}
              {f.breakdown?.checklists ? `✅ ${f.breakdown.checklists} צ׳קליסטים` : ''}
              {!f.automated ? 'עוד לא בוצעו פעולות אוטומטיות היום.' : ''}
            </div>
            {f.pending > 0 && <div className="text-[12px] mt-1.5 font-bold inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ color: '#2a1c0e', background: A.goldHi }}>⚠️ {f.pending} דברים עדיין דורשים אותך</div>}
          </div>
        </div>
      </div>

      {/* ── CREAM BODY ──────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(168deg,${A.creamHi} 0%,${A.cream} 60%,#EEDFBF 100%)` }}>
        {/* live tiles — clickable (Link) or a toggle (במשמרת opens the shift panel) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pt-4">
          {tiles.map((t, i) => {
            const inner = (
              <>
                <t.icon className="w-4 h-4 shrink-0" style={{ color: t.tone }} />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[15px] leading-none" style={{ color: A.espresso, fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
                  <div className="text-[10px] font-semibold truncate" style={{ color: A.muted }}>{t.label}</div>
                </div>
                {t.toggle && <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showShift ? 'rotate-180' : ''}`} style={{ color: A.muted }} />}
              </>
            );
            const cls = 'rounded-2xl px-3 py-2.5 flex items-center gap-2 text-right w-full';
            const st = { background: '#fffaf0', border: `1px solid ${A.line}` };
            if (t.toggle) return <button key={i} onClick={() => setShowShift(s => !s)} className={`${cls} hover:shadow-sm transition-shadow`} style={st}>{inner}</button>;
            if (t.to) return <Link key={i} to={createPageUrl(t.to)} className={`${cls} hover:shadow-sm transition-shadow`} style={st}>{inner}</Link>;
            return <div key={i} className={cls} style={st}>{inner}</div>;
          })}
        </div>

        {/* who's on shift now — opens on demand from the "במשמרת" tile */}
        {showShift && <div className="px-4 pt-3"><ActiveEmployeesWidget /></div>}

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
    </div>
  );
}
