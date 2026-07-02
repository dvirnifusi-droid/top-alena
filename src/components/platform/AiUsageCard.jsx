import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function formatIls(n) {
  const v = Number(n) || 0;
  return `₪${v.toFixed(2)}`;
}
function formatK(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 1000000).toFixed(2)}M`;
}

function DayBar({ tokens, max }) {
  const pct = max > 0 ? Math.max(4, Math.round((tokens / max) * 100)) : 4;
  return (
    <div
      className="w-2 rounded-sm bg-gradient-to-t from-slate-500 to-slate-300"
      style={{ height: `${pct}%` }}
      title={`${tokens.toLocaleString()} tokens`}
    />
  );
}

export default function AiUsageCard() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.getMyAiUsage({});
        const data = res?.data || res;
        if (alive) setUsage(data);
      } catch (e) {
        console.error('[AiUsageCard] load failed', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const now = new Date();
  const monthName = now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">טוען שימוש ב-AI...</span>
        </CardContent>
      </Card>
    );
  }

  const total = Number(usage?.total_tokens || 0);
  const cost = Number(usage?.total_cost_ils || 0);
  const days = Array.isArray(usage?.by_day) ? usage.by_day : [];
  const topFns = Array.isArray(usage?.by_fn) ? usage.by_fn.slice(0, 5) : [];
  const maxDay = days.reduce((m, d) => Math.max(m, Number(d.tokens || 0)), 0);

  return (
    <Card className="border-slate-200 bg-gradient-to-l from-slate-50 to-white">
      <CardContent className="p-5" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-slate-600" />
            <h3 className="font-bold text-sm">שימוש ב-AI • {monthName}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{formatK(total)} טוקנים</span>
            <span className="font-bold text-slate-800 text-sm">{formatIls(cost)}</span>
          </div>
        </div>

        {days.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">
            אין עדיין שימוש ב-AI החודש. הצ׳אטים והסוכנים ירשמו כאן ברגע שהם רצים.
          </div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-16 mb-3">
              {days.map((d) => (
                <DayBar key={d.day} tokens={Number(d.tokens || 0)} max={maxDay} />
              ))}
            </div>
            <div className="text-xs text-slate-500 mb-1">פונקציות דומיננטיות:</div>
            <div className="space-y-1">
              {topFns.map((f) => (
                <div key={f.fn_name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-slate-700">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span className="font-mono">{f.fn_name}</span>
                    <span className="text-slate-400">×{f.calls}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span>{formatK(f.tokens)}</span>
                    <span className="w-14 text-left font-bold text-slate-700">{formatIls(f.cost_ils)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-[10px] text-slate-400 pt-3 border-t mt-3">
          המחירים משקפים תעריפי Gemini/Anthropic הפומביים * שער דולר של 3.6.
          לצרכי הערכה בלבד — לא לחשבונאות מדויקת.
        </div>
      </CardContent>
    </Card>
  );
}
