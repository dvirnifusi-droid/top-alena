// "בואו נתחיל" — the one-time setup wizard that closes the "work once" loop.
// Shows every core data source with live status, and for each lets the owner
// SCAN (one tap, AI imports) or enter manually. When the core is filled, DVIR AI
// already knows everything. Reuses getDvirKnowledgeSources + AiScannerButton.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AiScannerButton from '@/components/scanner/AiScannerButton';
import {
  Rocket, Store, UtensilsCrossed, Users, Truck, ListChecks, ClipboardList,
  CheckCircle2, Circle, ArrowLeft, Loader2, Sparkles, PartyPopper,
} from 'lucide-react';

// Steps in the order a new owner should fill them. `scan` = which scanner target
// (null = manual only). `core` steps count toward "ready".
const STEPS = [
  { key: 'profile', label: 'פרטי העסק', desc: 'שם, כתובת, טלפון, שעות', icon: Store, page: 'Branding', scan: null, core: true },
  { key: 'menu', label: 'תפריט', desc: 'מנות + מחירים', icon: UtensilsCrossed, page: 'MenuManagement', scan: 'menu', unit: 'מנות', core: true },
  { key: 'employees', label: 'עובדים', desc: 'שמות + תפקידים', icon: Users, page: 'Employees', scan: 'employees', unit: 'עובדים', core: true },
  { key: 'suppliers', label: 'ספקים', desc: 'חברות + אנשי קשר', icon: Truck, page: 'Suppliers', scan: 'suppliers', unit: 'ספקים', core: false },
  { key: 'checklists', label: 'צ׳קליסטים', desc: 'נהלי עבודה', icon: ListChecks, page: 'Checklists', scan: 'checklist', unit: 'רשימות', core: false },
  { key: 'orderLists', label: 'רשימות הזמנות', desc: 'מוצרים לספקים', icon: ClipboardList, page: 'OrderList', scan: 'order_list', unit: 'רשימות', core: false },
];

export default function Setup() {
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await base44.functions.getDvirKnowledgeSources();
      setSources((res?.data || res)?.live || {});
    } catch {
      setSources({});
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filledOf = (key) => {
    if (!sources) return false;
    if (key === 'profile') return !!sources.profile?.restaurant_name;
    return (sources[key]?.count || 0) > 0;
  };
  const countOf = (key) => (key === 'profile' ? 0 : (sources?.[key]?.count || 0));

  const coreSteps = STEPS.filter((s) => s.core);
  const coreDone = coreSteps.filter((s) => filledOf(s.key)).length;
  const allCoreDone = coreDone === coreSteps.length;
  const totalDone = STEPS.filter((s) => filledOf(s.key)).length;
  const pct = Math.round((totalDone / STEPS.length) * 100);

  return (
    <PageShell>
      <PageHeader
        title="בואו נתחיל"
        subtitle="נזין את המסעדה פעם אחת — סרוק מסמך או הזן ידנית. מרגע שזה כאן, DVIR AI כבר יודע הכל."
        icon={Rocket}
      />

      {/* Progress */}
      <Card className="border-[#EADFC8] shadow-sm mb-5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-lg text-[#2A2018]">
              {allCoreDone ? '🎉 המערכת מוכנה' : `${totalDone} מתוך ${STEPS.length} מקורות מלאים`}
            </span>
            <span className="text-sm font-bold text-[var(--brand-primary,#A04A2E)]">{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#F1E6CE] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-[var(--brand-primary,#A04A2E)] to-[#C98A5E] transition-all duration-700"
              style={{ width: `${pct}%` }} />
          </div>
          {allCoreDone && (
            <p className="text-sm text-emerald-700 mt-3 flex items-center gap-1.5">
              <PartyPopper className="w-4 h-4" /> הבסיס מוכן — ה-DVIR AI מכיר את התפריט, המחירים והצוות. אפשר לשאול אותו כל דבר.
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-[#8A7C64] py-10">
          <Loader2 className="w-5 h-5 animate-spin" /> טוען את מצב ההקמה…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {STEPS.map((s, i) => {
            const done = filledOf(s.key);
            const cnt = countOf(s.key);
            return (
              <Card key={s.key} className={`border shadow-sm transition-colors ${done ? 'border-emerald-200 bg-emerald-50/40' : 'border-[#EADFC8] bg-white/70'}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                      style={{ background: done ? '#10b981' : 'var(--brand-primary,#A04A2E)' }}>
                      <s.icon className="w-6 h-6 text-white" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#B8A98C]">שלב {i + 1}</span>
                        {done
                          ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> {cnt > 0 ? `${cnt} ${s.unit}` : 'מוגדר'}</span>
                          : <span className="flex items-center gap-1 text-xs text-[#B8A98C]"><Circle className="w-3.5 h-3.5" /> ריק</span>}
                      </div>
                      <p className="font-display text-xl text-[#2A2018] leading-tight mt-0.5">{s.label}</p>
                      <p className="text-sm text-[#8A7C64]">{s.desc}</p>

                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {s.scan && (
                          <AiScannerButton
                            target={s.scan}
                            onImported={load}
                            label={done ? 'סרוק עוד' : 'סרוק ויבא'}
                            variant={done ? 'outline' : 'default'}
                            className={done ? '' : 'bg-[var(--brand-primary,#A04A2E)] hover:opacity-90 text-white'}
                          />
                        )}
                        <a href={`/${s.page}`}>
                          <Button variant="ghost" size="sm" className="rounded-xl text-[#6B5D45]">
                            {s.scan ? 'הזן ידנית' : 'הגדר עכשיו'} <ArrowLeft className="w-4 h-4 mr-1" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Knowledge files + test */}
      <Card className="border-[#EADFC8] shadow-sm mt-5">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F7EFDD] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[var(--brand-primary,#A04A2E)]" />
            </div>
            <div>
              <p className="font-bold text-[#2A2018]">רוצה להוסיף ידע נוסף?</p>
              <p className="text-sm text-[#8A7C64]">קבצים, מסמכים ומידע חופשי ל-DVIR AI — או בדוק מה הוא כבר יודע.</p>
            </div>
          </div>
          <a href="/AiDashboard#files">
            <Button variant="outline" className="rounded-xl whitespace-nowrap">מרכז הידע <ArrowLeft className="w-4 h-4 mr-1" /></Button>
          </a>
        </CardContent>
      </Card>
    </PageShell>
  );
}
