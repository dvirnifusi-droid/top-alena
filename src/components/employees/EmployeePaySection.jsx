import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Save, ShieldCheck } from 'lucide-react';

const PAY_TYPE_LABELS = { hourly: 'שעתי', monthly: 'חודשי קבוע', tips: 'טיפים (מחוץ לעלות שכר)' };
const ALL_SCOPE = '__ALL__'; // must match ALL_SCOPE in apps/api/src/lib/payAccess.ts

// Pay + employer-cost editor for one employee. Hides itself entirely when the
// API forbids access (the backend enforces department-scoped privacy).
export default function EmployeePaySection({ employee }) {
  const employeeId = employee?.id;
  const [state, setState] = useState({ loading: true, allowed: false, canEdit: false });
  const [form, setForm] = useState({ pay_type: 'hourly', hourly_rate: '', monthly_salary: '', employer_pct: '', notes: '' });
  const [me, setMe] = useState(null);
  const [scope, setScope] = useState(employee?.pay_access_scope || 'self');
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    try {
      const res = await base44.functions.getEmployeePay({ employee_id: employeeId });
      const d = res?.data || res;
      const pay = d.pay || {};
      setForm({
        pay_type: pay.pay_type || 'hourly',
        hourly_rate: pay.hourly_rate ?? '',
        monthly_salary: pay.monthly_salary ?? '',
        employer_pct: pay.employer_pct ?? '',
        notes: pay.notes || '',
      });
      setState({ loading: false, allowed: true, canEdit: !!d.can_edit });
    } catch (e) {
      setState({ loading: false, allowed: false, canEdit: false });
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setMe(u);
        if (u?.role === 'owner') {
          const emps = await base44.entities.Employee.list();
          setDepartments([...new Set((emps || []).map(e => e.department).filter(Boolean))]);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const save = async () => {
    setMsg(null);
    try {
      await base44.functions.setEmployeePay({
        employee_id: employeeId,
        pay_type: form.pay_type,
        hourly_rate: form.hourly_rate,
        monthly_salary: form.monthly_salary,
        employer_pct: form.employer_pct,
        notes: form.notes,
      });
      setMsg({ ok: true, text: 'נשמר' });
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'שגיאה' });
    }
  };

  const saveScope = async () => {
    setMsg(null);
    try {
      await base44.functions.setPayAccessScope({ employee_id: employeeId, scope });
      setMsg({ ok: true, text: 'הרשאת שכר עודכנה' });
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'שגיאה' });
    }
  };

  if (state.loading || !state.allowed) return null;
  const readOnly = !state.canEdit;

  return (
    <Card className="mt-6" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />שכר ועלות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && <div className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>סוג תשלום</Label>
            {readOnly
              ? <div className="text-slate-700 mt-1">{PAY_TYPE_LABELS[form.pay_type]}</div>
              : <Select value={form.pay_type} onValueChange={v => setForm(f => ({ ...f, pay_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>}
          </div>

          {form.pay_type === 'hourly' && (
            <div>
              <Label>תעריף לשעה (₪)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} />
            </div>
          )}
          {form.pay_type === 'monthly' && (
            <div>
              <Label>משכורת חודשית (₪)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} value={form.monthly_salary}
                onChange={e => setForm(f => ({ ...f, monthly_salary: e.target.value }))} />
            </div>
          )}

          {form.pay_type !== 'tips' && (
            <div>
              <Label>עלות מעביד (% על הברוטו, אופציונלי)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} placeholder="למשל 30" value={form.employer_pct}
                onChange={e => setForm(f => ({ ...f, employer_pct: e.target.value }))} />
            </div>
          )}
        </div>

        {!readOnly && (
          <Button onClick={save} className="bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 ml-2" />שמור שכר
          </Button>
        )}

        {me?.role === 'owner' && (
          <div className="border-t pt-4 mt-2">
            <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" />הרשאת צפייה/עריכת שכר (למנהל)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">עצמו בלבד</SelectItem>
                  <SelectItem value={ALL_SCOPE}>כל המחלקות</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={saveScope}>עדכן הרשאה</Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">קובע לאילו עובדים המנהל הזה יכול לראות/לערוך שכר.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
