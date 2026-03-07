import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ShiftEditInlineDialog({ open, onClose, shiftEntry, workShiftId, employeeId, onSaved }) {
    const [form, setForm] = useState({
        start_time: '',
        end_time: '',
        total_break_minutes: 0,
        notes: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (shiftEntry) {
            setForm({
                start_time: shiftEntry.start_time || '',
                end_time: shiftEntry.end_time || '',
                total_break_minutes: shiftEntry.break_minutes || 0,
                notes: shiftEntry.notes || ''
            });
        }
    }, [shiftEntry]);

    const handleSave = async () => {
        setSaving(true);
        // Load the full WorkShift, update the specific staff member
        const ws = await base44.entities.WorkShift.get ? 
            await base44.entities.WorkShift.get(workShiftId) :
            (await base44.entities.WorkShift.filter({ id: workShiftId }))[0];

        if (ws) {
            const updatedStaff = (ws.assigned_staff || []).map(a => {
                if (a.employee_id === employeeId &&
                    a.start_time === shiftEntry.start_time &&
                    a.end_time === shiftEntry.end_time) {
                    return {
                        ...a,
                        start_time: form.start_time,
                        end_time: form.end_time,
                        total_break_minutes: Number(form.total_break_minutes) || 0,
                        notes: form.notes
                    };
                }
                return a;
            });
            await base44.entities.WorkShift.update(workShiftId, { assigned_staff: updatedStaff });
        }
        setSaving(false);
        onSaved();
        onClose();
    };

    if (!shiftEntry) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm" dir="rtl">
                <DialogHeader>
                    <DialogTitle>עריכת משמרת - {shiftEntry.date}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>שעת כניסה</Label>
                            <Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                        </div>
                        <div>
                            <Label>שעת יציאה</Label>
                            <Input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
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