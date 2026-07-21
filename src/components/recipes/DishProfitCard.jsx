// C.2 — real food-cost % per dish from actual POS sales × recipe cost. Surfaces
// the specific dishes whose cost deviates (>35%), sorted by money impact.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, TrendingUp } from 'lucide-react';

const fcColor = (p) => (p == null ? 'text-slate-400' : p > 35 ? 'text-red-600' : p > 30 ? 'text-amber-600' : 'text-emerald-600');
const ils = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;

export default function DishProfitCard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = async (d) => {
    setLoading(true);
    try { const r = await base44.functions.getDishCostAnalysis({ days: d }); setData(r?.data || r || {}); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(days); }, [days]);

  if (loading && !data) return null;
  const t = data?.totals;
  if (!t || t.dishes_matched === 0) return null;
  const offenders = data.offenders || [];
  const dishes = data.dishes || [];

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-bold flex items-center gap-2 text-emerald-900"><TrendingUp className="w-4 h-4" /> רווחיות לפי מכירות אמיתיות {loading && <Loader2 className="w-3 h-3 animate-spin" />}</div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value={30}>30 יום</option><option value={60}>60 יום</option><option value={90}>90 יום</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="bg-white rounded-lg border p-2 flex-1 min-w-[110px]"><div className="text-xs text-slate-500">מכירות (מנות מזוהות)</div><div className="text-xl font-bold">{ils(t.revenue)}</div></div>
          <div className="bg-white rounded-lg border p-2 flex-1 min-w-[110px]"><div className="text-xs text-slate-500">עלות חומר גלם</div><div className="text-xl font-bold">{ils(t.cogs)}</div></div>
          <div className="bg-white rounded-lg border p-2 flex-1 min-w-[110px]"><div className="text-xs text-slate-500">פוד-קוסט כולל</div><div className={`text-xl font-bold ${fcColor(t.food_cost_pct)}`}>{t.food_cost_pct != null ? t.food_cost_pct + '%' : '—'}</div></div>
        </div>

        {offenders.length > 0 && (
          <div>
            <div className="text-sm font-semibold text-red-700 mb-1">⚠️ מנות חורגות (פוד-קוסט מעל 35%)</div>
            <div className="space-y-1">
              {offenders.map((d) => (
                <div key={d.name} className="flex items-center gap-2 bg-white rounded-lg border p-2 text-sm">
                  <div className="flex-1 min-w-0 truncate font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500 flex-shrink-0">{d.units_sold} נמכרו</div>
                  <div className={`text-sm font-bold flex-shrink-0 ${fcColor(d.food_cost_pct)}`}>{d.food_cost_pct}%</div>
                  <div className={`text-xs flex-shrink-0 ${d.margin < 0 ? 'text-red-600' : 'text-slate-500'}`}>רווח {ils(d.margin)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setShowAll((v) => !v)} className="text-xs text-slate-500 underline">{showAll ? 'הסתר' : 'הצג'} כל {dishes.length} המנות</button>
        {showAll && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead><tr className="text-slate-500 text-right"><th className="p-1">מנה</th><th className="p-1">נמכרו</th><th className="p-1">מכירות</th><th className="p-1">עלות/יח׳</th><th className="p-1">פוד-קוסט</th><th className="p-1">רווח</th></tr></thead>
              <tbody>
                {dishes.map((d) => (
                  <tr key={d.name} className="border-t">
                    <td className="p-1 font-medium">{d.name}</td>
                    <td className="p-1">{d.units_sold}</td>
                    <td className="p-1">{ils(d.revenue)}</td>
                    <td className="p-1">₪{d.unit_cost}</td>
                    <td className={`p-1 font-semibold ${fcColor(d.food_cost_pct)}`}>{d.food_cost_pct != null ? d.food_cost_pct + '%' : '—'}</td>
                    <td className={`p-1 ${d.margin < 0 ? 'text-red-600' : ''}`}>{ils(d.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {t.dishes_unmatched > 0 && <div className="text-xs text-slate-400">{t.dishes_unmatched} מנות שנמכרו לא זוהו במתכונים (אין להן עלות מחושבת).</div>}
      </CardContent>
    </Card>
  );
}
