// Employee CRM — core personal details editor + lifecycle status + termination.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, IdCard, UserCog } from 'lucide-react';

export const STATUSES = [
  { value: 'candidate', label: 'מועמד', color: 'bg-slate-100 text-slate-700' },
  { value: 'onboarding', label: 'בקליטה', color: 'bg-sky-100 text-sky-800' },
  { value: 'active', label: 'פעיל', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'on_leave', label: 'בחופשה', color: 'bg-amber-100 text-amber-800' },
  { value: 'terminated', label: 'סיים עבודה', color: 'bg-red-100 text-red-800' },
];
export const statusMeta = (v) => STATUSES.find((s) => s.value === v) || STATUSES[2];
const d10 = (v) => (v ? String(v).slice(0, 10) : '');

export default function EmployeeCoreDetails({ core = {}, onChange, readOnly = false }) {
  const employeeId = core.id;
  const [form, setForm] = useState({
    id_number: core.id_number || '', birth_date: d10(core.birth_date), hire_date: d10(core.hire_date),
    employment_type: core.employment_type || '', emergency_contact: core.emergency_contact || '', bank_details: core.bank_details || '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [termOpen, setTermOpen] = useState(false);
  const [term, setTerm] = useState({ end_date: '', reason: '', initiated_by: '', hearing_done: false, notice_given: false, equipment_returned: false, permissions_closed: false, letter_given: false, summary: '' });
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveDetails = async () => {
    setBusy(true); setMsg(null);
    try { await base44.functions.saveEmployeeCoreDetails({ employee_id: employeeId, ...form }); setMsg({ ok: true, text: '✅ נשמר' }); onChange && onChange(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };
  const setStatus = async (status) => {
    if (status === 'terminated') { setTermOpen(true); return; }
    setBusy(true);
    try { await base44.functions.updateEmployeeStatus({ employee_id: employeeId, status }); onChange && onChange(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };
  const confirmTermination = async () => {
    setBusy(true);
    try { await base44.functions.updateEmployeeStatus({ employee_id: employeeId, status: 'terminated', termination: term }); setTermOpen(false); onChange && onChange(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {msg && <div className={`text-sm rounded px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {/* Lifecycle status */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><UserCog className="w-5 h-5 text-[#44512C]" /> סטטוס עובד</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s.value} disabled={busy || readOnly} onClick={() => !readOnly && setStatus(s.value)}
                className={`text-sm rounded-full px-3 py-1.5 border transition ${core.status === s.value ? s.color + ' border-transparent font-bold ring-2 ring-offset-1 ring-slate-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {core.termination && core.status === 'terminated' && (
            <div className="mt-3 text-xs bg-red-50 rounded-lg p-2.5 text-red-800 space-y-0.5">
              <div><b>סיום:</b> {core.termination.end_date ? new Date(core.termination.end_date).toLocaleDateString('he-IL') : ''} · {core.termination.reason || ''}</div>
              {core.termination.summary && <div>{core.termination.summary}</div>}
              <div className="flex flex-wrap gap-2 text-[11px] text-red-600">
                {core.termination.hearing_done && <span>✓ שימוע</span>}
                {core.termination.notice_given && <span>✓ הודעה מוקדמת</span>}
                {core.termination.equipment_returned && <span>✓ ציוד הוחזר</span>}
                {core.termination.permissions_closed && <span>✓ הרשאות נסגרו</span>}
                {core.termination.letter_given && <span>✓ מכתב סיום</span>}
              </div>
            </div>
          )}

          {termOpen && (
            <div className="mt-3 border border-red-200 rounded-lg p-3 bg-red-50/40 space-y-2">
              <div className="text-sm font-semibold text-red-800">תיעוד סיום העסקה</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">תאריך סיום<Input type="date" value={term.end_date} onChange={(e) => setTerm((t) => ({ ...t, end_date: e.target.value }))} className="h-8 text-sm" /></label>
                <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">מי יזם<Input value={term.initiated_by} onChange={(e) => setTerm((t) => ({ ...t, initiated_by: e.target.value }))} placeholder="עובד / מעסיק" className="h-8 text-sm" /></label>
              </div>
              <Input value={term.reason} onChange={(e) => setTerm((t) => ({ ...t, reason: e.target.value }))} placeholder="סיבת סיום" className="h-8 text-sm" />
              <div className="flex flex-wrap gap-3 text-xs">
                {[['hearing_done', 'בוצע שימוע'], ['notice_given', 'ניתנה הודעה מוקדמת'], ['equipment_returned', 'הוחזר ציוד'], ['permissions_closed', 'נסגרו הרשאות'], ['letter_given', 'נמסר מכתב סיום']].map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={term[k]} onChange={(e) => setTerm((t) => ({ ...t, [k]: e.target.checked }))} /> {lbl}</label>
                ))}
              </div>
              <Textarea value={term.summary} onChange={(e) => setTerm((t) => ({ ...t, summary: e.target.value }))} placeholder="סיכום תקופת ההעסקה" rows={2} className="text-sm" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setTermOpen(false)}>ביטול</Button>
                <Button size="sm" disabled={busy} className="bg-red-600 hover:bg-red-700" onClick={confirmTermination}>אשר סיום העסקה</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Core personal details */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><IdCard className="w-5 h-5 text-[#44512C]" /> פרטים אישיים</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">תעודת זהות<Input value={form.id_number} onChange={(e) => upd('id_number', e.target.value)} dir="ltr" className="h-9 text-sm text-left" /></label>
            <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">תאריך לידה<Input type="date" value={form.birth_date} onChange={(e) => upd('birth_date', e.target.value)} className="h-9 text-sm" /></label>
            <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">תאריך תחילת עבודה<Input type="date" value={form.hire_date} onChange={(e) => upd('hire_date', e.target.value)} className="h-9 text-sm" /></label>
            <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">סוג העסקה
              <select value={form.employment_type} onChange={(e) => upd('employment_type', e.target.value)} className="h-9 rounded border border-slate-300 text-sm px-2">
                <option value="">—</option><option value="hourly">שעתי</option><option value="monthly">חודשי</option>
              </select>
            </label>
          </div>
          <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">איש קשר לשעת חירום<Input value={form.emergency_contact} onChange={(e) => upd('emergency_contact', e.target.value)} placeholder="שם + טלפון" className="h-9 text-sm" /></label>
          <label className="text-[11px] text-slate-600 flex flex-col gap-0.5">פרטי חשבון בנק<Textarea value={form.bank_details} onChange={(e) => upd('bank_details', e.target.value)} placeholder="בנק / סניף / חשבון" rows={2} className="text-sm" /></label>
          {!readOnly && (
            <div className="flex justify-end">
              <Button size="sm" disabled={busy} onClick={saveDetails} className="bg-[#44512C] hover:bg-[#3a4525] gap-1">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} שמור פרטים</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
