import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

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
      })));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addRow = () => setRows((r) => [...r, { weekday: 0, time: '16:00', duration_minutes: 30, active: true }]);
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
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl p-2.5">
                <select
                  value={r.weekday}
                  onChange={(e) => updateRow(i, { weekday: parseInt(e.target.value) })}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>יום {w.label}</option>)}
                </select>
                <input
                  type="time"
                  value={r.time}
                  onChange={(e) => updateRow(i, { time: e.target.value })}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
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
                <label className="text-xs flex items-center gap-1.5 text-slate-600 mr-1">
                  <input type="checkbox" checked={r.active} onChange={(e) => updateRow(i, { active: e.target.checked })} />
                  פעיל
                </label>
                <button onClick={() => deleteRow(i)} className="text-red-500 hover:text-red-700 text-sm font-bold mr-auto px-2">
                  ✕ הסר
                </button>
              </div>
            ))}
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

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          💡 הסלוטים הם שבועיים חוזרים — מועמדים יראו את ה‑14 הימים הבאים, פחות מועדים שכבר נתפסו.
        </div>
      </div>
    </div>
  );
}
