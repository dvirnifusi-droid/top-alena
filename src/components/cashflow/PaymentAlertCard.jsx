import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BellRing, Send, Eye } from 'lucide-react';

// The daily "these suppliers are owed" alert. It is NOT on a schedule yet — the
// message goes to WhatsApp and Pushover, and starting that without the owner
// having seen one is how a useful alert becomes one that gets muted.
export default function PaymentAlertCard() {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [denied, setDenied] = useState(false);

  const run = async (dryRun) => {
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.testOverduePaymentAlert({ dry_run: dryRun });
      const d = (r?.data ?? r) || {};
      if (dryRun) {
        setPreview(d.preview || '(אין מה לשלוח — אין תשלומים באיחור)');
      } else {
        setMsg(d.sent
          ? `נשלח — ${d.late} באיחור, ${d.soon} לתשלום בקרוב`
          : 'אין תשלומים באיחור, אז לא נשלח כלום');
      }
    } catch (e) {
      const m = String(e?.message || '');
      if (/forbidden|unauthorized|admin only|401|403/i.test(m)) setDenied(true);
      else setMsg(m || 'שגיאה');
    }
    setBusy(false);
  };

  if (denied) return null;

  return (
    <Card dir="rtl" className="border-rose-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="w-5 h-5 text-rose-600" /> התראת תשלומים לספקים
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          וואטסאפ + פושאובר: מה באיחור ומה לתשלום ב-5 הימים הקרובים, בהודעה אחת.
        </p>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-900">
            <b>עדיין לא נשלחת אוטומטית.</b> תראה את ההודעה, ואם היא נראית לך —
            תגיד לי ואפעיל שליחה יומית.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Eye className="w-4 h-4 ml-1" />}
            הצג לי את ההודעה
          </Button>
          <Button size="sm" className="bg-rose-600 hover:bg-rose-700"
            onClick={() => run(false)} disabled={busy}>
            <Send className="w-4 h-4 ml-1" /> שלח לי עכשיו
          </Button>
        </div>

        {preview && (
          <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {preview}
          </pre>
        )}

        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      </CardContent>
    </Card>
  );
}
