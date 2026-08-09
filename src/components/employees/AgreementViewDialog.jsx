import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { generateAndUploadSignedPdf } from '@/lib/signedPdf';

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
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await base44.functions.getEmployeeAgreement({ employee_id: employeeId });
        setData(res?.data || res);
      } catch (e) {
        toast({ title: 'שגיאה בטעינת ההסכם', description: e?.message || String(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, employeeId]);

  const makePdf = async () => {
    if (!printRef.current) return;
    setMaking(true);
    try {
      const fileUrl = await generateAndUploadSignedPdf(printRef.current, {
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
              {data.identified === false && (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  <ShieldAlert className="w-3 h-3 ml-1" /> נחתם ללא זיהוי
                </Badge>
              )}
            </div>

            <div ref={printRef} className="bg-white p-5 border rounded-lg" dir="rtl">
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{data.rendered}</div>
              {data.signature_data_url && (
                <div className="mt-6">
                  <div className="text-xs text-slate-600 mb-1">חתימת העובד/ת:</div>
                  <img src={data.signature_data_url} alt="חתימה" className="max-h-24" />
                </div>
              )}
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
