import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Eye, Download, Loader2, CheckCircle2 } from 'lucide-react';
import AgreementViewDialog from './AgreementViewDialog';

/**
 * The signed employment agreement, surfaced on the "קליטה ומסמכים" tab.
 *
 * It also lives on the forms list in the employee file tab, but that is not
 * where anyone looks for it: the onboarding checklist right above says
 * "הסכם עבודה נחתם ✓", so this is where the reader expects to open it.
 * Same dialog, same record — just reachable from where the question is asked.
 */
export default function SignedAgreementCard({ employeeId, employeeName }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.getEmployeeAgreement({ employee_id: employeeId });
      setData(res?.data || res);
    } catch {
      setData({ assigned: false });
    }
  };
  useEffect(() => { if (employeeId) load(); }, [employeeId]);

  if (!data) {
    return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>;
  }
  if (!data.assigned) return null;

  return (
    <>
      <Card className="mb-4 border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FileSignature className="w-4 h-4 text-emerald-600" />
            הסכם עבודה
            {data.signed ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                נחתם {data.signed_at ? new Date(data.signed_at).toLocaleDateString('he-IL') : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-700 border-amber-300">ממתין לחתימה</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Eye className="w-4 h-4 ml-1" /> תצוגת ההסכם
          </Button>
          {data.file_url ? (
            <a href={data.file_url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline"><Download className="w-4 h-4 ml-1" /> הורדת PDF</Button>
            </a>
          ) : data.signed ? (
            // No stored PDF yet — the dialog can build one from the record and
            // file it into the documents folder.
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Download className="w-4 h-4 ml-1" /> צור PDF
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <AgreementViewDialog
        employeeId={employeeId}
        employeeName={employeeName}
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) load(); }}
      />
    </>
  );
}
