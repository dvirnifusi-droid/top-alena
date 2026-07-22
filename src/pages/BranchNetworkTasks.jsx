// Branch-side network-task inbox. A branch (tenant) sees the tasks its chain HQ
// pushed to it and marks its own as done — the other half of the network-task
// loop. Backed by getMyBranchTasks / markMyBranchTask (scoped to this tenant).
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Loader2, Network, CheckCircle2, Circle, RefreshCw } from 'lucide-react';

const ROLE_LABELS = { owner: 'בעלים', manager: 'מנהל', chef: 'שף / מטבח', marketing: 'שיווק', bar: 'בר', service: 'שירות' };
const fmtDue = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); } catch { return ''; } };

export default function BranchNetworkTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [noteDraft, setNoteDraft] = useState({}); // task_id -> text being edited

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getMyBranchTasks();
      const list = (r?.data || r)?.tasks || [];
      setTasks(list);
      setNoteDraft(Object.fromEntries(list.map((t) => [t.task_id, t.note || ''])));
    }
    catch { setTasks([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (task_id, done) => {
    setBusy(task_id);
    setTasks((p) => p.map((t) => (t.task_id === task_id ? { ...t, done } : t))); // optimistic
    try { await base44.functions.markMyBranchTask({ task_id, done }); }
    catch { load(); }
    finally { setBusy(''); }
  };

  const saveNote = async (task_id, done) => {
    const note = noteDraft[task_id] ?? '';
    try { await base44.functions.markMyBranchTask({ task_id, done, note }); setTasks((p) => p.map((t) => (t.task_id === task_id ? { ...t, note } : t))); }
    catch { /* keep draft */ }
  };

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Network className="w-6 h-6 text-amber-600" /> משימות מהרשת
        </h1>
        <button onClick={load} className="text-slate-400 hover:text-slate-700"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <p className="text-sm text-slate-500">
        משימות שמטה הרשת שלך שלח לסניף. סמן מה שביצעתם — ההתקדמות נראית למטה גם ב-HQ.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">אין כרגע משימות מהרשת. 🎉</Card>
      ) : (
        <>
          <div className="text-xs text-slate-500">בוצעו {doneCount} מתוך {tasks.length}</div>
          <div className="space-y-2">
            {tasks.map((t) => (
              <Card key={t.task_id} className={`p-4 flex items-start gap-3 ${t.done ? 'bg-emerald-50/60 border-emerald-200' : ''}`}>
                <button onClick={() => toggle(t.task_id, !t.done)} disabled={busy === t.task_id} className="mt-0.5 shrink-0">
                  {busy === t.task_id
                    ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    : t.done
                      ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      : <Circle className="w-6 h-6 text-slate-300 hover:text-amber-500" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${t.done ? 'text-emerald-800 line-through' : 'text-slate-800'}`}>{t.title}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {t.role && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">👤 {ROLE_LABELS[t.role] || t.role}</span>}
                    {t.due_date && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">📅 עד {fmtDue(t.due_date)}</span>}
                    {t.chain_name && <span className="text-[10px] text-slate-400">רשת: {t.chain_name}</span>}
                  </div>
                  {t.detail && <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{t.detail}</div>}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={noteDraft[t.task_id] ?? ''}
                      onChange={(e) => setNoteDraft((p) => ({ ...p, [t.task_id]: e.target.value }))}
                      onBlur={() => { if ((noteDraft[t.task_id] ?? '') !== (t.note || '')) saveNote(t.task_id, t.done); }}
                      placeholder="הערה לרשת (אופציונלי)…"
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
