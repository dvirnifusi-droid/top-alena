// Employee CRM — meetings/conversations tab + full salary history.
// Meeting types: interview / onboarding / feedback / raise / role change /
// warning / disciplinary / motivation / hearing / termination / general.
// A raise meeting auto-updates EmployeePay + appends salary history (old kept).
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Pencil, Trash2, Upload, ExternalLink, CalendarClock, TrendingUp,
  MessageSquare, Save, CheckCircle2, Circle,
} from 'lucide-react';

export const MEETING_TYPES = [
  { value: 'interview', label: 'ראיון עבודה', color: 'bg-sky-100 text-sky-800' },
  { value: 'onboarding', label: 'שיחת קליטה', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'feedback', label: 'שיחת משוב', color: 'bg-blue-100 text-blue-800' },
  { value: 'raise', label: 'העלאת שכר', color: 'bg-amber-100 text-amber-800' },
  { value: 'role_change', label: 'שינוי תפקיד', color: 'bg-violet-100 text-violet-800' },
  { value: 'warning', label: 'שיחת אזהרה', color: 'bg-orange-100 text-orange-800' },
  { value: 'disciplinary', label: 'בירור משמעתי', color: 'bg-red-100 text-red-800' },
  { value: 'motivation', label: 'שיחת מוטיבציה', color: 'bg-teal-100 text-teal-800' },
  { value: 'hearing', label: 'שיחת שימוע', color: 'bg-rose-100 text-rose-800' },
  { value: 'termination', label: 'שיחת סיום עבודה', color: 'bg-slate-200 text-slate-800' },
  { value: 'general', label: 'פגישה כללית', color: 'bg-slate-100 text-slate-600' },
];
const mMeta = (t) => MEETING_TYPES.find((m) => m.value === t) || MEETING_TYPES[10];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');
const emptyMeeting = { meeting_type: 'feedback', meeting_at: '', participants: '', purpose: '', summary: '', decisions: '', followup_task: '', followup_date: '', doc_url: '', emp_signed: false, mgr_signed: false, salary_from: '', salary_to: '', salary_effective: '', salary_reason: '' };

