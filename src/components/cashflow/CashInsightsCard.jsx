import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lightbulb } from 'lucide-react';

const SEV = {
  critical: { cls: 'border-red-300 bg-red-50', dot: 'bg-red-500', he: 'קריטי' },
  warning: { cls: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500', he: 'שים לב' },
  info: { cls: 'border-slate-200 bg-white', dot: 'bg-slate-400', he: 'לידיעה' },
  good: { cls: 'border-emerald-300 bg-emerald-50', dot: 'bg-emerald-500', he: 'טוב' },
};

// Findings, each with the arithmetic that produced it. Deliberately not an LLM
// commentary: a confident sentence about someone's cash with nothing behind it
// is worse than no sentence at all.
export default function CashInsightsCard() {
  const [items, setItems] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.functions.getCashInsights({});
        setItems(((r?.data ?? r) || {}).insights || []);
      } catch (e) {
        if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
        setItems([]);
      }
    })();
  }, []);

  if (denied) return null;
  if (items === null) {
    return (
      <Card dir="rtl" className="mb-6">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </CardContent>
      </Card>
    );
  }
  if (!items.length) return null;

  return (
    <Card dir="rtl" className="mb-6 border-sky-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-sky-600" /> מה שווה לדעת
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {items.map((i) => {
          const s = SEV[i.severity] || SEV.info;
          return (
            <div key={i.key} className={`rounded-lg border p-3 ${s.cls}`}>
              <div className="flex items-start gap-2">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{i.title}</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{i.detail}</p>
                  <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">📊 {i.evidence}</p>
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400 pt-1">
          כל ממצא הוא השוואה בין שני מספרים בנתונים שלך — הראיה מוצגת כדי שתוכל לבדוק אותי.
        </p>
      </CardContent>
    </Card>
  );
}
