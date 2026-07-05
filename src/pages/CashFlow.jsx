import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet, RefreshCw, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Save } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RecurringCost } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';

const STATUS_LABEL = { received: 'התקבל', paid: 'שולם', planned: 'צפוי' };

function CashFlowInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [me, setMe] = useState(null);
  const [opening, setOpening] = useState({ opening_balance: '', opening_date: '' });
  const [costs, setCosts] = useState([]);
  const [newCost, setNewCost] = useState({ name: '', amount: '', day_of_month: 1, category: 'קבועות' });
  const [savingOpen, setSavingOpen] = useState(false);

  const isOwner = me?.role === 'owner' || me?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getLiveCashFlow({ days });
      setData(res?.data || res);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me(); setMe(u);
        const o = await base44.functions.getCashFlowOpening();
        const od = o?.data || o;
        setOpening({ opening_balance: od.opening_balance ?? '', opening_date: od.opening_date || '' });
        const rc = await RecurringCost.list();
        setCosts(rc || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const saveOpening = async () => {
    setSavingOpen(true);
    try {
      await base44.functions.setCashFlowOpening({
        opening_balance: Number(opening.opening_balance) || 0,
        opening_date: opening.opening_date || undefined,
      });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); } finally { setSavingOpen(false); }
  };

  const addCost = async () => {
    if (!newCost.name || !newCost.amount) return;
    try {
      await RecurringCost.create({
        name: newCost.name, amount: Number(newCost.amount) || 0,
        day_of_month: Math.min(28, Math.max(1, Number(newCost.day_of_month) || 1)),
        category: newCost.category, active: true,
      });
      setNewCost({ name: '', amount: '', day_of_month: 1, category: 'קבועות' });
      setCosts(await RecurringCost.list());
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };

  const removeCost = async (id) => {
    try { await RecurringCost.delete(id); setCosts(await RecurringCost.list()); await load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };

  const formatCur = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
  const upcoming = data?.upcoming || [];
  const balColor = (n) => n < 0 ? 'text-red-600' : n < 20000 ? 'text-amber-600' : 'text-emerald-700';

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600" /> תזרים מזומנים <Badge className="bg-emerald-100 text-emerald-800">חי</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מתעדכן אוטומטית מדוחות סוף המשמרת (הכנסות) ומהחשבוניות (הוצאות) · תחזית {days} יום
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-slate-50">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">יתרת פתיחה{opening.opening_date ? ` (${opening.opening_date})` : ''}</div>
              <div className="text-2xl font-bold mt-1">{formatCur(data.opening_balance)}</div>
            </CardContent>
          </Card>
          <Card className={data.current_projected_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">יתרה צפויה לסוף תקופה</div>
              <div className={`text-2xl font-bold mt-1 ${balColor(data.current_projected_balance)}`}>{formatCur(data.current_projected_balance)}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">טווח</div>
              <div className="flex gap-1 mt-1 flex-wrap">
                {[7, 14, 30, 60, 90].map(d => (
                  <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)} className="h-7 px-2 text-xs">{d} ימים</Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.negative_days_warning && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3 text-sm text-red-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>אזהרה:</strong> היתרה צפויה לרדת מתחת לאפס ב-{data.negative_days_warning.length} תאריכים.
              הראשון: <strong>{data.negative_days_warning[0].date}</strong> ({formatCur(data.negative_days_warning[0].balance_after)}).
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-base">יתרת פתיחה</CardTitle></CardHeader>
            <CardContent className="flex items-end gap-2">
              <div>
                <label className="text-xs text-slate-500">סכום (₪)</label>
                <Input type="number" dir="ltr" value={opening.opening_balance} onChange={e => setOpening(o => ({ ...o, opening_balance: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">תאריך</label>
                <Input type="date" value={opening.opening_date} onChange={e => setOpening(o => ({ ...o, opening_date: e.target.value }))} />
              </div>
              <Button onClick={saveOpening} disabled={savingOpen}><Save className="w-4 h-4 ml-1" />שמור</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">עלויות קבועות (חוזרות חודשית)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {costs.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm border rounded p-1.5">
                  <span>{c.name} · {formatCur(c.amount)} · יום {c.day_of_month}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeCost(c.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
              ))}
              <div className="flex items-end gap-1 flex-wrap">
                <Input className="w-28" placeholder="שם" value={newCost.name} onChange={e => setNewCost(c => ({ ...c, name: e.target.value }))} />
                <Input className="w-24" type="number" dir="ltr" placeholder="סכום" value={newCost.amount} onChange={e => setNewCost(c => ({ ...c, amount: e.target.value }))} />
                <Input className="w-16" type="number" dir="ltr" placeholder="יום" value={newCost.day_of_month} onChange={e => setNewCost(c => ({ ...c, day_of_month: e.target.value }))} />
                <Button variant="outline" size="sm" onClick={addCost}><Plus className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">תחזית מפורטת</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">אין תנועות צפויות בטווח. ודא שמוזנים דוחות משמרת וחשבוניות.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-xs text-slate-600">
                    <th className="p-2 text-right">תאריך</th>
                    <th className="p-2 text-right">קטגוריה</th>
                    <th className="p-2 text-right">מקור</th>
                    <th className="p-2 text-left">סכום</th>
                    <th className="p-2 text-left">יתרה</th>
                    <th className="p-2 text-center">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {upcoming.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="p-2 whitespace-nowrap font-mono text-xs">{e.date}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {e.type === 'income' ? <ArrowDownCircle className="w-3 h-3 inline ml-1 text-emerald-600" /> : <ArrowUpCircle className="w-3 h-3 inline ml-1 text-red-600" />}
                          {e.category}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs truncate max-w-[180px]">{e.source || '—'}</td>
                      <td className={`p-2 text-left font-bold whitespace-nowrap ${e.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {e.type === 'income' ? '+' : '-'}{formatCur(e.amount)}
                      </td>
                      <td className={`p-2 text-left font-mono text-xs whitespace-nowrap ${balColor(e.balance_after)}`}>{formatCur(e.balance_after)}</td>
                      <td className="p-2 text-center"><span className="text-xs text-slate-500">{STATUS_LABEL[e.status] || e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CashFlow() {
  return (
    <PageGuard pageName="CashFlow" pageTitle="תזרים מזומנים">
      <CashFlowInner />
    </PageGuard>
  );
}