export default function EmployeeMeetings({ employeeId, meetings = [], salaryHistory = [], onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyMeeting);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const upd = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const openNew = () => { setDraft(emptyMeeting); setEditingId(null); setShowAdd((v) => !v); };
  const edit = (m) => {
    setDraft({
      meeting_type: m.meeting_type, meeting_at: m.meeting_at ? String(m.meeting_at).slice(0, 16) : '', participants: m.participants || '',
      purpose: m.purpose || '', summary: m.summary || '', decisions: m.decisions || '', followup_task: m.followup_task || '',
      followup_date: m.followup_date ? String(m.followup_date).slice(0, 10) : '', doc_url: m.doc_url || '',
      emp_signed: !!m.emp_signed, mgr_signed: !!m.mgr_signed,
      salary_from: m.salary_from ?? '', salary_to: m.salary_to ?? '', salary_effective: m.salary_effective ? String(m.salary_effective).slice(0, 10) : '', salary_reason: m.salary_reason || '',
    });
    setEditingId(m.id); setShowAdd(true);
  };
  const uploadDoc = async (file) => {
    if (!file) return; setUploading(true);
    try { const { file_url } = await UploadFile({ file }); upd('doc_url', file_url); }
    catch (e) { setErr(e?.message || 'העלאה נכשלה'); }
    setUploading(false);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const payload = { ...draft, employee_id: employeeId };
      if (editingId) await base44.functions.updateEmployeeMeeting({ id: editingId, ...payload });
      else await base44.functions.addEmployeeMeeting(payload);
      setShowAdd(false); setEditingId(null); setDraft(emptyMeeting);
      onChange && onChange();
    } catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(false);
  };
  const del = async (id) => {
    if (!window.confirm('למחוק את הפגישה?')) return;
    setBusy(true);
    try { await base44.functions.deleteEmployeeMeeting({ id }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(false);
  };
  const toggleFollowupDone = async (m) => {
    try { await base44.functions.updateEmployeeMeeting({ ...m, id: m.id, followup_done: !m.followup_done, meeting_at: m.meeting_at ? String(m.meeting_at).slice(0, 16) : '', followup_date: m.followup_date ? String(m.followup_date).slice(0, 10) : '' }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
  };

  const isRaise = draft.meeting_type === 'raise';

  return (
    <div className="space-y-4" dir="rtl">
      {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{err}</div>}

      {/* Salary history */}
      {salaryHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-5 h-5 text-amber-600" /> היסטוריית שכר</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {salaryHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{h.old_rate != null ? `${h.old_rate} → ` : ''}{h.new_rate} ₪{h.pay_type === 'monthly' ? '' : '/שעה'}</span>
                    {h.reason && <span className="text-xs text-slate-500">· {h.reason}</span>}
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(h.effective_date || h.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meetings */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-5 h-5 text-[#44512C]" /> פגישות ושיחות</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={openNew}><Plus className="w-3.5 h-3.5" /> פגישה חדשה</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAdd && (
            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={draft.meeting_type} onChange={(e) => upd('meeting_type', e.target.value)} className="h-9 rounded border border-slate-300 text-sm px-2">
                  {MEETING_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <Input type="datetime-local" value={draft.meeting_at} onChange={(e) => upd('meeting_at', e.target.value)} className="h-9 text-sm" />
              </div>
              {isRaise && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
                  <div className="text-xs font-semibold text-amber-800">פרטי העלאת שכר (יתעדכן אוטומטית + יישמר בהיסטוריה)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">שכר נוכחי<Input type="number" dir="ltr" value={draft.salary_from} onChange={(e) => upd('salary_from', e.target.value)} placeholder="אוטו" className="h-8 text-sm" /></label>
                    <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">שכר חדש<Input type="number" dir="ltr" value={draft.salary_to} onChange={(e) => upd('salary_to', e.target.value)} className="h-8 text-sm" /></label>
                    <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">בתוקף מ-<Input type="date" value={draft.salary_effective} onChange={(e) => upd('salary_effective', e.target.value)} className="h-8 text-sm" /></label>
                  </div>
                  <Input value={draft.salary_reason} onChange={(e) => upd('salary_reason', e.target.value)} placeholder="סיבת ההעלאה / שינוי באחריות" className="h-8 text-sm" />
                </div>
              )}
              <Input value={draft.participants} onChange={(e) => upd('participants', e.target.value)} placeholder="משתתפים" className="h-9 text-sm" />
              <Input value={draft.purpose} onChange={(e) => upd('purpose', e.target.value)} placeholder="מטרת הפגישה" className="h-9 text-sm" />
              <Textarea value={draft.summary} onChange={(e) => upd('summary', e.target.value)} placeholder="סיכום הדברים שנאמרו" rows={2} className="text-sm" />
              <Textarea value={draft.decisions} onChange={(e) => upd('decisions', e.target.value)} placeholder="החלטות שהתקבלו" rows={2} className="text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={draft.followup_task} onChange={(e) => upd('followup_task', e.target.value)} placeholder="משימת המשך" className="h-9 text-sm" />
                <Input type="date" value={draft.followup_date} onChange={(e) => upd('followup_date', e.target.value)} className="h-9 text-sm" title="תאריך למעקב" />
              </div>
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={draft.emp_signed} onChange={(e) => upd('emp_signed', e.target.checked)} /> חתימת עובד</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={draft.mgr_signed} onChange={(e) => upd('mgr_signed', e.target.checked)} /> חתימת מנהל</label>
                <label className="flex items-center gap-1 cursor-pointer text-slate-500 hover:text-slate-700 mr-auto">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} מסמך מצורף
                  <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadDoc(e.target.files?.[0])} />
                </label>
                {draft.doc_url && <a href={draft.doc_url} target="_blank" rel="noreferrer" className="text-blue-600"><ExternalLink className="w-4 h-4" /></a>}
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setEditingId(null); }}>ביטול</Button>
                <Button size="sm" disabled={busy} onClick={save} className="bg-[#44512C] hover:bg-[#3a4525] gap-1"><Save className="w-3.5 h-3.5" /> {editingId ? 'עדכן' : 'שמור פגישה'}</Button>
              </div>
            </div>
          )}

          {meetings.length === 0 && !showAdd && <p className="text-sm text-slate-500 text-center py-3">אין עדיין פגישות. תעד ראיון, שיחות משוב, העלאות שכר ושימועים.</p>}
          {meetings.map((m) => {
            const meta = mMeta(m.meeting_type);
            return (
              <div key={m.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={meta.color}>{meta.label}</Badge>
                    <span className="text-xs text-slate-400">{fmtDate(m.meeting_at || m.createdAt)}</span>
                    {m.emp_signed && <span className="text-[10px] text-emerald-600">✓ עובד חתם</span>}
                    {m.mgr_signed && <span className="text-[10px] text-emerald-600">✓ מנהל חתם</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.doc_url && <a href={m.doc_url} target="_blank" rel="noreferrer" className="text-blue-600" title="מסמך"><ExternalLink className="w-3.5 h-3.5" /></a>}
                    <button onClick={() => edit(m)} className="text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(m.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {m.meeting_type === 'raise' && m.salary_to != null && (
                  <div className="text-sm font-semibold text-amber-700 mt-1">💰 {m.salary_from != null ? `${m.salary_from} → ` : ''}{m.salary_to} ₪{m.salary_reason ? ` · ${m.salary_reason}` : ''}</div>
                )}
                {m.purpose && <div className="text-xs text-slate-600 mt-1"><b>מטרה:</b> {m.purpose}</div>}
                {m.summary && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{m.summary}</div>}
                {m.decisions && <div className="text-xs text-slate-600 mt-1"><b>החלטות:</b> {m.decisions}</div>}
                {m.followup_task && (
                  <button onClick={() => toggleFollowupDone(m)} className={`mt-1.5 flex items-center gap-1.5 text-xs rounded px-2 py-1 ${m.followup_done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    {m.followup_done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    <CalendarClock className="w-3.5 h-3.5" /> מעקב: {m.followup_task}{m.followup_date ? ` · ${fmtDate(m.followup_date)}` : ''}
                  </button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
