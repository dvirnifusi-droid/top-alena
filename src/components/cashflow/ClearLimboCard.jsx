import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Archive, Undo2, AlertTriangle } from 'lucide-react';

const ils = (n) => `₪${Math.round(Math.abs(Number(n || 0))).toLocaleString()}`;

// Old invoices that were scanned but never marked paid. They clog the forecast
// and starve the reconciliation. Closing them is a bulk edit to payment records,
// so it previews before it writes and every batch stays undoable.
export default function ClearLimboCard() {
  const [date, setDate] = useState(() => {
    // Default: anything older than 60 days. Recent unpaid invoices are real
    // obligations and must not be swept up with the stale ones.
    const d = new Date(Date.now() - 60 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [preview, setPreview] = useState(null);
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [denied, setDenied] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const r = await base44.functions.listBulkPaidBatches({});
      setBatches(((r?.data ?? r) || {}).batches || []);
    } catch (e) {
      if (/forbidden|unauthorized|admin only|401|403/i.test(String(e?.message))) setDenied(true);
    }
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  const check = async () => {
    setBusy(true); setMsg(null); setPreview(null);
    try {
      const r = await base44.functions.markInvoicesPaidBefore({ date, apply: false });
      setPreview((r?.data ?? r) || null);
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  const apply = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.markInvoicesPaidBefore({ date, apply: true });
      const d = (r?.data ?? r) || {};
      setMsg({ ok: true, t: `${d.count} חשבוניות (${ils(d.total)}) סומנו כשולמו. אפשר לבטל בלחיצה.` });
      setPreview(null);
      loadBatches();
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  const undo = async (batch) => {
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.undoBulkPaid({ batch });
      const d = (r?.data ?? r) || {};
      setMsg({ ok: true, t: `${d.restored} חשבוניות הוחזרו למצב "לא שולם"` });
      loadBatches();
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  if (denied) return null;

  return (
    <Card dir="rtl" className="mb-6 border-slate-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="w-5 h-5 text-slate-600" /> ניקוי חשבוניות ישנות
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          חשבוניות שנסרקו ומעולם לא סומנו כשולמו. הן מעמיסות על הצפי ומפריעות לשיוך.
          בעסק שמשלם לספקים — חשבונית בת חודשיים כמעט בוודאות שולמה.
        </p>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs text-slate-500">סמן כשולם כל מה שלפני</label>
            <Input type="date" className="w-44" value={date}
              onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
          </div>
          <Button size="sm" variant="outline" onClick={check} disabled={busy}>
            {busy && !preview ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
            בדוק כמה
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            {preview.count === 0 ? (
              <p className="text-sm text-slate-600">אין חשבוניות פתוחות לפני התאריך הזה.</p>
            ) : (
              <>
                <p className="text-sm text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <b>{preview.count} חשבוניות</b> בסך <b>{ils(preview.total)}</b> יסומנו כשולמו.
                    חשבוניות ששויכו לתשלום אמיתי בבנק לא ייגעו.
                  </span>
                </p>
                <Button size="sm" className="mt-2 bg-slate-800 hover:bg-slate-900"
                  onClick={apply} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
                  סמן את {preview.count} החשבוניות
                </Button>
              </>
            )}
          </div>
        )}

        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</p>
        )}

        {batches.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-xs text-slate-500 mb-1">סימונים קודמים — אפשר לבטל</p>
            {batches.map((b) => (
              <div key={b.batch} className="flex items-center justify-between text-xs py-1">
                <span>{b.count} חשבוניות · {ils(b.total)}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => undo(b.batch)} disabled={busy}>
                  <Undo2 className="w-3.5 h-3.5 ml-1" /> בטל
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
