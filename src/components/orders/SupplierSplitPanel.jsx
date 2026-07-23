// #3 — Split the order (flagged items) by supplier and send each supplier their
// portion via WhatsApp, with a below-minimum warning. Assign unassigned items to
// a supplier, and manage supplier phone + order minimum inline.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Truck, Send, AlertTriangle, Settings2 } from 'lucide-react';

export default function SupplierSplitPanel({ listId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [supDraft, setSupDraft] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [sp, su] = await Promise.all([
        base44.functions.getOrderSupplierSplit(listId ? { list_id: listId } : {}),
        base44.functions.listOrderSuppliers({}),
      ]);
      setData(sp?.data || sp);
      const slist = (su?.data || su)?.suppliers || [];
      setSuppliers(slist);
      const d = {}; slist.forEach((s) => { d[s.id] = { phone: s.phone || '', min_order_units: s.min_order_units ?? '', min_order_amount: s.min_order_amount ?? '' }; });
      setSupDraft(d);
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setLoading(false);
  };
  const openPanel = () => { setOpen(true); setMsg(null); load(); };

  const assign = async (id, supplier_name) => {
    setBusy(id);
    try { await base44.functions.updatePrepItem({ id, supplier_name: supplier_name || '' }); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(null);
  };
  const sendGroup = async (g) => {
    setBusy(g.supplier);
    try {
      const r = await base44.functions.sendSupplierOrder({ supplier_name: g.supplier, phone: g.phone, items: g.items });
      const d = r?.data || r;
      setMsg(d?.ok ? { ok: true, text: `📤 נשלח ל-${g.supplier} (${d.count} פריטים)` } : { ok: false, text: d?.message || d?.error || 'לא נשלח' });
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(null);
  };
  const saveSupplier = async (s) => {
    const d = supDraft[s.id] || {};
    setBusy(s.id);
    try { await base44.functions.setSupplierOrderMinimum({ id: s.id, phone: d.phone, min_order_units: d.min_order_units, min_order_amount: d.min_order_amount }); await load(); setMsg({ ok: true, text: '✅ נשמר' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(null);
  };

  const groups = data?.groups || [];
  const supNames = suppliers.map((s) => s.company_name).filter(Boolean);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1 border-amber-300 text-amber-800" onClick={openPanel}><Truck className="w-4 h-4" /> פצל ושלח לספקים</Button>
      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" dir="rtl" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2"><Truck className="w-5 h-5 text-amber-600" /> פיצול הזמנה לפי ספקים</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>
            {msg && <div className={`text-sm rounded px-3 py-2 mb-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : (
              <div className="space-y-3">
                {groups.length === 0 && <p className="text-sm text-slate-500 text-center py-6">אין פריטים מסומנים להזמנה. סמן "חוסרים" ברשימה קודם.</p>}
                {groups.map((g) => (
                  <div key={g.supplier} className={`rounded-lg border p-3 ${g.unassigned ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50/40'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-bold text-sm">{g.unassigned ? '❓ לא משויך לספק' : `🏪 ${g.supplier}`}<span className="text-slate-500 font-normal text-xs"> · {g.item_count} פריטים{g.total_units ? ` · ${g.total_units} יח'` : ''}</span></div>
                      {!g.unassigned && (g.phone
                        ? <Button size="sm" disabled={busy === g.supplier} onClick={() => sendGroup(g)} className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-8"><Send className="w-3.5 h-3.5" /> שלח</Button>
                        : <span className="text-[11px] text-amber-600">אין טלפון ↓</span>)}
                    </div>
                    {g.below_min_units && <div className="text-[11px] text-red-600 flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> מתחת למינימום ({g.total_units}/{g.min_order_units} יח') — ייתכן שהספק לא יקבל</div>}
                    <div className="space-y-1">
                      {g.items.map((it, i) => (
                        <div key={it.id || i} className="flex items-center justify-between gap-2 text-sm">
                          <span>{it.name}{it.qty ? <span className="text-slate-500"> · {it.qty} {it.unit}</span> : ''}</span>
                          {g.unassigned && (
                            <select disabled={busy === it.id} value="" onChange={(e) => assign(it.id, e.target.value)} className="h-7 rounded border border-slate-300 text-xs px-1 max-w-[130px]">
                              <option value="">שייך לספק…</option>
                              {supNames.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <button onClick={() => setShowSuppliers((v) => !v)} className="text-xs text-slate-500 underline flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> {showSuppliers ? 'הסתר' : 'ניהול'} ספקים (טלפון + מינימום)</button>
                {showSuppliers && (
                  <div className="space-y-1.5 border-t pt-2">
                    {suppliers.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 text-xs">
                        <span className="flex-1 font-medium truncate">{s.company_name}</span>
                        <input value={supDraft[s.id]?.phone ?? ''} onChange={(e) => setSupDraft((d) => ({ ...d, [s.id]: { ...d[s.id], phone: e.target.value } }))} placeholder="טלפון" dir="ltr" className="w-28 h-7 rounded border border-slate-300 px-1 text-left" />
                        <input value={supDraft[s.id]?.min_order_units ?? ''} onChange={(e) => setSupDraft((d) => ({ ...d, [s.id]: { ...d[s.id], min_order_units: e.target.value } }))} placeholder="מינ' יח'" type="number" dir="ltr" className="w-16 h-7 rounded border border-slate-300 px-1 text-center" />
                        <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy === s.id} onClick={() => saveSupplier(s)}>שמור</Button>
                      </div>
                    ))}
                    {suppliers.length === 0 && <p className="text-[11px] text-slate-400">אין ספקים. הוסף ספקים בדף הספקים.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
