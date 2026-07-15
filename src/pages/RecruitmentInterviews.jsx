import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { Calendar } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// Owner-controllable AI threshold: candidates with score >= this get the
// auto-interview slot picker in the chat. Lower the threshold on high-pressure
// days (short-staffed) so more candidates self-book; raise it when you want
// only the very best to qualify.
function MinScoreControl({ currentScore, onSaved }) {
  const [val, setVal] = useState(currentScore ?? 80);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(currentScore ?? 80); }, [currentScore]);
  const dirty = Number(val) !== Number(currentScore ?? 80);
  const save = async () => {
    const n = Math.max(40, Math.min(95, parseInt(val, 10) || 80));
    setSaving(true);
    try {
      await base44.functions.updateRecruitmentMinScore({ score: n });
      if (onSaved) await onSaved();
    } catch (e) {
      alert('שגיאה: ' + (e?.data?.message || e?.message || ''));
    } finally { setSaving(false); }
  };
  const presets = [
    { label: '🔥 לחץ מקסימלי — קבל הרבה', val: 60, color: 'bg-red-100 text-red-700 border-red-300' },
    { label: '⚡ לחץ — קבל יותר', val: 70, color: 'bg-orange-100 text-orange-700 border-orange-300' },
    { label: '📅 רגיל', val: 80, color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { label: '⭐ רק מעולים', val: 90, color: 'bg-[#F4ECD8] text-[#7A3722] border-[#D9BD83]' },
  ];
  return (
    <div className="mt-4 pt-3 border-t border-indigo-200">
      <p className="text-xs font-semibold text-slate-700 mb-1">⚙️ סף ציון לקביעת ראיון אוטומטית</p>
      <p className="text-[11px] text-slate-500 mb-2">
        מועמדים עם ציון <b>{currentScore ?? 80}+</b> רואים בצ'אט רשימת מועדים פנויים ומזמינים את עצמם.
        מועמדים מתחת ל-{currentScore ?? 80} נכנסים ל"לחזור אליהם" — אתה מחליט אם להתקשר.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map((p) => (
          <button
            key={p.val}
            onClick={() => setVal(p.val)}
            className={`text-[11px] px-2.5 py-1 rounded-full border-2 font-bold ${Number(val) === p.val ? p.color : 'bg-white border-slate-200 text-slate-500'}`}
          >
            {p.label} ({p.val}+)
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="40"
          max="95"
          step="5"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="flex-1"
          style={{ accentColor: 'var(--brand-primary, #A04A2E)' }}
        />
        <input
          type="number"
          min="40"
          max="95"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-14 text-center text-sm border border-slate-300 rounded-lg py-1"
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg ${dirty && !saving ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
        >
          {saving ? 'שומר…' : dirty ? '💾 שמור' : 'נשמר ✓'}
        </button>
      </div>
    </div>
  );
}

// Per-tenant recruitment criteria — the AI recruiter screens + scores candidates
// by THESE instead of the hardcoded defaults. Structured fields for the common
// knobs + a free-text box for anything else / scoring priorities.
function RecruitmentCriteriaControl({ criteria, onSaved }) {
  const norm = (cr) => ({
    min_age: cr?.min_age ?? 17,
    weekend_required: cr?.weekend_required !== false,
    min_experience: cr?.min_experience || '',
    location_pref: cr?.location_pref || '',
    extra: cr?.extra || '',
  });
  const [c, setC] = useState(() => norm(criteria));
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setC(norm(criteria)); }, [criteria]);
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await base44.functions.updateRecruitmentCriteria({ criteria: c });
      if (onSaved) await onSaved();
      setOpen(false);
    } catch (e) { alert('שגיאה: ' + (e?.data?.message || e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-4 pt-3 border-t border-indigo-200">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-xs font-semibold text-slate-700">
        <span>🎯 קריטריוני הסינון של הסוכן</span>
        <span className="text-slate-400">{open ? '▲ סגור' : '▼ ערוך'}</span>
      </button>
      {!open && (
        <p className="text-[11px] text-slate-500 mt-1">
          גיל {c.min_age}+ · סופ"ש {c.weekend_required ? 'חובה' : 'לא חובה'}{c.location_pref ? ` · ${c.location_pref}` : ''}{c.min_experience ? ` · ${c.min_experience}` : ''}
        </p>
      )}
      {open && (
        <div className="space-y-2.5 mt-2">
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="text-[11px] text-slate-600">גיל מינימלי
              <input type="number" min="14" max="80" value={c.min_age} onChange={(e) => set('min_age', e.target.value)} className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg py-1.5 px-2" />
            </label>
            <label className="text-[11px] text-slate-600 flex items-center gap-2 pb-2">
              <input type="checkbox" checked={c.weekend_required} onChange={(e) => set('weekend_required', e.target.checked)} className="w-4 h-4" style={{ accentColor: 'var(--brand-primary, #A04A2E)' }} />
              זמינות סופ"ש חובה
            </label>
          </div>
          <label className="block text-[11px] text-slate-600">ניסיון נדרש / מועדף
            <input value={c.min_experience} onChange={(e) => set('min_experience', e.target.value)} placeholder="לדוגמה: שנה ניסיון במסעדנות" className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg py-1.5 px-2" />
          </label>
          <label className="block text-[11px] text-slate-600">מיקום / אזור מועדף
            <input value={c.location_pref} onChange={(e) => set('location_pref', e.target.value)} placeholder="לדוגמה: ראשון לציון והסביבה" className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg py-1.5 px-2" />
          </label>
          <label className="block text-[11px] text-slate-600">קריטריונים נוספים + מה לתעדף בניקוד (חופשי)
            <textarea value={c.extra} onChange={(e) => set('extra', e.target.value)} rows={3} placeholder="כל דרישה נוספת — למשל: העדפה לניסיון בבר, רישיון נהיגה, זמינות למשמרות בוקר, תעדף דוברי שפות…" className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg py-1.5 px-2" />
          </label>
          <button onClick={save} disabled={saving} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? 'שומר…' : '💾 שמור קריטריונים'}
          </button>
        </div>
      )}
    </div>
  );
}

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

function reminderText(iv, brand = 'המסעדה') {
  const d = new Date(iv.scheduled_date + 'T' + iv.scheduled_time);
  const dStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return (
    `היי ${iv.candidate_name || ''} 🌿\n` +
    `מזכיר/ה לך — נפגשים לראיון במסעדת ${brand} ב${dStr} בשעה ${iv.scheduled_time}.\n` +
    `נשמח לראותך, ואם משהו השתנה — תכתוב/י לי כאן.`
  );
}

function fmtDate(d) {
  try { return new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }); }
  catch { return d; }
}

