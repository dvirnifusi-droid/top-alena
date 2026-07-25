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
          {data.meta && !data.meta.error && (data.meta.campaigns || []).length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-orange-800 mb-1.5">
                <span>📣 מודעות ממומנות (Meta · 7 ימים)</span>
                <span className="text-slate-600">· ₪{(data.meta.total_spend_7d || 0).toLocaleString()} הוצאה</span>
                <span className="text-emerald-700">· {data.meta.total_leads_7d || 0} לידים</span>
                <span className="text-slate-500">· {data.meta.active} פעילים</span>
              </div>
              <div className="space-y-1">
                {(data.meta.campaigns || []).filter(c => c.spend_7d > 0 || c.status === 'ACTIVE').slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="truncate flex-1">{c.name}</span>
                    <span className="tabular-nums">₪{c.spend_7d}</span>
                    <span className="tabular-nums text-emerald-700">{c.leads_7d} לידים</span>
                    <span className="tabular-nums text-slate-400">CTR {c.ctr}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
