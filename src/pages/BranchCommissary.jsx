import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Factory, Send, RefreshCw, Plus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const cur = (n) => `₪${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Order lifecycle status as the branch sees it → [label, banner classes].
const ORDER_STATUS = {
  submitted: ['⏳ ממתין לאישור בית ההכנות', 'bg-amber-50 text-amber-700 border-amber-200'],
  approved: ['✅ ההזמנה אושרה', 'bg-sky-50 text-sky-700 border-sky-200'],
  approved_partial: ['✅ ההזמנה אושרה (חלקית)', 'bg-sky-50 text-sky-700 border-sky-200'],
  ready: ['📦 ההזמנה מוכנה לאיסוף!', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
};

function BranchCommissaryInner() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayStr());
  const [qtys, setQtys] = useState({}); // item_key → qty
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [orders, setOrders] = useState([]); // this branch's order ARCHIVE (multi-order)
  const [detail, setDetail] = useState(null); // one order's live detail (modal)
  const [customs, setCustoms] = useState([]); // special requests — preps NOT in the catalog/מרלו"ג
  const addCustom = () => setCustoms((s) => [...s, { name: '', qty: '', unit: 'ק״ג' }]);
  const updateCustom = (i, k, v) => setCustoms((s) => s.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const removeCustom = (i) => setCustoms((s) => s.filter((_, idx) => idx !== i));

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getBranchCommissaryInfo();
      setInfo(res?.data || res);
    } catch (e) { setInfo({ in_chain: false }); setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setLoading(false);
  }, []);

  // The branch's order ARCHIVE — every order it placed (each separate).
  const loadOrders = useCallback(async () => {
    try { const res = await base44.functions.listMyBranchCommissaryOrders({ days: 45 }); setOrders((res?.data || res)?.orders || []); }
    catch { setOrders([]); }
  }, []);
  // Open ONE order's live detail (prep status synced from the commissary).
  const openDetail = useCallback(async (order_id) => {
    setDetail({ loading: true });
    try { const res = await base44.functions.getMyBranchCommissaryOrder({ order_id }); setDetail(res?.data || res); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); setDetail(null); }
  }, []);
  const duplicateOrder = useCallback(async (order_id) => {
    try { await base44.functions.duplicateBranchCommissaryOrder({ order_id }); setMsg({ ok: true, text: '✅ ההזמנה שוכפלה כהזמנה חדשה' }); await loadOrders(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
  }, [loadOrders]);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => { if (info?.in_chain) loadOrders(); }, [info, loadOrders]);

  const catalog = info?.catalog || [];
  const departments = [...new Set(catalog.map((c) => c.department).filter(Boolean))];
  const shown = catalog.filter((c) =>
    (deptFilter === 'all' || c.department === deptFilter) && (!search || c.name?.includes(search)));
  const total = catalog.reduce((s, c) => s + (Number(qtys[c.item_key]) || 0) * (Number(c.internal_price) || 0), 0);
  const customValid = customs.filter((c) => c.name?.trim() && Number(c.qty) > 0);
  const lineCount = catalog.filter((c) => Number(qtys[c.item_key]) > 0).length + customValid.length;

  const submit = async () => {
    const lines = catalog.filter((c) => Number(qtys[c.item_key]) > 0).map((c) => ({ item_key: c.item_key, qty: Number(qtys[c.item_key]) }));
    const customLines = customValid.map((c) => ({ custom: true, name: c.name.trim(), unit: (c.unit || 'יח׳').trim(), qty: Number(c.qty) }));
    const all = [...lines, ...customLines];
    if (!all.length) { setMsg({ ok: false, text: 'הזן כמות לפחות לפריט אחד' }); return; }
    setSaving(true); setMsg(null);
    try {
      await base44.functions.submitBranchCommissaryOrder({ order_date: date, lines: all });
      setMsg({ ok: true, text: `✅ ההזמנה נשלחה לבית ההכנות!${customLines.length ? ` (כולל ${customLines.length} בקשות מיוחדות)` : ''}` });
      setQtys({}); setCustoms([]); await loadOrders(); // fresh form; the order joins the archive
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה בשליחה' }); }
    setSaving(false);
  };

  return (
    <PageShell>
      <PageHeader
        title="🏭 הזמנה לבית הכנות"
        subtitle={info?.chain_name ? `רשת ${info.chain_name} · הזמן הכנות מבית ההכנות המרכזי` : 'הזמנה מבית ההכנות המרכזי של הרשת'}
        icon={Factory}
        action={
          <div className="flex items-center gap-2">
            <Input type="date" dir="ltr" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => { loadInfo(); loadOrders(); }} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          </div>
        }
      />
      <div className="space-y-4" dir="rtl">
        {msg && <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>}

        {info?.in_chain && orders.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">📦 ההזמנות שלי ({orders.length})</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {orders.map((o) => {
                const t = o.created_at ? new Date(o.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : o.order_date;
                const st = ORDER_STATUS[o.status] || ORDER_STATUS.submitted;
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <button onClick={() => openDetail(o.id)} className="flex-1 text-right min-w-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${st[1]}`}>{st[0]}</span>
                      <span className="text-slate-500 text-xs"> · {t} · {o.line_count} פריטים · הוכן {o.done_items}/{o.total_items}{o.eta ? ` · יעד ${o.eta}` : ''}</span>
                    </button>
                    <span className="text-slate-600 text-xs font-semibold whitespace-nowrap">{cur(o.total_ils)}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600" onClick={() => duplicateOrder(o.id)}>שכפל</Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : !info?.in_chain ? (
          <Card><CardContent className="p-8 text-center text-slate-500">העסק הזה אינו משויך לרשת עם בית הכנות. פנה למנהל הרשת.</CardContent></Card>
        ) : !catalog.length ? (
          <Card><CardContent className="p-8 text-center text-slate-500">בית ההכנות עדיין לא פרסם קטלוג. נסה שוב מאוחר יותר.</CardContent></Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">קטלוג בית ההכנות · {date}</CardTitle>
                <div className="flex items-center gap-2">
                  <Input className="h-8 w-44" placeholder="חיפוש פריט…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל המחלקות</SelectItem>
                      {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0"><tr>
                    <th className="p-2 text-right">פריט</th><th className="p-2 text-right">מחלקה</th>
                    <th className="p-2 text-left">מחיר</th><th className="p-2 text-center">כמות</th><th className="p-2 text-left">סה"כ</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {shown.map((c) => {
                      const q = Number(qtys[c.item_key]) || 0;
                      return (
                        <tr key={c.item_key} className={q > 0 ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}>
                          <td className="p-2 font-medium">{c.name}<span className="text-xs text-slate-400"> /{c.unit}</span></td>
                          <td className="p-2 text-xs text-slate-500">{c.department || '—'}</td>
                          <td className="p-2 text-left whitespace-nowrap">{cur(c.internal_price)}</td>
                          <td className="p-2">
                            <Input type="number" dir="ltr" className="h-8 w-20 mx-auto text-center" placeholder="0"
                              value={qtys[c.item_key] ?? ''} onChange={(e) => setQtys((s) => ({ ...s, [c.item_key]: e.target.value }))} />
                          </td>
                          <td className="p-2 text-left whitespace-nowrap font-semibold">{q > 0 ? cur(q * c.internal_price) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="text-sm font-semibold text-amber-800">➕ בקשה מיוחדת — פריט שלא בקטלוג</div>
                <div className="text-xs text-slate-500 mb-2">הכנה שאתה רוצה אבל אין לה סל מוצרים במרלו"ג — בקש אותה, ובית ההכנות יראה אותה כ"בקשה מיוחדת".</div>
                {customs.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <Input className="h-8 flex-1" placeholder="שם ההכנה" value={c.name} onChange={(e) => updateCustom(i, 'name', e.target.value)} />
                    <Input className="h-8 w-20 text-center" dir="ltr" type="number" placeholder="כמות" value={c.qty} onChange={(e) => updateCustom(i, 'qty', e.target.value)} />
                    <Select value={c.unit || 'ק״ג'} onValueChange={(v) => updateCustom(i, 'unit', v)}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ק״ג">ק"ג</SelectItem>
                        <SelectItem value="יח׳">יחידות</SelectItem>
                        <SelectItem value="ליטר">ליטר</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-red-500 hover:text-red-600" onClick={() => removeCustom(i)}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1 mt-1 border-amber-300 text-amber-800" onClick={addCustom}><Plus className="w-3.5 h-3.5" /> הוסף בקשה</Button>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-slate-500">{lineCount} פריטים · {cur(total)}</span>
                <Button onClick={submit} disabled={saving || lineCount === 0} className="bg-indigo-600 hover:bg-indigo-700 gap-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} שלח הזמנה לבית ההכנות
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5" dir="rtl" onClick={(e) => e.stopPropagation()}>
            {detail.loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-lg font-extrabold">📦 הזמנה · {detail.order_date}</div>
                    <div className="text-xs"><span className={`inline-block px-1.5 py-0.5 rounded font-bold ${(ORDER_STATUS[detail.status] || ORDER_STATUS.submitted)[1]}`}>{(ORDER_STATUS[detail.status] || ORDER_STATUS.submitted)[0]}</span>{detail.eta ? ` · 🕐 מוכן בערך: ${detail.eta}` : ''}</div>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
                </div>
                <div className="text-xs text-slate-500 mb-2">מתעדכן חי לפי מה שסומן בבית ההכנות · הוכן {detail.done_count}/{detail.active_count}</div>
                <div className="space-y-1">
                  {(detail.lines || []).map((l, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${l.rejected ? 'bg-red-50 border-red-200' : l.done ? 'bg-emerald-50 border-emerald-200' : ''}`}>
                      <span className="w-5 text-center">{l.rejected ? '✖' : l.done ? '✅' : '⏳'}</span>
                      <span className={`flex-1 ${l.rejected ? 'line-through text-red-500' : l.done ? 'text-emerald-700' : ''}`}>{l.name}{l.rejected && l.reject_reason ? <span className="text-[10px] text-red-500 no-underline"> · {l.reject_reason}</span> : ''}</span>
                      <span className="text-xs font-bold text-slate-600">{l.qty} {l.unit}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full mt-4 gap-1" variant="outline" onClick={() => { const id = detail.order_id; setDetail(null); duplicateOrder(id); }}>שכפל הזמנה זו</Button>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function BranchCommissary() {
  return (
    <PageGuard pageName="BranchCommissary" pageTitle="הזמנה לבית הכנות">
      <BranchCommissaryInner />
    </PageGuard>
  );
}
