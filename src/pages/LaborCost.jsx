import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, TrendingUp, RefreshCw, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';
import EmployeePayMatrix from '@/components/employees/EmployeePayMatrix';

function LaborCostInner() {
  const [days, setDays] = useState(30);
  const [labor, setLabor] = useState(null);
  const [ratio, setRatio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [sending, setSending] = useState(false);

  const sendHoursReport = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await base44.functions.sendDailyHoursReportNow();
      const r = res?.data || res;
      const ch = r?.sent || {};
      alert(`📤 דוח שעות נשלח!\n${r?.count ?? 0} עובדים · ${r?.flagged ?? 0} חריגים\nוואטסאפ: ${ch.whatsapp ?? 0} · מייל: ${ch.email ?? 0} · פוש: ${ch.push ? '✓' : '✗'}`);
    } catch (e) {
      alert('שגיאה בשליחת הדוח: ' + (e?.message || 'unknown'));
    }
    setSending(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getLaborCost({ days });
      setLabor(res?.data || res);
      setAllowed(true);
    } catch (e) {
      setAllowed(false);
    }
    try {
      const r = await base44.functions.getLaborCostRatio({ days });
      setRatio(r?.data || r);
    } catch { setRatio(null); } // forbidden for non-owner — hide the ratio card
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const cur = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
  const devColor = (n) => n > 0 ? 'text-red-600' : n < 0 ? 'text-emerald-600' : 'text-slate-500';

  return (
    <PageShell>
      <PageHeader
        title="עלות שכר (Labor Cost)"
        subtitle={`עלות מתוכננת (סידור) מול בפועל (שעות אמת) · שעתיים בלבד · טווח ${days} יום`}
        icon={Users}
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[7, 14, 30, 90].map(d => (
                <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)} className="h-7 px-2 text-xs">{d} ימים</Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            <Button variant="outline" size="sm" onClick={sendHoursReport} disabled={sending} className="h-7 px-2 text-xs gap-1" title="שלח עכשיו דוח שעות יומי לוואטסאפ/פוש/מייל (בדיקה)">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} דוח שעות
            </Button>
          </div>
        }
      />
      <div className="space-y-4">

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : !allowed ? (
        <Card><CardContent className="p-6 text-center text-slate-500">אין לך הרשאה לצפות בנתוני עלות שכר.</CardContent></Card>
      ) : (
        <>
          {/* Enter pay for every employee here — writes EmployeePay → the KPIs below light up. */}
          <EmployeePayMatrix defaultOpen={!ratio?.ratio_pct} onSaved={load} />

          {/* Never present an estimate as a known number. */}
          {(labor?.estimated_employees > 0 || ratio?.estimated_employees > 0) && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ≈ {labor?.estimated_employees || ratio?.estimated_employees} עובדים מחושבים לפי <b>תעריף התפקיד</b> (הערכה), כי אין להם תעריף אישי.
              להחלפה בסכום מדויק — הזן להם תעריף בטבלה למעלה. לעריכת ההערכה — ניהול תפקידים → "שכר לשעה".
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ratio?.ratio_pct != null && (
              <Card className="bg-indigo-50 border-indigo-200 col-span-2">
                <CardContent className="p-4">
                  <div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> אחוז עלות שכר מהכנסות</div>
                  <div className="text-3xl font-bold mt-1 text-indigo-700">{ratio.ratio_pct}%</div>
                  <div className="text-xs text-slate-500 mt-1">{cur(ratio.labor_cost)} שכר / {cur(ratio.revenue)} הכנסות</div>
                </CardContent>
              </Card>
            )}
            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">עלות מתוכננת (סידור)</div>
                <div className="text-2xl font-bold mt-1">{cur(labor?.planned_total)}</div>
                <div className="text-xs text-slate-400 mt-1">{labor?.planned_hours || 0} שע'</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">עלות בפועל</div>
                <div className="text-2xl font-bold mt-1">{cur(labor?.actual_total)}</div>
                <div className="text-xs text-slate-400 mt-1">{labor?.actual_hours || 0} שע'</div>
              </CardContent>
            </Card>
          </div>

          {labor && (
            <Card className={labor.deviation_total > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm">חריגה כוללת (בפועל פחות מתוכנן)</span>
                <span className={`text-xl font-bold ${devColor(labor.deviation_total)}`}>
                  {labor.deviation_total > 0 ? '+' : ''}{cur(labor.deviation_total)}
                </span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">פירוט לפי עובד — חריגות</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!labor?.by_employee?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">אין נתוני עלות שכר בטווח (ודא שהוזנו תעריפים לעובדים, סידור, ושעות בפועל).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600">
                      <tr>
                        <th className="p-2 text-right">עובד</th>
                        <th className="p-2 text-left">מתוכנן</th>
                        <th className="p-2 text-left">בפועל</th>
                        <th className="p-2 text-left">חריגה</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {labor.by_employee.map(e => (
                        <tr key={e.employee_id} className="hover:bg-slate-50">
                          <td className="p-2">{e.name}</td>
                          <td className="p-2 text-left whitespace-nowrap">{cur(e.planned_cost)} <span className="text-xs text-slate-400">({e.planned_hours} שע')</span></td>
                          <td className="p-2 text-left whitespace-nowrap">{cur(e.actual_cost)} <span className="text-xs text-slate-400">({e.actual_hours} שע')</span></td>
                          <td className={`p-2 text-left font-bold whitespace-nowrap ${devColor(e.deviation)}`}>{e.deviation > 0 ? '+' : ''}{cur(e.deviation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </PageShell>
  );
}

export default function LaborCost() {
  return (
    <PageGuard pageName="LaborCost" pageTitle="עלות שכר">
      <LaborCostInner />
    </PageGuard>
  );
}
