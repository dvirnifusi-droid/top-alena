import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, Star, Plus } from 'lucide-react';
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

export default function QuickAssignDialog({ isOpen, onOpenChange, context, employees, positions, onAction, availabilities = [], weekShifts = [] }) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedPosition, setSelectedPosition] = useState('');
    const [employeeSearch, setEmployeeSearch] = useState('');
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

    // ── מי הגיש זמינות למשמרת הזו (יום + סוג משמרת) ──
    // מסנן את מי שכבר שובץ למשמרת (כל תפקיד) ואת מי שבחופשה, כדי שהרשימה
    // תצטמצם ככל שמשבצים. shift_preference: 'lunch'/'dinner'/'both'.
    const submitters = React.useMemo(() => {
        if (!isOpen || !context?.date || isEditMode) return [];
        const dateStr = format(context.date, 'yyyy-MM-dd');
        const slice = (d) => (typeof d === 'string' ? d.slice(0, 10) : format(new Date(d), 'yyyy-MM-dd'));
        // already assigned to this day+shift (any position)
        const assigned = new Set();
        (weekShifts || []).forEach(s => {
            if (slice(s.date) === dateStr && s.shift_type === context.shiftType) {
                (s.assigned_staff || []).forEach(a => a.employee_id && assigned.add(a.employee_id));
            }
        });
        const byId = new Map();
        (availabilities || []).forEach(av => {
            if (slice(av.date) !== dateStr) return;
            if (av.availability_type === 'unavailable') return;
            const sp = av.shift_preference || 'both';
            if (sp !== 'both' && sp !== context.shiftType) return;
            if (assigned.has(av.employee_id)) return;
            if (onLeaveEmployeeIds.has(av.employee_id)) return;
            if (byId.has(av.employee_id)) return;
            const emp = employees.find(e => e.id === av.employee_id);
            byId.set(av.employee_id, {
                id: av.employee_id,
                name: emp?.full_name || av.employee_name,
                preferred: av.availability_type === 'preferred',
                reason: av.reason || '',
                positions: Array.isArray(av.positions) ? av.positions : [],
            });
        });
        return [...byId.values()];
    }, [isOpen, context, isEditMode, availabilities, weekShifts, onLeaveEmployeeIds, employees]);

    // הוספה מהירה של מגיש-זמינות ישירות לתא (עם תפקיד+שעות ברירת-המחדל של התא)
    const quickAddSubmitter = (empId, preferredPosition) => {
        const pos = preferredPosition || selectedPosition || context?.positionName || '';
        const isUnassigned = pos === 'בלתם';
        onAction({
            employee_id: empId,
            position: pos,
            start_time: isUnassigned ? '' : startTime,
            end_time: isUnassigned ? '' : endTime,
        }, 'save');
    };

    // Editing the hours of an assignment on a date that has already happened is a
    // CORRECTION, and the report only counts a shift that carries a completed
    // clock or an owner-confirmed manual entry. Without this flag a manager could
    // fix someone's hours in the rota and the report would keep showing 0.
    // Deliberately NOT set for future dates — that's planning, and marking a plan
    // as confirmed hours would pay people for shifts they haven't worked yet.
    const isCorrection = () => {
        if (!isEditMode || !context?.date) return false;
        const d = format(context.date, 'yyyy-MM-dd');
        return d <= format(new Date(), 'yyyy-MM-dd');
    };

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
            end_time: isUnassigned ? '' : endTime,
            ...(isCorrection() ? { manual_entry: true, manual_edited_at: new Date().toISOString() } : {}),
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
                    {!isEditMode && (
                        <div className="rounded-xl border border-[#EADFC8] bg-[#FBF6EA] p-3">
                            <p className="text-xs font-bold text-[#3A2E1E] mb-2 flex items-center gap-1.5">
                                <span>הגישו זמינות ל{shiftTypesConfig[context?.shiftType]?.label || 'משמרת'} ביום זה</span>
                                <span className="text-[#8A7C64] font-normal">({submitters.length})</span>
                            </p>
                            {submitters.length === 0 ? (
                                <p className="text-xs text-[#8A7C64]">אף אחד שעדיין לא שובץ לא הגיש זמינות למשמרת הזו.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {submitters.map(s => {
                                        const posMatch = (s.positions || []).find(p => filteredPositions.some(fp => fp.position_name === p));
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => quickAddSubmitter(s.id, posMatch)}
                                                title={s.reason ? `הערה: ${s.reason}` : 'הוסף למשמרת'}
                                                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
                                                style={{ background: s.preferred ? 'var(--brand-primary, #A04A2E)' : '#6B7A47' }}
                                            >
                                                {s.preferred && <Star className="w-3 h-3" fill="currentColor" />}
                                                {s.name}
                                                {posMatch && <span className="opacity-80">· {posMatch}</span>}
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="employee" className="text-right">עובד</Label>
                        <Select onValueChange={setSelectedEmployeeId} value={selectedEmployeeId}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="בחר עובד" />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Search box inside the dropdown — type to filter, no scrolling */}
                                <div className="p-2 sticky top-0 bg-white z-10 border-b">
                                    <input
                                        type="text"
                                        placeholder="🔍 חפש לפי שם..."
                                        value={employeeSearch}
                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                                        dir="rtl"
                                    />
                                </div>
                                {(() => {
                                    const q = employeeSearch.trim().toLowerCase();
                                    const filtered = q
                                        ? employees.filter(e => (e.full_name || '').toLowerCase().includes(q))
                                        : employees;
                                    if (filtered.length === 0) {
                                        return <div className="text-xs text-gray-500 text-center py-3">לא נמצאו עובדים</div>;
                                    }
                                    return filtered.map(employee => {
                                        const isOnLeave = onLeaveEmployeeIds.has(employee.id);
                                        return (
                                            <SelectItem key={employee.id} value={employee.id} disabled={isOnLeave}>
                                                {isOnLeave ? `🚫 ${employee.full_name} (בחופשה)` : employee.full_name}
                                            </SelectItem>
                                        );
                                    });
                                })()}
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
                    {selectedEmployeeId && onLeaveEmployeeIds.has(selectedEmployeeId) && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            עובד זה בחופשה מאושרת בתאריך זה!
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