import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PiggyBank } from 'lucide-react';

const ils = (n) => `₪${Math.round(Math.abs(Number(n || 0))).toLocaleString()}`;

// How much of every shekel coming in should be held back for VAT.
//
// The headline rate is 18%, but that is not what a business owes: output VAT is
// reduced by the input VAT on everything purchased. Reserving the full rate on
// gross income sets aside far more than will ever be paid — so both figures are
// shown, and the gap between them is stated rather than left to be discovered.
export default function VatReserveCard() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.functions.getVatReserve({ months: 3 });
        setD((r?.data ?? r) || null);
      } catch (e) {
        if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
      }
      setLoading(false);
    })();
  }, []);

  if (denied) return null;
  if (loading) {
    return (
      <Card dir="rtl" className="mb-6">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </CardContent>
      </Card>
    );
  }
  if (!d || !d.income) return null;

  const gap = d.at_headline_rate - d.at_effective_rate;

  return (
    <Card dir="rtl" className="mb-6 border-teal-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PiggyBank className="w-5 h-5 text-teal-600" /> כמה לשים בצד למע"מ
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border-2 border-teal-300 bg-teal-50 p-4">
            <p className="text-xs text-slate-600">לפי מה שאתה משלם בפועל</p>
            <p className="text-3xl font-black text-teal-800 tabular-nums mt-1">
              {d.effective_rate}%
            </p>
            <p className="text-sm text-slate-700 mt-1">
              <b>{ils(d.reserve_per_1000_effective)}</b> מכל ₪1,000 שנכנס
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">
              על {ils(d.income)} הכנסה ב-{d.months} חודשים שילמת {ils(d.vat_paid)} מע"מ
            </p>
          </div>

          <div className="rounded-xl border p-4 bg-white">
            <p className="text-xs text-slate-600">לפי שיעור המע"מ המלא</p>
            <p className="text-3xl font-black text-slate-400 tabular-nums mt-1">18%</p>
            <p className="text-sm text-slate-600 mt-1">
              <b>{ils(d.reserve_per_1000_headline)}</b> מכל ₪1,000 שנכנס
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">
              היה מצטבר ל-{ils(d.at_headline_rate)} באותה תקופה
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-900">
            <b>18% מההכנסה זה לא המע"מ שאתה חייב.</b> מע"מ עסקאות מקוזז במע"מ תשומות
            על כל מה שקנית — ספקים, ציוד, שירותים. לכן בפועל יצא לך {d.effective_rate}%
            ולא 18%.
          </p>
          <p className="text-xs text-amber-800 mt-1.5">
            בתקופה הזאת ההפרש הוא <b>{ils(gap)}</b> — כסף שהיה יושב בצד בלי צורך.
          </p>
        </div>

        <p className="text-[11px] text-slate-500">
          💡 להפריש לפי {d.effective_rate}% מכסה את מה שאתה באמת משלם. אם אתה רוצה כרית ביטחון,
          עגל למעלה — אבל 18% זה כמעט כפול, וזה כסף שחסר לך בתזרים כל חודש.
        </p>
      </CardContent>
    </Card>
  );
}
