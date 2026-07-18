import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, ShieldCheck, ChevronDown, CheckCircle2 } from 'lucide-react';

const AUTO = '__AUTO__';

// Assign permission tiers to EVERY employee from one screen. Going profile by
// profile for 61 people is the slow path; this is the same idea as the pay matrix.
export default function EmployeeTierMatrix({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tiers, setTiers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.listEmployeeTiers({});
      const d = (r?.data ?? r) || {};
      setTiers(d.tiers || []);
      setRows((d.employees || []).map((e) => ({ ...e, value: e.tier_id || AUTO })));
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'שגיאה בטעינה' });
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const patch = (id, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, value } : r)));

  const visible = rows.filter((r) => {
    if (!showInactive && r.status !== 'active') return false;
    const needle = q.trim();
    if (!needle) return true;
    return `${r.full_name} ${r.role || ''}`.includes(needle);
  });
  const inactiveCount = rows.filter((r) => r.status !== 'active').length;
  const overrides = rows.filter((r) => r.value !== AUTO).length;

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await base44.functions.setEmployeeTiersBulk({
        rows: rows.map((r) => ({ employee_id: r.id, tier_id: r.value === AUTO ? null : r.value })),
      });
      const d = (res?.data ?? res) || {};
      setMsg({ ok: true, text: `נשמר ל-${d.saved ?? 0} עובדים` });
      load();
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה בשמירה' }); }
    setSaving(false);
  };

  return (
    <Card dir="rtl" className="mb-6 border-indigo-200">
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600" /> רמות הרשאה — כל העובדים במסך אחד</span>
          <span className="flex items-center gap-2 text-xs font-normal text-slate-500">
            {overrides > 0 ? `${overrides} ידניים` : 'הכל אוטומטי'}
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
            "אוטומטי" מתאים רמה לפי שם התפקיד של העובד. בחר רמה כדי לעקוף ידנית.
            לעריכת מה כל רמה רואה — "⚙️ ערוך רמות" בתפריט הצד.
          </p>

          <Input placeholder="🔎 חפש עובד או תפקיד..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">לא נמצאו עובדים</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
                  <tr>
                    <th className="p-2 text-right">עובד</th>
                    <th className="p-2 text-right">תפקיד</th>
                    <th className="p-2 text-right">רמת הרשאה</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => {
                    const effective = r.value === AUTO
                      ? (r.auto_tier_label || null)
                      : (tiers.find((t) => t.id === r.value)?.label || null);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-2 font-medium whitespace-nowrap">
                          {r.full_name}
                          {r.status !== 'active' && <span className="text-[10px] text-slate-400 mr-1">(לא פעיל)</span>}
                        </td>
                        <td className="p-2 text-slate-500 whitespace-nowrap">{r.role || '—'}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={r.value}
                              onChange={(e) => patch(r.id, e.target.value)}
                              className="h-8 text-xs border rounded-lg px-1 bg-white min-w-[9rem]"
                            >
                              <option value={AUTO}>
                                אוטומטי{r.auto_tier_label ? ` → ${r.auto_tier_label}` : ' (אין התאמה)'}
                              </option>
                              {tiers.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}{t.pages != null ? ` (${t.pages})` : ''}</option>
                              ))}
                            </select>
                            {!effective && <span className="text-[11px] text-amber-600">רואה הכל</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {inactiveCount > 0 ? (
              <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 underline">
                {showInactive ? `הסתר לא פעילים (${inactiveCount})` : `הצג גם לא פעילים (${inactiveCount})`}
              </button>
            ) : <span />}
            <Button onClick={save} disabled={saving || loading} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
              שמור רמות
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
