// Bulk "assign one employee across the week" — a horizontal alternative to
// clicking cell-by-cell. The manager picks an employee + role, then ticks, for
// each day, which shift(s) that employee works (צהריים / ערב / both). Built for
// a technophobe kitchen manager who staffs straight from the schedule.
import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const [position, setPosition] = useState('');
  const [sel, setSel] = useState({}); // { 'yyyy-MM-dd|shiftKey': true }
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setEmployeeId(''); setPosition(''); setSel({}); } }, [open]);

  const keyOf = (day, st) => `${format(day, 'yyyy-MM-dd')}|${st}`;
  const toggle = (day, st) => setSel((p) => ({ ...p, [keyOf(day, st)]: !p[keyOf(day, st)] }));
  const toggleColumn = (st) => {
    const allOn = days.every((d) => sel[keyOf(d, st)]);
    setSel((p) => { const n = { ...p }; days.forEach((d) => { n[keyOf(d, st)] = !allOn; }); return n; });
  };
  const toggleRow = (day) => {
    const allOn = shiftTypes.every((s) => sel[keyOf(day, s.key)]);
    setSel((p) => { const n = { ...p }; shiftTypes.forEach((s) => { n[keyOf(day, s.key)] = !allOn; }); return n; });
  };

  const count = Object.values(sel).filter(Boolean).length;
  const emp = employees.find((e) => e.id === employeeId);

  const submit = async () => {
    if (!employeeId || !position || count === 0) return;
    const selections = [];
    for (const d of days) for (const s of shiftTypes) if (sel[keyOf(d, s.key)]) selections.push({ date: d, shiftType: s.key });
    setSaving(true);
    try { await onSubmit({ employee_id: employeeId, position, selections }); onClose(); }
    catch (e) { console.warn('bulk assign', e); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> שיבוץ עובד לשבוע</DialogTitle>
          <DialogDescription>בחר עובד ותפקיד, וסמן לכל יום איזו משמרת ({shiftTypes.map((s) => s.label).join(' / ') || 'צהריים / ערב'}).</DialogDescription>
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
              <Label className="font-semibold">תפקיד</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger><SelectValue placeholder="בחר תפקיד" /></SelectTrigger>
                <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.position_name}>{p.position_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* rows = days, columns = shift types; tap a header to toggle the whole week/day */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="p-2 text-right">יום</th>
                  {shiftTypes.map((s) => (
                    <th key={s.key} className="p-2 text-center">
                      <button type="button" onClick={() => toggleColumn(s.key)} className="font-semibold hover:text-orange-600" title="סמן/בטל לכל השבוע">{s.label}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={format(d, 'yyyy-MM-dd')} className="border-t">
                    <td className="p-2">
                      <button type="button" onClick={() => toggleRow(d)} className="text-right hover:text-orange-600" title="סמן/בטל את כל המשמרות ביום זה">
                        <span className="font-medium">{format(d, 'EEEE', { locale: he })}</span>
                        <span className="text-xs text-gray-400 block">{format(d, 'dd/MM')}</span>
                      </button>
                    </td>
                    {shiftTypes.map((s) => (
                      <td key={s.key} className="p-2 text-center">
                        <input type="checkbox" checked={!!sel[keyOf(d, s.key)]} onChange={() => toggle(d, s.key)} className="w-5 h-5 accent-orange-600 cursor-pointer" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">טיפ: לחיצה על שם משמרת מסמנת אותה לכל השבוע; לחיצה על שם יום מסמנת את כל המשמרות באותו יום.</p>
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
