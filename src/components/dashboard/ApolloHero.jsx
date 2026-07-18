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
import { Loader2, RefreshCw, Brain, Target, ScanLine, Users, CalendarDays, AlertTriangle, ClipboardCheck, Sparkles, ChevronDown, CheckCircle2, Clock, Copy, ExternalLink, UserPlus, Menu, ListChecks, FileSpreadsheet } from 'lucide-react';

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
  const [showAttention, setShowAttention] = useState(false);
  const [showRes, setShowRes] = useState(false);
  const [showChecklists, setShowChecklists] = useState(false);
  const [showDid, setShowDid] = useState(false);
  const [showRecruit, setShowRecruit] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [copied, setCopied] = useState(false);
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
    { icon: Users, label: 'במשמרת', value: active.length, tone: A.good, toggle: 'shift' },
    { icon: CalendarDays, label: 'הזמנות היום · מוזמנים ושעות', value: d.reservations_today ?? 0, tone: A.blue, toggle: 'res' },
    ...(d.sales_today != null ? [{ icon: Target, label: 'מכירות היום', value: `₪${Number(d.sales_today).toLocaleString()}`, tone: A.gold }] : []),
    { icon: ClipboardCheck, label: 'צ׳קליסטים · בוצע/בתהליך', value: `${d.checklists?.done ?? 0}/${d.checklists?.total ?? 0}`, tone: A.goldLo, toggle: 'checklist' },
  ];

  // Which inline panel each toggle-tile opens (state + setter, generic).
  const toggleMap = { shift: [showShift, setShowShift], res: [showRes, setShowRes], checklist: [showChecklists, setShowChecklists] };

  // Rich, actionable "needs you" list from the backend (label + count + how + url).
  const ICONS = { incidents: AlertTriangle, candidates: Users, requests: CalendarDays, tips: Target, invoices: ScanLine, inventory: ClipboardCheck };
  const attention = (d.attention || []).map((a) => ({ ...a, icon: ICONS[a.key] || AlertTriangle }));

  // Shareable job-application link (tenant's own origin → /apply).
  const applyUrl = (typeof window !== 'undefined' ? window.location.origin : '') + createPageUrl('JobApplication');
  const copyApply = () => { try { navigator.clipboard.writeText(applyUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const cl = d.checklists_detail || { runs: [], not_started: 0 };
  const rec = d.recruitment || { new_candidates: [], upcoming_interviews: [] };
  const did = d.automated_detail || { whatsapp: [], checklists: [] };

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
            {f.automated > 0 ? (
              <button onClick={() => setShowDid(s => !s)} className="text-[14px] font-black inline-flex items-center gap-1.5 text-right hover:opacity-90 transition" style={{ color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
                אפולו טיפל ב-{f.automated} פעולות היום 🎯
                <ChevronDown className={`w-4 h-4 transition-transform ${showDid ? 'rotate-180' : ''}`} style={{ color: A.goldHi }} />
              </button>
            ) : (
              <div className="text-[14px] font-black" style={{ color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>אפולו טיפל ב-0 פעולות היום 🎯</div>
            )}
            <div className="text-[12px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,.82)' }}>
              {f.breakdown?.whatsapp ? `💬 ${f.breakdown.whatsapp} תגובות וואטסאפ · ` : ''}
              {f.breakdown?.reservations ? `📅 ${f.breakdown.reservations} הזמנות · ` : ''}
              {f.breakdown?.checklists ? `✅ ${f.breakdown.checklists} צ׳קליסטים` : ''}
              {!f.automated ? 'עוד לא בוצעו פעולות אוטומטיות היום.' : ''}
            </div>
            {f.pending > 0 && (
              <button onClick={() => setShowAttention(s => !s)} className="text-[12px] mt-1.5 font-black inline-flex items-center gap-1 rounded-full px-3 py-1.5 hover:brightness-95 transition" style={{ color: '#2a1c0e', background: A.goldHi, boxShadow: '0 3px 10px rgba(0,0,0,.3)' }}>
                ⚠️ {f.pending} דברים דורשים אותך — הצג ואיך לטפל
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAttention ? 'rotate-180' : ''}`} />
              </button>
            )}
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
                {t.toggle && <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${toggleMap[t.toggle]?.[0] ? 'rotate-180' : ''}`} style={{ color: A.muted }} />}
              </>
            );
            const cls = 'rounded-2xl px-3 py-2.5 flex items-center gap-2 text-right w-full';
            const st = { background: '#fffaf0', border: `1px solid ${A.line}` };
            if (t.toggle) { const set = toggleMap[t.toggle][1]; return <button key={i} onClick={() => set(s => !s)} className={`${cls} hover:shadow-sm transition-shadow`} style={st}>{inner}</button>; }
            if (t.to) return <Link key={i} to={createPageUrl(t.to)} className={`${cls} hover:shadow-sm transition-shadow`} style={st}>{inner}</Link>;
            return <div key={i} className={cls} style={st}>{inner}</div>;
          })}
        </div>

        {/* what Apollo actually handled today — opens from the "טיפל ב-N פעולות" line */}
        {showDid && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: `1px solid ${A.line}` }}>
            <div className="px-3 py-2 text-[12px] font-black flex items-center gap-1.5" style={{ background: '#efe7fb', color: '#6d28d9' }}>
              <Brain className="w-4 h-4" /> מה אפולו טיפל בו היום
            </div>
            <div style={{ background: '#fffaf5' }}>
              {/* WhatsApp Apollo answered */}
              {(did.whatsapp || []).length > 0 && (
                <div className="px-3 py-2 border-b" style={{ borderColor: A.line }}>
                  <div className="text-[11px] font-black mb-1.5" style={{ color: A.espresso }}>💬 תגובות וואטסאפ ({f.breakdown?.whatsapp ?? did.whatsapp.length})</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {did.whatsapp.map((w, i) => (
                      <div key={i} className="text-[12px] leading-snug rounded-lg px-2 py-1.5" style={{ background: '#fff', border: `1px solid ${A.line}` }}>
                        <span className="text-[10px] font-bold" style={{ color: '#9a7f57' }}>{ilTime(w.at)}{w.to ? ` · ${w.to}` : ''}</span>
                        <div style={{ color: A.ink }}>{w.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* reservations handled */}
              {(f.breakdown?.reservations ?? 0) > 0 && (
                <div className="px-3 py-2 border-b" style={{ borderColor: A.line }}>
                  <div className="text-[11px] font-black mb-1.5" style={{ color: A.espresso }}>📅 הזמנות שנקלטו ({f.breakdown.reservations})</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {(d.reservations_list || []).slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        <span className="font-black tabular-nums shrink-0" style={{ color: '#2563eb' }}>{r.time || '—'}</span>
                        <span className="flex-1 min-w-0 truncate" style={{ color: A.ink }}>{r.name || 'ללא שם'}</span>
                        <span className="text-[11px] shrink-0" style={{ color: A.muted }}>{r.party || '?'} סועדים</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* checklists completed */}
              {(did.checklists || []).length > 0 && (
                <div className="px-3 py-2">
                  <div className="text-[11px] font-black mb-1.5" style={{ color: A.espresso }}>✅ צ׳קליסטים שהושלמו ({did.checklists.length})</div>
                  <div className="space-y-0.5">
                    {did.checklists.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#4d7a2e' }} />
                        <span className="flex-1 min-w-0 truncate" style={{ color: A.ink }}>{c.title}</span>
                        {c.by && <span className="text-[11px] shrink-0" style={{ color: A.muted }}>{c.by}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(did.whatsapp || []).length === 0 && (did.checklists || []).length === 0 && (f.breakdown?.reservations ?? 0) === 0 && (
                <div className="px-3 py-4 text-center text-[12px]" style={{ color: A.muted }}>אין פירוט זמין לפעולות של היום</div>
              )}
            </div>
          </div>
        )}

        {/* who's on shift now — opens on demand from the "במשמרת" tile */}
        {showShift && <div className="px-4 pt-3"><ActiveEmployeesWidget /></div>}

        {/* today's reservations — names + times, opens from the "הזמנות היום" tile */}
        {showRes && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: `1px solid ${A.line}` }}>
            <div className="px-3 py-2 text-[12px] font-black flex items-center justify-between" style={{ background: '#eef4ff', color: '#2563eb' }}>
              <span>📅 הזמנות להיום</span>
              <Link to={createPageUrl('Reservations')} className="text-[11px] font-bold">לניהול המלא ←</Link>
            </div>
            {(d.reservations_list || []).length === 0
              ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: A.muted, background: '#fffaf5' }}>אין הזמנות להיום</div>
              : <div className="divide-y max-h-64 overflow-y-auto" style={{ background: '#fffaf5' }}>
                  {d.reservations_list.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-black text-[13px] tabular-nums shrink-0" style={{ color: '#2563eb' }}>{r.time || '—'}</span>
                      <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: A.ink }}>{r.name || 'ללא שם'}</span>
                      <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0" style={{ background: '#eef4ff', color: '#2563eb' }}>{r.party || '?'} סועדים</span>
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* checklists — inline summary: which finished, which mid-run + stage.
            Opens from the "צ׳קליסטים" tile, never navigates away. */}
        {showChecklists && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: `1px solid ${A.line}` }}>
            <div className="px-3 py-2 text-[12px] font-black flex items-center justify-between" style={{ background: '#f2f7ec', color: '#4d7a2e' }}>
              <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4" /> צ׳קליסטים היום</span>
              <Link to={createPageUrl('Checklists')} className="text-[11px] font-bold">לניהול המלא ←</Link>
            </div>
            {cl.runs.length === 0
              ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: A.muted, background: '#fffaf5' }}>
                  עדיין לא נפתח צ׳קליסט היום{cl.not_started > 0 ? ` · ${cl.not_started} מוכנים להרצה` : ''}
                </div>
              : <div className="divide-y" style={{ background: '#fffaf5' }}>
                  {cl.runs.map((c, i) => {
                    const done = c.status === 'completed';
                    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                    return (
                      <div key={i} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {done
                            ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4d7a2e' }} />
                            : <Clock className="w-4 h-4 shrink-0" style={{ color: '#c98a2e' }} />}
                          <span className="flex-1 min-w-0 truncate text-[13px] font-bold" style={{ color: A.ink }}>{c.title}</span>
                          <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: done ? '#4d7a2e' : '#c98a2e' }}>{c.done}/{c.total}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: '#ece3d0' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: done ? '#5F8B3D' : '#d8a24a' }} />
                        </div>
                        {!done && c.next && <div className="text-[11px] mt-1" style={{ color: A.muted }}>בשלב: {c.next}</div>}
                        {done && <div className="text-[11px] mt-1" style={{ color: '#4d7a2e' }}>הושלם ✓{c.by ? ` · ${c.by}` : ''}</div>}
                      </div>
                    );
                  })}
                  {cl.not_started > 0 && <div className="px-3 py-2 text-[11.5px]" style={{ color: A.muted }}>+ {cl.not_started} צ׳קליסטים שטרם התחילו היום</div>}
                </div>}
          </div>
        )}

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

        {/* needs attention — the actionable "what needs you + how to handle" panel,
            opened from the ⚠️ pill above. Each row: what · how · action button. */}
        {showAttention && attention.length > 0 && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: '1px solid #f0cba9' }}>
            <div className="px-3 py-2 text-[12px] font-black" style={{ background: '#fff1e6', color: '#9b4a1a' }}>🎯 מה דורש אותך עכשיו</div>
            <div className="divide-y" style={{ background: '#fffaf5' }}>
              {attention.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff1e6' }}><a.icon className="w-4 h-4" style={{ color: '#c2410c' }} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold" style={{ color: A.ink }}>{a.label} <span className="rounded-full px-1.5 text-white text-[11px]" style={{ background: '#c2410c' }}>{a.count}</span></div>
                    <div className="text-[11.5px]" style={{ color: A.muted }}>{a.how}</div>
                  </div>
                  <Link to={createPageUrl(a.url)} className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: '#c2410c' }}>טפל עכשיו</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI tools rail — כלי AI navigates; גיוס + סורק open inline panels */}
        <div className="grid grid-cols-3 gap-2 px-4 py-4">
          <Link to={createPageUrl('AIHub')} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px]" style={{ background: `linear-gradient(160deg,${A.goldHi},${A.gold})`, color: '#2a1c0e', boxShadow: '0 6px 14px rgba(201,161,90,.35)' }}><Brain className="w-5 h-5" /> כלי AI</Link>
          <button onClick={() => { setShowRecruit(s => !s); setShowScanner(false); }} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px] transition" style={{ background: showRecruit ? '#fff1cf' : '#fff8ea', color: A.espresso, border: `1px solid ${showRecruit ? A.gold : A.line}` }}><Target className="w-5 h-5" style={{ color: A.goldLo }} /> סוכן גיוס</button>
          <button onClick={() => { setShowScanner(s => !s); setShowRecruit(false); }} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 font-bold text-[12px] transition" style={{ background: showScanner ? '#fff1cf' : '#fff8ea', color: A.espresso, border: `1px solid ${showScanner ? A.gold : A.line}` }}><ScanLine className="w-5 h-5" style={{ color: A.goldLo }} /> סורק AI</button>
        </div>

        {/* recruitment agent — inline: share link + new candidates + next interviews */}
        {showRecruit && (
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${A.line}` }}>
            <div className="px-3 py-2 text-[12px] font-black flex items-center justify-between" style={{ background: '#fff4e0', color: A.goldLo }}>
              <span className="flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> סוכן הגיוס</span>
              <Link to={createPageUrl('RecruitmentInterviews')} className="text-[11px] font-bold">לניהול המלא ←</Link>
            </div>
            <div style={{ background: '#fffaf5' }}>
              {/* share the application link */}
              <div className="px-3 py-2.5 border-b" style={{ borderColor: A.line }}>
                <div className="text-[11px] font-bold mb-1" style={{ color: A.muted }}>קישור להגשת מועמדות — שלח למועמדים:</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 truncate text-[12px] rounded-lg px-2 py-1.5" style={{ background: '#fff', border: `1px solid ${A.line}`, color: A.ink, direction: 'ltr' }}>{applyUrl}</div>
                  <button onClick={copyApply} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold flex items-center gap-1" style={{ background: A.gold, color: '#2a1c0e' }}>
                    {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> הועתק</> : <><Copy className="w-3.5 h-3.5" /> העתק</>}
                  </button>
                </div>
              </div>
              {/* new candidates */}
              <div className="px-3 py-2">
                <div className="text-[11px] font-black mb-1.5" style={{ color: A.espresso }}>מועמדים חדשים ({rec.new_candidates.length})</div>
                {rec.new_candidates.length === 0
                  ? <div className="text-[12px] pb-1" style={{ color: A.muted }}>אין מועמדים חדשים ממתינים</div>
                  : <div className="space-y-1">
                      {rec.new_candidates.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px]">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black" style={{ background: '#fff1cf', color: A.goldLo }}>{(c.name || '?').slice(0, 1)}</span>
                          <span className="font-bold truncate" style={{ color: A.ink }}>{c.name || 'מועמד'}</span>
                          {c.role && <span className="text-[11px]" style={{ color: A.muted }}>· {c.role}</span>}
                          {c.city && <span className="text-[11px]" style={{ color: A.muted }}>· {c.city}</span>}
                        </div>
                      ))}
                    </div>}
              </div>
              {/* upcoming interviews */}
              <div className="px-3 py-2 border-t" style={{ borderColor: A.line }}>
                <div className="text-[11px] font-black mb-1.5" style={{ color: A.espresso }}>ראיונות קרובים ({rec.upcoming_interviews.length})</div>
                {rec.upcoming_interviews.length === 0
                  ? <div className="text-[12px] pb-1" style={{ color: A.muted }}>אין ראיונות מתוזמנים</div>
                  : <div className="space-y-1">
                      {rec.upcoming_interviews.map((iv, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px]">
                          <span className="font-black tabular-nums shrink-0" style={{ color: A.goldLo }}>{iv.date?.slice(5)} {iv.time}</span>
                          <span className="flex-1 min-w-0 truncate" style={{ color: A.ink }}>{iv.name || 'מועמד'}</span>
                        </div>
                      ))}
                    </div>}
              </div>
            </div>
          </div>
        )}

        {/* AI scanner — inline: what it reads + open the scanner. (The rail button
            used to land on Invoices by mistake; the scanner lives at /Scanner.) */}
        {showScanner && (
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${A.line}` }}>
            <div className="px-3 py-2 text-[12px] font-black flex items-center justify-between" style={{ background: '#fff4e0', color: A.goldLo }}>
              <span className="flex items-center gap-1.5"><ScanLine className="w-4 h-4" /> סורק ה-AI</span>
            </div>
            <div className="px-3 py-3" style={{ background: '#fffaf5' }}>
              <div className="text-[12px] leading-relaxed mb-2.5" style={{ color: A.ink }}>
                צלם או העלה כל מסמך — <b>תפריט, רשימת עובדים, ספקים, צ׳ק-ליסט או רשימת הזמנה</b> — וה-AI מזהה מה זה, קורא, מציג תצוגה מקדימה ומייבא ישר למערכת.
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {[{ i: Menu, t: 'תפריט' }, { i: Users, t: 'עובדים' }, { i: FileSpreadsheet, t: 'ספקים' }, { i: ListChecks, t: 'צ׳ק-ליסט' }, { i: ClipboardCheck, t: 'הזמנה' }, { i: ScanLine, t: 'חשבונית' }].map((x, i) => (
                  <div key={i} className="rounded-xl py-1.5 flex flex-col items-center gap-0.5 text-[10.5px] font-bold" style={{ background: '#fff', border: `1px solid ${A.line}`, color: A.muted }}>
                    <x.i className="w-4 h-4" style={{ color: A.goldLo }} />{x.t}
                  </div>
                ))}
              </div>
              <Link to={createPageUrl('Scanner')} className="rounded-xl py-2.5 flex items-center justify-center gap-1.5 font-bold text-[13px]" style={{ background: `linear-gradient(160deg,${A.goldHi},${A.gold})`, color: '#2a1c0e' }}>
                <ScanLine className="w-4 h-4" /> פתח את הסורק <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <div className="text-[11px] mt-2 text-center" style={{ color: A.muted }}>💬 אפשר גם לשלוח את המסמך לסוכן בוואטסאפ והוא יסרוק אותו</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
