import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, CheckCircle2, ShieldAlert, PenLine } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { generateAndUploadSignedPdf } from '@/lib/signedPdf';
import SignaturePad from '@/components/shared/SignaturePad';

/**
 * Reads one employee's employment agreement exactly as they signed it.
 *
 * Shared by the agreement admin screen and the employee card so both show the
 * same thing. The PDF can be regenerated on demand: the binding record is the
 * text + signature in the database, so a missing file is never a lost document.
 */
export default function AgreementViewDialog({ employeeId, employeeName, open, onOpenChange }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [making, setMaking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [busySign, setBusySign] = useState(false);
  const [savedSig, setSavedSig] = useState(null);
  const sigRef = useRef(null);

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    (async () => {
      try {
        const [res, sigRes] = await Promise.all([
          base44.functions.getEmployeeAgreement({ employee_id: employeeId }),
          base44.functions.getCompanySignature().catch(() => null),
        ]);
        setData(res?.data || res);
        setSavedSig((sigRes?.data || sigRes)?.signature_data_url || null);
      } catch (e) {
        toast({ title: 'שגיאה בטעינת ההסכם', description: e?.message || String(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, employeeId]);

  // Counter-signs on behalf of the company. Drawing is a one-time act — the
  // signature is stored and reused — but APPLYING it stays a deliberate click
  // per agreement, so the company never silently signs something.
  const applyCompanySignature = async (drawNew = false) => {
    let payload = { employee_id: employeeId };
    if (drawNew) {
      if (sigRef.current?.isEmpty()) { toast({ title: 'צייר/י חתימה', variant: 'destructive' }); return; }
      payload.signature_data_url = sigRef.current.toDataURL();
    }
    setBusySign(true);
    try {
      const res = await base44.functions.signAgreementAsCompany(payload);
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.message || 'שגיאה');
      toast({ title: 'ההסכם נחתם ע"י החברה' });
      setSigning(false);
      // Reload: the stored PDF was cleared server-side because it predates the
      // company signature, so the dialog must not keep offering the old file.
      const fresh = await base44.functions.getEmployeeAgreement({ employee_id: employeeId });
      setData(fresh?.data || fresh);
      if (payload.signature_data_url) setSavedSig(payload.signature_data_url);
    } catch (e) {
      toast({ title: 'שגיאה בחתימה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusySign(false);
    }
  };

  const makePdf = async () => {
    if (!data?.rendered) return;
    setMaking(true);
    try {
      const fileUrl = await generateAndUploadSignedPdf({
        body: data.rendered,
        signature: data.signature_data_url,
        companySignature: data.rep_signature_data_url,
        title: 'הסכם העסקה',
        subtitle: employeeName || '',
      }, {
        title: `agreement-${employeeName || employeeId}`,
        signedAt: data?.signed_at,
        ip: data?.signed_ip,
        formId: employeeId,
      });
      if (!fileUrl) throw new Error('לא הוחזר קובץ');
      setData((d) => ({ ...d, file_url: fileUrl }));
      window.open(fileUrl, '_blank');
      toast({ title: 'ה-PDF נוצר ונשמר בכרטיס העובד' });
    } catch (e) {
      toast({ title: 'שגיאה ביצירת PDF', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setMaking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            הסכם עבודה — {employeeName}
            {data?.signed && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                נחתם {data.signed_at ? new Date(data.signed_at).toLocaleDateString('he-IL') : ''}
              </Badge>
            )}
            {data?.assigned && !data?.signed && (
              <Badge variant="outline" className="text-amber-700 border-amber-300">טרם נחתם</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}

        {!loading && data && !data.assigned && (
          <p className="text-slate-500 text-center py-8">לא שויך לעובד/ת הזה הסכם עבודה.</p>
        )}

        {!loading && data?.assigned && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {data.file_url ? (
                <a href={data.file_url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline"><Download className="w-4 h-4 ml-1" /> הורדת ה-PDF</Button>
                </a>
              ) : data.signed ? (
                <Button size="sm" variant="outline" onClick={makePdf} disabled={making}>
                  {making ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Download className="w-4 h-4 ml-1" />}
                  צור והורד PDF
                </Button>
              ) : null}
              {data.signed && !data.rep_signed_at && (
                <Button size="sm" onClick={() => setSigning(true)}>
                  <PenLine className="w-4 h-4 ml-1" /> חתום כחברה
                </Button>
              )}
              {data.rep_signed_at && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                  חתום ע"י החברה {new Date(data.rep_signed_at).toLocaleDateString('he-IL')}
                </Badge>
              )}
              {data.identified === false && (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  <ShieldAlert className="w-3 h-3 ml-1" /> נחתם ללא זיהוי
                </Badge>
              )}
            </div>

            {signing && (
              <div className="border rounded-lg p-3 mb-3 bg-slate-50">
                {savedSig ? (
                  <>
                    <div className="text-sm text-slate-700 mb-2">חתימת החברה השמורה:</div>
                    <img src={savedSig} alt="חתימת החברה" className="max-h-20 bg-white border rounded p-1 mb-3" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => applyCompanySignature()} disabled={busySign}>
                        {busySign ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                        חתום בחתימה הזו
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSavedSig(null)}>צייר חתימה חדשה</Button>
                      <Button size="sm" variant="ghost" onClick={() => setSigning(false)}>ביטול</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <SignaturePad ref={sigRef} label="חתימת החברה" />
                    <p className="text-xs text-slate-500 mt-1">
                      נשמרת פעם אחת ותשמש גם להסכמים הבאים.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" onClick={() => applyCompanySignature(true)} disabled={busySign}>
                        {busySign ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                        שמור וחתום
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSigning(false)}>ביטול</Button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="bg-white p-5 border rounded-lg" dir="rtl">
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{data.rendered}</div>
              <div className="mt-6 flex gap-10">
                <div className="flex-1">
                  <div className="text-xs text-slate-600 mb-1">חתימת החברה:</div>
                  {data.rep_signature_data_url
                    ? <img src={data.rep_signature_data_url} alt="חתימת החברה" className="max-h-20" />
                    : <div className="text-xs text-amber-700">טרם נחתם</div>}
                </div>
                <div className="flex-1">
                  <div className="text-xs text-slate-600 mb-1">חתימת העובד/ת:</div>
                  {data.signature_data_url
                    ? <img src={data.signature_data_url} alt="חתימה" className="max-h-20" />
                    : <div className="text-xs text-amber-700">טרם נחתם</div>}
                </div>
              </div>
              {data.signed_at && (
                <div className="mt-4 pt-2 border-t text-[11px] text-slate-500">
                  נחתם דיגיטלית ב-{new Date(data.signed_at).toLocaleString('he-IL')}
                  {data.signed_ip ? ` · מכתובת IP ${data.signed_ip}` : ''}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
