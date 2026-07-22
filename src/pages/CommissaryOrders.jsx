import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Package, Factory, Plus, Save, Trash2, RefreshCw, Receipt, ClipboardList, BarChart3, AlertTriangle, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const cur = (n) => `₪${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function CommissaryOrdersInner() {
  const [tab, setTab] = useState('orders'); // orders | distribution
  const [date, setDate] = useState(todayStr());
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Order builder
  const [customerId, setCustomerId] = useState('');
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [qtys, setQtys] = useState({}); // `${source}:${ref_id}` → qty
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);

  // New customer
  const [newCustomer, setNewCustomer] = useState('');

  // Distribution
  const [dist, setDist] = useState(null);

  // Analytics
  const [analytics, setAnalytics] = useState(null);
  const [anDays, setAnDays] = useState(30);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, catRes] = await Promise.all([
        base44.functions.listCommissaryCustomers(),
        base44.functions.getCommissaryCatalog(),
      ]);
      setCustomers((cRes?.data || cRes)?.customers || []);
      const cat = catRes?.data || catRes;
      setCatalog((cat?.catalog || []).filter((r) => r.active));
      setDepartments(cat?.departments || []);
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await base44.functions.listCommissaryOrders({ date_from: date, date_to: date });
      setOrders((res?.data || res)?.orders || []);
    } catch { setOrders([]); }
  }, [date]);

  const loadDist = useCallback(async () => {
    try {
      const res = await base44.functions.getCommissaryDistribution({ order_date: date });
      setDist(res?.data || res);
    } catch (e) { setDist(null); setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
  }, [date]);

  const loadAnalytics = useCallback(async () => {
    try {
      const to = todayStr();
      const from = new Date(Date.now() - (anDays - 1) * 86400000);
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      const res = await base44.functions.getCommissaryAnalytics({ date_from: fromStr, date_to: to });
      setAnalytics(res?.data || res);
    } catch (e) { setAnalytics(null); setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
  }, [anDays]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadOrders(); if (tab === 'distribution') loadDist(); }, [date, tab, loadOrders, loadDist]);
  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, anDays, loadAnalytics]);

  const addCustomer = async () => {
    const name = newCustomer.trim();
    if (!name) return;
    setSaving(true);
    try { await base44.functions.saveCommissaryCustomer({ name }); setNewCustomer(''); await loadBase(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  const startNewOrder = () => { setEditingOrderId(null); setQtys({}); setCustomerId(''); };
  const editOrder = async (o) => {
    try {
      const res = await base44.functions.getCommissaryOrder({ order_id: o.id });
      const data = res?.data || res;
      const q = {};
      (data?.lines || []).forEach((l) => { q[`${l.source}:${l.ref_id}`] = l.qty; });
      setQtys(q); setCustomerId(o.customer_id); setEditingOrderId(o.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
  };

  const saveOrder = async () => {
    if (!customerId) { setMsg({ ok: false, text: 'בחר מסעדה' }); return; }
    const lines = catalog
      .filter((c) => Number(qtys[`${c.source}:${c.ref_id}`]) > 0)
      .map((c) => ({ source: c.source, ref_id: c.ref_id, qty: Number(qtys[`${c.source}:${c.ref_id}`]) }));
    if (!lines.length) { setMsg({ ok: false, text: 'הוסף לפחות פריט אחד עם כמות' }); return; }
    setSaving(true); setMsg(null);
    try {
      await base44.functions.saveCommissaryOrder({ order_id: editingOrderId, customer_id: customerId, order_date: date, lines });
      setMsg({ ok: true, text: 'ההזמנה נשמרה' });
      startNewOrder();
      await loadOrders();
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה בשמירה' }); }
    setSaving(false);
  };

  const deleteOrder = async (o) => {
    if (!window.confirm(`למחוק את ההזמנה של ${o.customer_name}?`)) return;
    setSaving(true);
    try { await base44.functions.deleteCommissaryOrder({ order_id: o.id }); await loadOrders(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  const shownCatalog = catalog.filter((c) =>
    (deptFilter === 'all' || c.department === deptFilter) &&
    (!search || c.name?.includes(search)));
  const draftTotal = catalog.reduce((s, c) => {
    const q = Number(qtys[`${c.source}:${c.ref_id}`]) || 0;
    return s + q * (Number(c.internal_price) || 0);
  }, 0);
  const draftLineCount = catalog.filter((c) => Number(qtys[`${c.source}:${c.ref_id}`]) > 0).length;

  return (
    <PageShell>
      <PageHeader
        title="📦 הזמנות והפצה — בית הכנות"
        subtitle="כל מסעדה מזמינה מבית ההכנות · המערכת מסכמת מה להכין ומפיקה חשבונית פנימית"
        icon={Package}
        action={
          <div className="flex items-center gap-2">
            <Input type="date" dir="ltr" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => { loadBase(); loadOrders(); if (tab === 'distribution') loadDist(); }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />
      <div className="space-y-4" dir="rtl">
        {msg && (
          <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>
        )}

        <div className="flex gap-2">
          <Button variant={tab === 'orders' ? 'default' : 'outline'} size="sm" onClick={() => setTab('orders')} className="gap-1"><ClipboardList className="w-4 h-4" /> הזמנות מסעדות</Button>
          <Button variant={tab === 'distribution' ? 'default' : 'outline'} size="sm" onClick={() => setTab('distribution')} className="gap-1"><Factory className="w-4 h-4" /> הפצה — מה להכין + חשבוניות</Button>
          <Button variant={tab === 'analytics' ? 'default' : 'outline'} size="sm" onClick={() => setTab('analytics')} className="gap-1"><BarChart3 className="w-4 h-4" /> אנליטיקה ורווחיות</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : tab === 'orders' ? (
          <>
            {/* Customers */}
            <Card>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">מסעדות הרשת:</span>
                {customers.filter((c) => c.active).map((c) => <Badge key={c.id} variant="outline">{c.name}</Badge>)}
                {!customers.length && <span className="text-xs text-slate-400">אין עדיין — הוסף מסעדה ←</span>}
                <div className="flex items-center gap-1 mr-auto">
                  <Input className="h-8 w-40" placeholder="שם מסעדה חדשה" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={addCustomer} disabled={!newCustomer.trim() || saving}><Plus className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>

            {/* Order builder */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">{editingOrderId ? 'עריכת הזמנה' : 'הזמנה חדשה'} · {date}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="h-9 w-48"><SelectValue placeholder="בחר מסעדה" /></SelectTrigger>
                      <SelectContent>{customers.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {editingOrderId && <Button size="sm" variant="ghost" onClick={startNewOrder}>ביטול עריכה</Button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input className="h-8 w-48" placeholder="חיפוש פריט…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל המחלקות</SelectItem>
                      {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-slate-500 mr-auto">{draftLineCount} פריטים · {cur(draftTotal)}</span>
                </div>
                {catalog.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">אין פריטים פעילים בקטלוג. הפעל פריטים ב"🏭 בית הכנות".</p>
                ) : (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0"><tr>
                        <th className="p-2 text-right">פריט</th><th className="p-2 text-right">מחלקה</th>
                        <th className="p-2 text-left">מחיר פנימי</th><th className="p-2 text-center">כמות</th><th className="p-2 text-left">סה"כ</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {shownCatalog.map((c) => {
                          const k = `${c.source}:${c.ref_id}`;
                          const q = Number(qtys[k]) || 0;
                          return (
                            <tr key={k} className={q > 0 ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}>
                              <td className="p-2 font-medium">{c.name}<span className="text-xs text-slate-400"> /{c.unit}</span></td>
                              <td className="p-2 text-xs text-slate-500">{c.department || '—'}</td>
                              <td className="p-2 text-left whitespace-nowrap">{cur(c.internal_price)}</td>
                              <td className="p-2">
                                <Input type="number" dir="ltr" className="h-8 w-20 mx-auto text-center" placeholder="0"
                                  value={qtys[k] ?? ''} onChange={(e) => setQtys((s) => ({ ...s, [k]: e.target.value }))} />
                              </td>
                              <td className="p-2 text-left whitespace-nowrap font-semibold">{q > 0 ? cur(q * c.internal_price) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={saveOrder} disabled={saving || !customerId || draftLineCount === 0} className="bg-indigo-600 hover:bg-indigo-700">
                    {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                    {editingOrderId ? 'עדכן הזמנה' : 'שמור הזמנה'} ({cur(draftTotal)})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Existing orders for the date */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">הזמנות ל-{date}</CardTitle></CardHeader>
              <CardContent className="p-0">
                {!orders.length ? (
                  <p className="text-sm text-slate-500 text-center py-6">אין הזמנות בתאריך זה.</p>
                ) : (
                  <div className="divide-y">
                    {orders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between p-3 hover:bg-slate-50">
                        <div><span className="font-medium">{o.customer_name || 'מסעדה'}</span><span className="text-xs text-slate-400"> · {o.line_count} פריטים</span></div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-indigo-700">{cur(o.total_ils)}</span>
                          <button onClick={() => editOrder(o)} className="text-xs text-slate-500 hover:text-indigo-600">ערוך</button>
                          <button onClick={() => deleteOrder(o)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : tab === 'distribution' ? (
          /* Distribution tab */
          <>
            {!dist || !dist.production?.length ? (
              <Card><CardContent className="p-8 text-center text-slate-500">אין הזמנות ל-{date}. הזן הזמנות בטאב "הזמנות מסעדות".</CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-slate-50"><CardContent className="p-4"><div className="text-xs text-slate-500">פריטים להכנה</div><div className="text-2xl font-bold mt-1">{dist.totals.item_count}</div></CardContent></Card>
                  <Card className="bg-slate-50"><CardContent className="p-4"><div className="text-xs text-slate-500">מסעדות</div><div className="text-2xl font-bold mt-1">{dist.totals.customer_count}</div></CardContent></Card>
                  <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4"><div className="text-xs text-slate-500">עלות ייצור</div><div className="text-xl font-bold mt-1">{cur(dist.totals.cost_ils)}</div></CardContent></Card>
                  <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4"><div className="text-xs text-slate-500">מכירה פנימית · רווח</div><div className="text-xl font-bold mt-1 text-emerald-700">{cur(dist.totals.price_ils)}</div><div className="text-xs text-emerald-600">רווח {cur(dist.totals.margin_ils)}</div></CardContent></Card>
                </div>

                {/* Production — grouped by department */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Factory className="w-4 h-4" /> מה להכין ({date})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                          <th className="p-2 text-right">פריט</th><th className="p-2 text-right">מחלקה</th>
                          <th className="p-2 text-center">כמות כוללת</th><th className="p-2 text-right">פירוט למסעדות</th>
                          <th className="p-2 text-left">מכירה</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {dist.production.map((p) => (
                            <tr key={`${p.source}:${p.ref_id}`} className="hover:bg-slate-50 align-top">
                              <td className="p-2 font-medium">{p.name}</td>
                              <td className="p-2 text-xs text-slate-500">{p.department || '—'}</td>
                              <td className="p-2 text-center font-bold text-indigo-700 whitespace-nowrap">{p.total_qty} {p.unit}</td>
                              <td className="p-2 text-xs text-slate-600">{p.per_customer.map((pc) => `${pc.customer_name || '—'}: ${pc.qty}`).join(' · ')}</td>
                              <td className="p-2 text-left whitespace-nowrap">{cur(p.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Internal invoices per restaurant */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4" /> חשבונית פנימית לכל מסעדה</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {dist.invoices.map((inv) => (
                        <div key={inv.customer_id} className="flex items-center justify-between p-3">
                          <div><span className="font-medium">{inv.customer_name || 'מסעדה'}</span><span className="text-xs text-slate-400"> · {inv.line_count} פריטים</span></div>
                          <div className="text-left">
                            <div className="font-bold text-indigo-700">{cur(inv.total_ils)}</div>
                            <div className="text-xs text-slate-400">עלות {cur(inv.cost_ils)} · רווח {cur(inv.margin_ils)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        ) : (
          /* Analytics tab */
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">טווח:</span>
              {[7, 30, 90].map((d) => (
                <Button key={d} size="sm" variant={anDays === d ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setAnDays(d)}>{d} ימים</Button>
              ))}
              {analytics && <span className="text-xs text-slate-400 mr-auto">{analytics.from} — {analytics.to}</span>}
            </div>
            {!analytics ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-slate-50"><CardContent className="p-4"><div className="text-xs text-slate-500">מכירה פנימית</div><div className="text-xl font-bold mt-1 text-indigo-700">{cur(analytics.totals.revenue)}</div></CardContent></Card>
                  <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4"><div className="text-xs text-slate-500">עלות ייצור</div><div className="text-xl font-bold mt-1">{cur(analytics.totals.cost)}</div></CardContent></Card>
                  <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4"><div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> רווח</div><div className="text-xl font-bold mt-1 text-emerald-700">{cur(analytics.totals.margin)}</div></CardContent></Card>
                  <Card className="bg-indigo-50 border-indigo-200"><CardContent className="p-4"><div className="text-xs text-slate-500">מרווח ממוצע</div><div className="text-2xl font-bold mt-1 text-indigo-700">{analytics.totals.margin_pct != null ? `${analytics.totals.margin_pct}%` : '—'}</div></CardContent></Card>
                </div>

                {analytics.totals.item_count === 0 ? (
                  <Card><CardContent className="p-8 text-center text-slate-500">אין הזמנות בטווח. ההזמנות (ידניות + סניפים) יופיעו כאן.</CardContent></Card>
                ) : (
                  <>
                    {analytics.alerts?.length > 0 && (
                      <Card className="border-amber-200">
                        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-amber-700"><AlertTriangle className="w-4 h-4" /> התראות תמחור ({analytics.alerts.length})</CardTitle></CardHeader>
                        <CardContent className="p-0"><div className="divide-y">
                          {analytics.alerts.slice(0, 12).map((a, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 text-sm">
                              <div><span className="font-medium">{a.name}</span> <span className="text-xs text-slate-400">{a.department || ''}</span></div>
                              <div className="text-left text-xs">
                                {a.issue === 'loss' && <span className="text-red-600 font-bold">מוכר בהפסד · קוסט {cur(a.cost_per_unit)} מול {cur(a.internal_price)}</span>}
                                {a.issue === 'thin' && <span className="text-amber-600">מרווח דק · {a.margin_pct}%</span>}
                                {a.issue === 'no_cost' && <span className="text-slate-500">חסר מחיר חומר גלם</span>}
                              </div>
                            </div>
                          ))}
                        </div></CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">רווחיות לפי פריט</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                              <th className="p-2 text-right">פריט</th><th className="p-2 text-right">מחלקה</th>
                              <th className="p-2 text-center">כמות</th><th className="p-2 text-left">מכירה</th><th className="p-2 text-left">עלות</th><th className="p-2 text-left">רווח</th>
                            </tr></thead>
                            <tbody className="divide-y">
                              {analytics.by_item.slice(0, 25).map((it, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-2 font-medium">{it.name}</td>
                                  <td className="p-2 text-xs text-slate-500">{it.department || '—'}</td>
                                  <td className="p-2 text-center whitespace-nowrap">{it.qty} {it.unit}</td>
                                  <td className="p-2 text-left whitespace-nowrap">{cur(it.revenue)}</td>
                                  <td className="p-2 text-left whitespace-nowrap text-slate-500">{cur(it.cost)}</td>
                                  <td className={`p-2 text-left whitespace-nowrap font-bold ${it.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{cur(it.margin)} {it.margin_pct != null ? <span className="text-xs font-normal">({it.margin_pct}%)</span> : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">לפי מחלקה</CardTitle></CardHeader>
                        <CardContent className="p-0"><div className="divide-y">
                          {analytics.by_department.map((d, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 text-sm">
                              <span className="font-medium">{d.department}</span>
                              <div className="text-left"><div className="font-bold text-indigo-700">{cur(d.revenue)}</div><div className="text-xs text-emerald-600">רווח {cur(d.margin)}</div></div>
                            </div>
                          ))}
                        </div></CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4" /> חשבונית תקופתית למסעדה</CardTitle></CardHeader>
                        <CardContent className="p-0"><div className="divide-y">
                          {analytics.by_customer.map((c, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 text-sm">
                              <span className="font-medium">{c.customer_name}</span>
                              <div className="text-left"><div className="font-bold text-indigo-700">{cur(c.revenue)}</div><div className="text-xs text-slate-400">רווח {cur(c.margin)}</div></div>
                            </div>
                          ))}
                        </div></CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

export default function CommissaryOrders() {
  return (
    <PageGuard pageName="CommissaryOrders" pageTitle="הזמנות והפצה">
      <CommissaryOrdersInner />
    </PageGuard>
  );
}
