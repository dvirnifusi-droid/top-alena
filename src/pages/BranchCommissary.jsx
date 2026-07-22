import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Factory, Send, RefreshCw } from 'lucide-react';
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
  const [myOrder, setMyOrder] = useState(null); // this branch's order for the date (status/eta/rejections)

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getBranchCommissaryInfo();
      setInfo(res?.data || res);
    } catch (e) { setInfo({ in_chain: false }); setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setLoading(false);
  }, []);

  const loadMyOrder = useCallback(async () => {
    try {
      const res = await base44.functions.getMyBranchCommissaryOrder({ order_date: date });
      const data = res?.data || res;
      setMyOrder(data);
      const q = {};
      (data?.lines || []).forEach((l) => { q[l.item_key] = l.qty; });
      setQtys(q);
    } catch { setQtys({}); setMyOrder(null); }
  }, [date]);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => { if (info?.in_chain) loadMyOrder(); }, [date, info, loadMyOrder]);

  const catalog = info?.catalog || [];
  const departments = [...new Set(catalog.map((c) => c.department).filter(Boolean))];
  const shown = catalog.filter((c) =>
    (deptFilter === 'all' || c.department === deptFilter) && (!search || c.name?.includes(search)));
  const total = catalog.reduce((s, c) => s + (Number(qtys[c.item_key]) || 0) * (Number(c.internal_price) || 0), 0);
  const lineCount = catalog.filter((c) => Number(qtys[c.item_key]) > 0).length;

  const submit = async () => {
    const lines = catalog.filter((c) => Number(qtys[c.item_key]) > 0).map((c) => ({ item_key: c.item_key, qty: Number(qtys[c.item_key]) }));
    if (!lines.length) { setMsg({ ok: false, text: 'הזן כמות לפחות לפריט אחד' }); return; }
    setSaving(true); setMsg(null);
    try {
      await base44.functions.submitBranchCommissaryOrder({ order_date: date, lines });
      setMsg({ ok: true, text: '✅ ההזמנה נשלחה לבית ההכנות!' });
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
            <Button variant="outline" size="sm" onClick={() => { loadInfo(); loadMyOrder(); }} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          </div>
        }
      />
      <div className="space-y-4" dir="rtl">
        {msg && <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>}

        {info?.in_chain && myOrder?.status && (myOrder.lines?.length > 0) && (
          <div className={`rounded-lg border px-3 py-2 ${(ORDER_STATUS[myOrder.status] || ORDER_STATUS.submitted)[1]}`}>
            <div className="font-bold text-sm">{(ORDER_STATUS[myOrder.status] || ORDER_STATUS.submitted)[0]}{myOrder.eta ? ` · 🕐 מוכן בערך: ${myOrder.eta}` : ''}</div>
            {myOrder.rejected_count > 0 && (
              <div className="mt-1 text-xs">
                פריטים שלא נכנסו להזמנה:
                <ul className="list-disc pr-4 mt-0.5">
                  {myOrder.rejected.map((r, i) => <li key={i}>{r.name}{r.qty ? ` (${r.qty} ${r.unit || ''})` : ''}{r.reason ? ` — ${r.reason}` : ''}</li>)}
                </ul>
              </div>
            )}
          </div>
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
