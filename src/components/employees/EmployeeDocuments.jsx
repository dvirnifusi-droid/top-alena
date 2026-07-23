// Employee CRM — documents folder (agreement / 101 / ID / bank / sick notes /
// vacation / warnings / hearing / raise / role-change / termination / other).
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FolderOpen, Upload, ExternalLink, Trash2, FileText } from 'lucide-react';

const DOC_TYPES = [
  { v: 'agreement', l: 'הסכם עבודה' }, { v: 'agreement_update', l: 'עדכון להסכם' }, { v: '101', l: 'טופס 101' },
  { v: 'id', l: 'תעודת זהות' }, { v: 'bank', l: 'פרטי בנק' }, { v: 'sick', l: 'אישור מחלה' },
  { v: 'vacation', l: 'אישור חופשה' }, { v: 'warning', l: 'מכתב אזהרה' }, { v: 'hearing', l: 'סיכום שימוע' },
  { v: 'raise', l: 'מסמך העלאת שכר' }, { v: 'role_change', l: 'שינוי תפקיד' }, { v: 'termination', l: 'מכתב סיום' }, { v: 'other', l: 'אחר' },
];
const typeLabel = (v) => DOC_TYPES.find((d) => d.v === v)?.l || v;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');
const SIGN = { none: '—', pending: '⏳ ממתין לחתימה', signed: '✅ חתום' };

export default function EmployeeDocuments({ employeeId, documents = [], onChange }) {
  const [docType, setDocType] = useState('agreement');
  const [label, setLabel] = useState('');
  const [signStatus, setSignStatus] = useState('none');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const uploadDoc = async (file) => {
    if (!file) return; setUploading(true); setErr(null);
    try {
      const { file_url } = await UploadFile({ file });
      await base44.functions.addEmployeeDocument({ employee_id: employeeId, doc_type: docType, label: label || typeLabel(docType), file_url, sign_status: signStatus });
      setLabel(''); onChange && onChange();
    } catch (e) { setErr(e?.message || 'העלאה נכשלה'); }
    setUploading(false);
  };
  const cycleSign = async (d) => {
    const next = d.sign_status === 'none' ? 'pending' : d.sign_status === 'pending' ? 'signed' : 'none';
    setBusy(d.id);
    try { await base44.functions.updateEmployeeDocument({ id: d.id, sign_status: next }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const del = async (id) => {
    if (!window.confirm('למחוק את המסמך?')) return;
    setBusy(id);
    try { await base44.functions.deleteEmployeeDocument({ id }); onChange && onChange(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="w-5 h-5 text-[#44512C]" /> תיקיית מסמכים</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{err}</div>}
        {/* Upload row */}
        <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 rounded-lg p-2">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="h-8 rounded border border-slate-300 text-xs px-1">
            {DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="תיאור (אופציונלי)" className="h-8 text-xs flex-1 min-w-[120px]" />
          <select value={signStatus} onChange={(e) => setSignStatus(e.target.value)} className="h-8 rounded border border-slate-300 text-xs px-1">
            <option value="none">ללא חתימה</option><option value="pending">ממתין לחתימה</option><option value="signed">חתום</option>
          </select>
          <label className="cursor-pointer text-xs flex items-center gap-1 bg-[#44512C] text-white rounded px-2.5 py-1.5 hover:bg-[#3a4525]">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} העלה
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadDoc(e.target.files?.[0])} />
          </label>
        </div>

        {documents.length === 0 && <p className="text-sm text-slate-500 text-center py-3">אין מסמכים עדיין.</p>}
        <div className="space-y-1.5">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 border rounded-lg p-2">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{d.label || typeLabel(d.doc_type)}</div>
                <div className="text-[11px] text-slate-500">{typeLabel(d.doc_type)} · {fmtDate(d.createdAt)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</div>
              </div>
              <button onClick={() => cycleSign(d)} disabled={busy === d.id} className={`text-[11px] rounded-full px-2 py-0.5 ${d.sign_status === 'signed' ? 'bg-emerald-100 text-emerald-700' : d.sign_status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`} title="לחיצה משנה סטטוס חתימה">{SIGN[d.sign_status] || '—'}</button>
              {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0"><ExternalLink className="w-4 h-4" /></a>}
              <button onClick={() => del(d.id)} disabled={busy === d.id} className="text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
