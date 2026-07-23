// Employee CRM — notes feed (positive AND negative) + follow-up tasks.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ThumbsUp, ThumbsDown, MessageCircle, Trash2, Plus, CheckCircle2, Circle, ListTodo } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');
const QUICK = [
  { s: 'positive', t: 'קיבל מחמאה מלקוח' }, { s: 'positive', t: 'ניהל משמרת מצוין' }, { s: 'positive', t: 'עזר לעובד אחר' }, { s: 'positive', t: 'עבר הכשרה' }, { s: 'positive', t: 'קיבל אחריות חדשה' },
  { s: 'negative', t: 'איחר למשמרת' }, { s: 'negative', t: 'לא הגיע למשמרת' }, { s: 'negative', t: 'טעות תפעולית' },
];

export default function EmployeeNotesTasks({ employeeId, notes = [], tasks = [], onChange }) {
  const [text, setText] = useState('');
  const [sentiment, setSentiment] = useState('positive');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const addNote = async (s, t) => {
    const body = { employee_id: employeeId, sentiment: s || sentiment, text: t || text };
    if (!body.text.trim()) return;
    setBusy('note');
    try { await base44.functions.addEmployeeNote(body); setText(''); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const delNote = async (id) => { setBusy(id); try { await base44.functions.deleteEmployeeNote({ id }); onChange && onChange(); } catch (e) { setErr(e?.message || 'שגיאה'); } setBusy(null); };
  const addTask = async () => {
    if (!taskTitle.trim()) return; setBusy('task');
    try { await base44.functions.addEmployeeTask({ employee_id: employeeId, title: taskTitle, due_date: taskDue }); setTaskTitle(''); setTaskDue(''); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const toggleTask = async (t) => { setBusy(t.id); try { await base44.functions.updateEmployeeTask({ id: t.id, title: t.title, assignee: t.assignee, due_date: t.due_date ? String(t.due_date).slice(0, 10) : '', status: t.status === 'done' ? 'open' : 'done' }); onChange && onChange(); } catch (e) { setErr(e?.message || 'שגיאה'); } setBusy(null); };
  const delTask = async (id) => { setBusy(id); try { await base44.functions.deleteEmployeeTask({ id }); onChange && onChange(); } catch (e) { setErr(e?.message || 'שגיאה'); } setBusy(null); };

  const sIcon = (s) => s === 'positive' ? <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" /> : s === 'negative' ? <ThumbsDown className="w-3.5 h-3.5 text-red-600" /> : <MessageCircle className="w-3.5 h-3.5 text-slate-400" />;

  return (
    <div className="space-y-4" dir="rtl">
      {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{err}</div>}

      {/* Tasks */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ListTodo className="w-5 h-5 text-[#44512C]" /> משימות ומעקבים</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="משימת המשך (לבדוק העלאת שכר בעוד 3 חודשים…)" className="h-8 text-sm flex-1 min-w-[160px]" />
            <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="h-8 text-sm w-36" />
            <Button size="sm" className="h-8 gap-1 bg-[#44512C] hover:bg-[#3a4525]" disabled={busy === 'task' || !taskTitle.trim()} onClick={addTask}><Plus className="w-3.5 h-3.5" /> הוסף</Button>
          </div>
          {tasks.length === 0 && <p className="text-xs text-slate-400 text-center py-2">אין משימות פתוחות.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border-b last:border-0 py-1.5">
              <button disabled={busy === t.id} onClick={() => toggleTask(t)}>{t.status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}</button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</div>
                {t.due_date && <div className="text-[11px] text-amber-600">יעד: {fmtDate(t.due_date)}</div>}
              </div>
              <button onClick={() => delTask(t.id)} disabled={busy === t.id} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notes feed */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#44512C]" /> הערות ואירועים</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q, i) => (
              <button key={i} disabled={busy === 'note'} onClick={() => addNote(q.s, q.t)} className={`text-[11px] rounded-full px-2 py-1 border flex items-center gap-1 ${q.s === 'positive' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
                {q.s === 'positive' ? '👍' : '⚠️'} {q.t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded overflow-hidden border">
              <button onClick={() => setSentiment('positive')} className={`px-2 py-1.5 ${sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}><ThumbsUp className="w-4 h-4" /></button>
              <button onClick={() => setSentiment('negative')} className={`px-2 py-1.5 ${sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'text-slate-400'}`}><ThumbsDown className="w-4 h-4" /></button>
            </div>
            <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="הוסף הערה חופשית…" className="h-9 text-sm flex-1" />
            <Button size="sm" className="h-9" disabled={busy === 'note' || !text.trim()} onClick={() => addNote()}>הוסף</Button>
          </div>
          {notes.length === 0 && <p className="text-xs text-slate-400 text-center py-2">אין הערות עדיין. תעד גם הצלחות, לא רק בעיות.</p>}
          <div className="space-y-1">
            {notes.map((n) => (
              <div key={n.id} className={`flex items-start gap-2 rounded-lg p-2 ${n.sentiment === 'positive' ? 'bg-emerald-50/50' : n.sentiment === 'negative' ? 'bg-red-50/40' : 'bg-slate-50'}`}>
                <span className="mt-0.5">{sIcon(n.sentiment)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700">{n.text}</div>
                  <div className="text-[11px] text-slate-400">{fmtDate(n.createdAt)}{n.created_by_name ? ` · ${n.created_by_name}` : ''}</div>
                </div>
                <button onClick={() => delNote(n.id)} disabled={busy === n.id} className="text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
