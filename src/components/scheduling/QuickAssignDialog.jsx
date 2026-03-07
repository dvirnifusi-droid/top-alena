import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle } from 'lucide-react';
import { he } from 'date-fns/locale';
import { format } from 'date-fns';
import TimePicker from '../shared/TimePicker';
import { base44 } from '@/api/base44Client';

const shiftTypesConfig = {
    lunch: { label: 'צהריים' },
    dinner: { label: 'ערב' }
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

// פונקציה לסינון תפקידים לפי סוג משמרת
const filterPositionsByShiftType = (positions, shiftType) => {
    // If shiftType is not defined or not recognized, return all positions
    if (!shiftType || (shiftType !== 'lunch' && shiftType !== 'dinner')) {
        return positions;
    }
    const excludedPositions = shiftType === 'lunch' ? EXCLUDED_LUNCH_POSITIONS : EXCLUDED_DINNER_POSITIONS;
    return positions.filter(position => !excludedPositions.includes(position.position_name));
};

export default function QuickAssignDialog({ isOpen, onOpenChange, context, employees, positions, onAction }) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedPosition, setSelectedPosition] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [onLeaveEmployeeIds, setOnLeaveEmployeeIds] = useState(new Set());

    const isEditMode = !!context?.existingAssignment;

    // Load approved leave requests for the shift date
    useEffect(() => {
        if (!isOpen || !context?.date) return;
        const dateStr = format(context.date, 'yyyy-MM-dd');
        base44.entities.LeaveRequest.filter({ status: 'approved' }).then(reqs => {
            const onLeave = new Set(
                reqs.filter(r => r.start_date <= dateStr && r.end_date >= dateStr).map(r => r.employee_id)
            );
            setOnLeaveEmployeeIds(onLeave);
        }).catch(() => {});
    }, [isOpen, context?.date]);

    useEffect(() => {
        if (isOpen && context) {
            if (isEditMode) {
                const { existingAssignment } = context;
                setSelectedEmployeeId(existingAssignment.employee_id || '');
                setSelectedPosition(existingAssignment.position || '');
                setStartTime(existingAssignment.start_time || '');
                setEndTime(existingAssignment.end_time || '');
            } else {
                setSelectedPosition(context.positionName || '');
                const defaultTimes = { lunch: { start: '12:00', end: '17:00' }, dinner: { start: '17:00', end: '23:00' } };
                setStartTime(defaultTimes[context.shiftType]?.start || '');
                setEndTime(defaultTimes[context.shiftType]?.end || '');
                setSelectedEmployeeId('');
            }
        }
    }, [isOpen, context, isEditMode]);

    const handleSubmit = () => {
        if (!selectedEmployeeId || !selectedPosition) {
            alert('אנא בחר עובד ותפקיד');
            return;
        }
        // אם זה "בלתם", לא תהיה שעה קבועה (תתעדכן כשנכנסים למשמרת)
        const isUnassigned = selectedPosition === 'בלתם';
        onAction({
            employee_id: selectedEmployeeId,
            position: selectedPosition,
            start_time: isUnassigned ? '' : startTime,
            end_time: isUnassigned ? '' : endTime
        }, 'save');
    };

    const handleDelete = () => {
        if (!isEditMode) return;
        if (window.confirm('האם אתה בטוח שברצונך להסיר את השיבוץ?')) {
            onAction(null, 'delete');
        }
    };
    
    const getDialogTitle = () => {
        if (!context) return 'שיבוץ עובד';
        const shiftLabel = shiftTypesConfig[context.shiftType]?.label || '';
        const dateLabel = context.date ? format(context.date, 'dd/MM/yyyy', { locale: he }) : '';
        return isEditMode 
            ? `עריכת שיבוץ - ${context.existingAssignment.employee_name}`
            : `שיבוץ עובד ל${shiftLabel} ב${dateLabel}`;
    };

    // סנן תפקידים לפי סוג משמרת
    const filteredPositions = context?.shiftType ? filterPositionsByShiftType(positions, context.shiftType) : positions;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]" dir="rtl">
                <DialogHeader>
                    <DialogTitle>{getDialogTitle()}</DialogTitle>
                    {!isEditMode && <DialogDescription>שבץ עובד לתפקיד ולשעות ספציפיות במשמרת.</DialogDescription>}
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="employee" className="text-right">עובד</Label>
                        <Select onValueChange={setSelectedEmployeeId} value={selectedEmployeeId}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="בחר עובד" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map(employee => (
                                    <SelectItem key={employee.id} value={employee.id}>{employee.full_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="position" className="text-right">תפקיד</Label>
                        <Select onValueChange={setSelectedPosition} value={selectedPosition}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="בחר תפקיד" />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredPositions.map(pos => (
                                    <SelectItem key={pos.id} value={pos.position_name}>{pos.position_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {selectedPosition !== 'בלתם' && (
                        <>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="start-time" className="text-right">שעת התחלה</Label>
                                <div className="col-span-3">
                                  <TimePicker id="start-time" value={startTime} onChange={setStartTime} />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="end-time" className="text-right">שעת סיום</Label>
                                <div className="col-span-3">
                                  <TimePicker id="end-time" value={endTime} onChange={setEndTime} />
                                </div>
                            </div>
                        </>
                    )}
                    {selectedPosition === 'בלתם' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                            🔄 השעות יתעדכנו אוטומטית כשהעובד נכנס למשמרת
                        </div>
                    )}
                </div>
                <DialogFooter className="justify-between">
                    <div>
                        {isEditMode && (
                            <Button variant="destructive" onClick={handleDelete}>
                                <Trash2 className="w-4 h-4 ml-2" />
                                הסר שיבוץ
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                        <Button type="button" onClick={handleSubmit}>שמור שינויים</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}