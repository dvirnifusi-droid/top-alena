import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TimePicker from '@/components/shared/TimePicker';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ShiftEditInlineDialog({ open, onClose, shiftEntry, workShiftId, employeeId, onSaved }) {
    const [form, setForm] = useState({
        date: '',
        shift_type: 'dinner',
        start_time: '',
        end_time: '',
        total_break_minutes: 0,
        notes: '',
        position: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (shiftEntry) {
            setForm({
                date: (shiftEntry.date || '').slice(0, 10),
                shift_type: shiftEntry.shift_type || 'dinner',
                start_time: shiftEntry.start_time || '',
                end_time: shiftEntry.end_time || '',
                total_break_minutes: shiftEntry.break_minutes || 0,
                notes: shiftEntry.notes || '',
                position: shiftEntry.position || ''
            });
        }
    }, [shiftEntry]);

    const handleSave = async () => {
        setSaving(true);
        try {
        // Load the full WorkShift, update the specific staff member
        const ws = await base44.entities.WorkShift.get ?
            await base44.entities.WorkShift.get(workShiftId) :
            (await base44.entities.WorkShift.filter({ id: workShiftId }))[0];

        if (ws) {
            const sourceDate = (ws.date || '').slice(0, 10);
            const targetDate = (form.date || sourceDate).slice(0, 10);
            const dateChanged = targetDate !== sourceDate;
            const typeChanged = form.shift_type !== ws.shift_type;

            // Find the staff entry being edited. This used to compare the row's
            // start_time/end_time against assigned_staff — but the row shows the
            // CLOCK-OUT time while assigned_staff holds the SCHEDULED end, so on
            // any shift with a real clock-out nothing matched: saving rewrote the
            // array unchanged and looked like it worked, and changing the shift
            // type added a duplicate instead of moving. Prefer the index the
            // report carries, fall back to the scheduled times, and only then to
            // the displayed ones.
            const staffList = ws.assigned_staff || [];
            const sameEmployee = (a) => a.employee_id === employeeId
                || (a.employee_name && shiftEntry.employee_name && a.employee_name === shiftEntry.employee_name);
            let targetIdx = -1;
            if (Number.isInteger(shiftEntry.staffIdx)
                && staffList[shiftEntry.staffIdx]
                && sameEmployee(staffList[shiftEntry.staffIdx])) {
                targetIdx = shiftEntry.staffIdx;
            }
            if (targetIdx < 0) {
                targetIdx = staffList.findIndex(a => sameEmployee(a)
                    && a.start_time === (shiftEntry.sched_start_time ?? shiftEntry.start_time)
                    && a.end_time === (shiftEntry.sched_end_time ?? shiftEntry.end_time));
            }
            if (targetIdx < 0) {
                targetIdx = staffList.findIndex(a => sameEmployee(a) && a.start_time === shiftEntry.start_time);
            }
            if (targetIdx < 0) {
                // Refuse to guess. Silently rewriting the wrong person's shift is
                // worse than telling the manager it didn't work.
                alert('לא הצלחנו לאתר את המשמרת הזו ברשומה. רענן את הדף ונסה שוב.');
                setSaving(false);
                return;
            }
            const newStaffEntry = {
                employee_id: employeeId,
                start_time: form.start_time,
                end_time: form.end_time,
                total_break_minutes: Number(form.total_break_minutes) || 0,
                notes: form.notes,
                position: form.position || shiftEntry.position,
                status: 'scheduled',
            };

            if (dateChanged || typeChanged) {
                // Move: remove from current WorkShift, add to target (find-or-create).
                const removedStaff = staffList.filter((_, i) => i !== targetIdx);
                await base44.entities.WorkShift.update(workShiftId, { assigned_staff: removedStaff });
                const target = await base44.entities.WorkShift.filter({ date: targetDate, shift_type: form.shift_type });
                if (target?.length > 0) {
                    const newWs = target[0];
                    await base44.entities.WorkShift.update(newWs.id, {
                        assigned_staff: [...(newWs.assigned_staff || []), newStaffEntry],
                    });
                } else {
                    await base44.entities.WorkShift.create({
                        date: targetDate,
                        shift_type: form.shift_type,
                        start_time: form.start_time,
                        end_time: form.end_time,
                        assigned_staff: [newStaffEntry],
                    });
                }
            } else {
                const updatedStaff = staffList.map((a, i) => (i === targetIdx ? {
                    ...a,
                    start_time: form.start_time,
                    end_time: form.end_time,
                    total_break_minutes: Number(form.total_break_minutes) || 0,
                    notes: form.notes,
                    position: form.position || shiftEntry.position,
                } : a));
                await base44.entities.WorkShift.update(workShiftId, { assigned_staff: updatedStaff });
            }
        }
        // The hours in the report come from the CLOCK whenever there is one, so
        // editing only the scheduled shift left the manager staring at the same
        // number and concluding nothing saved. Move the clock too.
        if (shiftEntry.trackingId && (form.start_time || form.end_time)) {
            try {
                const day = (form.date || (shiftEntry.date || '')).slice(0, 10);
                const iso = (hhmm) => {
                    if (!day || !/^\d{2}:\d{2}$/.test(String(hhmm || ''))) return null;
                    return new Date(`${day}T${hhmm}:00`).toISOString();
                };
                const patch = {};
                const s = iso(form.start_time);
                const e = iso(form.end_time);
                if (s) patch.shift_start = s;
                if (e) {
                    // An end before the start is an overnight shift, not a typo.
                    patch.shift_end = (s && e <= s)
                        ? new Date(new Date(e).getTime() + 24 * 3600 * 1000).toISOString()
                        : e;
                }
                patch.total_break_minutes = Number(form.total_break_minutes) || 0;
                if (Object.keys(patch).length) {
                    await base44.entities.ShiftTracking.update(shiftEntry.trackingId, patch);
                }
            } catch (e) {
                console.warn('clock update failed', e);
            }
        }
        onSaved();
        onClose();
        } catch (err) {
            console.error('Shift edit save failed', err);
            alert('שגיאה בשמירת המשמרת. נסה שוב.');
        } finally {
            setSaving(false);
        }
    };

    if (!shiftEntry) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm" dir="rtl">
                <DialogHeader>
                    <DialogTitle>עריכת משמרת - {form.date || shiftEntry.date}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>תאריך</Label>
                        <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div>
                        <Label>תפקיד</Label>
                        <Input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder="לדוגמה: קופה, מטבח..." />
                    </div>
                    <div>
                        <Label>סוג משמרת</Label>
                        <select value={form.shift_type} onChange={e => setForm(p => ({ ...p, shift_type: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="dinner">ערב</option>
                            <option value="lunch">צהריים</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>שעת כניסה</Label>
                            <TimePicker value={form.start_time} onChange={v => setForm(p => ({ ...p, start_time: v }))} />
                        </div>
                        <div>
                            <Label>שעת יציאה</Label>
                            <TimePicker value={form.end_time} onChange={v => setForm(p => ({ ...p, end_time: v }))} />
                        </div>
                    </div>
                    <div>
                        <Label>הפסקה (דקות)</Label>
                        <Input type="number" min={0} value={form.total_break_minutes} onChange={e => setForm(p => ({ ...p, total_break_minutes: e.target.value }))} />
                    </div>
                    <div>
                        <Label>הערות</Label>
                        <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="הערות אופציונליות" />
                    </div>
                    {shiftEntry.trackingId && (
                        <div className="text-[11px] leading-relaxed rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
                            השעות בדוח למשמרת הזו מגיעות מ<b>שעון הנוכחות</b>, לא מהשיבוץ.
                            השמירה כאן תעדכן גם את רישום השעון, כדי שהמספר בדוח באמת ישתנה.
                        </div>
                    )}
                    <div className="flex gap-2 pt-2">
                        <Button onClick={handleSave} disabled={saving} className="flex-1">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            שמור
                        </Button>
                        <Button variant="outline" onClick={onClose}>ביטול</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}