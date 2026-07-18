import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lightbulb } from 'lucide-react';

const ils = (n) => `₪${Math.round(Math.abs(Number(n || 0))).toLocaleString()}`;

const SEV = {
  critical: { cls: 'border-red-300 bg-red-50', chip: 'bg-red-600 text-white', he: 'קריטי' },
  high: { cls: 'border-amber-300 bg-amber-50', chip: 'bg-amber-500 text-white', he: 'חשוב' },
  medium: { cls: 'border-slate-200 bg-white', chip: 'bg-slate-200 text-slate-700', he: 'שווה לבדוק' },
  info: { cls: 'border-slate-200 bg-slate-50', chip: 'bg-slate-200 text-slate-600', he: 'לידיעה' },
};

// The forecast says what will happen; this says what can be changed about it.
export default function CashActionsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getCashflowActions({ days: 90 });
      setData((r?.data ?? r) || null);
    } catch (e) {
      if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (denied) return null;
  if (loading) {
    return (
      <Card dir="rtl" className="mb-6">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }
  if (!data?.has_data || !data.actions?.length) return null;

  const quantified = data.actions.filter((a) => a.impact > 0);

  return (
    <Card dir="rtl" className="mb-6 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" /> מה אפשר לעשות כדי לשפר את המזומן
          </span>
          {quantified.length > 0 && (
            <span className="text-xs font-normal text-slate-500">
              סה"כ בהישג יד: <b className="text-emerald-700">{ils(data.total_impact)}</b>
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {data.actions.map((a) => {
          const s = SEV[a.severity] || SEV.medium;
          return (
            <div key={a.key} className={`rounded-lg border p-3 ${s.cls}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug">{a.title}</p>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${s.chip}`}>{s.he}</span>
                  {a.impact > 0 && (
                    <span className="text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                      {a.impact_label}
                    </span>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.detail}</p>
              <p className="text-[10px] text-slate-400 mt-1">{a.evidence}</p>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400 pt-1">
          ההמלצות משנות את המזומן בפועל — לא את הצפי. הצפי ממשיך להראות את המצב כפי שהוא.
        </p>
      </CardContent>
    </Card>
  );
}