function fmtFullDate(d) {
  try { return new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return d; }
}

// Returns { label, tone } describing how far a slot is from today.
// tone is one of 'today' | 'soon' | 'this_week' | 'next_week' | 'far'
function daysFromNow(d) {
  try {
    const target = new Date(d + 'T00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return { days: 0, label: 'היום', tone: 'today' };
    if (diff === 1) return { days: 1, label: 'מחר', tone: 'today' };
    if (diff < 0) return { days: diff, label: `לפני ${-diff} ימים`, tone: 'far' };
    if (diff <= 3) return { days: diff, label: `בעוד ${diff} ימים`, tone: 'soon' };
    if (diff <= 7) return { days: diff, label: `בעוד ${diff} ימים`, tone: 'this_week' };
    if (diff <= 14) return { days: diff, label: `בעוד ${diff} ימים`, tone: 'next_week' };
    return { days: diff, label: `בעוד ${diff} ימים ⚠️`, tone: 'far' };
  } catch { return { days: 0, label: '', tone: 'far' }; }
}

const TONE_CLASSES = {
  today:     'bg-emerald-100 text-emerald-800 border-emerald-300',
  soon:      'bg-[#F4ECD8] text-[#2E3819] border-[#D9BD83]',
  this_week: 'bg-[#F4ECD8] text-cyan-800 border-[#D9BD83]',
  next_week: 'bg-amber-100 text-amber-800 border-amber-300',
  far:       'bg-red-100 text-red-800 border-red-300',
};

export default function RecruitmentInterviews() {
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const [inbox, setInbox] = useState({ upcoming: [], recent: [], toCallBack: [], topUnscheduled: [], trainees: [], rejected: [], abandoned: [], funnel: null });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  // Inline slot picker state (per candidate row)
  const [openSlotCand, setOpenSlotCand] = useState(null); // candidate_id whose slots are showing
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [transcriptCand, setTranscriptCand] = useState(null); // candidate object to show transcript for

  const restoreRejected = async (cand) => {
    if (!confirm(`להחזיר את ${cand.full_name || 'המועמד'} למעמד "ממתין"?`)) return;
    try {
      await base44.functions.unrejectCandidate({ candidate_id: cand.id });
      await load();
    } catch (e) { alert('שגיאה בהחזרה: ' + (e?.message || '')); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const inboxRes = await base44.functions.getRecruitmentInbox({});
      setInbox(inboxRes?.data || { upcoming: [], recent: [], toCallBack: [], topUnscheduled: [], trainees: [], rejected: [], abandoned: [], funnel: null });
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
    const text = encodeURIComponent(reminderText(iv, brandName));
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

  const cancelInterview = async (iv) => {
    if (!confirm(`לבטל את הראיון של ${iv.candidate_name || 'המועמד'} בתאריך ${fmtDate(iv.scheduled_date)} ${iv.scheduled_time}?\n\nהמועד יתפנה לאחרים והמועמד יחזור לרשימת ההמתנה.`)) return;
    setActionId(iv.id);
    try {
      await base44.functions.cancelInterview({ id: iv.id });
      await load();
    } catch { alert('שגיאה בביטול'); }
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

  const deleteCandidate = async (cand) => {
    if (!window.confirm(`למחוק את "${cand.full_name}" לצמיתות? פעולה זו תסיר גם את כל הראיונות המקושרים שלו.`)) return;
    setActionId(cand.id);
    try {
      await base44.functions.deleteCandidate({ candidate_id: cand.id });
      await load();
    } catch { alert('שגיאה במחיקה'); }
    finally { setActionId(null); }
  };

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4 space-y-5">
      <PageHeader
        title="ראיונות וגיוס"
        subtitle="ראיונות קרובים, ציר התלמדות, מי מחכה לחזרה"
        icon={Calendar}
        action={
          <a href={createPageUrl('InterviewSettings')} className="text-sm bg-white border border-slate-300 hover:bg-slate-50 rounded-xl px-3 py-2 font-bold text-slate-700">
            ⚙️ הגדרת סלוטים
          </a>
        }
      />

      {loading && <p className="text-slate-400 text-center py-6">טוען…</p>}

      {/* Funnel dashboard — application pipeline with conversion % */}
      {inbox.funnel && (
        <section className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] rounded-2xl shadow border border-indigo-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-slate-800">משפך הגיוס</p>
            <span className="text-xs text-slate-500">סה"כ במאגר: {inbox.funnel.total}</span>
          </div>
          {/* Conversion-aware funnel — each step shows % vs previous step */}
          {(() => {
            const steps = [
              { label: 'התחילו', icon: '👋', val: inbox.funnel.started, color: 'bg-slate-100 text-slate-700' },
              { label: 'נתנו טלפון', icon: '📞', val: inbox.funnel.gave_phone, color: 'bg-[#F4ECD8] text-[#44512C]' },
              { label: 'בחרו תפקיד', icon: '💼', val: inbox.funnel.gave_role, color: 'bg-[#F4ECD8] text-[#8A6E3A]' },
              { label: 'סיימו סינון', icon: '✔️', val: inbox.funnel.completed_screening, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'מועמדים מעולים', icon: '🌟', val: inbox.funnel.approved, color: 'bg-amber-100 text-amber-700' },
              { label: 'ראיון נקבע', icon: '📅', val: inbox.funnel.interview_scheduled, color: 'bg-[#F4ECD8] text-[#7A3722]' },
              { label: 'התקבלו', icon: '🎉', val: inbox.funnel.hired, color: 'bg-green-200 text-green-800' },
            ];
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {steps.map((s, i) => {
                  const prev = i === 0 ? null : steps[i - 1].val;
                  const pct = prev && prev > 0 ? Math.round((s.val / prev) * 100) : null;
                  return (
                    <div key={i} className={`rounded-xl px-3 py-2 ${s.color}`}>
                      <p className="text-xs font-medium flex items-center gap-1"><span>{s.icon}</span><span>{s.label}</span></p>
                      <p className="text-2xl font-black mt-1">{s.val}</p>
                      {pct !== null && (
                        <p className="text-[10px] opacity-70 mt-0.5">{pct}% מהשלב הקודם</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 rounded-xl px-3 py-2 bg-orange-100 text-orange-700">
              <p className="text-xs font-medium">🚪 נטשו באמצע</p>
              <p className="text-2xl font-black mt-1">{inbox.funnel.abandoned}</p>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2 bg-red-100 text-red-700">
              <p className="text-xs font-medium">❌ נדחו ע"י ה-AI</p>
              <p className="text-2xl font-black mt-1">{inbox.funnel.rejected}</p>
            </div>
          </div>

          {/* Source breakdown — where the leads are coming from */}
          {inbox.source_counts && Object.keys(inbox.source_counts).length > 0 && (
            <div className="mt-4 pt-3 border-t border-indigo-200">
              <p className="text-xs font-semibold text-slate-600 mb-2">📥 לפי מקור</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(inbox.source_counts).map(([src, n]) => {
                  const icon = src === 'facebook' ? '📘' : src === 'whatsapp' ? '💬' : src === 'web_chat' ? '🌐' : src === 'instagram' ? '📷' : '📥';
                  return (
                    <span key={src} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="mr-1">{icon}</span><b>{src}:</b> {n}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 30-day trend mini-bar chart */}
          {Array.isArray(inbox.trend_30) && inbox.trend_30.length > 0 && (() => {
            const max = Math.max(1, ...inbox.trend_30.map((t) => t.count));
            return (
              <div className="mt-4 pt-3 border-t border-indigo-200">
                <p className="text-xs font-semibold text-slate-600 mb-2">📈 פניות ב-30 הימים האחרונים</p>
                <div className="flex items-end gap-0.5 h-16">
                  {inbox.trend_30.map((t) => (
                    <div
                      key={t.date}
                      title={`${t.date}: ${t.count}`}
                      className="flex-1 bg-[#D9BD83] hover:bg-[#A04A2E] transition-colors rounded-t"
                      style={{ height: `${(t.count / max) * 100}%`, minHeight: t.count > 0 ? '4px' : '0' }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{inbox.trend_30[0]?.date.slice(5)}</span>
                  <span>{inbox.trend_30[inbox.trend_30.length - 1]?.date.slice(5)}</span>
                </div>
              </div>
            );
          })()}

          {/* Rejection reasons breakdown */}
          {inbox.rejection_reasons && Object.keys(inbox.rejection_reasons).length > 0 && (
            <div className="mt-4 pt-3 border-t border-indigo-200">
              <p className="text-xs font-semibold text-slate-600 mb-2">❌ סיבות דחיה</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(inbox.rejection_reasons).map(([reason, n]) => {
                  const label = {
                    test: '🧪 בדיקה',
                    age: '🔞 גיל',
                    kashrut: '✡️ כשרות',
                    weekend: '🌙 סופ"ש',
                    location: '📍 מיקום',
                    experience: '📚 ניסיון',
                    availability: '⏰ זמינות',
                    other: '❔ אחר',
                  }[reason] || reason;
                  return (
                    <span key={reason} className="text-xs bg-white border border-red-200 rounded-lg px-2.5 py-1.5">
                      {label}: <b>{n}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goals progress (only shown if owner set targets) */}
          {Array.isArray(inbox.goals_progress) && inbox.goals_progress.length > 0 && (
            <div className="mt-4 pt-3 border-t border-indigo-200">
              <p className="text-xs font-semibold text-slate-600 mb-2">🎯 יעדי גיוס החודש</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {inbox.goals_progress.map((g) => {
                  const pct = g.target > 0 ? Math.min(100, Math.round((g.hired / g.target) * 100)) : 0;
                  return (
                    <div key={g.role} className="bg-white border border-slate-200 rounded-lg p-2">
                      <p className="text-xs font-semibold text-slate-700">{g.role}</p>
                      <p className="text-lg font-black">{g.hired}/{g.target}</p>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duplicate phones warning */}
          {Array.isArray(inbox.duplicates) && inbox.duplicates.length > 0 && (
            <div className="mt-4 pt-3 border-t border-indigo-200">
              <p className="text-xs font-semibold text-orange-600 mb-2">⚠️ טלפונים כפולים ({inbox.duplicates.length})</p>
              <div className="space-y-1">
                {inbox.duplicates.slice(0, 5).map((d) => (
                  <p key={d.phone} className="text-xs text-slate-600">
                    📱 {d.phone} — {d.count} רשומות (אחרון: <b>{d.latest_name}</b>, {d.latest_status})
                  </p>
                ))}
              </div>
            </div>
          )}

        </section>
      )}

      {/* AI recruiter config — must be reachable even before any applications create a funnel */}
      <section className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] rounded-2xl shadow border border-indigo-200 p-4">
        {/* Min-score slider — owner-tunable threshold for auto interview booking */}
        <MinScoreControl currentScore={inbox.settings?.min_score ?? 80} onSaved={load} />
        <RecruitmentCriteriaControl criteria={inbox.settings?.recruitment_criteria} onSaved={load} />
      </section>

      {/* Upcoming interviews */}
      <section className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-black text-slate-800 mb-3">ראיונות קרובים ({inbox.upcoming.length})</p>
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
                <button
                  disabled={actionId===iv.id}
                  onClick={() => cancelInterview(iv)}
                  title="בטל ראיון ופתח את התאריך"
                  className="text-xs bg-slate-500 hover:bg-slate-600 text-white font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                >
                  🗑️ בטל ראיון
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top candidates (80+) not yet scheduled */}
      <section className="bg-white rounded-2xl shadow border border-amber-200 p-4">
        <p className="font-black text-slate-800 mb-1">מועמדים מעולים — לשבץ ({inbox.topUnscheduled?.length || 0})</p>
        <p className="text-xs text-slate-500 mb-3">מועמדים עם 80+ שעדיין לא נכנסו לראיון. תוכל לקבוע להם ראיון או לפנות בוואטסאפ.</p>
        {(inbox.topUnscheduled || []).length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע מועמדים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {(inbox.topUnscheduled || []).map((c) => {
              const phone = normalizePhoneIL(c.phone);
              const waText = encodeURIComponent(`היי ${c.full_name} 🌿\nראיתי את הפניה שלך ל${brandName}, התרשמנו ממך 🙏 בא לקבוע ראיון?`);
              const open = openSlotCand === c.id;
              return (
                <div key={c.id} className="border-2 border-amber-200 rounded-xl p-3 bg-amber-50/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-bold text-slate-800">{c.full_name} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                      <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'}</p>
                    </div>
                    <div className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">ציון: {c.score ?? '-'}</div>
                    {c.source && c.source !== 'web_chat' && (
                      <div className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full font-bold">מ‑{c.source}</div>
                    )}
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
                    <button
                      disabled={actionId === c.id}
                      onClick={() => deleteCandidate(c)}
                      title="מחק מועמד"
                      className="text-xs bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      🗑️
                    </button>
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
                          {slots.map((s, i) => {
                            const t = daysFromNow(s.date);
                            return (
                              <button
                                key={i}
                                onClick={() => bookForCandidate(c.id, s)}
                                disabled={actionId === c.id}
                                className="rounded-lg border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 transition p-2 text-right text-xs"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-bold text-slate-800">יום {s.weekday_name}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TONE_CLASSES[t.tone]}`}>{t.label}</span>
                                </div>
                                <p className="text-slate-600 font-semibold">{fmtFullDate(s.date)} · {s.time}</p>
                              </button>
                            );
                          })}
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
        <p className="font-black text-slate-800 mb-3">לחזור אליהם ({inbox.toCallBack.length})</p>
        <p className="text-xs text-slate-500 mb-3">מועמדים עם ציון 50–79. אם תרצה לזמן אותם — שלח להם בוואטסאפ.</p>
        {inbox.toCallBack.length === 0 ? (
          <p className="text-slate-400 text-sm">אין מועמדים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {inbox.toCallBack.map((c) => {
              const phone = normalizePhoneIL(c.phone);
              const waText = encodeURIComponent(`היי ${c.full_name} 🌿\nראיתי את הפניה שלך ל${brandName}. אשמח לתאם איתך ראיון בקרוב — מתי נוח לך?`);
              return (
                <div key={c.id} className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-bold text-slate-800">{c.full_name} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                    <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'}</p>
                  </div>
                  <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">ציון: {c.score ?? '-'}</div>
                  {c.source && c.source !== 'web_chat' && (
                    <div className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full font-bold">מ‑{c.source}</div>
                  )}
                  {c.kashrut_required && c.kashrut_capable === false && (
                    <div className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full font-bold border border-orange-300" title="ענה שאינו עומד בדרישות בישול גויים">
                      🍽️ לא לכשרות
                    </div>
                  )}
                  {c.ai_summary && (
                    <p className="basis-full text-xs text-slate-500 italic border-r-2 border-slate-200 pr-2">{c.ai_summary}</p>
                  )}
                  {phone && (
                    <a href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">
                      📱 פנייה בוואטסאפ
                    </a>
                  )}
                  <button
                    disabled={actionId === c.id}
                    onClick={() => deleteCandidate(c)}
                    title="מחק מועמד"
                    className="text-xs bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Training pipeline */}
      <section className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-black text-slate-800 mb-1">ציר ההתלמדות ({(inbox.trainees || []).length})</p>
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
                onDelete={deleteCandidate}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-4">💡 קלט מועמד חדש: סמן "הגיע" בראיון שלו → ייכנס לשלב "נקלט" ומשם תקדם דרך השלבים.</p>

        {/* Quick-hire shortcut for candidates already marked interviewed */}
        <InterviewedQuickHire onChange={load} />
      </section>

      {/* Abandoned mid-chat — started but never completed screening */}
      <section className="bg-white rounded-2xl shadow border border-orange-200 p-4">
        <p className="font-black text-slate-800 mb-1">נטשו באמצע הראיון ({(inbox.abandoned || []).length})</p>
        <p className="text-xs text-slate-500 mb-3">פתחו את צ'אט הגיוס אבל לא סיימו. בכל אחד מסומן השלב שבו עזב — תוכל לפנות לו ולעודד לסיים.</p>
        {(inbox.abandoned || []).length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע נטישות פעילות.</p>
        ) : (
          <div className="space-y-2">
            {(inbox.abandoned || []).map((c) => {
              const stageLabel = ({
                phone: '📞 לא נתן טלפון',
                role: '💼 לא בחר תפקיד',
                experience: '📚 לא תיאר ניסיון',
                shifts: '📅 לא ציין משמרות',
                weekend: '🌙 לא ציין סופ"ש',
                start_date: '🗓️ לא ציין תאריך התחלה',
                final_review: '✔️ הגיע לסוף, לא אישר',
              }[c.abandoned_stage] || c.abandoned_stage);
              const phone = normalizePhoneIL(c.phone);
              const applyUrl = `${typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://topalena.com'}/apply`;
              const waText = encodeURIComponent(`היי ${c.full_name || ''} 🌿\nראיתי שהתחלת בשיחה עם ${brandName} ולא סיימת. רוצה לחזור ולהמשיך?\n${applyUrl}`);
              return (
                <div key={c.id} className="border border-orange-200 rounded-xl p-3 bg-orange-50/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-bold text-slate-800">{c.full_name || 'ללא שם'} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                      <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'} · 📞 {c.phone || '-'}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full font-bold bg-orange-100 text-orange-700">{stageLabel}</span>
                    <span className="text-xs text-slate-400">💬 {c.transcript_turns} הודעות</span>
                    {phone && (
                      <a href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">📱 וואטסאפ</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Rejected by AI — visible for audit */}
      <section className="bg-white rounded-2xl shadow border border-red-200 p-4">
        <p className="font-black text-slate-800 mb-1">❌ נדחו ע"י ה-AI ({(inbox.rejected || []).length})</p>
        <p className="text-xs text-slate-500 mb-3">ה-AI החליט שלא להמשיך איתם. בדוק אם נדחה במקרה מועמד מתאים — תוכל להפוך את ההחלטה ידנית.</p>
        {(inbox.rejected || []).length === 0 ? (
          <p className="text-slate-400 text-sm">אין כרגע מועמדים שנדחו.</p>
        ) : (
          <div className="space-y-2">
            {(inbox.rejected || []).map((c) => {
              const phone = normalizePhoneIL(c.phone);
              const waText = encodeURIComponent(`היי ${c.full_name || ''} 🌿\nבדקתי שוב את הפניה שלך ל${brandName} ובא לי להמשיך איתך. תוכל לחזור אלינו?`);
              return (
                <div key={c.id} className="border border-red-200 rounded-xl p-3 bg-red-50/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-bold text-slate-800">{c.full_name || 'ללא שם'} {c.age && <span className="text-slate-400 text-xs">({c.age})</span>}</p>
                      <p className="text-xs text-slate-500">{c.role_applied || '—'} · {c.city || '-'} · 📞 {c.phone || '-'}</p>
                      {c.ai_summary && <p className="text-xs text-[#7A3722] bg-[#F4ECD8] px-2 py-1 mt-1 rounded">🤖 {String(c.ai_summary).slice(0, 200)}</p>}
                      {c.notes && <p className="text-xs text-slate-600 mt-1 line-clamp-2">💬 {c.notes}</p>}
                    </div>
                    {c.score != null && <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-1 rounded-full">ציון: {c.score}</span>}
                    <span className="text-xs px-2 py-1 rounded-full font-bold bg-red-100 text-red-700">נדחה</span>
                    {Array.isArray(c.transcript) && c.transcript.length > 0 && (
                      <button onClick={() => setTranscriptCand(c)} className="text-xs bg-slate-500 hover:bg-slate-600 text-white font-bold px-2.5 py-1.5 rounded-lg">💬 ראה שיחה</button>
                    )}
                    <button onClick={() => restoreRejected(c)} className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1.5 rounded-lg">🔄 החזר ל-pending</button>
                    {phone && (
                      <a href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded-lg">📱 וואטסאפ</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Transcript modal — overlays the whole chat for any candidate row */}
      {transcriptCand && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTranscriptCand(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="font-black text-slate-800">💬 שיחת ה-AI עם {transcriptCand.full_name || 'מועמד'}</p>
                <p className="text-xs text-slate-500">{transcriptCand.transcript?.length || 0} הודעות · ציון: {transcriptCand.score ?? '—'} · {transcriptCand.status}</p>
              </div>
              <button onClick={() => setTranscriptCand(null)} className="text-2xl text-slate-400 hover:text-slate-700">×</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {(transcriptCand.transcript || []).map((m, i) => (
                <div key={i} className={`p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-[#F4ECD8] mr-12' : 'bg-slate-50 ml-12'}`}>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{m.role === 'user' ? 'המועמד' : 'הסוכן'}</p>
                  <p className="whitespace-pre-wrap text-slate-800">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TraineeCard({ cand, actionId, openSlotCand, slots, slotsLoading, onOpenSlots, onScheduleMenuExam, onExamResult, onAddTraining, onAdvance, onDelete }) {
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
    <div className="border-2 border-[#F4ECD8] rounded-xl p-3 bg-[#F4ECD8]/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[160px]">
          <p className="font-bold text-slate-800">{cand.full_name}</p>
          <p className="text-xs text-slate-500">{cand.role_applied || '—'} · {phone || '-'}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full font-bold bg-[#F4ECD8] text-[#7A3722]">{stageLabel(stage)}</span>
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
          <button disabled={busy} onClick={() => onAdvance(cand, 'learning_menu')} className="text-xs bg-[#A04A2E] hover:bg-[#7A3722] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
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
            <button disabled={busy} onClick={() => onAddTraining(cand)} className="text-xs bg-[#A04A2E] hover:bg-[#7A3722] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg">
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
        <button
          disabled={busy}
          onClick={() => onDelete?.(cand)}
          title="מחק מועמד"
          className="text-xs bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
        >
          🗑️
        </button>
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
              {slots.map((s, i) => {
                const t = daysFromNow(s.date);
                return (
                  <button
                    key={i}
                    onClick={() => onScheduleMenuExam(cand.id, s)}
                    disabled={busy}
                    className="rounded-lg border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 transition p-2 text-right text-xs"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-slate-800">יום {s.weekday_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TONE_CLASSES[t.tone]}`}>{t.label}</span>
                    </div>
                    <p className="text-slate-600 font-semibold">{fmtFullDate(s.date)} · {s.time}</p>
                  </button>
                );
              })}
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
