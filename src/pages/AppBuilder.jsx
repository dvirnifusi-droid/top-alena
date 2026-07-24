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
import { Loader2, LayoutGrid, Lock, Check, Store } from 'lucide-react';

// The main owner-facing pages that can be shown/hidden. (Core shell pages like
// the dashboard are always on.) Grouped for a readable list.
const PAGE_GROUPS = [
  { group: 'תפעול', pages: [
    { page: 'WorkScheduling', title: 'סידור עבודה' }, { page: 'EmployeesHub', title: 'עובדים' },
    { page: 'OrderList', title: 'רשימת הזמנות' }, { page: 'Checklists', title: "צ'קליסטים" },
    { page: 'Incidents', title: 'אירועים חריגים' }, { page: 'PrepSheet', title: 'דף הכנות' },
  ] },
  { group: 'לקוחות והזמנות', pages: [
    { page: 'PublicReservationSettings', title: 'הזמנת מקום' }, { page: 'CustomerClub', title: 'מועדון לקוחות' },
    { page: 'QueueHub', title: 'ניהול תור' }, { page: 'EventsPrivate', title: 'אירועים פרטיים' },
  ] },
  { group: 'כספים', pages: [
    { page: 'CashFlow', title: 'תזרים מזומנים' }, { page: 'LaborCost', title: 'עלות שכר' },
    { page: 'Invoices', title: 'חשבוניות' }, { page: 'OperatingCosts', title: 'עלויות תפעול' },
  ] },
  { group: 'שיווק ותוכן', pages: [
    { page: 'MarketingHub', title: 'מרכז שיווק' }, { page: 'StoryStudio', title: 'סטודיו סטוריז' },
    { page: 'Recipes', title: 'עץ מוצר' },
  ] },
];

export default function AppBuilder() {
  const { businessType, hiddenPages, verticals, loading, refresh, pageTitle } = useAppConfig();
  const { pageEnabled, isLocked, unlockPlanFor } = useTenantModules();
  const [vertical, setVertical] = useState('');
  const [hidden, setHidden] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (!loading) { setVertical(businessType || ''); setHidden(hiddenPages || []); } }, [loading, businessType, hiddenPages]);

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
                <p className="text-[11px] text-slate-400 mt-2">משפיע על מונחים והמלצות ברירת-מחדל לעסק שלך.</p>
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
          </>
        )}
      </div>
    </div>
  );
}
