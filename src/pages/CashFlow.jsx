import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wallet, RefreshCw, Upload, AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';

function CashFlowInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [days, setDays] = useState(30);
  const [marking, setMarking] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getCashFlowForecast({ days });
      setData(res?.data || res);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm(`ייבא את "${file.name}"? פעולה זו תמחק את כל רשומות התזרים הקיימות.`)) {
      event.target.value = ''; return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await base44.functions.importCashFlowFromJson(payload);
      const d = res?.data || res;
      alert(`✅ יובאו ${d.inserted} רשומות${d.opening_balance != null ? `\nיתרת פתיחה: ₪${d.opening_balance.toLocaleString()}` : ''}`);
      await load();
    } catch (e) {
      alert('שגיאה: ' + (e?.message || ''));
    } finally { setImporting(false); event.target.value = ''; }
  };

  const markPaid = async (id) => {
    setMarking(id);
    try {
      await base44.functions.markCashFlowEntryPaid({ id });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setMarking(null); }
  };

  const formatCur = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
  const upcoming = data?.upcoming || [];
  const balColor = (n) => n < 0 ? 'text-red-600' : n < 20000 ? 'text-amber-600' : 'text-emerald-700';

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600" /> תזרים מזומנים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            תחזית {days} יום קדימה · {upcoming.length} רשומות עתידיות
          </p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-1 cursor-pointer border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm px-3 py-2 rounded-md">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            ייבא JSON
            <input type="file" accept="application/json,.json" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-slate-50">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">יתרת פתיחה (1.1.26)</div>
              <div className="text-2xl font-bold mt-1">{formatCur(data.opening_balance)}</div>
            </CardContent>
          </Card>
          <Card className={data.current_projected_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">יתרה צפויה לסוף תקופה</div>
              <div className={`text-2xl font-bold mt-1 ${balColor(data.current_projected_balance)}`}>
                {formatCur(data.current_projected_balance)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">טווח</span>
              </div>
              <div className="flex gap-1 mt-1">
                {[7, 14, 30, 60, 90].map(d => (
                  <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)} className="h-7 px-2 text-xs">
                    {d} ימים
                  </Button>
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
              <strong>אזהרה:</strong> היתרה צפויה לרדת מתחת לאפס ב-{data.negative_days_warning.length} תאריכים החודש.
              הראשון: <strong>{data.negative_days_warning[0].date}</strong> ({formatCur(data.negative_days_warning[0].balance_after)}).
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">תחזית מפורטת</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              אין רשומות עתידיות. ייבא JSON של תזרים.
            </p>
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
                    <th className="p-2"></th>
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
                      <td className="p-2 text-xs truncate max-w-[180px]">{e.source || e.description || '—'}</td>
                      <td className={`p-2 text-left font-bold whitespace-nowrap ${e.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {e.type === 'income' ? '+' : '-'}{formatCur(e.amount)}
                      </td>
                      <td className={`p-2 text-left font-mono text-xs whitespace-nowrap ${balColor(e.balance_after)}`}>
                        {formatCur(e.balance_after)}
                      </td>
                      <td className="p-2">
                        {e.status === 'planned' && (
                          <Button size="sm" variant="outline" disabled={marking === e.id} onClick={() => markPaid(e.id)} className="h-6 px-2 text-xs">
                            {marking === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 ml-1" /> בוצע</>}
                          </Button>
                        )}
                      </td>
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
