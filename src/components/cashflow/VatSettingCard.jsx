import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';

const ils = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;

// VAT timing is a fact the owner knows and the bank cannot reveal — the actual
// payment dates wander (the 20th, then the 12th, then the 26th), so a learned
// pattern smears it across the month instead of landing it on one date.
export default function VatSettingCard() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await base44.functions.getVatSetting({});
      setS((r?.data ?? r) || null);
    } catch { /* card simply stays hidden if not permitted */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await base44.functions.setVatSetting({
        period: s.period,
        payment_day: s.payment_day,
        amount_mode: s.amount_mode,
        fixed_amount: s.fixed_amount,
        enabled: true,
      });
      setMsg({ ok: true, t: 'נשמר · צפי ההון יתעדכן בהתאם' });
      load();
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  if (!s) return null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const avg = s.history?.length
    ? s.history.reduce((n, h) => n + h.amount, 0) / s.history.length
    : 0;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">🧾 מע"מ</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-xs text-slate-500">
          התאריך שבו המע"מ יוצא לא נלמד טוב מהעו"ש. תגיד לי את התדירות ואני אשים אותו במקום הנכון בצפי.
        </p>

        <div>
          <label className="text-xs text-slate-500">תדירות דיווח</label>
          <div className="flex gap-1 mt-1">
            {[['monthly', 'חודשי'], ['bimonthly', 'דו-חודשי']].map(([v, he]) => (
              <Button key={v} size="sm" variant={s.period === v ? 'default' : 'outline'}
                className={`h-8 text-xs ${s.period === v ? 'bg-slate-800 hover:bg-slate-900' : ''}`}
                onClick={() => set('period', v)}>{he}</Button>
            ))}
          </div>
          {s.period === 'bimonthly' && (
            <p className="text-[11px] text-slate-400 mt-1">
              תקופות ינו-פבר, מרץ-אפר וכו' — התשלום נופל בחודש שאחרי סגירת התקופה
            </p>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">יום תשלום</label>
            <Input type="number" min="1" max="28" dir="ltr" className="w-20"
              value={s.payment_day} onChange={(e) => set('payment_day', Number(e.target.value) || 15)} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500">סכום</label>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant={s.amount_mode === 'learned' ? 'default' : 'outline'}
                className={`h-8 text-xs ${s.amount_mode === 'learned' ? 'bg-slate-800 hover:bg-slate-900' : ''}`}
                onClick={() => set('amount_mode', 'learned')}>לפי ההיסטוריה</Button>
              <Button size="sm" variant={s.amount_mode === 'fixed' ? 'default' : 'outline'}
                className={`h-8 text-xs ${s.amount_mode === 'fixed' ? 'bg-slate-800 hover:bg-slate-900' : ''}`}
                onClick={() => set('amount_mode', 'fixed')}>סכום קבוע</Button>
            </div>
          </div>
        </div>

        {s.amount_mode === 'fixed' && (
          <div>
            <label className="text-xs text-slate-500">סכום לתשלום (₪)</label>
            <Input type="number" dir="ltr" value={s.fixed_amount ?? ''}
              onChange={(e) => set('fixed_amount', e.target.value)} />
          </div>
        )}

        {s.history?.length > 0 && (
          <div className="text-[11px] text-slate-500 border-t pt-2">
            תשלומי מע"מ אחרונים: {s.history.slice(0, 4).map((h) => `${h.date} ${ils(h.amount)}`).join(' · ')}
            {avg > 0 && <> · ממוצע {ils(avg)}</>}
          </div>
        )}

        {msg && (
          <div className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {msg.ok && <CheckCircle2 className="w-3.5 h-3.5" />}{msg.t}
          </div>
        )}

        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
          שמור
        </Button>
      </CardContent>
    </Card>
  );
}
