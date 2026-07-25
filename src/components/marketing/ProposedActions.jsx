import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Send, Sparkles, Users2, AlertTriangle, Check } from 'lucide-react';

// Advisor → Action bridge: the advisor proposes concrete club blasts (bound to a
// real segment with its live recipient count); the owner reviews + edits the copy
// and sends through the same consent-enforced blast path. Nothing sends without a
// two-step confirm.
export default function ProposedActions() {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState(null);
  const [error, setError] = useState('');
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [sendingIdx, setSendingIdx] = useState(null);
  const [results, setResults] = useState({});

  const propose = async () => {
    setLoading(true); setError(''); setActions(null); setResults({}); setConfirmIdx(null);
    try {
      const res = await base44.functions.proposeMarketingActions({ goal });
      const data = res?.data || res;
      setActions(data?.actions || []);
    } catch (e) {
      setError(e?.message || 'שגיאה בהפקת ההצעות');
    } finally { setLoading(false); }
  };

  const setMsg = (i, v) => setActions(prev => prev.map((a, idx) => idx === i ? { ...a, message: v } : a));

  const send = async (i) => {
    const a = actions[i];
    setSendingIdx(i); setError('');
    try {
      const res = await base44.functions.sendSegmentBlast({
        segment_key: a.segment_key, channel: a.channel, message: a.message,
      });
      const data = res?.data || res;
      setResults(prev => ({ ...prev, [i]: data }));
    } catch (e) {
      setResults(prev => ({ ...prev, [i]: { error: e?.message || 'שליחה נכשלה' } }));
    } finally { setSendingIdx(null); setConfirmIdx(null); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-800">מהעצה לפעולה</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          תאר יעד קצר, והיועץ יציע פעולות שיווק מוכנות לשיגור למועדון — עם סגמנט אמיתי, מספר נמענים וטקסט לעריכה. שום דבר לא נשלח בלי אישור שלך.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder='למשל: "להחזיר לקוחות שלא ביקרו מזמן" או "למלא את יום שלישי"'
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') propose(); }}
          />
          <button
            onClick={propose}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold px-5 py-2 rounded-xl disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            הצע פעולות
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {actions && actions.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-6">לא נמצאו פעולות מתאימות כרגע — נסה יעד אחר.</div>
      )}

      {(actions || []).map((a, i) => {
        const r = results[i];
        return (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full px-2.5 py-1">
                  <Users2 className="w-3.5 h-3.5" /> {a.segment_label}
                </span>
                <span className="text-xs font-bold text-emerald-700">→ {a.recipient_count.toLocaleString()} נמענים</span>
                <span className="text-[11px] uppercase text-slate-400 font-mono">{a.channel}</span>
              </div>
            </div>
            {a.reason && <p className="text-xs text-slate-500">{a.reason}</p>}
            <textarea
              value={a.message}
              onChange={(e) => setMsg(i, e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            {r ? (
              r.error ? (
                <div className="text-rose-600 text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {r.error}</div>
              ) : (
                <div className="text-emerald-700 text-sm flex items-center gap-1 font-semibold">
                  <Check className="w-4 h-4" /> נשלח ל-{a.segment_label}: {r.sent || 0} הצליחו{r.failed ? `, ${r.failed} נכשלו` : ''}{r.note ? ` — ${r.note}` : ''}
                </div>
              )
            ) : confirmIdx === i ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-2">
                <span className="text-sm text-amber-800 flex-1">לשלוח ל-{a.recipient_count.toLocaleString()} נמענים ({a.segment_label})?</span>
                <button onClick={() => send(i)} disabled={sendingIdx === i} className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg disabled:opacity-60">
                  {sendingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} כן, שלח
                </button>
                <button onClick={() => setConfirmIdx(null)} className="text-sm text-slate-500 px-2">ביטול</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmIdx(i)}
                disabled={!a.message.trim() || !a.recipient_count}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> שלח עכשיו
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
