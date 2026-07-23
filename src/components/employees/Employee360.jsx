// Itzik roadmap #1/#2 — Employee card 360° (group-owner HR view).
//   • Required-forms checklist with signature + date + uploaded scan + note.
//   • Full life-in-the-group timeline: hire / role changes / promotions /
//     per-role performance ratings / שימוע (hearing) / notes / termination.
// All editable. Self-contained: loads getEmployee360, writes via the
// setEmployeeForm / addEmployeeTimelineEvent / update / delete fns.
import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, FileSignature, ClipboardList, Plus, Trash2, Pencil, Upload,
  Star, CheckCircle2, Circle, ExternalLink, Scale, ArrowUp, Shuffle, LogIn, LogOut, StickyNote,
} from 'lucide-react';

const EVENT_TYPES = [
  { value: 'hire', label: 'קליטה / התחלה', icon: LogIn, color: 'text-emerald-600' },
  { value: 'role', label: 'שינוי תפקיד', icon: Shuffle, color: 'text-blue-600' },
  { value: 'promotion', label: 'קידום', icon: ArrowUp, color: 'text-violet-600' },
  { value: 'rating', label: 'דירוג ביצועים', icon: Star, color: 'text-amber-500' },
  { value: 'hearing', label: 'שימוע', icon: Scale, color: 'text-red-600' },
  { value: 'note', label: 'הערה', icon: StickyNote, color: 'text-slate-500' },
  { value: 'termination', label: 'סיום העסקה', icon: LogOut, color: 'text-slate-700' },
];
const evMeta = (t) => EVENT_TYPES.find((e) => e.value === t) || EVENT_TYPES[5];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '');

const emptyEvent = { event_type: 'rating', title: '', role: '', restaurant: '', rating: '', effective_date: '', notes: '' };

