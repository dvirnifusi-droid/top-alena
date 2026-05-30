import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

// Manager-facing: upcoming interviews + status + WhatsApp reminders + training pipeline.

const STAGE_LABELS = {
  hired: 'נקלט',
  learning_menu: 'לומד תפריט 📖',
  menu_exam_scheduled: 'מבחן תפריט מתוזמן 📅',
  menu_exam_passed: 'עבר מבחן תפריט ✓',
  menu_exam_failed: 'נכשל במבחן ✕',
  training: 'בהתלמדויות',
  active_waiter: 'מלצר פעיל ⭐',
};
const stageLabel = (s) => STAGE_LABELS[s] || s || '—';

const FLOW_TEXT = 'נקלט → לומד תפריט → תיאום מבחן → (עבר → התלמדות 1, 2, 3, ... → מלצר פעיל) / (נכשל → תיאום מבחן חדש)';

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
  const [inbox, setInbox] = useState({ upcoming: [], recent: [], toCallBack: [], topUnscheduled: [], trainees: [] });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  // Inline slot picker state (per candidate row)
  const [openSlotCand, setOpenSlotCand] = useState(null); // candidate_id whose slots are showing
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const inboxRes = await base44.functions.getRecruitmentInbox({});
      setInbox(inboxRes?.data || { upcoming: [], recent: [], toCallBack: [], topUnscheduled: [], trainees: [] });
    } catch (e) {
      console.warn('load failed', e);
    } finally {
      setLoading(false);
    }
  };

  const openSlots = async (candId) => {
    if (openSlotCand === candId) { setOpenSlotCand(null); return; }
    setOpenSlotCand(candId);
    setSlotsLoading(true);
    try {
      const res = await base44.functions.getInterviewSlotsForManager({});
      setSlots(res?.data?.slots || []);
    } catch { setSlots([]); }
    finally { setSlotsLoading(false); }
  };

  const bookForCandidate = async (candId, slot) => {
    setActionId(candId);
    try {
      await base44.functions.bookInterviewByManager({ candidate_id: candId, date: slot.date, time: slot.time });
      setOpenSlotCand(null);
      await load();
    } catch (e) {
      alert(e?.message === 'slot_taken' ? 'המועד נתפס. בחר אחר.' : 'שגיאה בקביעת הראיון');
    } finally { setActionId(null); }
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

  const scheduleMenuExam = async (candId, slot) => {
    setActionId(candId);
    try {
      await base44.functions.bookInterviewByManager({ candidate_id: candId, date: slot.date, time: slot.time, type: 'menu_exam' });
      setOpenSlotCand(null);
      await load();
    } catch (e) {
      alert(e?.message === 'slot_taken' ? 'המועד נתפס. בחר אחר.' : 'שגיאה בקביעת המבחן');
    } finally { setActionId(null); }
  };

  const setExamResult = async (cand, passed) => {
    setActionId(cand.id);
    try {
      await base44.functions.setMenuExamResult({
        candidate_id: cand.id,
        interview_id: cand.next_menu_exam?.id || null,
        passed,
      });
      await load();
    } catch { alert('שגיאה בעדכון התוצאה'); }
    finally { setActionId(null); }
  };

  const addTrainingSession = async (cand) => {
    setActionId(cand.id);
    try {
      await base44.functions.completeTrainingSession({ candidate_id: cand.id });
      await load();
    } catch { alert('שגיאה'); }
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

      {/* Top candidates (80+) not yet scheduled */}
      <section className="bg-white rounded-2xl shadow border border-amber-200 p-4">
        <p className="font-black text-slate-800 mb-1">🌟 מועמדים מעולים — לשבץ ({inbox.topUnscheduled?.length || 0})</p>
        <p className="text-xs text-slate-500 mb-3">מועמדים עם 80+ שעדיין לא נכנסו לראיון. תוכל לקבוע להם ראיון או לפנות בוואטסאפ.</p>
        {(inbox.topUnscheduled || []).length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע מועמדים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {(inbox.topUnscheduled || []).map((c) => {
              const phone = normalizePhoneIL(c.phone);
              const waText = encodeURIComponent(`היי ${c.full_name} 🌿\nראיתי את הפניה שלך לעלינא, התרשמנו ממך 🙏 בא לקבוע ראיון?`);
              const open = openSlotCand === c.id;
              return (
                <div key={c.id} className="border-2 border-amber-200 rounded-xl p-3 bg-amber-50/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-bold text-slate-800">{c.full_name} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                      <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'}</p>
                    </div>
                    <div className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">ציון: {c.score ?? '-'}</div>
                    <button
                      onClick={() => openSlots(c.id)}
                      disabled={actionId === c.id}
                      className="text-xs bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold px-2.5 py-1.5 rounded-lg"
                    >
                      📅 {open ? 'סגור' : 'קבע ראיון'}
                    </button>
                    {phone && (
                      <a href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">
                        📱 פנייה בוואטסאפ
                      </a>
                    )}
                  </div>
                  {c.ai_summary && (
                    <p className="mt-2 text-xs text-slate-600 italic border-r-2 border-amber-200 pr-2">{c.ai_summary}</p>
                  )}
                  {open && (
                    <div className="mt-3 bg-white rounded-xl p-3 border border-slate-200">
                      {slotsLoading ? (
                        <p className="text-slate-400 text-sm">טוען מועדים…</p>
                      ) : slots.length === 0 ? (
                        <p className="text-slate-500 text-sm">
                          אין מועדים פנויים — הגדר סלוטים ב<a href={createPageUrl('InterviewSettings')} className="underline text-emerald-700"> הגדרות סלוטים</a>.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                          {slots.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => bookForCandidate(c.id, s)}
                              disabled={actionId === c.id}
                              className="rounded-lg border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 transition p-2 text-right text-xs"
                            >
                              <p className="font-bold text-slate-800">יום {s.weekday_name}</p>
                              <p className="text-slate-500">{fmtDate(s.date)} · {s.time}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
        <p className="font-black text-slate-800 mb-1">🎓 ציר ההתלמדות ({(inbox.trainees || []).length})</p>
        <p className="text-xs text-slate-500 mb-3">{FLOW_TEXT}</p>

        {(inbox.trainees || []).length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע מתלמדים. אחרי שתסמן "הגיע" בראיון, תוכל לקלוט אותו כאן.</p>
        ) : (
          <div className="space-y-3">
            {(inbox.trainees || []).map((c) => (
              <TraineeCard
                key={c.id}
                cand={c}
                actionId={actionId}
                openSlotCand={openSlotCand}
                slots={slots}
                slotsLoading={slotsLoading}
                onOpenSlots={openSlots}
                onScheduleMenuExam={scheduleMenuExam}
                onExamResult={setExamResult}
                onAddTraining={addTrainingSession}
                onAdvance={advance}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-4">💡 קלט מועמד חדש: סמן "הגיע" בראיון שלו → ייכנס לשלב "נקלט" ומשם תקדם דרך השלבים.</p>

        {/* Quick-hire shortcut for candidates already marked interviewed */}
        <InterviewedQuickHire onChange={load} />
      </section>
    </div>
  );
}

function TraineeCard({ cand, actionId, openSlotCand, slots, slotsLoading, onOpenSlots, onScheduleMenuExam, onExamResult, onAddTraining, onAdvance }) {
  const stage = cand.training_stage || 'hired';
  const sessions = cand.training_sessions_completed || 0;
  const attempts = cand.menu_exam_attempts || 0;
  const exam = cand.next_menu_exam;
  const open = openSlotCand === cand.id;
  const busy = actionId === cand.id;

  const phone = cand.phone;
  const wa = phone && (() => {
    const n = String(phone).replace(/\D/g, '');
    return (n.startsWith('0') ? '972' + n.slice(1) : (n.startsWith('972') ? n : '972' + n));
  })();

  return (
    <div className="border-2 border-indigo-100 rounded-xl p-3 bg-indigo-50/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[160px]">
          <p className="font-bold text-slate-800">{cand.full_name}</p>
          <p className="text-xs text-slate-500">{cand.role_applied || '—'} · {phone || '-'}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full font-bold bg-indigo-100 text-indigo-700">{stageLabel(stage)}</span>
        {stage === 'training' && (
          <span className="text-xs px-2 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">
            התלמדות #{sessions}
          </span>
        )}
        {attempts > 0 && (
          <span className="text-xs px-2 py-1 rounded-full font-bold bg-slate-100 text-slate-600">
            מבחני תפריט: {attempts}
          </span>
        )}
      </div>

      {/* Stage-specific actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {stage === 'hired' && (
          <button disabled={busy} onClick={() => onAdvance(cand, 'learning_menu')} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
            📖 התחל ללמד תפריט
          </button>
        )}

        {(stage === 'learning_menu' || stage === 'menu_exam_failed') && (
          <>
            <button disabled={busy} onClick={() => onOpenSlots(cand.id)} className="text-xs bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              📅 {open ? 'סגור' : 'תאם מבחן תפריט'}
            </button>
            {stage === 'menu_exam_failed' && (
              <span className="text-xs text-red-600 self-center">⚠️ נכשל במבחן הקודם — תאם חדש</span>
            )}
          </>
        )}

        {stage === 'menu_exam_scheduled' && exam && (
          <>
            <span className="text-xs bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg text-amber-700 font-bold">
              🗓️ {exam.scheduled_date} בשעה {exam.scheduled_time}
            </span>
            <button disabled={busy} onClick={() => onExamResult(cand, true)} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              ✓ עבר
            </button>
            <button disabled={busy} onClick={() => onExamResult(cand, false)} className="text-xs bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              ✕ לא עבר
            </button>
          </>
        )}

        {stage === 'menu_exam_passed' && (
          <button disabled={busy} onClick={() => onAdvance(cand, 'training')} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
            🎓 התחל התלמדויות
          </button>
        )}

        {stage === 'training' && (
          <>
            <button disabled={busy} onClick={() => onAddTraining(cand)} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              ✓ סיים התלמדות #{sessions + 1}
            </button>
            <button disabled={busy} onClick={() => onAdvance(cand, 'active_waiter')} className="text-xs bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
              ⭐ מלצר פעיל
            </button>
          </>
        )}

        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg mr-auto">
            📱 וואטסאפ
          </a>
        )}
      </div>

      {/* Inline slot picker for menu exam */}
      {open && (
        <div className="mt-3 bg-white rounded-xl p-3 border border-slate-200">
          <p className="text-xs font-bold text-slate-700 mb-2">📅 בחר מועד למבחן תפריט:</p>
          {slotsLoading ? (
            <p className="text-slate-400 text-sm">טוען…</p>
          ) : slots.length === 0 ? (
            <p className="text-slate-500 text-sm">
              אין מועדים פנויים — הגדר סלוטים ב<a href={createPageUrl('InterviewSettings')} className="underline text-emerald-700">הגדרות סלוטים</a>.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {slots.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onScheduleMenuExam(cand.id, s)}
                  disabled={busy}
                  className="rounded-lg border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 transition p-2 text-right text-xs"
                >
                  <p className="font-bold text-slate-800">יום {s.weekday_name}</p>
                  <p className="text-slate-500">{s.date} · {s.time}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
