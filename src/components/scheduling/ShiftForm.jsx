
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X } from "lucide-react";
import _ from 'lodash';
import TimePicker from '../shared/TimePicker';

const shiftTypeOptions = {
    morning: { start: '08:00', end: '16:00' },
    lunch: { start: '11:00', end: '17:00' },
    dinner: { start: '17:00', end: '23:00' },
    night: { start: '22:00', end: '04:00' },
};

// תפקידים שלא מוצגים במשמרת צהריים
const EXCLUDED_LUNCH_POSITIONS = [
    'ברמן',
    'מארחת',
    'מנהל מטבח',
    'מנהלת משמרת',
    'מנהל פלור',
    'ראנר',
    'שוטף כלים'
];

// תפקידים שלא מוצגים במשמרת ערב
const EXCLUDED_DINNER_POSITIONS = [
    'מנהל פלור',
    'מנהל מטבח',
    'קופה +אריזות'
];

export default function ShiftForm({ isOpen, onOpenChange, shift, positions, employees, onSave, onDelete }) {
    const [formData, setFormData] = useState(null);

    useEffect(() => {
        if (shift) {
            const defaultPositions = positions.reduce((acc, pos) => {
                acc[pos.position_name] = 0;
                return acc;
            }, {});

            setFormData({
                ...shift,
                positions_needed: { ...defaultPositions, ...(shift.positions_needed || {}) },
                assigned_staff: (shift.assigned_staff || []).map(staff => ({
                    ...staff,
                    start_time: staff.start_time || shift.start_time,
                    end_time: staff.end_time || shift.end_time,
                })),
            });
        } else {
            setFormData(null);
        }
    }, [shift, positions]);

    const handleFieldChange = (field, value) => {
        let newFormData = { ...formData, [field]: value };
        if (field === 'shift_type' && shiftTypeOptions[value]) {
            newFormData.start_time = shiftTypeOptions[value].start;
            newFormData.end_time = shiftTypeOptions[value].end;
        }
        setFormData(newFormData);
    };

    const handlePositionNeededChange = (posName, count) => {
        const newCount = Math.max(0, parseInt(count, 10) || 0);
        setFormData(prev => ({
            ...prev,
            positions_needed: {
                ...prev.positions_needed,
                [posName]: newCount,
            }
        }));
    };

    const handleAssignEmployee = (posName, empId) => {
        if (!empId) return;
        const employee = employees.find(e => e.id === empId);
        if (!employee) return;

        const isAlreadyAssigned = formData.assigned_staff.some(staff => staff.employee_id === empId);
        if (isAlreadyAssigned) {
            alert("עובד זה כבר משובץ למשמרת.");
            return;
        }

        const newAssignment = {
            employee_id: employee.id,
            employee_name: employee.full_name,
            position: posName,
            status: 'scheduled',
            start_time: formData.start_time,
            end_time: formData.end_time,
        };

        setFormData(prev => ({
            ...prev,
            assigned_staff: [...prev.assigned_staff, newAssignment],
        }));
    };

    const handleUnassignEmployee = (empId) => {
        setFormData(prev => ({
            ...prev,
            assigned_staff: prev.assigned_staff.filter(staff => staff.employee_id !== empId),
        }));
    };

    const handleStaffTimeChange = (empId, field, value) => {
        setFormData(prev => ({
            ...prev,
            assigned_staff: prev.assigned_staff.map(staff =>
                staff.employee_id === empId ? { ...staff, [field]: value } : staff
            ),
        }));
    };

    const assignedEmployeesByPosition = _.groupBy(formData?.assigned_staff || [], 'position');

    // פונקציה לסינון תפקידים לפי סוג משמרת
    const getAvailablePositions = () => {
        if (!formData || !formData.shift_type) {
            // אם אין נתוני טופס או סוג משמרת, הצג את כל התפקידים
            return positions;
        }

        let excludedList = [];
        if (formData.shift_type === 'lunch') {
            excludedList = EXCLUDED_LUNCH_POSITIONS;
        } else if (formData.shift_type === 'dinner') {
            excludedList = EXCLUDED_DINNER_POSITIONS;
        }
        // עבור סוגי משמרות אחרים, יוחזרו כל התפקידים (רשימת excludedList תישאר ריקה)

        return positions.filter(pos => !excludedList.includes(pos.position_name));
    };

    if (!isOpen || !formData) return null;

    const availablePositions = getAvailablePositions();

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl" dir="rtl">
                <DialogHeader>
                    <DialogTitle>{formData.id ? 'עריכת משמרת' : 'הוספת משמרת'}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                    {/* Left Column: Basic Details */}
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="date">תאריך</Label>
                            <Input id="date" type="date" value={formData.date} onChange={(e) => handleFieldChange('date', e.target.value)} required />
                        </div>
                        <div>
                            <Label htmlFor="shift_type">סוג משמרת</Label>
                            <Select value={formData.shift_type} onValueChange={(val) => handleFieldChange('shift_type', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="lunch">🌆 צהריים</SelectItem>
                                    <SelectItem value="dinner">🌙 ערב</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <Label htmlFor="start_time">שעת התחלה (כללית)</Label>
                                <TimePicker id="start_time" value={formData.start_time} onChange={(val) => handleFieldChange('start_time', val)} />
                            </div>
                            <div>
                                <Label htmlFor="end_time">שעת סיום (כללית)</Label>
                                <TimePicker id="end_time" value={formData.end_time} onChange={(val) => handleFieldChange('end_time', val)} />
                            </div>
                        </div>
                         <div>
                            <Label htmlFor="notes">הערות</Label>
                            <Textarea id="notes" value={formData.notes} onChange={(e) => handleFieldChange('notes', e.target.value)} placeholder="לדוגמה: אירוע חברה, משמרת חג..." />
                        </div>
                    </div>

                    {/* Right Column: Staffing */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg">שיבוץ עובדים</h3>
                        <p className="text-sm text-gray-600">
                            מוצגים רק התפקידים הרלוונטיים לסוג המשמרת שנבחר.
                        </p>
                        {availablePositions.map(pos => (
                            <div key={pos.id} className="p-3 border rounded-lg bg-gray-50/50">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold">{pos.position_name}</Label>
                                    <div className="flex items-center gap-2">
                                        <Label className="text-sm">נדרש:</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={formData.positions_needed[pos.position_name] || 0}
                                            onChange={(e) => handlePositionNeededChange(pos.position_name, e.target.value)}
                                            className="w-16 h-8 text-center"
                                        />
                                    </div>
                                </div>
                                <div className="mt-2 space-y-2">
                                    {(assignedEmployeesByPosition[pos.position_name] || []).map(staff => (
                                        <div key={staff.employee_id} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-md shadow-sm">
                                            <span className="text-sm col-span-4">{staff.employee_name}</span>
                                            <div className="col-span-3">
                                                <TimePicker value={staff.start_time} onChange={val => handleStaffTimeChange(staff.employee_id, 'start_time', val)} />
                                            </div>
                                            <div className="col-span-3">
                                                <TimePicker value={staff.end_time} onChange={val => handleStaffTimeChange(staff.employee_id, 'end_time', val)} />
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => handleUnassignEmployee(staff.employee_id)}>
                                                    <X className="w-3 h-3 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2">
                                    <Select onValueChange={(empId) => handleAssignEmployee(pos.position_name, empId)} value="">
                                        <SelectTrigger>
                                            <SelectValue placeholder="הוסף עובד..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees
                                                .filter(emp => emp.role === pos.position_name && !(formData.assigned_staff || []).some(s => s.employee_id === emp.id))
                                                .map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter className="pt-4 border-t gap-2">
                    {formData.id && (
                        <Button variant="destructive" onClick={() => onDelete(formData.id)} className="mr-auto">
                            <Trash2 className="w-4 h-4 ml-2" />
                            מחק משמרת
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button onClick={() => onSave(formData)}>שמור משמרת</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
