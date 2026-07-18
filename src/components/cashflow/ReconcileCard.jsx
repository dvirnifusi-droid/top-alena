import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, CheckCircle2 } from 'lucide-react';

const ils = (n) => `₪${Math.round(Math.abs(Number(n || 0))).toLocaleString()}`;
const CONF_CLS = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};
const CONF_HE = { high: 'ודאי', medium: 'סביר', low: 'חלש' };

// Bank transfers arrive nameless; invoices know the supplier. This runs the
// match and lets the owner see it before anything is written.
export default function ReconcileCard() {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [denied, setDenied] = useState(false);

  const run = async (apply) => {
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.reconcileBankTransactions({ apply, min_confidence: 'medium' });
      const d = (r?.data ?? r) || {};
      setRes(d);
      if (apply) setMsg({ ok: true, t: `שויכו ${d.stored} תשלומים לספקים` });
    } catch (e) {
      const m = String(e?.message || '');
      if (/forbidden|unauthorized|401|403/i.test(m)) setDenied(true);
      else setMsg({ ok: false, t: m || 'שגיאה' });
    }
    setBusy(false);
  };

  if (denied) return null;

  return (
    <Card dir="rtl" className="mb-6 border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-5 h-5 text-violet-600" /> שיוך תשלומים לספקים
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          הבנק לא כותב למי הלכה כל העברה או שיק. אני משווה כל תשלום לחשבוניות הפתוחות —
          לפי סכום ומועד תשלום — כולל מקרה של העברה אחת שסוגרת כמה חשבוניות של אותו ספק.
          מה שלא ודאי נשאר לא משויך במקום להיות ניחוש.
        </p>

        {msg && (
          <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {msg.ok && <CheckCircle2 className="w-4 h-4" />}{msg.t}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => run(false)} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
            בדוק התאמות
          </Button>
          {res?.matched > 0 && !res.applied && (
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => run(true)} disabled={busy}>
              שייך {res.matched} תשלומים
            </Button>
          )}
        </div>

        {res && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Stat label="תשלומים ללא שם" value={res.candidates} />
              <Stat label="חשבוניות פתוחות" value={res.open_invoices} />
              <Stat label="הותאמו" value={res.matched} tone="good" />
              <Stat label="נשארו ללא שיוך" value={`${res.unmatched_tx} · ${ils(res.unmatched_amount)}`} tone="warn" />
            </div>

            {res.matches?.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-slate-600">התאמות</h4>
                {res.matches.slice(0, 20).map((m) => (
                  <div key={m.bank_tx_id} className="text-xs border rounded-lg p-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-medium">{m.supplier_name}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`rounded-full px-1.5 py-0.5 border text-[10px] ${CONF_CLS[m.confidence]}`}>
                          {CONF_HE[m.confidence]}
                        </span>
                        <span className="tabular-nums font-semibold">{ils(m.bank_amount)}</span>
                        <span className="text-slate-400">{m.bank_date}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{m.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {res.top_unmatched?.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-slate-600">
                  התשלומים הגדולים שעדיין בלי שם — כאן שווה לסרוק חשבוניות
                </h4>
                {res.top_unmatched.map((t) => (
                  <div key={t.id} className="text-xs flex justify-between border-b py-1">
                    <span>{t.date} · {t.description}</span>
                    <span className="tabular-nums font-semibold text-red-600">{ils(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }) {
  const cls = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-700';
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${cls}`}>{value}</p>
    </div>
  );
}
