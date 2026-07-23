// Employee CRM — onboarding process checklist (distinct from documents/forms).
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Circle, Upload, ExternalLink, ClipboardCheck } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');

export default function EmployeeOnboarding({ employeeId, steps = [], done = 0, total = 0, onChange }) {
  const [busy, setBusy] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [err, setErr] = useState(null);

  const toggle = async (st, val) => {
    setBusy(st.step_key);
    try { await base44.functions.setOnboardingStep({ employee_id: employeeId, step_key: st.step_key, done: val, file_url: st.file_url, note: st.note }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const upload = async (st, file) => {
    if (!file) return; setUploading(st.step_key);
    try { const { file_url } = await UploadFile({ file }); await base44.functions.setOnboardingStep({ employee_id: employeeId, step_key: st.step_key, done: true, file_url, note: st.note }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'העלאה נכשלה'); }
    setUploading(null);
  };
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-[#44512C]" /> תהליך קליטה
          <span className="text-sm font-normal text-slate-500">{done}/{total}</span>
        </CardTitle>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
      </CardHeader>
      <CardContent className="space-y-1">
        {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2 mb-1">{err}</div>}
        {steps.map((st) => (
          <div key={st.step_key} className="flex items-center gap-2 border-b last:border-0 py-1.5">
            <button disabled={busy === st.step_key} onClick={() => toggle(st, !st.done)} className="shrink-0">
              {st.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${st.done ? 'text-slate-700' : 'text-slate-500'}`}>{st.label}</div>
              {st.done && st.done_at && <div className="text-[11px] text-slate-400">{fmtDate(st.done_at)}</div>}
            </div>
            {st.file_url && <a href={st.file_url} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0"><ExternalLink className="w-4 h-4" /></a>}
            <label className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-700" title="צרף קובץ">
              {uploading === st.step_key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(st, e.target.files?.[0])} />
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
