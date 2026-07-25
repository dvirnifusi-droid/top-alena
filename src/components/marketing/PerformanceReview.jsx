import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, BarChart3, Lightbulb, Send } from 'lucide-react';

// The optimization loop, surfaced: after campaigns are launched, the optimization
// agent reviews delivery/timing/channel and recommends the next move.
export default function PerformanceReview() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.reviewMarketingPerformance({});
      setData((res?.data || res) || null);
    } catch { setData({ summary: 'לא הצלחתי לטעון סקירה כרגע.', recommendations: [], recent: [] }); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <h3 className="font-bold text-slate-800">📊 מעקב ואופטימיזציה</h3>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} סקור ביצועים
        </button>
      </div>

      {!data ? (
        <p className="text-sm text-slate-500">אחרי ששיגרת קמפיינים, סוכן האופטימיזציה סוקר מה עבד וממליץ על הפעולה הבאה.</p>
      ) : (
        <div className="space-y-3">
          {data.summary && <p className="text-sm text-slate-700">{data.summary}</p>}
          {(data.recommendations || []).length > 0 && (
            <ul className="space-y-1.5">
              {data.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {(data.recent || []).length > 0 && (
            <div className="border-t border-slate-100 pt-2">
              <div className="text-[11px] font-bold text-slate-400 mb-1">קמפיינים אחרונים</div>
              <div className="space-y-1">
                {data.recent.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                    <Send className="w-3 h-3" />
                    <span className="font-mono uppercase">{c.channel}</span>
                    <span className="text-emerald-700 font-bold">{c.sent}</span>
                    <span>נשלחו{c.failed ? ` · ${c.failed} נכשלו` : ''}</span>
                    <span className="truncate text-slate-400">— {c.preview}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
