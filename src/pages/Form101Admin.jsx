import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Send, CheckCircle2, Save, ShieldAlert, FileDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Manager side of טופס 101: who still owes one for the tax year, plus the
// business's own part א details.
export default function Form101Admin() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [taxYear, setTaxYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [employer, setEmployer] = useState({ name: '', address: '', phone: '', deductions_file: '' });
  const [savingEmployer, setSavingEmployer] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.listForm101Status({});
      const d = res?.data || res;
      if (!d?.ok) throw new Error(d?.message || 'שגיאה');
      setRows(d.employees || []);
      setTaxYear(d.tax_year);
      if (d.employer) setEmployer({ name: '', address: '', phone: '', deductions_file: '', ...d.employer });
    } catch (e) {
      toast({ title: 'שגיאה בטעינה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const pending = useMemo(() => rows.filter((r) => !r.signed), [rows]);
  const done = useMemo(() => rows.filter((r) => r.signed), [rows]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const remind = async () => {
    if (!picked.size) { toast({ title: 'לא נבחרו עובדים', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const res = await base44.functions.sendForm101Request({ tax_year: taxYear, employee_ids: [...picked] });
      const d = res?.data || res;
      toast({
        title: `נשלחו ${d?.notified || 0} תזכורות`,
        // WhatsApp delivery outside the 24h window fails silently, so the count
        // is what Twilio accepted — not a guarantee anyone received it.
        description: (d?.notified || 0) < picked.size ? 'חלק מההודעות לא נשלחו — בדוק/י מספרי טלפון' : undefined,
      });
      setPicked(new Set());
      load();
    } catch (e) {
      toast({ title: 'שגיאה בשליחה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const saveEmployer = async () => {
    setSavingEmployer(true);
    try {
      await base44.functions.setForm101Employer(employer);
      toast({ title: 'פרטי המעביד נשמרו' });
    } catch (e) {
      toast({ title: 'שגיאה', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSavingEmployer(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
      <h1 className="text-xl font-bold text-slate-900">טופס 101 — שנת המס {taxYear}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">חלק א — פרטי המעביד</CardTitle>
          <p className="text-xs text-slate-500">
            נכנס אוטומטית לכל טופס. בלי מספר תיק ניכויים הטופס יופק עם חלק א׳ חסר.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            ['deductions_file', 'מספר תיק ניכויים'],
            ['name', 'שם המעביד'],
            ['address', 'כתובת'],
            ['phone', 'טלפון'],
          ].map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input value={employer[key]} onChange={(e) => setEmployer((p) => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={saveEmployer} disabled={savingEmployer}>
              {savingEmployer ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
              שמור
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">עוד לא מילאו ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto divide-y">
            {pending.map((r) => (
              <label key={r.id} className="flex items-center gap-3 py-2 cursor-pointer">
                <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                <span className="flex-1 text-sm text-slate-800">{r.full_name}</span>
                {r.role && <Badge variant="outline" className="text-xs">{r.role}</Badge>}
                {r.status === 'draft' && <Badge className="bg-amber-100 text-amber-800 text-xs">טיוטה</Badge>}
                {!r.phone && <Badge variant="outline" className="text-xs text-red-600 border-red-300">אין טלפון</Badge>}
              </label>
            ))}
            {!pending.length && <p className="text-sm text-emerald-700 py-4 text-center">כולם מילאו 🎉</p>}
          </div>
          {pending.length > 0 && (
            <Button className="w-full mt-4" onClick={remind} disabled={sending || !picked.size}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}
              שלח תזכורת ל-{picked.size}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">נחתמו ({done.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto divide-y">
            {done.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="flex-1 text-sm text-slate-800">{r.full_name}</span>
                <span className="text-xs text-slate-400">
                  {r.signed_at ? new Date(r.signed_at).toLocaleDateString('he-IL') : ''}
                </span>
                {/* Filled through the token link, which can't satisfy the Tax
                    Authority's unique-identification requirement. Shown rather
                    than hidden — a form that looks fine but isn't is worse. */}
                {r.identified === false && (
                  <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                    <ShieldAlert className="w-3 h-3 ml-1" /> ללא זיהוי
                  </Badge>
                )}
                {r.file_url && (
                  <a href={r.file_url} target="_blank" rel="noreferrer" title="הורדת הטופס">
                    <FileDown className="w-4 h-4 text-slate-500" />
                  </a>
                )}
              </div>
            ))}
            {!done.length && <p className="text-sm text-slate-400 py-4 text-center">עוד אף אחד לא חתם</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
