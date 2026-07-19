import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CreditCard, AlertTriangle } from 'lucide-react';

const cur = (c) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : '₪');
const amt = (n, c) => `${cur(c)}${Math.round(Number(n || 0)).toLocaleString()}`;

// What is actually inside the monthly card payment, and which suppliers it
// covers. Those suppliers are the ones at risk of being counted twice in the
// forecast — once as an invoice, once inside the card bill.
export default function CardChargesCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getCardSummary({ months: 12 });
      setData((r?.data ?? r) || null);
    } catch (e) {
      if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (o) => {
    setSaving(o.supplier_id);
    try {
      await base44.functions.setSupplierPaidByCard({
        supplier_id: o.supplier_id, paid_by_card: !o.paid_by_card,
      });
      await load();
    } catch { /* leave the toggle as-is; the next load reflects the truth */ }
    setSaving(null);
  };

  if (denied) return null;
  if (loading) return null;
  if (!data?.has_data) return null;

  return (
    <Card dir="rtl" className="mb-6 border-purple-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" /> מה יש בתוך תשלום האשראי
          </span>
          <span className="text-xs font-normal text-slate-500">
            {data.from} → {data.to} · {data.charges} חיובים
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(data.totals || []).map((t) => (
            <span key={t.currency}
              className="text-sm rounded-lg bg-purple-50 border border-purple-200 px-3 py-1.5">
              <b>{amt(t.total, t.currency)}</b>
              <span className="text-xs text-slate-500"> · {t.count} חיובים</span>
            </span>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          החיובים האלה הם <b>פירוט</b> של תשלום הכרטיס שכבר מופיע בעו"ש — הם לא נספרים כיציאה נוספת בצפי.
        </p>

        {data.overlap?.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {data.overlap.length} ספקים מחויבים בכרטיס — סכנת ספירה כפולה
            </p>
            <p className="text-xs text-amber-800 mt-1 mb-2">
              לספקים האלה יש גם חשבוניות במערכת. סמן ✓ למי שמשולם <b>רק</b> בכרטיס — החשבוניות שלו
              יפסיקו להיספר בנפרד בצפי. השאר לא מסומן ספק שמשלמים לו גם בהעברה.
            </p>
            <div className="space-y-1">
              {data.overlap.map((o) => (
                <label key={o.supplier_id}
                  className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!o.paid_by_card}
                    disabled={saving === o.supplier_id}
                    onChange={() => toggle(o)} />
                  <span className="font-medium flex-1 truncate">{o.supplier_name}</span>
                  <span className="text-slate-400 truncate max-w-[9rem]">{o.merchant}</span>
                  <span className="tabular-nums font-semibold">{amt(o.total, 'ILS')}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-slate-600 mb-1.5">בתי העסק הגדולים</h4>
          <div className="space-y-0.5">
            {(data.merchants || []).slice(0, 12).map((m) => (
              <div key={m.merchant + m.currency} className="flex justify-between text-xs">
                <span className="truncate">{m.merchant} <span className="text-slate-400">({m.count})</span></span>
                <span className="tabular-nums font-medium shrink-0">{amt(m.total, m.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
