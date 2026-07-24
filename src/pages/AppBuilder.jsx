// App Builder (Wix-model) — the OWNER assembles their own app: pick a business
// vertical, and choose which pages appear in their sidebar. The default is
// everything their plan includes ("what we built"); here they declutter it to
// what fits their business. Pages their plan does NOT include show 🔒 with the
// upgrade plan. Per-page title/label editing lives on each page's own ⚙️.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useTenantModules } from '@/hooks/useTenantModules';
import PageConfigButton from '@/components/shared/PageConfigButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LayoutGrid, Lock, Check, Store, GripVertical } from 'lucide-react';

// The owner-facing pages that can be shown/hidden — mirrors the real sidebar,
// grouped like it. Core shell pages (Dashboard, settings) stay always-on and
// are intentionally excluded. Titles match the sidebar (emojis included).
const PAGE_GROUPS = [
  { group: '🎛 תפעול', pages: [
    { page: 'OperationsHub', title: 'מטה תפעול' }, { page: 'BriefingManagement', title: 'ניהול תדריכים' },
    { page: 'MenuManagement', title: '🍽 ניהול תפריט' }, { page: 'PrepSheet', title: '👨‍🍳 דף הכנות' },
    { page: 'DishGuide', title: '📖 מדריך מנות' }, { page: 'TablesManagement', title: 'ניהול שולחנות' },
    { page: 'SeatingSetup', title: 'ניהול הושבה' }, { page: 'RestroomCleaning', title: 'ניקיון שירותים 🚽' },
    { page: 'Checklists', title: "צ'קליסטים" }, { page: 'OrderList', title: '🛒 רשימת הזמנה' },
    { page: 'Incidents', title: 'תקריות' }, { page: 'ShiftEndReport', title: 'דוח סיום משמרת' },
    { page: 'QueueHub', title: '📞 תור והזמנות' },
  ] },
  { group: '💰 כספים ודוחות', pages: [
    { page: 'Reports', title: 'דוחות' }, { page: 'CashFlow', title: '💰 תזרים מזומנים' },
    { page: 'LaborCost', title: '👥 עלות שכר' }, { page: 'Recipes', title: '🍽 מתכונים ופוד-קוסט' },
    { page: 'Tips', title: 'ניהול טיפים' }, { page: 'Invoices', title: 'חשבוניות' },
    { page: 'Suppliers', title: 'ספקים' }, { page: 'OperatingCosts', title: 'עלויות תפעול' },
  ] },
  { group: '🏭 רשת ובית הכנות', pages: [
    { page: 'Commissary', title: '🏭 בית הכנות (רשת)' }, { page: 'CommissaryOrders', title: '📦 הזמנות והפצה' },
  ] },
  { group: '👥 צוות', pages: [
    { page: 'EmployeesHub', title: '👥 עובדים וסידור' }, { page: 'RecruitmentHub', title: '🎓 גיוס והכשרה' },
  ] },
  { group: '🌿 אירועים ומשלוחים', pages: [
    { page: 'EventsHub', title: '🌿 אירועים פרטיים' }, { page: 'EventVendors', title: '🤝 ספקי אירועים' },
    { page: 'DeliveriesHub', title: '📦 משלוחים' },
  ] },
  { group: '📢 שיווק ולקוחות', pages: [
    { page: 'MarketingHub', title: '📢 שיווק ולקוחות' }, { page: 'StoriesHub', title: '🏆 גמיפיקציה וסטוריז' },
  ] },
  { group: '🤖 כלים חכמים', pages: [
    { page: 'AIHub', title: '🤖 כלי AI' }, { page: 'Scanner', title: '🔍 סורק חכם' },
  ] },
];
const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

