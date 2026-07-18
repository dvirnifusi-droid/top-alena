import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, BookOpen, ChevronDown, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ils = (n) => `₪${Number(n || 0).toLocaleString()}`;

// Common Israeli terms, offered as one-tap presets so the owner doesn't have to
// remember the exact wording the parser understands.
const PRESETS = ['מיידי', 'שוטף', 'שוטף+30', 'שוטף+60', 'שוטף+90', '30 ימים'];

// Per-supplier ledger: every invoice, monthly totals, the payment terms, and the
// DATE each invoice falls due — the same calculation the cash-flow forecast uses.
export default function SupplierLedger({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState({});          // supplier_id → {payment_terms, is_occasional}
  const [expanded, setExpanded] = useState(null);  // supplier_id whose invoices are shown
  const [denied, setDenied] = useState(false);     // not an admin — hide the card entirely

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getSupplierLedger({ months: 6 });
      const d = (r?.data ?? r) || {};
      setData(d);
      const seed = {};
      for (const s of d.suppliers || []) {
        seed[s.supplier_id] = {
          payment_terms: s.payment_terms_raw || '',
          is_occasional: !!s.terms?.occasional,
        };
      }
      setDraft(seed);
    } catch (e) {
      const m = String(e?.message || '');
      // Only a real permission denial hides the card — a transient failure must
      // stay visible with its error, not silently disappear.
      if (/admin only|forbidden|unauthorized|401|403/i.test(m)) setDenied(true);
      else setMsg({ ok: false, t: m || 'שגיאה בטעינה' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  if (denied) return null;

  const patch = (id, key, val) => setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: val } }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const rows = Object.entries(draft).map(([supplier_id, v]) => ({
        supplier_id,
        payment_terms: v.payment_terms || null,
        is_occasional: !!v.is_occasional,
      }));
      const r = await base44.functions.setSupplierTermsBulk({ rows });
      const d = (r?.data ?? r) || {};
      setMsg({ ok: true, t: `נשמרו תנאים ל-${d.saved ?? 0} ספקים · התזרים יתעדכן בהתאם` });
      setData(null);
      load();
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה בשמירה' }); }
    setSaving(false);
  };

  const suppliers = data?.suppliers || [];
  const t = data?.totals || {};

  return (
    <Card dir="rtl" className="mb-6 border-emerald-200">
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-600" /> כרטסת ספקים ותנאי תשלום</span>
          <span className="flex items-center gap-2 text-xs font-normal text-slate-500">
            {data ? `${ils(t.open)} פתוח${t.overdue ? ` · ${ils(t.overdue)} באיחור` : ''}` : ''}
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {msg && (
            <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {msg.ok && <CheckCircle2 className="w-4 h-4" />}{msg.t}
            </div>
          )}
          <p className="text-xs text-slate-500">
            <b>"שוטף+30"</b> = 30 יום מ<b>סוף החודש</b> של החשבונית (לא מתאריך החשבונית).
            <b> מזדמן</b> = משלמים מיידית. ספק ללא תנאים מחושב כמיידי — כדי לא לנפח את התזרים.
          </p>
          {t.suppliers_without_terms > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ {t.suppliers_without_terms} ספקים ללא תנאי תשלום — הם מחושבים כמיידי, מה שמקדים את התזרים.
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : suppliers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">אין ספקים להצגה</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="p-2 text-right">ספק</th>
                    <th className="p-2 text-right">תנאי תשלום</th>
                    <th className="p-2 text-center">מזדמן</th>
                    <th className="p-2 text-left">פתוח</th>
                    <th className="p-2 text-left">באיחור</th>
                    <th className="p-2 text-center">חשבוניות</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map((s) => {
                    const d = draft[s.supplier_id] || {};
                    const isOpen = expanded === s.supplier_id;
                    return (
                      <React.Fragment key={s.supplier_id}>
                        <tr className="hover:bg-slate-50">
                          <td className="p-2 font-medium whitespace-nowrap">{s.name}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Input className="h-8 w-28 text-xs" placeholder="שוטף+30"
                                value={d.payment_terms ?? ''}
                                onChange={(e) => patch(s.supplier_id, 'payment_terms', e.target.value)} />
                              <select className="h-8 text-[11px] border rounded bg-white"
                                value="" onChange={(e) => { if (e.target.value) patch(s.supplier_id, 'payment_terms', e.target.value); e.target.value = ''; }}>
                                <option value="">בחר</option>
                                {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={!!d.is_occasional}
                              onChange={(e) => patch(s.supplier_id, 'is_occasional', e.target.checked)} />
                          </td>
                          <td className="p-2 text-left whitespace-nowrap font-semibold">{ils(s.open_total)}</td>
                          <td className={`p-2 text-left whitespace-nowrap ${s.overdue_total ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                            {s.overdue_total ? (<span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{ils(s.overdue_total)}</span>) : '—'}
                          </td>
                          <td className="p-2 text-center">
                            <button className="text-xs text-blue-600 underline"
                              onClick={() => setExpanded(isOpen ? null : s.supplier_id)}>
                              {s.invoice_count} {isOpen ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="p-3 bg-slate-50">
                              {s.monthly?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {s.monthly.map((m) => (
                                    <span key={m.month} className="text-[11px] rounded-full px-2 py-0.5 bg-white border">
                                      {m.month}: <b>{ils(m.total)}</b>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {s.invoices?.length === 0 ? (
                                <p className="text-xs text-slate-500">אין חשבוניות בטווח</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-slate-500">
                                    <tr>
                                      <th className="p-1 text-right">תאריך חשבונית</th>
                                      <th className="p-1 text-right">מועד תשלום</th>
                                      <th className="p-1 text-left">סכום</th>
                                      <th className="p-1 text-center">סטטוס</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.invoices.map((inv) => (
                                      <tr key={inv.id} className={inv.overdue ? 'bg-red-50' : ''}>
                                        <td className="p-1">{inv.invoice_date}</td>
                                        <td className="p-1">
                                          {inv.due_date}
                                          <span className="text-[10px] text-slate-400 mr-1">
                                            {inv.due_source === 'explicit' ? '(ידני)' : '(מהתנאים)'}
                                          </span>
                                        </td>
                                        <td className="p-1 text-left font-semibold">{ils(inv.amount)}</td>
                                        <td className="p-1 text-center">
                                          {inv.paid ? <span className="text-emerald-700">שולם ✓</span>
                                            : inv.overdue ? <span className="text-red-600 font-bold">באיחור</span>
                                            : <span className="text-slate-500">ממתין</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || loading} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
              שמור תנאי תשלום
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
