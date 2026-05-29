import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

// Manager-facing: upcoming interviews + status + WhatsApp reminders + training pipeline.

const STAGES = [
  { key: 'hired', label: 'נקלט' },
  { key: 'trainee_tables', label: 'מתלמד שולחנות' },
  { key: 'trainee_bar', label: 'מתלמד בר' },
  { key: 'trainee_kitchen', label: 'מתלמד מטבח' },
  { key: 'active_waiter', label: 'מלצר פעיל' },
];

const stageIndex = (s) => STAGES.findIndex((x) => x.key === s);
const nextStage = (s) => {
  const i = stageIndex(s);
  if (i < 0) return STAGES[0]?.key;
  return STAGES[Math.min(i + 1, STAGES.length - 1)].key;
};
const stageLabel = (s) => STAGES.find((x) => x.key === s)?.label || s;

function normalizePhoneIL(p) {
  if (!p) return null;
  let n = String(p).replace(/\D/g, '');
  if (n.startsWith('0')) n = '972' + n.slice(1);
  else if (!n.startsWith('972')) n = '972' + n;
  return n;
}

function reminderText(iv) {
  const d = new Date(iv.scheduled_date + 'T' + iv.scheduled_time);
  const dStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return (
    `היי ${iv.candidate_name || ''} 🌿\n` +
    `מזכיר/ה לך — נפגשים לראיון במסעדת עלינא ב${dStr} בשעה ${iv.scheduled_time}.\n` +
    `נשמח לראותך, ואם משהו השתנה — תכתוב/י לי כאן.`
  );
}

function fmtDate(d) {
  try { return new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }); }
  catch { return d; }
}