export default function Employee360({ employeeId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyEvent);
  const [editingId, setEditingId] = useState(null);
  const [newForm, setNewForm] = useState('');

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true); setErr(null);
    try {
      const r = await base44.functions.getEmployee360({ employee_id: employeeId });
      setData(r?.data || r);
    } catch (e) { setErr(e?.message || 'שגיאה בטעינה'); }
    setLoading(false);
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const toggleForm = async (f, signed) => {
    setBusy(f.form_type);
    try { await base44.functions.setEmployeeForm({ employee_id: employeeId, form_type: f.form_type, form_label: f.form_label, signed, file_url: f.file_url, note: f.note }); await load(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const uploadFormFile = async (f, file) => {
    if (!file) return;
    setUploading(f.form_type);
    try {
      const { file_url } = await UploadFile({ file });
      await base44.functions.setEmployeeForm({ employee_id: employeeId, form_type: f.form_type, form_label: f.form_label, signed: true, file_url, note: f.note });
      await load();
    } catch (e) { setErr(e?.message || 'העלאה נכשלה'); }
    setUploading(null);
  };
  const addCustomForm = async () => {
    const label = newForm.trim();
    if (!label) return;
    const type = 'custom_' + label.replace(/\s+/g, '_').slice(0, 24);
    setBusy('newform');
    try { await base44.functions.setEmployeeForm({ employee_id: employeeId, form_type: type, form_label: label, signed: false }); setNewForm(''); await load(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };

  const saveEvent = async () => {
    setBusy('event');
    try {
      const payload = { ...draft, employee_id: employeeId };
      if (editingId) await base44.functions.updateEmployeeTimelineEvent({ id: editingId, ...payload });
      else await base44.functions.addEmployeeTimelineEvent(payload);
      setShowAdd(false); setEditingId(null); setDraft(emptyEvent); await load();
    } catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };
  const editEvent = (t) => {
    setDraft({ event_type: t.event_type, title: t.title || '', role: t.role || '', restaurant: t.restaurant || '', rating: t.rating ?? '', effective_date: t.effective_date ? String(t.effective_date).slice(0, 10) : '', notes: t.notes || '' });
    setEditingId(t.id); setShowAdd(true);
  };
  const deleteEvent = async (id) => {
    if (!window.confirm('למחוק את האירוע?')) return;
    setBusy(id);
    try { await base44.functions.deleteEmployeeTimelineEvent({ id }); await load(); }
    catch (e) { setErr(e?.message || 'שגיאה'); }
    setBusy(null);
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></CardContent></Card>;

  const s = data?.summary || {};
  const forms = data?.forms || [];
  const timeline = data?.timeline || [];

  return (
    <div className="space-y-4" dir="rtl">
      {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{err}</div>}

      {/* Summary strip */}
      <div className="flex flex-wrap gap-2">
        <Badge className={`${s.forms_missing?.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'} gap-1`}>
          <FileSignature className="w-3.5 h-3.5" /> טפסים חתומים {s.forms_signed ?? 0}/{s.forms_required ?? 0}
        </Badge>
        <Badge className={`${s.had_hearing ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'} gap-1`}>
          <Scale className="w-3.5 h-3.5" /> שימוע: {s.had_hearing ? `כן (${s.hearing_count})` : 'לא'}
        </Badge>
        {s.avg_rating != null && (
          <Badge className="bg-amber-100 text-amber-800 gap-1"><Star className="w-3.5 h-3.5" /> דירוג ממוצע {s.avg_rating}/5</Badge>
        )}
      </div>

      {/* Forms & signatures */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileSignature className="w-5 h-5 text-[#44512C]" /> טפסים וחתימות</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {s.forms_missing?.length > 0 && (
            <div className="text-xs bg-amber-50 text-amber-800 rounded px-2 py-1.5">חסר: {s.forms_missing.join(' · ')}</div>
          )}
          {forms.map((f) => (
            <div key={f.form_type} className="flex items-center gap-2 border-b last:border-0 py-1.5">
              <button disabled={busy === f.form_type} onClick={() => toggleForm(f, !f.signed)} className="shrink-0">
                {f.signed ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{f.form_label}{!f.required && <span className="text-[10px] text-slate-400"> · נוסף</span>}</div>
                {f.signed && f.signed_at && <div className="text-[11px] text-slate-500">נחתם {fmtDate(f.signed_at)}</div>}
              </div>
              {f.file_url && <a href={f.file_url} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0" title="צפה במסמך"><ExternalLink className="w-4 h-4" /></a>}
              <label className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-700" title="העלה סריקה חתומה">
                {uploading === f.form_type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadFormFile(f, e.target.files?.[0])} />
              </label>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Input value={newForm} onChange={(e) => setNewForm(e.target.value)} placeholder="הוסף טופס נוסף (למשל: הצהרת בריאות)" className="h-8 text-sm" />
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy === 'newform' || !newForm.trim()} onClick={addCustomForm}><Plus className="w-3.5 h-3.5" /> הוסף</Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-5 h-5 text-[#44512C]" /> ציר זמן בקבוצה</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setDraft(emptyEvent); setEditingId(null); setShowAdd((v) => !v); }}><Plus className="w-3.5 h-3.5" /> אירוע</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAdd && (
            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={draft.event_type} onChange={(e) => setDraft((d) => ({ ...d, event_type: e.target.value }))} className="h-9 rounded border border-slate-300 text-sm px-2">
                  {EVENT_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <Input type="date" value={draft.effective_date} onChange={(e) => setDraft((d) => ({ ...d, effective_date: e.target.value }))} className="h-9 text-sm" />
                <Input value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} placeholder="תפקיד (מלצר/ברמן…)" className="h-9 text-sm" />
                <Input value={draft.restaurant} onChange={(e) => setDraft((d) => ({ ...d, restaurant: e.target.value }))} placeholder="באיזו מסעדה/סניף" className="h-9 text-sm" />
              </div>
              {draft.event_type === 'rating' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-slate-600">דירוג:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setDraft((d) => ({ ...d, rating: n }))}>
                      <Star className={`w-6 h-6 ${Number(draft.rating) >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                    </button>
                  ))}
                </div>
              )}
              <Textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="הערות / דגשים" rows={2} className="text-sm" />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setEditingId(null); }}>ביטול</Button>
                <Button size="sm" disabled={busy === 'event'} onClick={saveEvent} className="bg-[#44512C] hover:bg-[#3a4525]">{editingId ? 'עדכן' : 'שמור'}</Button>
              </div>
            </div>
          )}

          {timeline.length === 0 && !showAdd && <p className="text-sm text-slate-500 text-center py-3">אין עדיין אירועים. הוסף קליטה, דירוגים, קידומים ושימועים כדי לבנות את ההיסטוריה.</p>}
          <div className="relative">
            {timeline.map((t) => {
              const m = evMeta(t.event_type); const Icon = m.icon;
              return (
                <div key={t.id} className="flex gap-3 pb-3 border-r-2 border-slate-100 pr-3 mr-2 relative">
                  <span className={`absolute -right-[9px] top-0.5 w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center ${m.color.replace('text-', 'border-')}`}>
                    <Icon className={`w-2.5 h-2.5 ${m.color}`} />
                  </span>
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${m.color}`}>{m.label}</span>
                      {t.event_type === 'rating' && t.rating != null && (
                        <span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${t.rating >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />)}</span>
                      )}
                      {t.effective_date && <span className="text-xs text-slate-400">{fmtDate(t.effective_date)}</span>}
                    </div>
                    {(t.role || t.restaurant) && <div className="text-xs text-slate-600">{t.role}{t.role && t.restaurant ? ' · ' : ''}{t.restaurant && <span className="text-slate-500">🏪 {t.restaurant}</span>}</div>}
                    {t.notes && <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{t.notes}</div>}
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    <button onClick={() => editEvent(t)} className="text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button disabled={busy === t.id} onClick={() => deleteEvent(t.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
