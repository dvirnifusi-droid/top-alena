import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import TimePicker from '@/components/shared/TimePicker';

// Owner-facing: weekly recurring interview slot definition.
// Stored as InterviewSlotTemplate {weekday, time, duration_minutes, active}.

const WEEKDAYS = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

// Compute the next calendar date for a (weekday, time) recurring slot.
function nextOccurrence(weekday, time) {
  try {
    const [h, m] = (time || '00:00').split(':').map(Number);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    let diff = weekday - now.getDay();
    if (diff < 0) diff += 7;                       // weekday already passed this week
    if (diff === 0 && today.getTime() < now.getTime()) diff = 7; // today but past the time
    const next = new Date(today.getTime() + diff * 86400000);
    return next;
  } catch { return null; }
}

function fmtDate(date) {
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysUntil(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function chipFor(date) {
  const n = daysUntil(date);
  if (n === 0) return { text: 'היום', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (n === 1) return { text: 'מחר', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (n <= 3) return { text: `בעוד ${n} ימים`, cls: 'bg-[#F4ECD8] text-[#2E3819] border-[#D9BD83]' };
  if (n <= 7) return { text: `בעוד ${n} ימים`, cls: 'bg-[#F4ECD8] text-cyan-800 border-[#D9BD83]' };
  return { text: `בעוד ${n} ימים`, cls: 'bg-amber-100 text-amber-800 border-amber-300' };
}

export default function InterviewSettings() {
  const [rows, setRows] = useState([]); // [{weekday, time, duration_minutes, active}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.getInterviewSlotTemplates({});
      setRows((res?.data?.templates || []).map((t) => ({
        weekday: t.weekday,
        time: t.time,
        duration_minutes: t.duration_minutes ?? 30,
        active: t.active !== false,
        specific_date: t.specific_date || '',
      })));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addRow = () => setRows((r) => [...r, { weekday: 0, time: '16:00', duration_minutes: 30, active: true, specific_date: '' }]);
  const updateRow = (i, patch) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const deleteRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.functions.saveInterviewSlotTemplates({ templates: rows });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-1">📅</div>
        <h1 className="text-2xl font-black text-slate-800">סלוטים לראיון עבודה</h1>
        <p className="text-slate-500 text-sm">המועדים שמועמדים עם ציון 80+ יוכלו לבחור מתוכם</p>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="font-bold text-slate-700">המועדים הקבועים שלי</p>
          <button onClick={addRow} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold">
            ➕ הוסף מועד
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm text-center py-6">טוען…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">עדיין לא הוגדרו מועדים — הוסף מועד אחד לפחות.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const effectiveDate = r.specific_date
                ? new Date(r.specific_date + 'T00:00')
                : nextOccurrence(r.weekday, r.time);
              const chip = effectiveDate && r.active ? chipFor(effectiveDate) : null;
              const isOneOff = !!r.specific_date;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl p-2.5">
                  <select
                    value={r.weekday}
                    onChange={(e) => updateRow(i, { weekday: parseInt(e.target.value), specific_date: '' })}
                    disabled={isOneOff}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>יום {w.label}</option>)}
                  </select>
                  <TimePicker
                    value={r.time}
                    onChange={(v) => updateRow(i, { time: v })}
                  />
                  <select
                    value={r.duration_minutes}
                    onChange={(e) => updateRow(i, { duration_minutes: parseInt(e.target.value) })}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value={15}>15 דק׳</option>
                    <option value={30}>30 דק׳</option>
                    <option value={45}>45 דק׳</option>
                    <option value={60}>60 דק׳</option>
                  </select>

                  {/* Editable date — switching this turns the slot into a one-off */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">{isOneOff ? '🎯 תאריך:' : '→ הבא:'}</span>
                    <input
                      type="date"
                      value={r.specific_date || (effectiveDate ? effectiveDate.toISOString().slice(0,10) : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) { updateRow(i, { specific_date: '' }); return; }
                        const wd = new Date(v + 'T00:00').getDay();
                        updateRow(i, { specific_date: v, weekday: wd });
                      }}
                      className={`border rounded-lg px-2 py-1 text-xs ${isOneOff ? 'border-purple-400 bg-[#F4ECD8] font-semibold' : 'border-slate-300 bg-white'}`}
                    />
                    {chip && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.text}</span>
                    )}
                    {isOneOff && (
                      <button
                        onClick={() => updateRow(i, { specific_date: '' })}
                        title="חזור לחזרה שבועית"
                        className="text-slate-400 hover:text-slate-700 text-xs px-1"
                      >
                        ↺
                      </button>
                    )}
                  </div>

                  <label className="text-xs flex items-center gap-1.5 text-slate-600 mr-1">
                    <input type="checkbox" checked={r.active} onChange={(e) => updateRow(i, { active: e.target.checked })} />
                    פעיל
                  </label>
                  <button onClick={() => deleteRow(i)} className="text-red-500 hover:text-red-700 text-sm font-bold mr-auto px-2">
                    ✕ הסר
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
          {saved && <span className="text-emerald-600 text-sm font-bold">✓ נשמר</span>}
        </div>

        <div className="mt-4 bg-[#F4ECD8] border border-[#E8D9B5] rounded-xl p-3 text-xs text-[#44512C]">
          💡 הסלוטים הם שבועיים חוזרים — מועמדים יראו את ה‑14 הימים הבאים, פחות מועדים שכבר נתפסו.
        </div>
      </div>
    </div>
  );
}
