import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, Send, Sparkles, Users2, AlertTriangle, Check, MessageSquare, Gift, Megaphone, Coins, Instagram, Lightbulb } from 'lucide-react';

const TYPE_META = {
  club_blast:   { label: 'הודעת מועדון', icon: MessageSquare, tone: '#0f766e' },
  club_benefit: { label: 'הטבה למועדון', icon: Gift, tone: '#9333ea' },
  social_post:  { label: 'פוסט אורגני', icon: Instagram, tone: '#db2777' },
  meta_ad:      { label: 'מודעה ממומנת', icon: Megaphone, tone: '#c2410c' },
  guerrilla:    { label: 'שיווק גרילה', icon: Lightbulb, tone: '#0369a1' },
};

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
  const [agentIdx, setAgentIdx] = useState(null); // which action is generating via an agent
  const [agentOut, setAgentOut] = useState({}); // index → generated post variants

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

  // Hand a social-post action to the existing copywriter agent to produce a
  // ready-to-publish post (3 variants). This is the bridge into the marketing agents.
  const runAgent = async (i) => {
    const a = actions[i];
    setAgentIdx(i);
    try {
      const res = await base44.functions.runMarketingAgent({ agent_type: 'copywriter', input: { topic: a.message, channel: 'instagram', length: 'short' } });
      const out = (res?.data || res)?.run?.output || {};
      setAgentOut(prev => ({ ...prev, [i]: out.variants || [] }));
    } catch (e) {
      setAgentOut(prev => ({ ...prev, [i]: { error: e?.message || 'שגיאה' } }));
    } finally { setAgentIdx(null); }
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
        const isMeta = a.type === 'meta_ad';
        const isSocial = a.type === 'social_post';
        const isGuerrilla = a.type === 'guerrilla';
        const isClub = a.type === 'club_blast' || a.type === 'club_benefit';
        return (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {(() => { const tm = TYPE_META[a.type] || TYPE_META.club_blast; const TI = tm.icon; return (
                  <span className="inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1" style={{ background: tm.tone + '18', color: tm.tone }}>
                    <TI className="w-3.5 h-3.5" /> {tm.label}
                  </span>
                ); })()}
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full px-2.5 py-1">
                  <Users2 className="w-3.5 h-3.5" /> {a.segment_label}
                </span>
                {isClub && <span className="text-xs font-bold text-emerald-700">→ {(a.recipient_count || 0).toLocaleString()} נמענים</span>}
                {isClub && <span className="text-[11px] uppercase text-slate-400 font-mono">{a.channel}</span>}
              </div>
              {a.cost_note && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  <Coins className="w-3.5 h-3.5" /> {a.cost_note}
                </span>
              )}
            </div>
            {a.reason && <p className="text-xs text-slate-500">{a.reason}</p>}
            <textarea
              value={a.message}
              onChange={(e) => setMsg(i, e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            {isMeta ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Link to={createPageUrl('MarketingAgentsHub')} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
                  <Megaphone className="w-4 h-4" /> פתח מנהל קמפיינים
                </Link>
                <span className="text-xs text-slate-400">מודעה ממומנת מתנהלת בדף הקמפיינים (דורש חיבור Meta).</span>
              </div>
            ) : isSocial ? (
              <div className="space-y-2">
                <button onClick={() => runAgent(i)} disabled={agentIdx === i} className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-500 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60">
                  {agentIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} צור פוסט מלא (סוכן קופירייטינג)
                </button>
                {agentOut[i] && (agentOut[i].error ? (
                  <div className="text-rose-600 text-sm">{agentOut[i].error}</div>
                ) : (
                  <div className="space-y-2">
                    {(agentOut[i] || []).map((v, vi) => (
                      <div key={vi} className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-sm text-slate-800">
                        {v.hook && <div className="font-bold">{v.hook}</div>}
                        <div className="whitespace-pre-wrap">{v.body}</div>
                        {Array.isArray(v.hashtags) && v.hashtags.length > 0 && <div className="text-pink-600 text-xs mt-1">{v.hashtags.map(h => (h.startsWith('#') ? h : '#' + h)).join(' ')}</div>}
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-400">העתק את הגרסה שאהבת ופרסם באינסטגרם/פייסבוק. ליצירת תמונה: דף הסוכנים.</div>
                  </div>
                ))}
              </div>
            ) : isGuerrilla ? (
              <div className="text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl p-2">💡 רעיון גרילה לביצוע בשטח — הטקסט למעלה כולל את הצעדים.</div>
            ) : r ? (
              r.error ? (
                <div className="text-rose-600 text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {r.error}</div>
              ) : (
                <div className="text-emerald-700 text-sm flex items-center gap-1 font-semibold">
                  <Check className="w-4 h-4" /> נשלח ל-{a.segment_label}: {r.sent || 0} הצליחו{r.failed ? `, ${r.failed} נכשלו` : ''}{r.note ? ` — ${r.note}` : ''}
                </div>
              )
            ) : confirmIdx === i ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-2 flex-wrap">
                <span className="text-sm text-amber-800 flex-1">לשלוח ל-{(a.recipient_count || 0).toLocaleString()} נמענים ({a.segment_label})? עלות {a.cost_note}</span>
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
                <Send className="w-4 h-4" /> {a.type === 'club_benefit' ? 'הנפק ושלח' : 'שלח עכשיו'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
