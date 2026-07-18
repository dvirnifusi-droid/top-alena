import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, DollarSign, ChevronDown, CheckCircle2 } from 'lucide-react';

const PAY_TYPES = [
  { v: 'hourly', l: 'שעתי' },
  { v: 'monthly', l: 'חודשי קבוע' },
  { v: 'tips', l: 'טיפים בלבד' },
];

// One screen to set pay for EVERY employee — the fast path that lights up the
// dashboard labor-cost KPI (writes the EmployeePay model via setEmployeePayBulk).
// Only HOURLY staff feed the variable labor cost; monthly = fixed cost; tips = excluded.
export default function EmployeePayMatrix({ defaultOpen = true, onSaved }) {
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [bulkPct, setBulkPct] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listEmployeePay();
      const list = (res?.data || res || []);
      setRows(list.map((e) => {
        const p = e.pay || {};
        const type = p.pay_type || 'hourly';
        return {
          employee_id: e.employee_id,
          full_name: e.full_name,
          department: e.department || '',
          status: e.status || 'active',
          pay_type: type,
          rate: type === 'monthly' ? (p.monthly_salary ?? '') : (p.hourly_rate ?? ''),
          employer_pct: p.employer_pct ?? '',
        };
      }));
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (id, key, val) => setRows((rs) => rs.map((r) => r.employee_id === id ? { ...r, [key]: val } : r));
  // Active employees only by default — inactive rows are noise when pricing payroll.
  const visible = showInactive ? rows : rows.filter((r) => r.status === 'active');
  const inactiveCount = rows.length - rows.filter((r) => r.status === 'active').length;
  const applyBulkPct = () => {
    if (bulkPct === '') return;
    const ids = new Set(visible.map((r) => r.employee_id));
    setRows((rs) => rs.map((r) => ids.has(r.employee_id) ? { ...r, employer_pct: bulkPct } : r));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload = visible.map((r) => ({
        employee_id: r.employee_id,
        pay_type: r.pay_type,
        hourly_rate: r.pay_type === 'hourly' ? r.rate : '',
        monthly_salary: r.pay_type === 'monthly' ? r.rate : '',
        employer_pct: r.employer_pct,
      }));
      const res = await base44.functions.setEmployeePayBulk({ rows: payload });
      const r = res?.data || res;
      setMsg({ ok: true, text: `נשמרו תעריפים ל-${r?.saved ?? 0} עובדים${r?.errors?.length ? ` · ${r.errors.length} נכשלו` : ''}` });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'שגיאה בשמירה' });
    }
    setSaving(false);
  };

  const withRate = visible.filter((r) => r.pay_type !== 'tips' && r.rate !== '' && Number(r.rate) > 0).length;

  return (
    <Card dir="rtl" className="border-amber-200">
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-amber-600" /> תעריפי שכר — כל העובדים במסך אחד</span>
          <span className="flex items-center gap-2 text-xs font-normal text-slate-500">
            {withRate}/{visible.length} עם תעריף
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {msg && (
            <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {msg.ok && <CheckCircle2 className="w-4 h-4" />}{msg.text}
            </div>
          )}
          <p className="text-xs text-slate-500">
            רק עובדים <b>שעתיים</b> נספרים לעלות העבודה המשתנה. חודשי = עלות קבועה; טיפים = לא נספר. מלא ולחץ שמור — מדד עלות העבודה בדאשבורד יתעדכן מיד.
          </p>

          {/* quick-fill employer % for everyone */}
          <div className="flex items-center gap-2 text-sm bg-amber-50 rounded-lg p-2">
            <span className="text-slate-600">עלות מעביד לכולם (%):</span>
            <Input type="number" dir="ltr" className="h-8 w-24" placeholder="30" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} />
            <Button size="sm" variant="outline" className="h-8" onClick={applyBulkPct}>החל על כולם</Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">אין עובדים להצגה (או שאין לך הרשאת שכר).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="p-2 text-right">עובד</th>
                    <th className="p-2 text-right">מחלקה</th>
                    <th className="p-2 text-right">סוג תשלום</th>
                    <th className="p-2 text-right">תעריף / משכורת (₪)</th>
                    <th className="p-2 text-right">עלות מעביד %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => (
                    <tr key={r.employee_id} className="hover:bg-slate-50">
                      <td className="p-2 font-medium whitespace-nowrap">{r.full_name}</td>
                      <td className="p-2 text-slate-500 whitespace-nowrap">{r.department || '—'}</td>
                      <td className="p-2">
                        <Select value={r.pay_type} onValueChange={(v) => patch(r.employee_id, 'pay_type', v)}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAY_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {r.pay_type === 'tips'
                          ? <span className="text-xs text-slate-400">—</span>
                          : <Input type="number" dir="ltr" className="h-8 w-28"
                              placeholder={r.pay_type === 'monthly' ? 'משכורת' : 'לשעה'}
                              value={r.rate} onChange={(e) => patch(r.employee_id, 'rate', e.target.value)} />}
                      </td>
                      <td className="p-2">
                        {r.pay_type === 'tips'
                          ? <span className="text-xs text-slate-400">—</span>
                          : <Input type="number" dir="ltr" className="h-8 w-20" placeholder="30"
                              value={r.employer_pct} onChange={(e) => patch(r.employee_id, 'employer_pct', e.target.value)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {inactiveCount > 0 ? (
              <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 underline">
                {showInactive ? `הסתר עובדים לא פעילים (${inactiveCount})` : `הצג גם עובדים לא פעילים (${inactiveCount})`}
              </button>
            ) : <span />}
            <Button onClick={save} disabled={saving || loading || visible.length === 0} className="bg-amber-600 hover:bg-amber-700">
              {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
              שמור תעריפים לכל העובדים
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
