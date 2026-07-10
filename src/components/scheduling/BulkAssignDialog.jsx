// Bulk "assign one employee across the week" — a horizontal alternative to
// clicking cell-by-cell. Pick an employee + a DEFAULT role, then per day tick
// which shift(s) they work. Each ticked shift gets its own start/end time and
// its own role (pre-filled from the shift config + the default role, editable
// per shift). Built for a technophobe kitchen manager who staffs from the grid.
import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function BulkAssignDialog({ open, onClose, employees = [], positions = [], days = [], shiftTypesConfig = {}, onSubmit }) {
  const shiftTypes = useMemo(
    () => Object.entries(shiftTypesConfig).map(([key, c]) => ({ key, label: c?.label || key, start: c?.start, end: c?.end })),
    [shiftTypesConfig],
  );
  const [employeeId, setEmployeeId] = useState('');
  const [position, setPosition] = useState(''); // default role
  const [rows, setRows] = useState({}); // key 'yyyy-MM-dd|shiftKey' -> { start, end, role }
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setEmployeeId(''); setPosition(''); setRows({}); } }, [open]);

  const keyOf = (day, st) => `${format(day, 'yyyy-MM-dd')}|${st}`;
  const defOf = (st) => {
    const c = shiftTypesConfig[st] || {};
    return { start: c.start || (st === 'lunch' ? '12:00' : '17:00'), end: c.end || (st === 'lunch' ? '17:00' : '23:00') };
  };
  const isOn = (day, st) => !!rows[keyOf(day, st)];
  const toggle = (day, st) => setRows((p) => {
    const k = keyOf(day, st); const n = { ...p };
    if (n[k]) delete n[k]; else { const d = defOf(st); n[k] = { start: d.start, end: d.end, role: '' }; }
    return n;
  });
  const setField = (day, st, field, val) => setRows((p) => {
    const k = keyOf(day, st); if (!p[k]) return p;
    return { ...p, [k]: { ...p[k], [field]: val } };
  });
  const toggleColumn = (st) => setRows((p) => {
    const allOn = days.every((d) => p[keyOf(d, st)]); const n = { ...p };
    days.forEach((d) => { const k = keyOf(d, st); if (allOn) delete n[k]; else if (!n[k]) { const dd = defOf(st); n[k] = { start: dd.start, end: dd.end, role: '' }; } });
    return n;
  });

  const count = Object.keys(rows).length;
  const emp = employees.find((e) => e.id === employeeId);

  const submit = async () => {
    if (!employeeId || !position || count === 0) return;
    const selections = [];
    for (const d of days) for (const s of shiftTypes) {
      const k = keyOf(d, s.key); const r = rows[k];
      if (r) selections.push({ date: d, shiftType: s.key, start: r.start, end: r.end, position: r.role || position });
    }
    setSaving(true);
    try { await onSubmit({ employee_id: employeeId, selections }); onClose(); }
    catch (e) { console.warn('bulk assign', e); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto overflow-x-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> שיבוץ עובד לשבוע</DialogTitle>
          <DialogDescription>בחר עובד ותפקיד ברירת-מחדל, סמן לכל יום איזו משמרת, וכוונן שעות/תפקיד לכל משמרת בנפרד.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-semibold">👤 עובד</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="בחר עובד" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">תפקיד ברירת-מחדל</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger><SelectValue placeholder="בחר תפקיד" /></SelectTrigger>
                <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.position_name}>{p.position_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick-fill a whole shift-type for the week */}
          <div className="flex flex-wrap gap-2">
            {shiftTypes.map((s) => (
              <Button key={s.key} type="button" size="sm" variant="outline" onClick={() => toggleColumn(s.key)} className="text-xs">
                כל השבוע · {s.label}
              </Button>
            ))}
          </div>

          {/* One card per day; each ticked shift reveals its own times + role */}
          <div className="space-y-2">
            {days.map((d) => (
              <div key={format(d, 'yyyy-MM-dd')} className="border rounded-lg p-2">
                <div className="font-semibold text-sm mb-1">{format(d, 'EEEE', { locale: he })} <span className="text-xs text-gray-400">{format(d, 'dd/MM')}</span></div>
                {shiftTypes.map((s) => {
                  const on = isOn(d, s.key);
                  const r = rows[keyOf(d, s.key)] || {};
                  return (
                    <div key={s.key} className="flex items-center gap-2 py-1 flex-wrap">
                      <label className="flex items-center gap-1.5 w-24 flex-shrink-0 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => toggle(d, s.key)} className="w-4 h-4 accent-orange-600" />
                        <span className="text-sm">{s.label}</span>
                      </label>
                      {on && (
                        <>
                          <Input type="time" value={r.start || ''} onChange={(e) => setField(d, s.key, 'start', e.target.value)} className="h-8 w-[104px] text-sm" />
                          <span className="text-gray-400">-</span>
                          <Input type="time" value={r.end || ''} onChange={(e) => setField(d, s.key, 'end', e.target.value)} className="h-8 w-[104px] text-sm" />
                          <Select value={r.role || position || undefined} onValueChange={(v) => setField(d, s.key, 'role', v)}>
                            <SelectTrigger className="h-8 w-32 text-sm"><SelectValue placeholder="תפקיד" /></SelectTrigger>
                            <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.position_name}>{p.position_name}</SelectItem>)}</SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="!flex-row !flex-wrap gap-2 !justify-between pt-2 border-t mt-1">
          <span className="text-sm text-gray-500 self-center">{count > 0 ? `${count} שיבוצים${emp ? ` ל${emp.full_name}` : ''}` : 'לא נבחרו משמרות'}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>ביטול</Button>
            <Button size="sm" disabled={!employeeId || !position || count === 0 || saving} onClick={submit} className="bg-[#44512C] hover:bg-[#7A3722] text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שבץ'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
