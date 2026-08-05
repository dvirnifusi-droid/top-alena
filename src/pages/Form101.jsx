import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SignaturePad from '@/components/shared/SignaturePad';
import { isValidIsraeliId } from '@/lib/israeliId';
import { generateAndUploadSignedPdf } from '@/lib/signedPdf';

// טופס 101 — the employee fills the official tax card from their phone.
// The section/field definitions come from the server (apps/api/src/lib/form101.ts)
// so a form this size can't drift between client and server.
export default function Form101() {
  const { toast } = useToast();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [confirmedPrefill, setConfirmedPrefill] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const sigRef = useRef(null);
  const pdfRef = useRef(null);

  const load = async () => {
    try {
      const res = await base44.functions.getMyForm101({});
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.message || 'שגיאה');
      setMeta(d);
      setData(d.form_data || {});
      if (!d.prefilled_from_last_year) setConfirmedPrefill(true);
    } catch (e) {
      toast({ title: 'שגיאה בטעינת הטופס', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Only the employee-filled parts become wizard steps; part א is the business's.
  const steps = useMemo(
    () => (meta?.sections || []).filter((s) => s.employee_fills),
    [meta],
  );

  const setSection = (key, patch) =>
    setData((d) => ({ ...d, [key]: { ...(d[key] || {}), ...patch } }));

  const saveDraft = async (silent = true) => {
    try {
      await base44.functions.saveMyForm101Draft({ tax_year: meta.tax_year, form_data: data });
      if (!silent) toast({ title: 'נשמר' });
    } catch (e) {
      // A rejected draft means a malformed value (e.g. a bad ID) — worth showing.
      toast({ title: 'לא נשמר', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  const next = async () => { await saveDraft(); setStep((s) => Math.min(s + 1, steps.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (sigRef.current?.isEmpty()) { toast({ title: 'חסרה חתימה', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const signature = sigRef.current.toDataURL();
      const payload = {
        ...data,
        declaration: { ...(data.declaration || {}), signature_data_url: signature },
      };
      const res = await base44.functions.submitMyForm101({ tax_year: meta.tax_year, form_data: payload });
      const d = res?.data || res;
      if (!d?.ok) {
        setErrors(d?.errors || []);
        toast({ title: 'הטופס לא נשלח', description: d?.message || 'יש שדות חסרים', variant: 'destructive' });
        return;
      }
      setErrors([]);
      toast({ title: 'טופס 101 נחתם ונשלח' });
      setPdfDoc({ data: payload, signature, meta: d });
      await load();
    } catch (e) {
      toast({ title: 'שגיאה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const fileUrl = await generateAndUploadSignedPdf(pdfRef.current, {
          title: `form101-${meta?.tax_year}`,
          signedAt: pdfDoc.meta?.signed_at,
          ip: pdfDoc.meta?.signed_ip,
          formId: pdfDoc.meta?.form_id,
        });
        if (cancelled || !fileUrl) return;
        await base44.functions.attachSignedFormPdf({ form_type: '101', tax_year: meta.tax_year, file_url: fileUrl });
      } catch (e) {
        console.warn('[Form101] pdf save failed', e);
      } finally {
        if (!cancelled) setPdfDoc(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!meta) return null;

  if (meta.signed) {
    return (
      <div className="max-w-2xl mx-auto p-4" dir="rtl">
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">טופס 101 לשנת {meta.tax_year} נחתם</h2>
          <p className="text-sm text-slate-500 mt-1">
            {meta.signed_at ? new Date(meta.signed_at).toLocaleString('he-IL') : ''}
          </p>
          {meta.file_url && (
            <a href={meta.file_url} target="_blank" rel="noreferrer">
              <Button variant="outline" className="mt-4">הורדת הטופס החתום</Button>
            </a>
          )}
        </CardContent></Card>
      </div>
    );
  }

  // The rules require the employee to actively confirm data carried from last
  // year before continuing — not to have it silently ride into a new tax year.
  if (!confirmedPrefill) {
    return (
      <div className="max-w-2xl mx-auto p-4" dir="rtl">
        <Card>
          <CardHeader><CardTitle className="text-base">האם הפרטים עדיין נכונים?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              מילאנו מראש את הפרטים האישיים, הילדים ובן/בת הזוג מהטופס של שנת {meta.tax_year - 1}.
              עבור/י עליהם — אם משהו השתנה, תוכל/י לתקן בשלבים הבאים.
            </p>
            <PrefillSummary data={data} />
            <Button className="w-full" onClick={() => setConfirmedPrefill(true)}>
              הפרטים נכונים, המשך/י
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-slate-900">טופס 101 — שנת המס {meta.tax_year}</h1>
          <Badge variant="outline">{step + 1}/{steps.length}</Badge>
        </div>
        <Progress value={((step + 1) / steps.length) * 100} />
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-900">
          <div className="flex items-center gap-2 font-semibold mb-1"><AlertCircle className="w-4 h-4" /> יש לתקן</div>
          <ul className="list-disc pr-5 space-y-0.5">
            {errors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">חלק {current.part} — {current.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {current.key === 'children' ? (
            <ChildrenEditor
              kids={data.children || []}
              fields={current.fields}
              onChange={(children) => setData((d) => ({ ...d, children }))}
            />
          ) : current.key === 'credits' ? (
            <CreditsEditor
              clauses={current.clauses}
              value={data.credits?.clauses || {}}
              onChange={(clauses) => setData((d) => ({ ...d, credits: { clauses } }))}
            />
          ) : current.key === 'declaration' ? (
            <div className="space-y-4">
              <div className="bg-slate-50 border rounded-lg p-3 text-sm leading-6 text-slate-700">
                {meta.declaration_text}
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!data.declaration?.accepted}
                  onCheckedChange={(v) => setSection('declaration', { accepted: !!v })}
                />
                <span className="text-sm text-slate-800">קראתי ואני מאשר/ת את ההצהרה</span>
              </label>
              <SignaturePad ref={sigRef} label="חתימה" />
            </div>
          ) : (
            <FieldList
              fields={current.fields || []}
              values={data[current.key] || {}}
              onChange={(patch) => setSection(current.key, patch)}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={back} disabled={step === 0}>
          <ChevronRight className="w-4 h-4 ml-1" /> הקודם
        </Button>
        <Button variant="ghost" onClick={() => saveDraft(false)}>שמור טיוטה</Button>
        <div className="flex-1" />
        {isLast ? (
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
            חתום/י ושלח/י
          </Button>
        ) : (
          <Button onClick={next}>הבא <ChevronLeft className="w-4 h-4 mr-1" /></Button>
        )}
      </div>

      {pdfDoc && (
        <div style={{ position: 'fixed', top: 0, right: '-10000px', width: '794px' }} aria-hidden="true">
          <div ref={pdfRef} dir="rtl" style={{ background: '#fff', padding: '32px', fontFamily: 'Arial, sans-serif' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '4px' }}>טופס 101 — כרטיס עובד</h2>
            <div style={{ fontSize: '12px', color: '#555', marginBottom: '14px' }}>שנת המס {meta.tax_year}</div>
            <PrintableForm sections={meta.sections} employer={meta.employer} data={pdfDoc.data} />
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>חתימת העובד/ת:</div>
              <img src={pdfDoc.signature} alt="" style={{ maxHeight: '80px' }} />
            </div>
            <div style={{ marginTop: '14px', fontSize: '10px', color: '#666', borderTop: '1px solid #ddd', paddingTop: '6px' }}>
              נחתם דיגיטלית ב-{pdfDoc.meta?.signed_at ? new Date(pdfDoc.meta.signed_at).toLocaleString('he-IL') : ''}
              {pdfDoc.meta?.signed_ip ? ` · מכתובת IP ${pdfDoc.meta.signed_ip}` : ''}
              {pdfDoc.meta?.form_id ? ` · מזהה טופס ${pdfDoc.meta.form_id}` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldList({ fields, values, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((f) => {
        const opts = f.type?.startsWith('select:') ? f.type.slice(7).split(',') : null;
        const invalidId = f.key.includes('id_number') && values[f.key] && !isValidIsraeliId(values[f.key]);
        if (f.type === 'bool') {
          return (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer sm:col-span-2">
              <Checkbox checked={!!values[f.key]} onCheckedChange={(v) => onChange({ [f.key]: !!v })} />
              <span className="text-sm text-slate-800">{f.label}{f.required && ' *'}</span>
            </label>
          );
        }
        if (f.type === 'multi' || f.type === 'table' || f.type === 'file') return null;
        return (
          <div key={f.key}>
            <Label>{f.label}{f.required && ' *'}</Label>
            {opts ? (
              <Select value={values[f.key] || ''} onValueChange={(v) => onChange({ [f.key]: v })}>
                <SelectTrigger><SelectValue placeholder="בחר/י" /></SelectTrigger>
                <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input
                type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'}
                value={values[f.key] || ''}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                className={invalidId ? 'border-red-400' : undefined}
              />
            )}
            {invalidId && <p className="text-xs text-red-600 mt-1">מספר זהות אינו תקין</p>}
          </div>
        );
      })}
    </div>
  );
}

// `kids`, not `children` — a prop literally named children would collide with
// React's own and read as though the editor renders nested JSX.
function ChildrenEditor({ kids, fields, onChange }) {
  const add = () => onChange([...(kids || []), {}]);
  const remove = (i) => onChange(kids.filter((_, idx) => idx !== i));
  const patch = (i, p) => onChange(kids.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        לכל ילד/ה נדרשים שם, מספר זהות ותאריך לידה — מספר ילדים בלבד אינו מספיק לטופס.
      </p>
      {(kids || []).map((c, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">ילד/ה {i + 1}</span>
            <Button variant="ghost" size="sm" onClick={() => remove(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
          </div>
          <FieldList fields={fields} values={c} onChange={(p) => patch(i, p)} />
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full">
        <Plus className="w-4 h-4 ml-1" /> הוסף/י ילד/ה
      </Button>
    </div>
  );
}

function CreditsEditor({ clauses, value, onChange }) {
  const toggle = (n, checked) => onChange({ ...value, [n]: { ...(value[n] || {}), checked } });
  const patch = (n, p) => onChange({ ...value, [n]: { ...(value[n] || {}), ...p } });
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">סמן/י רק את הסעיפים הרלוונטיים אליך.</p>
      {clauses.map((c) => {
        const v = value[c.n] || {};
        return (
          <div key={c.n} className={`border rounded-lg p-3 ${v.checked ? 'bg-amber-50 border-amber-300' : ''}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={!!v.checked} onCheckedChange={(x) => toggle(c.n, !!x)} />
              <span className="text-sm text-slate-800">{c.n}. {c.label}</span>
            </label>
            {v.checked && (
              <div className="mt-3 space-y-2 pr-6">
                {(c.fields || []).length > 0 && (
                  <FieldList fields={c.fields} values={v} onChange={(p) => patch(c.n, p)} />
                )}
                {c.requires_document && (
                  <div>
                    <Label className="text-xs">קישור לאישור המצורף *</Label>
                    <Input
                      value={v.document_url || ''}
                      placeholder="העלה/י את האישור ותדביק/י כאן את הקישור"
                      onChange={(e) => patch(c.n, { document_url: e.target.value })}
                    />
                    <p className="text-xs text-amber-700 mt-1">בלי האישור לא ניתן לשלוח את הטופס</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrefillSummary({ data }) {
  const p = data?.personal || {};
  return (
    <div className="text-sm text-slate-700 bg-slate-50 border rounded-lg p-3 space-y-1">
      <div>{p.first_name} {p.last_name} · ת.ז {p.id_number || '—'}</div>
      <div>{[p.street, p.house_no, p.city].filter(Boolean).join(' ') || 'כתובת חסרה'}</div>
      <div>ילדים: {(data?.children || []).length}</div>
      {data?.spouse?.id_number && <div>בן/בת זוג: {data.spouse.first_name} · ת.ז {data.spouse.id_number}</div>}
    </div>
  );
}

// Flat printable rendering of everything filled — the PDF source.
function PrintableForm({ sections, employer, data }) {
  const row = (label, val) => (
    <div key={label} style={{ display: 'flex', gap: '8px', fontSize: '11px', padding: '2px 0' }}>
      <span style={{ color: '#666', minWidth: '190px' }}>{label}:</span>
      <span style={{ color: '#111' }}>{String(val)}</span>
    </div>
  );
  const out = [];
  out.push(<h3 key="h-a" style={{ fontSize: '13px', marginTop: '10px' }}>חלק א — פרטי המעביד</h3>);
  out.push(row('שם המעביד', employer?.name || '—'));
  out.push(row('מספר תיק ניכויים', employer?.deductions_file || '—'));
  out.push(row('כתובת', employer?.address || '—'));

  for (const s of sections) {
    if (!s.employee_fills) continue;
    out.push(<h3 key={`h-${s.key}`} style={{ fontSize: '13px', marginTop: '10px' }}>חלק {s.part} — {s.title}</h3>);
    if (s.key === 'children') {
      const kids = data.children || [];
      if (!kids.length) out.push(row('ילדים', 'אין'));
      kids.forEach((c, i) => out.push(row(`ילד/ה ${i + 1}`, `${c.name || ''} · ת.ז ${c.id_number || ''} · ${c.birth_date || ''}`)));
    } else if (s.key === 'credits') {
      const cl = data.credits?.clauses || {};
      const on = (s.clauses || []).filter((c) => cl[c.n]?.checked);
      if (!on.length) out.push(row('סעיפים', 'לא סומנו'));
      on.forEach((c) => out.push(row(`סעיף ${c.n}`, c.label)));
    } else if (s.key === 'declaration') {
      out.push(row('הצהרה', data.declaration?.accepted ? 'אושרה' : 'לא אושרה'));
    } else {
      const vals = data[s.key] || {};
      for (const f of s.fields || []) {
        const v = vals[f.key];
        if (v === undefined || v === null || v === '') continue;
        out.push(row(f.label, typeof v === 'boolean' ? (v ? 'כן' : 'לא') : v));
      }
    }
  }
  return <div>{out}</div>;
}
