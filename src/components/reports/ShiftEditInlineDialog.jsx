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
                const removedStaff = (ws.assigned_staff || []).filter(a =>
                    !(a.employee_id === employeeId && a.start_time === shiftEntry.start_time && a.end_time === shiftEntry.end_time)
                );
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
                const updatedStaff = (ws.assigned_staff || []).map(a => {
                    if (a.employee_id === employeeId &&
                        a.start_time === shiftEntry.start_time &&
                        a.end_time === shiftEntry.end_time) {
                        return {
                            ...a,
                            start_time: form.start_time,
                            end_time: form.end_time,
                            total_break_minutes: Number(form.total_break_minutes) || 0,
                            notes: form.notes,
                            position: form.position || shiftEntry.position,
                        };
                    }
                    return a;
                });
                await base44.entities.WorkShift.update(workShiftId, { assigned_staff: updatedStaff });
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