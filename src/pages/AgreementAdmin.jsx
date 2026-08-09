import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Send, AlertTriangle, CheckCircle2, Search, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import AgreementViewDialog from '@/components/employees/AgreementViewDialog';

// Owner side of the employment agreement: edit the text once, then send it to
// specific employees with their terms filled in.
export default function AgreementAdmin() {
  const { toast } = useToast();
  const [tpl, setTpl] = useState(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warn, setWarn] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [values, setValues] = useState({});
  const [sending, setSending] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tplRes, emps] = await Promise.all([
          base44.functions.getAgreementTemplate(),
          base44.entities.Employee.list(),
        ]);
        const t = tplRes?.data || tplRes;
        setTpl(t);
        setBody(t.body || '');
        // Defaults come from the template so the owner isn't retyping the same
        // rates for every hire — still editable per employee before sending.
        const init = {};
        for (const f of t.fields || []) if (f.default) init[f.key] = f.default;
        setValues(init);
        setEmployees((emps || []).filter((e) => e.status !== 'terminated'));
      } catch (e) {
        toast({ title: 'שגיאה בטעינה', description: e?.message || String(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const managerFields = useMemo(
    () => (tpl?.fields || []).filter((f) => f.filled_by === 'manager'),
    [tpl],
  );
  const employeeFields = useMemo(
    () => (tpl?.fields || []).filter((f) => f.filled_by === 'employee'),
    [tpl],
  );

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.setAgreementTemplate({ body, fields: tpl.fields });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      // A dropped placeholder means a field that will never appear in the signed
      // text. Surfaced rather than saved quietly.
      setWarn((data.orphaned?.length || data.unused?.length) ? data : null);
      toast({ title: 'הנוסח נשמר' });
    } catch (e) {
      toast({ title: 'שגיאה בשמירה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveDefaults = async () => {
    setSavingDefaults(true);
    try {
      const res = await base44.functions.setAgreementDefaults({ values });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      toast({ title: 'התנאים נשמרו כברירת מחדל' });
    } catch (e) {
      toast({ title: 'שגיאה בשמירה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSavingDefaults(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return employees;
    return employees.filter((e) => `${e.full_name || ''} ${e.role || ''}`.includes(q));
  }, [employees, search]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const send = async () => {
    if (!picked.size) { toast({ title: 'לא נבחרו עובדים', variant: 'destructive' }); return; }
    const missing = managerFields
      .filter((f) => f.required && !String(values[f.key] || '').trim())
      .map((f) => f.label);
    if (missing.length) {
      toast({ title: 'חסרים פרטים למילוי', description: missing.join(', '), variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.assignAgreement({
        employee_ids: [...picked],
        values,
      });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      const skipped = data.skipped || [];
      toast({
        title: `ההסכם נשלח ל-${data.assigned} עובדים`,
        description: skipped.length ? `${skipped.length} דולגו (כבר חתומים)` : undefined,
      });
      setPicked(new Set());
    } catch (e) {
      toast({ title: 'שגיאה בשליחה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4" dir="rtl">
      <h1 className="text-xl font-bold text-slate-900 mb-4">הסכם עבודה</h1>
      <Tabs defaultValue="send">
        <TabsList className="mb-4">
          <TabsTrigger value="send">שליחה לעובדים</TabsTrigger>
          <TabsTrigger value="status">מי חתם</TabsTrigger>
          <TabsTrigger value="template">עריכת הנוסח</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <AgreementStatusList />
        </TabsContent>

        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">התנאים — אתה ממלא</CardTitle>
              <p className="text-xs text-slate-500">
                הערכים האלה נכנסים לתוך ההסכם לפני שהעובד רואה אותו. העובד חותם על מסמך שלם —
                הוא לא ממלא שכר על עצמו.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {managerFields.map((f) => {
                const opts = f.type?.startsWith('select:') ? f.type.slice(7).split(',') : null;
                return (
                  <div key={f.key}>
                    <Label>{f.label}{f.required && ' *'}</Label>
                    {opts ? (
                      <Select value={values[f.key] || ''} onValueChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}>
                        <SelectTrigger><SelectValue placeholder="בחר/י" /></SelectTrigger>
                        <SelectContent>
                          {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                        value={values[f.key] || ''}
                        onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
              <div className="sm:col-span-2 border-t pt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={saveDefaults} disabled={savingDefaults}>
                  {savingDefaults ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  שמור כברירת מחדל
                </Button>
                <span className="text-xs text-slate-500">
                  יישמר ויופיע מלא בפעם הבאה — לא תצטרך להקליד שוב לכל עובד.
                </span>
              </div>
              <div className="sm:col-span-2 text-xs text-slate-500">
                העובד ימלא בעצמו: {employeeFields.map((f) => f.label).join(' · ')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">בחירת עובדים ({picked.size})</CardTitle>
              <div className="relative mt-2">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <Input className="pr-9" placeholder="חיפוש לפי שם או תפקיד" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-y-auto divide-y">
                {filtered.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 py-2 cursor-pointer">
                    <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    <span className="flex-1 text-sm text-slate-800">{e.full_name}</span>
                    {e.role && <Badge variant="outline" className="text-xs">{e.role}</Badge>}
                  </label>
                ))}
                {!filtered.length && <p className="text-sm text-slate-400 py-4 text-center">אין עובדים תואמים</p>}
              </div>
              <Button className="w-full mt-4" onClick={send} disabled={sending || !picked.size}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}
                שלח את ההסכם ל-{picked.size} עובדים
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                עובד שכבר חתם יידלג — שליחה חוזרת לא מוחקת הסכם חתום.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">נוסח ההסכם</CardTitle>
              <p className="text-xs text-slate-500">
                {'השדות למילוי נכתבים כ-{{שם_השדה}}. שדות זמינים: '}
                {(tpl?.fields || []).map((f) => `{{${f.key}}}`).join(' ')}
                {' {{signing_day}} {{signing_month}} {{signing_year}}'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {warn && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertTriangle className="w-4 h-4" /> שים לב
                  </div>
                  {warn.orphaned?.length > 0 && <p>שדות שאין להם הגדרה: {warn.orphaned.join(', ')}</p>}
                  {warn.unused?.length > 0 && <p>שדות מוגדרים שלא מופיעים בנוסח: {warn.unused.join(', ')}</p>}
                </div>
              )}
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[60vh] font-mono text-xs leading-6"
                dir="rtl"
              />
              <div className="flex items-center gap-2">
                <Button onClick={saveTemplate} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  שמור נוסח
                </Button>
                {!warn && !saving && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    שינוי נוסח לא משפיע על הסכמים שכבר נחתמו
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Who has signed, who hasn't — with a view straight into the signed document.
function AgreementStatusList() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.listAgreementStatus();
        const d = res?.data || res;
        if (!d?.ok) throw new Error(d?.message || 'שגיאה');
        setRows(d.employees || []);
      } catch (e) {
        toast({ title: 'שגיאה בטעינה', description: e?.message || String(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const signed = rows.filter((r) => r.signed);
  const waiting = rows.filter((r) => r.assigned && !r.signed);
  const never = rows.filter((r) => !r.assigned);

  const Row = ({ r }) => (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <span className="flex-1 text-sm text-slate-800">{r.full_name}</span>
      {r.role && <Badge variant="outline" className="text-xs">{r.role}</Badge>}
      {r.signed && (
        <span className="text-xs text-slate-400">
          {r.signed_at ? new Date(r.signed_at).toLocaleDateString('he-IL') : ''}
        </span>
      )}
      {r.assigned && (
        <Button variant="ghost" size="sm" onClick={() => setViewing(r)}>
          <Eye className="w-4 h-4 ml-1" /> תצוגה
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base text-emerald-800">חתמו ({signed.length})</CardTitle></CardHeader>
        <CardContent>
          {signed.length ? signed.map((r) => <Row key={r.id} r={r} />)
            : <p className="text-sm text-slate-400 py-3 text-center">עוד אף אחד לא חתם</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base text-amber-800">נשלח וממתין לחתימה ({waiting.length})</CardTitle></CardHeader>
        <CardContent>
          {waiting.length ? waiting.map((r) => <Row key={r.id} r={r} />)
            : <p className="text-sm text-slate-400 py-3 text-center">אין ממתינים</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-600">לא נשלח אליהם הסכם ({never.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {never.length ? never.map((r) => <Row key={r.id} r={r} />)
            : <p className="text-sm text-slate-400 py-3 text-center">לכולם נשלח</p>}
        </CardContent>
      </Card>

      <AgreementViewDialog
        employeeId={viewing?.id}
        employeeName={viewing?.full_name}
        open={!!viewing}
        onOpenChange={(o) => { if (!o) setViewing(null); }}
      />
    </div>
  );
}