export default function AppBuilder() {
  const { businessType, hiddenPages, verticals, loading, refresh, pageTitle, terms, termOverrides, navOrder } = useAppConfig();
  const { pageEnabled, isLocked, unlockPlanFor, modules, refresh: modulesRefresh } = useTenantModules();
  const [vertical, setVertical] = useState('');
  const [hidden, setHidden] = useState([]);
  const [termsDraft, setTermsDraft] = useState({});
  const [order, setOrder] = useState(ALL_PAGES);
  const [dragIdx, setDragIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (loading) return;
    setVertical(businessType || ''); setHidden(hiddenPages || []); setTermsDraft(termOverrides || {});
    // order = owner nav_order first (in that order), then the rest by default.
    const byKey = Object.fromEntries(ALL_PAGES.map((p) => [p.page, p]));
    const seen = new Set();
    const ordered = [];
    for (const k of (navOrder || [])) { if (byKey[k] && !seen.has(k)) { ordered.push(byKey[k]); seen.add(k); } }
    for (const p of ALL_PAGES) if (!seen.has(p.page)) ordered.push(p);
    setOrder(ordered);
  }, [loading, businessType, hiddenPages, termOverrides, navOrder]);

  const onDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); return; }
    setOrder((prev) => { const next = [...prev]; const [m] = next.splice(dragIdx, 1); next.splice(i, 0, m); return next; });
    setDragIdx(null);
  };
  const saveOrder = async () => {
    setSaving(true); setMsg(null);
    try { await base44.functions.setAppConfig({ nav_order: order.map((p) => p.page) }); await refresh(); setMsg({ ok: true, text: '✅ סדר הסרגל נשמר — רענן את הדף' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  const saveTerms = async () => {
    setSaving(true); setMsg(null);
    try { await base44.functions.setAppConfig({ term_overrides: termsDraft }); await refresh(); setMsg({ ok: true, text: '✅ המונחים נשמרו — רענן את הדף' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  const isOn = (page) => !hidden.includes(page);
  const toggle = (page) => setHidden((p) => (p.includes(page) ? p.filter((x) => x !== page) : [...p, page]));

  const saveVertical = async (v) => {
    setVertical(v); setSaving(true); setMsg(null);
    try { await base44.functions.setAppConfig({ business_type: v }); await refresh(); setMsg({ ok: true, text: 'סוג העסק נשמר' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };
  const savePages = async () => {
    setSaving(true); setMsg(null);
    try { await base44.functions.setAppConfig({ hidden_pages: hidden }); await refresh(); setMsg({ ok: true, text: '✅ הסרגל עודכן — רענן את הדף כדי לראות' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };
  const toggleModule = async (m) => {
    if (m.core || m.locked) return;
    setSaving(true); setMsg(null);
    try {
      const r = await base44.functions.updateMyTenantModule({ module_key: m.key, enabled: !m.enabled });
      const d = r?.data || r;
      if (d?.ok === false) { setMsg({ ok: false, text: d.message || 'לא ניתן להפעיל' }); }
      else { await (modulesRefresh && modulesRefresh()); setMsg({ ok: true, text: `✅ ${m.name_he} ${!m.enabled ? 'הופעל' : 'כובה'} — רענן את הדף` }); }
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };
  const applyPreset = async () => {
    if (!vertical) return;
    if (!window.confirm('להחיל את ברירות המחדל המומלצות לסוג העסק? (יסתיר דפים שלא מתאימים ויתאים כותרות — תוכל לשנות אחר כך)')) return;
    setSaving(true); setMsg(null);
    try {
      const r = await base44.functions.applyVerticalPreset({ vertical });
      const d = r?.data || r;
      await refresh();
      setHidden(d?.hidden_pages || hidden);
      setMsg({ ok: true, text: '✅ התבנית הוחלה — רענן את הדף כדי לראות את הסרגל המעודכן' });
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#44512C] text-white flex items-center justify-center"><LayoutGrid className="w-6 h-6" /></div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#44512C]">{pageTitle('AppBuilder', 'בונה האפליקציה')}</h1>
              <p className="text-slate-500 text-sm">התאם את האפליקציה לעסק שלך — הברירת מחדל היא מה שכבר בנינו.</p>
            </div>
          </div>
          <PageConfigButton page="AppBuilder" defaultTitle="בונה האפליקציה" />
        </div>

        {msg && <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div> : (
          <>
            {/* Business vertical */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Store className="w-5 h-5 text-[#44512C]" /> סוג העסק</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {verticals.map((v) => (
                    <button key={v.key} disabled={saving} onClick={() => saveVertical(v.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${vertical === v.key ? 'bg-[#44512C] text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-[#44512C]/40'}`}>
                      {v.label}{vertical === v.key ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
                {vertical && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap bg-amber-50/60 rounded-lg p-2.5">
                    <span className="text-xs text-slate-600 flex-1">החל את ברירות המחדל המומלצות ל{(verticals.find((v) => v.key === vertical)?.label) || 'עסק'} — יסתיר דפים לא-רלוונטיים ויתאים כותרות.</span>
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" disabled={saving} onClick={applyPreset}>החל תבנית</Button>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-2">אפשר לשנות הכל ידנית אחרי החלת התבנית.</p>
              </CardContent>
            </Card>

            {/* Modules — whole feature areas the owner turns on/off (plan-gated) */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">מודולים (אזורי פעילות)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(!modules || modules.length === 0) ? <p className="text-sm text-slate-400 text-center py-2">טוען מודולים…</p> : (
                  modules.filter((m) => !m.core).map((m) => (
                    <div key={m.key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${m.locked ? 'bg-slate-50 border-slate-100' : m.enabled ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-1.5">{m.icon ? <span>{m.icon}</span> : null}{m.name_he}</div>
                        {m.description_he && <div className="text-[11px] text-slate-500 truncate">{m.description_he}</div>}
                      </div>
                      {m.locked ? (
                        <span className="text-[11px] text-amber-600 flex items-center gap-1 shrink-0"><Lock className="w-3.5 h-3.5" /> {m.unlock_plan || 'שדרוג'}</span>
                      ) : (
                        <button disabled={saving} onClick={() => toggleModule(m)} className={`relative w-11 h-6 rounded-full transition shrink-0 ${m.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} title={m.enabled ? 'פעיל' : 'כבוי'}>
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${m.enabled ? 'right-0.5' : 'right-[22px]'}`} />
                        </button>
                      )}
                    </div>
                  ))
                )}
                <p className="text-[11px] text-slate-400">כיבוי מודול מסתיר את כל הדפים שלו. מודולים עם 🔒 אינם בחבילה שלך.</p>
              </CardContent>
            </Card>

            {/* Global terms — rename business terms app-wide */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">מונחים (שמות גלובליים)</CardTitle>
                <Button size="sm" onClick={saveTerms} disabled={saving} className="bg-[#44512C] hover:bg-[#3a4525]">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}</Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(terms || []).map((t) => (
                    <label key={t.key} className="text-sm flex items-center gap-2">
                      <span className="text-slate-500 w-20 shrink-0">{t.default}</span>
                      <span className="text-slate-300">→</span>
                      <input value={termsDraft[t.key] ?? ''} onChange={(e) => setTermsDraft((p) => ({ ...p, [t.key]: e.target.value }))} placeholder={t.default} className="flex-1 h-8 rounded border border-slate-300 px-2 text-sm" />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">שינוי מונח מחליף אותו בכל הסרגל והכותרות (למשל "שולחן"→"חדר" למלון). ריק = המונח המקורי.</p>
              </CardContent>
            </Card>

            {/* Page visibility */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">הדפים שמופיעים בסרגל</CardTitle>
                <Button size="sm" onClick={savePages} disabled={saving} className="bg-[#44512C] hover:bg-[#3a4525]">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {PAGE_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="text-xs font-bold text-slate-400 mb-1.5">{g.group}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {g.pages.map((p) => {
                        const locked = isLocked(p.page);
                        const on = isOn(p.page) && !locked;
                        return (
                          <button key={p.page} disabled={locked} onClick={() => !locked && toggle(p.page)}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${locked ? 'bg-slate-50 border-slate-100 opacity-70 cursor-not-allowed' : on ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                            <span className={locked ? 'text-slate-400' : ''}>{p.title}</span>
                            {locked ? <span className="text-[10px] text-amber-600 flex items-center gap-1"><Lock className="w-3 h-3" /> {unlockPlanFor(p.page) || 'שדרוג'}</span>
                              : on ? <Check className="w-4 h-4 text-emerald-600" /> : <span className="text-[10px] text-slate-400">מוסתר</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">דפים עם 🔒 אינם כלולים בחבילה שלך — שדרוג יפתח אותם. את הכותרות והתוכן של כל דף עורכים דרך ה-⚙️ שבתוך הדף עצמו.</p>
              </CardContent>
            </Card>

            {/* Sidebar order — drag to reorder */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">סדר הסרגל</CardTitle>
                <Button size="sm" onClick={saveOrder} disabled={saving} className="bg-[#44512C] hover:bg-[#3a4525]">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור סדר'}</Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {order.map((p, i) => (
                    <div
                      key={p.page}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(i)}
                      onDragEnd={() => setDragIdx(null)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-grab active:cursor-grabbing transition ${dragIdx === i ? 'opacity-40 border-[#44512C]' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    >
                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="text-slate-400 w-5 text-center text-xs">{i + 1}</span>
                      <span className="flex-1 truncate">{p.title}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">גרור פריט למעלה/למטה כדי לקבוע את סדר הופעתו בסרגל הצד. פריט שגררת גבוה יעלה את הקטגוריה שלו כלפי מעלה.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
