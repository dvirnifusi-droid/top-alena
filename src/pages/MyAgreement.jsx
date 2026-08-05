import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SignaturePad from '@/components/shared/SignaturePad';
import { isValidIsraeliId } from '@/lib/israeliId';
import { generateAndUploadSignedPdf } from '@/lib/signedPdf';

// The employee reads their employment agreement, fills the fields that are
// theirs, and signs. The wage and role clauses are already filled in by the
// business before this is ever sent — the employee signs a complete document,
// never one with blanks where the terms should be.
export default function MyAgreement() {
  const { toast } = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const sigRef = useRef(null);
  const bodyRef = useRef(null);
  const pdfRef = useRef(null);

  const load = async () => {
    try {
      const res = await base44.functions.getMyAgreement();
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      setState({ loading: false, data, error: null });
      setValues(data.my_values || {});
      if (data.signed) setReadAll(true);
    } catch (e) {
      setState({ loading: false, data: null, error: e?.message || 'שגיאה בטעינת ההסכם' });
    }
  };
  useEffect(() => { load(); }, []);

  // Once the signed text is staged, render it off-screen, snapshot it to PDF and
  // store it. Runs after paint so the hidden node actually exists to capture.
  useEffect(() => {
    if (!pdfDoc || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const fileUrl = await generateAndUploadSignedPdf(pdfRef.current, {
          title: 'employment-agreement',
          signedAt: pdfDoc.meta?.signed_at,
          ip: pdfDoc.meta?.signed_ip,
          formId: pdfDoc.meta?.form_id,
        });
        if (cancelled || !fileUrl) return;
        await base44.functions.attachSignedFormPdf({ form_type: 'work_agreement', tax_year: 0, file_url: fileUrl });
      } catch (e) {
        // Non-fatal by design: the signature is already binding without the PDF.
        console.warn('[MyAgreement] pdf save failed', e);
        toast({ title: 'ההסכם נחתם, אך שמירת ה-PDF נכשלה', description: 'המנהל יוכל להפיק אותו מחדש', });
      } finally {
        if (!cancelled) setPdfDoc(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  // "I read it" only unlocks once the text has been scrolled to the bottom —
  // §9.7 has the employee declaring they read the agreement in full.
  //
  // Two traps this avoids, both of which lock the employee out with no way
  // forward and no error to explain it:
  //  1. On a tall screen (or with a short agreement) the text fits without
  //     scrolling, so a scroll event NEVER fires. The initial fit check below
  //     unlocks that case immediately — there was nothing left to read.
  //  2. React's onScroll can't be relied on here (scroll doesn't bubble), so
  //     the listener is attached natively to the element itself.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || readAll) return;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    const check = () => { if (atBottom()) setReadAll(true); };
    check();                                   // already fully visible?
    el.addEventListener('scroll', check, { passive: true });
    // Re-check on resize: rotating a phone can turn a scrollable block into one
    // that fits, which would otherwise never fire another scroll event.
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [readAll, state.data]);

  const submit = async () => {
    const fields = state.data?.my_fields || [];
    for (const f of fields) {
      if (f.required && !String(values[f.key] || '').trim()) {
        toast({ title: `חסר: ${f.label}`, variant: 'destructive' });
        return;
      }
      if (f.type === 'id' && values[f.key] && !isValidIsraeliId(values[f.key])) {
        toast({ title: `${f.label} — מספר זהות אינו תקין`, variant: 'destructive' });
        return;
      }
    }
    if (sigRef.current?.isEmpty()) {
      toast({ title: 'יש לחתום למטה', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const signatureDataUrl = sigRef.current.toDataURL();
      const res = await base44.functions.submitMyAgreement({ values, signature_data_url: signatureDataUrl });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      toast({ title: 'ההסכם נחתם בהצלחה' });

      // The signature is already recorded server-side at this point. The PDF is
      // an artefact of it, so a failure here is reported but never rolls the
      // signing back — and it can be regenerated from the record later.
      try {
        setPdfDoc({ body: data.signed_body, signature: signatureDataUrl, meta: data });
      } catch (e) {
        console.warn('[MyAgreement] pdf staging failed', e);
      }
      await load();
    } catch (e) {
      toast({ title: 'שגיאה בחתימה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }
  if (state.error) {
    return (
      <div className="max-w-2xl mx-auto p-4" dir="rtl">
        <Card><CardContent className="p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-slate-700">{state.error}</p>
        </CardContent></Card>
      </div>
    );
  }
  if (!state.data?.assigned) {
    return (
      <div className="max-w-2xl mx-auto p-4" dir="rtl">
        <Card><CardContent className="p-8 text-center text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          לא שויך אליך הסכם עבודה כרגע.
        </CardContent></Card>
      </div>
    );
  }

  const { signed, signed_at, rendered, my_fields, form_label } = state.data;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{form_label || 'הסכם עבודה'}</CardTitle>
          {signed ? (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
              נחתם {signed_at ? new Date(signed_at).toLocaleDateString('he-IL') : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-300">ממתין לחתימתך</Badge>
          )}
        </CardHeader>
        <CardContent>
          <div
            ref={bodyRef}
            className="h-[52vh] overflow-y-auto border rounded-lg p-4 bg-slate-50 whitespace-pre-wrap text-sm leading-7 text-slate-800"
          >
            {rendered}
          </div>
          {!signed && !readAll && (
            <p className="text-xs text-amber-700 mt-2">גלול/י עד סוף ההסכם כדי להמשיך</p>
          )}
        </CardContent>
      </Card>

      {!signed && (
        <Card>
          <CardHeader><CardTitle className="text-base">הפרטים שלך</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {my_fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key}>{f.label}{f.required && ' *'}</Label>
                <Input
                  id={f.key}
                  value={values[f.key] || ''}
                  inputMode={f.type === 'id' ? 'numeric' : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <SignaturePad ref={sigRef} label="חתימת העובד/ת" />
            <Button className="w-full" disabled={!readAll || submitting} onClick={submit}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              אני מאשר/ת וחותם/ת על ההסכם
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Off-screen render of exactly what was signed — the source for the PDF.
          Positioned off-canvas rather than display:none, because html2canvas
          cannot capture a node that was never laid out. */}
      {pdfDoc && (
        <div style={{ position: 'fixed', top: 0, right: '-10000px', width: '794px' }} aria-hidden="true">
          <div ref={pdfRef} dir="rtl" style={{ background: '#fff', padding: '32px', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.7, color: '#111' }}>
              {pdfDoc.body}
            </div>
            <div style={{ marginTop: '28px' }}>
              <div style={{ fontSize: '12px', marginBottom: '6px' }}>חתימת העובד/ת:</div>
              <img src={pdfDoc.signature} alt="" style={{ maxHeight: '90px' }} />
            </div>
            <div style={{ marginTop: '18px', fontSize: '10px', color: '#666', borderTop: '1px solid #ddd', paddingTop: '8px' }}>
              נחתם דיגיטלית ב-{pdfDoc.meta?.signed_at ? new Date(pdfDoc.meta.signed_at).toLocaleString('he-IL') : ''}
              {pdfDoc.meta?.signed_ip ? ` · מכתובת IP ${pdfDoc.meta.signed_ip}` : ''}
              {pdfDoc.meta?.form_id ? ` · מזהה טופס ${pdfDoc.meta.form_id}` : ''}
            </div>
          </div>
        </div>
      )}

      {signed && state.data.signature_data_url && (
        <Card>
          <CardHeader><CardTitle className="text-base">חתימתך</CardTitle></CardHeader>
          <CardContent>
            <img src={state.data.signature_data_url} alt="חתימה" className="max-h-24" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
