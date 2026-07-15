// Universal AI scanner hub — send anything (menu, checklist, employees,
// suppliers, order list), the AI classifies + parses it, you confirm, it
// imports. "Work once": no manual re-typing.
import React from 'react';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ScanLine, UtensilsCrossed, ListChecks, Users, Truck, ClipboardList } from 'lucide-react';
import ScannerPanel from '@/components/scanner/ScannerPanel';

const TARGETS = [
  { icon: UtensilsCrossed, label: 'תפריט', desc: 'מנות + מחירים' },
  { icon: ListChecks, label: 'צ׳קליסט', desc: 'רשימת משימות' },
  { icon: Users, label: 'עובדים', desc: 'שמות + תפקידים' },
  { icon: Truck, label: 'ספקים', desc: 'חברות + קשר' },
  { icon: ClipboardList, label: 'הזמנות', desc: 'מוצרים + כמויות' },
];

export default function Scanner() {
  return (
    <PageShell>
      <PageHeader
        title="סורק חכם"
        subtitle="שלח כל מסמך — תפריט, צ׳קליסט, עובדים, ספקים או רשימת הזמנות. ה-AI מזהה, מחלץ, ואתה מאשר. פעם אחת, בלי להקליד."
        icon={ScanLine}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Scanner */}
        <div className="lg:col-span-2">
          <Card className="border-[#EADFC8] shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <ScannerPanel />
            </CardContent>
          </Card>
        </div>

        {/* What it reads */}
        <div className="space-y-3">
          <p className="font-display text-lg text-[#2A2018] px-1">מה אפשר לסרוק</p>
          {TARGETS.map((t) => (
            <div key={t.label} className="flex items-center gap-3 rounded-2xl border border-[#EADFC8] bg-white/70 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-[#F7EFDD] flex items-center justify-center shrink-0">
                <t.icon className="w-5 h-5 text-[var(--brand-primary,#A04A2E)]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#2A2018] leading-tight">{t.label}</p>
                <p className="text-xs text-[#8A7C64]">{t.desc}</p>
              </div>
            </div>
          ))}
          <div className="text-xs text-[#8A7C64] bg-[#FBF6EA] rounded-xl p-3 border border-[#EADFC8] leading-relaxed">
            💡 תמונה חדה או PDF נותנים את התוצאה הכי טובה. תמיד רואים תצוגה מקדימה ומאשרים לפני שנשמר — שום דבר לא נכנס בלי אישור.
          </div>
        </div>
      </div>
    </PageShell>
  );
}