export default function RecruitmentInterviews() {
  const [inbox, setInbox] = useState({ upcoming: [], recent: [], toCallBack: [] });
  const [trainees, setTrainees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [inboxRes, trainees] = await Promise.all([
        base44.functions.getRecruitmentInbox({}),
        base44.entities.JobCandidate.filter({ status: 'trainee' }, '-created_date', 100),
      ]);
      setInbox(inboxRes?.data || { upcoming: [], recent: [], toCallBack: [] });
      // Also include active waiters for visibility
      const active = await base44.entities.JobCandidate.filter({ status: 'active' }, '-created_date', 50).catch(() => []);
      setTrainees([...(trainees || []), ...(active || [])]);
    } catch (e) {
      console.warn('load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendWhatsApp = (iv) => {
    const phone = normalizePhoneIL(iv.candidate_phone);
    if (!phone) { alert('אין מספר טלפון למועמד'); return; }
    const text = encodeURIComponent(reminderText(iv));
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const setStatus = async (iv, status) => {
    setActionId(iv.id);
    try {
      await base44.functions.markInterviewStatus({ id: iv.id, status });
      await load();
    } catch { alert('שגיאה בעדכון'); }
    finally { setActionId(null); }
  };

  const advance = async (cand, stage) => {
    setActionId(cand.id);
    try {
      await base44.functions.advanceCandidateStage({ candidate_id: cand.id, stage });
      await load();
    } catch { alert('שגיאה בקידום השלב'); }
    finally { setActionId(null); }
  };

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800">ראיונות וגיוס</h1>
          <p className="text-slate-500 text-sm">ראיונות קרובים, ציר התלמדות, מי מחכה לחזרה</p>
        </div>
        <a href={createPageUrl('InterviewSettings')} className="text-sm bg-white border border-slate-300 hover:bg-slate-50 rounded-xl px-3 py-2 font-bold text-slate-700">
          ⚙️ הגדרת סלוטים
        </a>
      </div>

      {loading && <p className="text-slate-400 text-center py-6">טוען…</p>}

      {/* Upcoming interviews */}
      <section className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-black text-slate-800 mb-3">📅 ראיונות קרובים ({inbox.upcoming.length})</p>
        {inbox.upcoming.length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע ראיונות מתוזמנים.</p>
        ) : (
          <div className="space-y-2">
            {inbox.upcoming.map((iv) => (
              <div key={iv.id} className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="font-bold text-slate-800">{iv.candidate_name || '—'}</p>
                  <p className="text-xs text-slate-500">📞 {iv.candidate_phone || '-'}</p>
                </div>
                <div className="text-sm font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg">
                  {fmtDate(iv.scheduled_date)} · {iv.scheduled_time}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                  iv.status === 'scheduled' ? 'bg-amber-100 text-amber-700' :
                  iv.status === 'showed' ? 'bg-emerald-100 text-emerald-700' :
                  iv.status === 'no_show' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {iv.status === 'scheduled' ? 'מתוזמן' : iv.status === 'showed' ? 'הגיע' : iv.status === 'no_show' ? 'לא הגיע' : iv.status}
                </span>
                <button onClick={() => sendWhatsApp(iv)} className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">
                  📱 תזכורת בוואטסאפ
                </button>
                {iv.status === 'scheduled' && (
                  <>
                    <button disabled={actionId===iv.id} onClick={() => setStatus(iv, 'showed')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-lg">
                      ✓ הגיע
                    </button>
                    <button disabled={actionId===iv.id} onClick={() => setStatus(iv, 'no_show')} className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold px-2.5 py-1.5 rounded-lg">
                      ✕ לא הגיע
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* To call back: candidates 50-79 */}
      <section className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-black text-slate-800 mb-3">📞 לחזור אליהם ({inbox.toCallBack.length})</p>
        <p className="text-xs text-slate-500 mb-3">מועמדים עם ציון 50–79. אם תרצה לזמן אותם — שלח להם בוואטסאפ.</p>
        {inbox.toCallBack.length === 0 ? (
          <p className="text-slate-400 text-sm">אין מועמדים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {inbox.toCallBack.map((c) => {
              const phone = normalizePhoneIL(c.phone);
              const waText = encodeURIComponent(`היי ${c.full_name} 🌿\nראיתי את הפניה שלך לעלינא. אשמח לתאם איתך ראיון בקרוב — מתי נוח לך?`);
              return (
                <div key={c.id} className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-bold text-slate-800">{c.full_name} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                    <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'}</p>
                  </div>
                  <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">ציון: {c.score ?? '-'}</div>
                  {c.ai_summary && (
                    <p className="basis-full text-xs text-slate-500 italic border-r-2 border-slate-200 pr-2">{c.ai_summary}</p>
                  )}
                  {phone && (
                    <a href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">
                      📱 פנייה בוואטסאפ
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Training pipeline */}
      <section className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-black text-slate-800 mb-1">🎓 ציר ההתלמדות</p>
        <p className="text-xs text-slate-500 mb-3">
          {STAGES.map((s, i) => (
            <span key={s.key}>{s.label}{i < STAGES.length - 1 ? ' → ' : ''}</span>
          ))}
        </p>
        {trainees.length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע מתלמדים. אחרי שתסמן "הגיע" בראיון, תוכל לקלוט אותו כאן.</p>
        ) : (
          <div className="space-y-2">
            {trainees.map((c) => {
              const stage = c.training_stage || 'hired';
              const next = nextStage(stage);
              const isFinal = stage === 'active_waiter';
              return (
                <div key={c.id} className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-bold text-slate-800">{c.full_name}</p>
                    <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.phone || '-'}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-bold bg-indigo-100 text-indigo-700">{stageLabel(stage)}</span>
                  {!isFinal && (
                    <button disabled={actionId===c.id} onClick={() => advance(c, next)} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-2.5 py-1.5 rounded-lg">
                      קדם ל‑{stageLabel(next)} ↩
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          💡 קלט מועמד חדש שעבר ראיון: סמן "הגיע" בראיון שלו → ייכנס לשלב הראשון (נקלט) ומשם תקדם ביד.
        </p>

        {/* Quick-hire shortcut for candidates already marked interviewed */}
        <InterviewedQuickHire onChange={load} />
      </section>
    </div>
  );
}

function InterviewedQuickHire({ onChange }) {
  const [interviewed, setInterviewed] = useState([]);
  const [acting, setActing] = useState(null);

  useEffect(() => {
    base44.entities.JobCandidate.filter({ status: 'interviewed' }, '-created_date', 30)
      .then((arr) => setInterviewed(arr || []))
      .catch(() => setInterviewed([]));
  }, []);

  if (!interviewed.length) return null;

  const hire = async (c) => {
    setActing(c.id);
    try {
      await base44.functions.advanceCandidateStage({ candidate_id: c.id, stage: 'hired' });
      setInterviewed((arr) => arr.filter((x) => x.id !== c.id));
      onChange?.();
    } catch { alert('שגיאה'); }
    finally { setActing(null); }
  };

  return (
    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
      <p className="font-bold text-emerald-800 text-sm mb-2">לאחר ראיון — לקלוט כעובד?</p>
      <div className="space-y-2">
        {interviewed.map((c) => (
          <div key={c.id} className="flex items-center gap-2 bg-white rounded-lg p-2">
            <span className="flex-1 text-sm font-bold text-slate-700">{c.full_name}</span>
            <button disabled={acting===c.id} onClick={() => hire(c)} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              ✓ קלוט (נקלט)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
