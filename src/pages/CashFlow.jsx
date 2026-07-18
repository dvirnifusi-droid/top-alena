import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet, RefreshCw, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Save, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RecurringCost } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';
import BankStatementCard from '../components/cashflow/BankStatementCard';
import CapitalForecastCard from '../components/cashflow/CapitalForecastCard';
import ReconcileCard from '../components/cashflow/ReconcileCard';
import VatSettingCard from '../components/cashflow/VatSettingCard';

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
  // Manual daily revenue (a day whose shift-end report was never filed) and the
  // payday that projected wages land on.
  const [manualRev, setManualRev] = useState({ date: '', amount: '' });
  const [savingRev, setSavingRev] = useState(false);
  const [revMsg, setRevMsg] = useState(null);
  const [payroll, setPayroll] = useState({ payroll_day: 10, enabled: true });
  const [savingPayroll, setSavingPayroll] = useState(false);

  const isOwner = me?.role === 'owner' || me?.role === 'admin';

  const loadPayrollSetting = async () => {
    try {
      const r = await base44.functions.getPayrollSetting({});
      const d = r?.data || r || {};
      setPayroll({ payroll_day: d.payroll_day ?? 10, enabled: d.enabled !== false });
    } catch { /* not permitted */ }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getLiveCashFlow({ days });
      setData(res?.data || res);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); loadPayrollSetting(); /* eslint-disable-next-line */ }, [days]);

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

  const saveManualRevenue = async () => {
    if (!manualRev.date || manualRev.amount === '') { setRevMsg({ ok: false, t: 'צריך תאריך וסכום' }); return; }
    setSavingRev(true); setRevMsg(null);
    try {
      await base44.functions.setDailyRevenue({ date: manualRev.date, amount: Number(manualRev.amount) });
      setRevMsg({ ok: true, t: 'נשמר — הפדיון נכנס לתזרים' });
      setManualRev({ date: '', amount: '' });
      load();
    } catch (e) { setRevMsg({ ok: false, t: e?.message || 'שגיאה' }); }
    setSavingRev(false);
  };

  const savePayroll = async () => {
    setSavingPayroll(true);
    try {
      await base44.functions.setPayrollSetting(payroll);
      load();
    } catch (e) { console.warn('payroll setting', e); }
    setSavingPayroll(false);
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
  const hasOpening = !!opening?.opening_date;

  return (
    <PageShell>
      <PageHeader
        title="תזרים מזומנים"
        subtitle="צפי ההון למעלה הוא התשובה; מתחתיו הפירוט לפי דוחות משמרת וחשבוניות"
        icon={Wallet}
        action={
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800">חי</Badge>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
            </Button>
          </div>
        }
      />
      <div className="space-y-4">

      {isOwner && (
        <>
          <CapitalForecastCard />

          <Section title="📥 מקורות נתונים — עו״ש ושיוך תשלומים"
            hint="מכאן הצפי מקבל את הנתונים" defaultOpen={!hasOpening}>
            <BankStatementCard />
            <ReconcileCard />
          </Section>

          <Section title="⚙️ הגדרות תזרים" hint="יתרת פתיחה, משכורות, עלויות קבועות">
            <div className="grid md:grid-cols-2 gap-3">
              <OpeningCard {...{ opening, setOpening, saveOpening, savingOpen }} />
              <PayrollCard {...{ payroll, setPayroll, savePayroll, savingPayroll }} />
              <ManualRevenueCard {...{ manualRev, setManualRev, saveManualRevenue, savingRev, revMsg }} />
              <RecurringCostsCard {...{ costs, removeCost, newCost, setNewCost, addCost, formatCur }} />
              <VatSettingCard />
            </div>
          </Section>
        </>
      )}

      <Section title="📊 פירוט לפי דוחות משמרת וחשבוניות"
        hint={`תחזית ${days} יום`}>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-slate-50">
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">
                יתרת פתיחה{hasOpening ? ` (${opening.opening_date})` : ' — לא הוגדרה'}
              </div>
              <div className="text-2xl font-bold mt-1">{formatCur(data.opening_balance)}</div>
              {!hasOpening && (
                <div className="text-[11px] text-amber-700 mt-1">העלה עו"ש למעלה והיא תיקבע לבד</div>
              )}
            </CardContent>
          </Card>
          <Card className={!hasOpening ? 'bg-slate-50' : data.current_projected_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}>
            <CardContent className="p-4">
              {/* Without an opening balance this series starts from zero, so it is
                  the net movement over the period — calling it a balance would be
                  a made-up number shown in red. */}
              <div className="text-xs text-slate-500">
                {hasOpening ? 'יתרה צפויה לסוף תקופה' : 'תנועה נטו בתקופה (לא יתרה)'}
              </div>
              <div className={`text-2xl font-bold mt-1 ${hasOpening ? balColor(data.current_projected_balance) : 'text-slate-700'}`}>
                {formatCur(data.current_projected_balance)}
              </div>
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

      {/* An "below zero" warning computed from a zero opening balance is not a
          warning about anything — it would fire for every healthy business. */}
      {hasOpening && data?.negative_days_warning?.length > 0 && (
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
      </Section>
      </div>
    </PageShell>
  );
}

function OpeningCard({ opening, setOpening, saveOpening, savingOpen }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">יתרת פתיחה</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-slate-500">
          נקבעת אוטומטית מייבוא העו"ש. ערוך רק אם אתה רוצה לדרוס אותה ידנית.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">סכום (₪)</label>
            <Input type="number" dir="ltr" value={opening.opening_balance}
              onChange={e => setOpening(o => ({ ...o, opening_balance: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500">תאריך</label>
            <Input type="date" value={opening.opening_date}
              onChange={e => setOpening(o => ({ ...o, opening_date: e.target.value }))} />
          </div>
          <Button onClick={saveOpening} disabled={savingOpen}><Save className="w-4 h-4 ml-1" />שמור</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PayrollCard({ payroll, setPayroll, savePayroll, savingPayroll }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">👥 משכורות בתזרים</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-slate-500">
          השכר מחושב מהסידור (כולל שעות נוספות ועלות מעביד) ויוצא כתשלום אחד ביום המשכורת.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">יום תשלום בחודש</label>
            <Input type="number" min="1" max="28" dir="ltr" className="w-24"
              value={payroll.payroll_day}
              onChange={e => setPayroll(v => ({ ...v, payroll_day: Number(e.target.value) || 10 }))} />
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-600 pb-2">
            <input type="checkbox" checked={payroll.enabled}
              onChange={e => setPayroll(v => ({ ...v, enabled: e.target.checked }))} />
            כלול בתזרים
          </label>
          <Button onClick={savePayroll} disabled={savingPayroll}><Save className="w-4 h-4 ml-1" />שמור</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualRevenueCard({ manualRev, setManualRev, saveManualRevenue, savingRev, revMsg }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">💵 פדיון יומי ידני</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-slate-500">
          יום שלא הוגש עליו דוח סיום משמרת נספר כאפס הכנסה. הזן כאן את הזד והוא ייכנס לתזרים.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">תאריך</label>
            <Input type="date" value={manualRev.date}
              onChange={e => setManualRev(v => ({ ...v, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500">פדיון (₪)</label>
            <Input type="number" dir="ltr" value={manualRev.amount}
              onChange={e => setManualRev(v => ({ ...v, amount: e.target.value }))} />
          </div>
          <Button onClick={saveManualRevenue} disabled={savingRev}><Save className="w-4 h-4 ml-1" />שמור</Button>
        </div>
        {revMsg && <div className={`text-xs ${revMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{revMsg.t}</div>}
      </CardContent>
    </Card>
  );
}

function RecurringCostsCard({ costs, removeCost, newCost, setNewCost, addCost, formatCur }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">עלויות קבועות (חוזרות חודשית)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {costs.map(c => (
          <div key={c.id} className="flex items-center justify-between text-sm border rounded p-1.5">
            <span>{c.name} · {formatCur(c.amount)} · יום {c.day_of_month}</span>
            <Button variant="ghost" size="sm" onClick={() => removeCost(c.id)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        ))}
        <div className="flex items-end gap-1 flex-wrap">
          <Input className="w-28" placeholder="שם" value={newCost.name}
            onChange={e => setNewCost(c => ({ ...c, name: e.target.value }))} />
          <Input className="w-24" type="number" dir="ltr" placeholder="סכום" value={newCost.amount}
            onChange={e => setNewCost(c => ({ ...c, amount: e.target.value }))} />
          <Input className="w-16" type="number" dir="ltr" placeholder="יום" value={newCost.day_of_month}
            onChange={e => setNewCost(c => ({ ...c, day_of_month: e.target.value }))} />
          <Button variant="outline" size="sm" onClick={addCost}><Plus className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Everything that is not the answer lives behind one of these. The page had
// grown nine competing cards and four loose forms; the owner opens it to learn
// one thing — how much money there will be — and should not have to find it.
function Section({ title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-lg bg-slate-100 hover:bg-slate-200/70 px-3 py-2 transition-colors">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {hint}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="space-y-3">{children}</div>}
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
