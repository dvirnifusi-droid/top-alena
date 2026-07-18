import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Check } from 'lucide-react';

const AUTO = '__AUTO__';

// Manual override of an employee's permission tier. Leaving it on "אוטומטי"
// keeps the position-based auto-match (e.g. an employee whose role is
// "מנהל מטבח" picks up the "מנהל מטבח" tier by itself).
export default function EmployeeTierSelect({ employee }) {
  const [tiers, setTiers] = useState([]);
  const [value, setValue] = useState(AUTO);
  const [msg, setMsg] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!alive) return;
        if (!(me?.role === 'owner' || me?.role === 'admin')) return;
        setShow(true);
        const r = await base44.functions.getPermissionTiers({});
        const list = ((r?.data ?? r) || {}).tiers || [];
        if (alive) setTiers(list);
      } catch { /* not permitted → stay hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { setValue(employee?.permission_tier_id || AUTO); }, [employee?.permission_tier_id]);

  const save = async (v) => {
    setValue(v); setMsg(null);
    try {
      await base44.functions.setEmployeeTier({
        employee_id: employee?.id,
        tier_id: v === AUTO ? null : v,
      });
      setMsg('נשמר');
      setTimeout(() => setMsg(null), 1800);
    } catch (e) { setMsg(e?.message || 'שגיאה'); }
  };

  if (!show || !employee?.id) return null;
  const matched = tiers.find((t) => t.id === value);

  return (
    <Card className="mt-6" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-5 h-5" /> רמת הרשאה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select value={value} onValueChange={save}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>אוטומטי — לפי התפקיד ({employee?.role || 'ללא'})</SelectItem>
            {tiers.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          {value === AUTO
            ? 'המערכת מתאימה את הרמה לפי שם התפקיד של העובד. בחר רמה כדי לעקוף ידנית.'
            : `העובד רואה בדיוק את מה שמוגדר לרמה "${matched?.label || ''}".`}
          {' '}לעריכת מה כל רמה רואה — "⚙️ ערוך רמות" בתפריט הצד.
        </p>
        {msg && <div className="text-xs text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" />{msg}</div>}
      </CardContent>
    </Card>
  );
}
