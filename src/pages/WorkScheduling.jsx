import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, RotateCcw, X, Crown, Link, Check, Trash2, MoveRight, Phone, MessageCircle, Star, Copy, UserPlus } from 'lucide-react';
import EmployeeRatingDialog from '../components/scheduling/EmployeeRatingDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday } from 'date-fns';
import { he } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import QuickAssignDialog from '../components/scheduling/QuickAssignDialog';
import ShiftEditDialog from '../components/scheduling/ShiftEditDialog';
import AssignmentEditDialog from '../components/scheduling/AssignmentEditDialog';
import BulkAssignDialog from '../components/scheduling/BulkAssignDialog';
import { canonRole as canon } from '@/lib/roles';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import ShiftNotificationBell from '../components/shared/ShiftNotificationBell';
import SendScheduleWhatsAppDialog from '../components/scheduling/SendScheduleWhatsAppDialog';
import { RestaurantProfile } from '@/entities/RestaurantProfile';
import ApparelCustomizer from '../components/gamification/ApparelCustomizer';
import ScheduleInsights from '../components/scheduling/ScheduleInsights';

// Default shifts (Alena's lunch/dinner). Each tenant can override via the
// schedule-settings dialog — add בוקר/לילה, rename, retime, or hide positions.
const SHIFT_COLOR = 'bg-[#F4ECD8] border-[#D9BD83]';
const DEFAULT_SHIFTS = [
    { key: 'lunch', label: 'צהריים', start: '12:00', end: '17:00' },
    { key: 'dinner', label: 'ערב', start: '17:00', end: '23:00' },
];
const shiftTypesConfig = Object.fromEntries(DEFAULT_SHIFTS.map(s => [s.key, { label: s.label, color: SHIFT_COLOR, start: s.start, end: s.end }]));

// canon() (feminine → canonical role) is imported from '@/lib/roles' — the single
// source of truth shared with the availability screens, applied at write time.
// Build the {key: {label,color,start,end,positions}} map the render loops expect
// from a tenant's saved shifts list (falls back to the Alena default).
function buildShiftConfig(shifts) {
    const list = Array.isArray(shifts) && shifts.length ? shifts : DEFAULT_SHIFTS;
    return Object.fromEntries(list.map(s => [s.key, {
        label: s.label || s.key, color: SHIFT_COLOR,
        start: s.start || '12:00', end: s.end || '23:00',
        positions: Array.isArray(s.positions) && s.positions.length ? s.positions : null,
    }]));
}

// New Fixed Order Definitions
const LUNCH_POSITIONS_ORDER = ['קופה + אריזות', 'מלצר', 'חומוס', 'טבח', 'מתלמד פלור', 'בלתם'];
const DINNER_POSITIONS_ORDER = [
    'מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור',
    'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם'
];

// New constant for department definitions and their associated position names
const DEPARTMENT_DEFINITIONS = {
    all: { name: 'כל המחלקות' },
    floor: { name: 'סידור פלור', positionNames: [
        'מלצר', 'מלצרית', 'ברמן', 'ברמנית',
        'מארח/ת', 'מארח', 'מארחת',
        'מנהל פלור', 'מנהלת פלור',
        'ראנר', 'ראנרית',
        'קופה +אריזות', 'קופה + אריזות', 'קופה ואריזות',
        'מנהל משמרת', 'מנהלת משמרת',
        'מתלמד פלור', 'מתלמדת פלור',
        'בלתם',
    ] },
    kitchen: { name: 'סידור מטבח', positionNames: [
        'טבח', 'טבחית',
        'מנהל מטבח', 'מנהלת מטבח',
        'שוטף כלים', 'שוטפת כלים',
        'קונדיטור', 'קונדיטורית',
        'מתלמד מטבח', 'מתלמדת מטבח',
        'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'חומוס', 'בלתם',
    ] },
};

// The fixed order lists below are ALENA's positions. For any OTHER tenant, its
// own positions (from its WorkPosition table) won't appear in these lists — so
// we must NOT drop them. We keep Alena's positions in their curated order, then
// append the tenant's custom positions (those in neither Alena list) so every
// business sees ITS OWN roles in the schedule and can staff by them.
const ALENA_KNOWN_POSITIONS = new Set([...LUNCH_POSITIONS_ORDER, ...DINNER_POSITIONS_ORDER]);

// Helper: ordered positions for a shift. `cfg` (optional) carries per-tenant
// config: cfg.hidden (Set of position names to drop everywhere) and
// cfg.shiftPositions (explicit ordered list for THIS shift — overrides the
// default order/append behaviour so a business can staff each shift precisely).
const getOrderedPositionsForShift = (allPositions, shiftType, cfg = {}) => {
    const hidden = cfg.hidden instanceof Set ? cfg.hidden : new Set(Array.isArray(cfg.hidden) ? cfg.hidden : []);
    let result;

    if (Array.isArray(cfg.shiftPositions) && cfg.shiftPositions.length) {
        // Explicit per-shift positions, in the owner's chosen order.
        result = cfg.shiftPositions.map(name =>
            allPositions.find(p => p.position_name === name) || { position_name: name, id: 'ps_' + name });
    } else {
        const orderList = shiftType === 'lunch' ? LUNCH_POSITIONS_ORDER
            : (shiftType === 'dinner' ? DINNER_POSITIONS_ORDER : []);
        // Alena's positions for this shift, in the curated order.
        const includedPositions = allPositions.filter(p => orderList.includes(p.position_name));
        includedPositions.sort((a, b) => orderList.indexOf(a.position_name) - orderList.indexOf(b.position_name));
        // Tenant-custom positions — not in EITHER Alena list — shown in every shift.
        const customPositions = allPositions
            .filter(p => p.position_name && !ALENA_KNOWN_POSITIONS.has(p.position_name))
            .sort((a, b) => String(a.position_name).localeCompare(String(b.position_name), 'he'));
        result = [...includedPositions, ...customPositions];
        if (orderList.includes('בלתם') && !result.some(p => p.position_name === 'בלתם')) {
            result.push({ position_name: 'בלתם', id: 'unassigned' });
        }
    }

    // Drop positions the owner hid from the schedule.
    return result.filter(p => !hidden.has(p.position_name));
};

// Helper function to filter positions by department.
// Match is whitespace-tolerant and case-insensitive — owner-typed positions
// like " מלצרית" (with stray space) or "Waiter" otherwise dropped silently.
const _normPos = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const filterPositionsByDepartment = (allPositions, departmentFilter) => {
    if (departmentFilter === 'all') {
        return allPositions;
    }
    const departmentPositionNames = (DEPARTMENT_DEFINITIONS[departmentFilter]?.positionNames || []).map(_normPos);
    return allPositions.filter(position => departmentPositionNames.includes(_normPos(position.position_name)));
};


// =================================================================
// ScheduleFilters Component
// =================================================================
const ScheduleFilters = ({ filters, onFilterChange, employees, currentEmployeeId, shiftTypesConfig = {} }) => {
    return (
        <div className="space-y-4">
            {/* פילטר משמרות שלי */}
            {currentEmployeeId && (
                <div>
                    <Label className="font-medium mb-2 block">תצוגה מהירה</Label>
                    <Button
                        variant={filters.employee === currentEmployeeId ? "default" : "outline"}
                        onClick={() => onFilterChange('employee', filters.employee === currentEmployeeId ? 'all' : currentEmployeeId)}
                        className="w-full"
                    >
                        <Crown className="w-4 h-4 ml-2" />
                        📌 המשמרות שלי בלבד
                    </Button>
                </div>
            )}

            {/* פילטר סוג משמרת */}
            <div>
                <Label className="font-medium mb-2 block">סוג משמרת</Label>
                <Select value={filters.shiftType} onValueChange={(value) => onFilterChange('shiftType', value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="כל המשמרות" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">כל המשמרות</SelectItem>
                        {Object.entries(shiftTypesConfig).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{cfg.label} בלבד</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* פילטר מחלקה */}
            <div>
                <Label className="font-medium mb-2 block">מחלקה</Label>
                <Select value={filters.department} onValueChange={(value) => onFilterChange('department', value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="כל המחלקות" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">כל המחלקות</SelectItem>
                        <SelectItem value="floor">🍽️ סידור פלור</SelectItem>
                        <SelectItem value="kitchen">👨‍🍳 סידור מטבח</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* פילטר עובד ספציפי */}
            <div>
                <Label className="font-medium mb-2 block">עובד ספציפי</Label>
                <Select value={filters.employee} onValueChange={(value) => onFilterChange('employee', value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="כל העובדים" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">כל העובדים</SelectItem>
                        {employees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* כפתור איפוס */}
            <Button
                variant="outline"
                onClick={() => onFilterChange('reset')}
                className="w-full"
            >
                <RotateCcw className="w-4 h-4 ml-2" />
                איפוס פילטרים
            </Button>
        </div>
    );
};

// =================================================================
// Mobile View Component
// =================================================================
const MobileScheduleView = ({ week, positions, employees, onCellClick, onAssignmentClick, onAssignmentDelete, filters, currentEmployeeId, tipReports, isAdmin, strengthLabel, shiftTypesConfig = {}, hiddenPositions }) => {
    const [selectedDay, setSelectedDay] = useState(new Date());

    const weekDays = eachDayOfInterval({
        start: startOfWeek(selectedDay, { weekStartsOn: 0 }),
        end: endOfWeek(selectedDay, { weekStartsOn: 0 }),
    });

    const handlePrevWeek = () => {
        setSelectedDay(subDays(selectedDay, 7));
    };

    const handleNextWeek = () => {
        setSelectedDay(addDays(selectedDay, 7));
    };

    // canon() / POSITION_ALIASES are module-scope (shared with the desktop grid).
    const getAssignmentsFor = (day, shiftType, positionName) => {
        const dateString = format(day, 'yyyy-MM-dd');
        // AGGREGATE across ALL shifts matching date+type — older code paths can
        // produce duplicate WorkShift rows for the same day+shift, and find()
        // only returned the first one. Verified in browser console: a Mon dinner
        // shift m6xzyx had Aya, but apdfch (also Mon dinner, no Aya) was being
        // picked first → Aya invisible. Concat the staff arrays to surface
        // everyone who's actually been assigned to this slot.
        const matchingShifts = week.filter(s => s.date === dateString && s.shift_type === shiftType);
        if (!matchingShifts.length) return [];
        const allStaff = matchingShifts.flatMap(s => s.assigned_staff || []);
        // De-dupe by employee_id+position in case the same person was written
        // to both duplicate shifts.
        const seen = new Set();
        const uniqueStaff = [];
        for (const a of allStaff) {
            const key = `${a.employee_id}|${a.position}`;
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueStaff.push(a);
        }

        let filteredAssignments = uniqueStaff.filter(a => canon(a.position) === canon(positionName));

        if (filters.employee !== 'all') {
            filteredAssignments = filteredAssignments.filter(a => a.employee_id === filters.employee);
        }
        return filteredAssignments;
    };

    const isMyAssignment = (assignment) => {
        return currentEmployeeId && assignment.employee_id === currentEmployeeId;
    };

    const getMobileTipRole = (assignment, dateStr, shiftType) => {
        const report = tipReports?.find(r => r.date === dateStr && r.shift_type === shiftType);
        if (!report) return null;
        const empId = assignment.employee_id;
        if (report.closing_employee_ids?.includes(empId)) return 'closing';
        if (report.opening_employee_ids?.includes(empId)) return 'opening';
        return null;
    };

    return (
        <div className="lg:hidden bg-gray-50 pb-20">
            {/* Week Navigation */}
            <div className="sticky top-0 z-20 bg-white shadow-md p-4 mb-2">
                <div className="flex items-center justify-between mb-3">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handlePrevWeek}
                        className="flex items-center gap-1"
                    >
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-xs">שבוע קודם</span>
                    </Button>
                    
                    <div className="text-center">
                        <p className="font-bold text-sm">
                            {format(startOfWeek(selectedDay, { weekStartsOn: 0 }), 'dd/MM')} - {format(endOfWeek(selectedDay, { weekStartsOn: 0 }), 'dd/MM')}
                        </p>
                        <p className="text-xs text-gray-500">
                            {format(selectedDay, 'MMMM yyyy', { locale: he })}
                        </p>
                    </div>
                    
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleNextWeek}
                        className="flex items-center gap-1"
                    >
                        <span className="text-xs">שבוע הבא</span>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                </div>
                
                {/* מקרא */}
                <div className="flex gap-3 text-xs flex-wrap justify-center mb-2">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span> 🔴 סגירה</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block"></span> 🟣 פתיחה</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span> 👑 שלי</span>
                </div>

                {/* Day Selector */}
                <div className="flex justify-around">
                    {weekDays.map(day => (
                        <button
                            key={day.toISOString()}
                            onClick={() => setSelectedDay(day)}
                            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${format(day, 'yyyy-MM-dd') === format(selectedDay, 'yyyy-MM-dd') ? 'bg-[#F4ECD8] text-[#44512C]' : 'text-gray-600'} ${isToday(day) ? 'border-2 border-orange-400' : ''}`}
                        >
                            <span className="font-bold text-xs">{format(day, 'E', { locale: he })}</span>
                            <span className="text-xs">{format(day, 'd/M')}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Shifts for selected day */}
            <div className="p-2 space-y-4">
                {Object.entries(shiftTypesConfig)
                    .filter(([shiftKey]) => filters.shiftType === 'all' || shiftKey === filters.shiftType)
                    .map(([shiftKey, shiftConfig]) => {
                        let shiftPositions = getOrderedPositionsForShift(positions, shiftKey, { hidden: hiddenPositions, shiftPositions: shiftConfig.positions });
                        let finalFilteredPositions = filterPositionsByDepartment(shiftPositions, filters.department);

                        return (
                            <Card key={shiftKey}>
                                <CardHeader className="p-3 bg-gray-100">
                                     <CardTitle className="text-lg flex items-center gap-2">
                                         {shiftConfig.label}
                                         {isAdmin && (() => {
                                             const dateStr = format(selectedDay, 'yyyy-MM-dd');
                                             const shift = week.find(s => s.date === dateStr && s.shift_type === shiftKey);
                                             if (!shift?.assigned_staff?.length) return null;
                                             const rated = shift.assigned_staff
                                                 .map(a => employees.find(e => e.id === a.employee_id)?.manager_quality_rating || 0)
                                                 .filter(r => r > 0);
                                             if (!rated.length) return null;
                                             const avg = (rated.reduce((s, r) => s + r, 0) / rated.length).toFixed(1);
                                             const lbl = strengthLabel(avg);
                                             return lbl ? (
                                                 <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${lbl.color}`}>
                                                     {lbl.text} ({avg}/5)
                                                 </span>
                                             ) : null;
                                         })()}
                                     </CardTitle>
                                 </CardHeader>
                                <CardContent className="p-3 space-y-4">
                                    {finalFilteredPositions.map(position => (
                                        <div key={position.id}>
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="font-semibold border-b-2 border-orange-300 pb-1 ">{position.position_name}</h3>
                                            </div>
                                            <div className="space-y-2">
                                                             {getAssignmentsFor(selectedDay, shiftKey, position.position_name).map(assignment => {
                                                                 const dateStr = format(selectedDay, 'yyyy-MM-dd');
                                                                 const tipRole = getMobileTipRole(assignment, dateStr, shiftKey);
                                                                 let cardClass = 'bg-[#F4ECD8] text-[#2E3819]';
                                                                 if (isMyAssignment(assignment)) {
                                                                     cardClass = 'bg-gradient-to-r from-green-400 to-yellow-400 text-gray-900 font-bold shadow-lg border-2 border-yellow-500';
                                                                 } else if (tipRole === 'closing') {
                                                                     cardClass = 'bg-red-100 text-red-800 border border-red-300';
                                                                 } else if (tipRole === 'opening') {
                                                                     cardClass = 'bg-[#F4ECD8] text-[#7A3722] border border-[#D9BD83]';
                                                                 }
                                                                 return (
                                                                 <div
                                                                     key={assignment.employee_id}
                                                                     className={`p-2 rounded-lg cursor-pointer flex justify-between items-center gap-1 ${cardClass}`}
                                                                     onClick={() => onAssignmentClick(selectedDay, shiftKey, position.position_name, assignment)}
                                                                 >
                                                                     <span className="truncate flex items-center gap-1">
                                                                         {isMyAssignment(assignment) && <Crown className="w-4 h-4 text-yellow-700" />}
                                                                         {tipRole === 'closing' && <span className="text-xs">🔴</span>}
                                                                         {tipRole === 'opening' && <span className="text-xs">🟣</span>}
                                                                         {assignment.employee_name}
                                                                     </span>
                                                                     <span className="flex items-center gap-1.5 flex-shrink-0">
                                                                         <span className="text-sm">{assignment.start_time} - {assignment.end_time}</span>
                                                                         {isAdmin && onAssignmentDelete && (
                                                                             <button
                                                                                 onClick={(e) => { e.stopPropagation(); onAssignmentDelete(selectedDay, shiftKey, position.position_name, assignment); }}
                                                                                 className="text-red-500 hover:text-red-700"
                                                                                 title="הסר שיבוץ"
                                                                             >
                                                                                 <X className="w-4 h-4" />
                                                                             </button>
                                                                         )}
                                                                     </span>
                                                                 </div>
                                                                 );
                                                             })}
                                                <Button
                                                    variant="outline"
                                                    className="w-full h-9"
                                                    onClick={() => onCellClick(selectedDay, shiftKey, position.position_name)}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        );
                    })}
            </div>
        </div>
    );
};


// =================================================================
// Schedule Settings — per-tenant shifts + which positions to show
// =================================================================
function ScheduleSettingsDialog({ open, onClose, initialShifts, initialHidden, allPositions, onSave }) {
    const [shifts, setShifts] = useState([]);
    const [hidden, setHidden] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            const base = (Array.isArray(initialShifts) && initialShifts.length ? initialShifts : DEFAULT_SHIFTS);
            setShifts(base.map(s => ({ key: s.key || ('s' + Math.floor(Math.random() * 1e9)), label: s.label || '', start: s.start || '12:00', end: s.end || '23:00' })));
            setHidden(Array.isArray(initialHidden) ? [...initialHidden] : []);
        }
    }, [open, initialShifts, initialHidden]);

    const updateShift = (i, field, val) => setShifts(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
    const addShift = () => setShifts(prev => [...prev, { key: 's' + Date.now(), label: 'משמרת חדשה', start: '08:00', end: '16:00' }]);
    const removeShift = (i) => setShifts(prev => prev.filter((_, idx) => idx !== i));
    const toggleHidden = (name) => setHidden(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

    const uniqueNames = [...new Set((allPositions || []).map(p => p.position_name).filter(Boolean))];

    const save = async () => {
        setSaving(true);
        const cleanShifts = shifts
            .filter(s => s.label && s.label.trim())
            .map(s => ({ key: s.key, label: s.label.trim(), start: s.start || '12:00', end: s.end || '23:00' }));
        try { await onSave({ shifts: cleanShifts, hidden_positions: hidden }); } finally { setSaving(false); onClose(); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
                <DialogHeader><DialogTitle>⚙️ הגדרות סידור עבודה</DialogTitle></DialogHeader>
                <div className="space-y-5 py-2">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <Label className="font-bold">המשמרות שלך</Label>
                            <Button size="sm" variant="outline" onClick={addShift}><Plus className="w-4 h-4 ml-1" /> הוסף משמרת</Button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">הגדר את המשמרות של העסק — בוקר / צהריים / ערב / לילה, עם שעות.</p>
                        <div className="space-y-2">
                            {shifts.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Input value={s.label} onChange={e => updateShift(i, 'label', e.target.value)} placeholder="שם המשמרת" className="flex-1" />
                                    <Input type="time" value={s.start || ''} onChange={e => updateShift(i, 'start', e.target.value)} className="w-24" />
                                    <Input type="time" value={s.end || ''} onChange={e => updateShift(i, 'end', e.target.value)} className="w-24" />
                                    <Button size="icon" variant="ghost" onClick={() => removeShift(i)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label className="font-bold">תפקידים בסידור</Label>
                        <p className="text-xs text-gray-500 mb-2">בטל סימון כדי להסתיר תפקיד מהסידור (למשל כפילויות שאתה לא צריך).</p>
                        <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto">
                            {uniqueNames.map(name => (
                                <label key={name} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" checked={!hidden.includes(name)} onChange={() => toggleHidden(name)} />
                                    <span className={hidden.includes(name) ? 'line-through text-gray-400' : ''}>{name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


// =================================================================
// Main Component
// =================================================================
export default function WorkScheduling() {
    const [week, setWeek] = useState([]);
    const [positions, setPositions] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const initialLoadedRef = useRef(false); // first load blanks the page; refreshes don't
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isQuickAssignOpen, setIsQuickAssignOpen] = useState(false);
    const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
    const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
    const [isAssignmentEditorOpen, setIsAssignmentEditorOpen] = useState(false);
    const [dialogContext, setDialogContext] = useState(null);
    const [selectedAssignment, setSelectedAssignment] = useState(null);

    // Filter states
    const [filters, setFilters] = useState({ shiftType: 'all', department: 'all', employee: 'all' });

    // Per-tenant schedule config (dynamic shifts + hidden positions). Shadows the
    // module-level `shiftTypesConfig` within this component so both render loops
    // and MobileScheduleView use the tenant's shifts.
    const [scheduleCfg, setScheduleCfg] = useState(null);
    const [showScheduleSettings, setShowScheduleSettings] = useState(false);
    const shiftTypesConfig = useMemo(() => buildShiftConfig(scheduleCfg?.shifts), [scheduleCfg]);
    const hiddenPositions = useMemo(
        () => new Set(Array.isArray(scheduleCfg?.hidden_positions) ? scheduleCfg.hidden_positions : []),
        [scheduleCfg],
    );

    // Department managers (e.g. kitchen manager) get admin-equivalent powers
    // here, but the page UI auto-scopes them to their department further below.
    const managedDept = currentUser?.managed_department || null;
    const isAdminLike = currentUser?.role === 'admin' || currentUser?.role === 'owner' || !!managedDept;

    // Once we know this user manages a department, force the department filter
    // to it and don't let them switch (the Select is also disabled below).
    useEffect(() => {
      if (managedDept && filters.department !== managedDept) {
        setFilters(f => ({ ...f, department: managedDept }));
      }
    }, [managedDept]); // eslint-disable-line react-hooks/exhaustive-deps
    const [copied, setCopied] = useState(false);
    const [managerPhone, setManagerPhone] = useState('');
    const [managerPhoneInput, setManagerPhoneInput] = useState('');
    const [phoneSettingOpen, setPhoneSettingOpen] = useState(false);
    const [restaurantProfileId, setRestaurantProfileId] = useState(null);
    const [moveShiftDialog, setMoveShiftDialog] = useState(null); // { shift }
    const [moveShiftDate, setMoveShiftDate] = useState('');
    const [clearDialog, setClearDialog] = useState(false);
    const [clearDepartment, setClearDepartment] = useState('all');
    const [clearScope, setClearScope] = useState('week'); // 'week' | specific date string
    const [undoSnapshot, setUndoSnapshot] = useState(null); // { shiftsBackup: [{id, assigned_staff}] }
    const [editHistory, setEditHistory] = useState([]); // שמורת שינויים בודדים
    const [lastEditedShift, setLastEditedShift] = useState(null); // מידע על השינוי האחרון
    const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
    const [tipReports, setTipReports] = useState([]); // לזיהוי פתיחה/סגירה
    const [ratingDialog, setRatingDialog] = useState(null); // { employee }
    const [availabilities, setAvailabilities] = useState([]);
    // Clock-in lookup: Map<"employee_id|YYYY-MM-DD", ShiftTracking record>
    // Built once on load. Used to overlay "no-show" badges on scheduled cells
    // when shift_type matches but no matching clock-in exists for that date.
    const [clockIns, setClockIns] = useState(new Map());

    const handleCopyAvailabilityLink = () => {
        const url = `${window.location.origin}/AvailabilityForm`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const weekInterval = {
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 })
    };
    const days = eachDayOfInterval(weekInterval);

    const loadScheduleData = useCallback(async () => {
        // Full-page spinner ONLY on the first load. Later refreshes (after an
        // assign/edit/delete) update the data in place so the page doesn't blank
        // and the scroll doesn't jump back to the top mid-work.
        if (!initialLoadedRef.current) setLoading(true);
        try {
            // Load current user
            const user = await base44.auth.me();
            setCurrentUser(user);

            // Find employee by email
            const allEmployees = await base44.entities.Employee.filter({});
            
            // Safe email comparison with null checks
            const myEmployee = allEmployees.find(emp => {
                if (!emp.email || !user.email) return false;
                return emp.email.toLowerCase() === user.email.toLowerCase();
            });
            
            setCurrentEmployee(myEmployee);

            const [shifts, allPositions, allTipReports, allAvailabilities, allTracks, schedCfg] = await Promise.all([
                // The '-date' orderBy on this endpoint sorts ascending (proven via
                // a direct API probe in browser console: limit=100 returned the
                // OLDEST 100 shifts, latest date 2026-04-06; with no limit there
                // were 252 total reaching 2026-06-27). With a 100-cap the upcoming
                // week's shifts never made it into `week` and the grid showed
                // empty cells even when assignments existed in the DB. Pull a
                // wider window and let the client-side date filter pick the week.
                base44.entities.WorkShift.list('-date', 2000),
                base44.entities.WorkPosition.filter({ is_active: true }),
                base44.entities.TipReport.list('-date', 200),
                base44.entities.EmployeeAvailability.list(),
                // Clock-ins of past 14 days — enough for the visible week + a buffer
                base44.entities.ShiftTracking.list('-shift_start', 300).catch(() => []),
                base44.functions.getScheduleConfig({}).then(r => r?.data || r || {}).catch(() => ({})),
            ]);
            setScheduleCfg(schedCfg || {});
            // Build clock-in lookup: key = "employee_id|YYYY-MM-DD"
            const cMap = new Map();
            for (const t of (allTracks || [])) {
                const dateKey = (typeof t.date === 'string' ? t.date : new Date(t.date).toISOString()).slice(0, 10);
                cMap.set(`${t.employee_id}|${dateKey}`, t);
            }
            setClockIns(cMap);
            // Normalize date fields once — API returns ISO strings post-migration
            // but every comparison site below uses YYYY-MM-DD form.
            const sliceDate = (x) => (typeof x === 'string' ? x.slice(0, 10) : x);
            setTipReports(allTipReports.map(r => ({ ...r, date: sliceDate(r.date) })));
            setAvailabilities(allAvailabilities.map(a => ({ ...a, date: sliceDate(a.date) })));

            // סנכרן שמות עובדים בשיבוצים עם הנתונים הנוכחיים
            const employeeMap = Object.fromEntries(allEmployees.map(e => [e.id, e.full_name]));
            const syncedShifts = shifts.map(shift => ({
                ...shift,
                // After the DateTime migration the API returns ISO strings here
                // ("YYYY-MM-DDTHH:mm:ss.sssZ"); every grid comparison below uses
                // YYYY-MM-DD form, so normalize once at load.
                date: typeof shift.date === 'string' ? shift.date.slice(0, 10) : shift.date,
                assigned_staff: (shift.assigned_staff || []).map(assignment => ({
                    ...assignment,
                    employee_name: employeeMap[assignment.employee_id] || assignment.employee_name
                }))
            }));

            setWeek(syncedShifts);
            setPositions(allPositions);
            setEmployees(allEmployees);
        } catch (error) {
            console.error("Error loading schedule data:", error);
        } finally {
            initialLoadedRef.current = true;
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadScheduleData();
        base44.entities.RestaurantProfile.list().then(list => {
            if (list.length > 0) {
                setManagerPhone(list[0].manager_whatsapp_phone || '');
                setManagerPhoneInput(list[0].manager_whatsapp_phone || '');
                setRestaurantProfileId(list[0].id);
            }
        }).catch(() => {});
    }, [loadScheduleData]);

    const handleSaveManagerPhone = async () => {
        if (restaurantProfileId) {
            await base44.entities.RestaurantProfile.update(restaurantProfileId, { manager_whatsapp_phone: managerPhoneInput });
        } else {
            const created = await base44.entities.RestaurantProfile.create({ restaurant_name: 'TOP APOLLO', manager_whatsapp_phone: managerPhoneInput });
            setRestaurantProfileId(created.id);
        }
        setManagerPhone(managerPhoneInput);
        setPhoneSettingOpen(false);
    };

    const getShiftFor = (date, type) => {
        const dateString = format(date, 'yyyy-MM-dd');
        return week.find(s => s.date === dateString && s.shift_type === type);
    };

    const handleQuickAssign = (day, shiftType, positionName) => {
        setDialogContext({ date: day, shiftType, positionName });
        setIsQuickAssignOpen(true);
    };

    const handleEditAssignment = (day, shiftType, positionName, assignment) => {
        setSelectedAssignment({ ...assignment, date: day, shift_type: shiftType, position: positionName });
        setIsAssignmentEditorOpen(true);
    };

    // Remove a single assignment straight from its card (no edit dialog).
    const quickDeleteAssignment = (day, shiftType, positionName, assignment) => {
        if (!window.confirm(`להסיר את ${assignment.employee_name} מהשיבוץ?`)) return;
        handleAssignmentDelete({ ...assignment, date: day, shift_type: shiftType, position: positionName });
    };

    const handleEditShift = (shift) => {
        setDialogContext({ shift });
        setIsShiftEditorOpen(true);
    };

    // Bulk assign one employee across the week — each selection carries its own
    // shift, hours and role. For each, find-or-create the WorkShift and add the
    // employee. The shift WINDOW uses the shift config; the assignment gets the
    // per-shift custom start/end + role.
    const handleBulkAssign = async ({ employee_id, selections }) => {
        const employee = employees.find(e => e.id === employee_id);
        if (!employee || !selections?.length) return;
        let created = 0, skipped = 0;
        for (const sel of selections) {
            try {
                const { date, shiftType } = sel;
                const dateString = format(date, 'yyyy-MM-dd');
                const cfgStart = shiftTypesConfig[shiftType]?.start || (shiftType === 'lunch' ? '12:00' : '17:00');
                const cfgEnd = shiftTypesConfig[shiftType]?.end || (shiftType === 'lunch' ? '17:00' : '23:00');
                const start = sel.start || cfgStart;
                const end = sel.end || cfgEnd;
                const position = canon(sel.position || 'עובד');
                let shift = getShiftFor(date, shiftType);
                if (!shift) {
                    shift = await base44.entities.WorkShift.create({
                        date: dateString, shift_type: shiftType, start_time: cfgStart, end_time: cfgEnd,
                        assigned_staff: [], positions_needed: {},
                    });
                }
                const updatedStaff = [...(shift.assigned_staff || [])];
                if (updatedStaff.some(a => a.employee_id === employee_id && a.position === position)) { skipped++; continue; }
                updatedStaff.push({
                    employee_id, employee_name: employee.full_name, position,
                    start_time: start, end_time: end,
                    breaks: [], notes: '', had_meal: false, meal_details: '', total_break_minutes: 0,
                });
                await base44.entities.WorkShift.update(shift.id, { assigned_staff: updatedStaff });
                created++;
            } catch (e) {
                console.error('bulk assign row failed', e);
            }
        }
        await loadScheduleData();
        alert(`שובץ ${employee.full_name}: ${created} משמרות${skipped ? ` (${skipped} כבר היו קיימות)` : ''}.`);
    };

    const handleQuickAssignAction = async (assignmentData) => {
        if (!dialogContext) return;
        const { date, shiftType, positionName } = dialogContext;
        const dateString = format(date, 'yyyy-MM-dd');

        let shift = getShiftFor(date, shiftType);

        try {
            if (!shift) {
                const newShiftData = {
                    date: dateString,
                    shift_type: shiftType,
                    start_time: shiftTypesConfig[shiftType]?.start || (shiftType === 'lunch' ? '12:00' : '17:00'),
                    end_time: shiftTypesConfig[shiftType]?.end || (shiftType === 'lunch' ? '17:00' : '23:00'),
                    assigned_staff: [],
                    positions_needed: {}
                };
                shift = await base44.entities.WorkShift.create(newShiftData);
            }

            let updatedStaff = [...(shift.assigned_staff || [])];

            const employee = employees.find(e => e.id === assignmentData.employee_id);
            if (!employee) {
                alert("שגיאה: העובד לא נמצא.");
                setIsQuickAssignOpen(false);
                setDialogContext(null);
                return;
            }

            const newAssignment = {
                ...assignmentData,
                position: canon(assignmentData.position),
                employee_name: employee.full_name,
                breaks: [],
                notes: '',
                had_meal: false,
                meal_details: '',
                total_break_minutes: 0,
            };

            if (!updatedStaff.some(a => a.employee_id === newAssignment.employee_id && a.position === newAssignment.position)) {
                updatedStaff.push(newAssignment);
            } else {
                alert("העובד כבר משובץ לתפקיד זה במשמרת זו.");
                setIsQuickAssignOpen(false);
                setDialogContext(null);
                return;
            }

            await base44.entities.WorkShift.update(shift.id, { assigned_staff: updatedStaff });

            setIsQuickAssignOpen(false);
            setDialogContext(null);
            await loadScheduleData();
        } catch (error) {
            console.error("Error creating assignment:", error);
            alert("שגיאה ביצירת השיבוץ");
        }
    };

    const handleAssignmentSave = async (updatedAssignmentData) => {
        setIsAssignmentEditorOpen(false);
        // Persist the role canonically so a feminine name ('מלצרית') is stored as
        // 'מלצר' and matches the schedule everywhere (not just at display time).
        updatedAssignmentData = { ...updatedAssignmentData, position: canon(updatedAssignmentData.position) };

        if (!selectedAssignment) {
            console.error("Original assignment context is missing.");
            alert("שגיאה: לא נמצא השיבוץ המקורי לעדכון.");
            setSelectedAssignment(null);
            return;
        }

        const originalAssignment = selectedAssignment;
        const assignmentDate = new Date(originalAssignment.date);
        const dateString = format(assignmentDate, 'yyyy-MM-dd');

        const targetShift = week.find(s =>
            s.date === dateString &&
            s.shift_type === originalAssignment.shift_type
        );

        if (!targetShift) {
            console.error("Could not find shift for assignment update.");
            alert("שגיאה: לא נמצאה המשמרת לעדכון השיבוץ.");
            setSelectedAssignment(null);
            return;
        }

        let updatedStaff;

        if (originalAssignment.position !== updatedAssignmentData.position || originalAssignment.employee_id !== updatedAssignmentData.employee_id) {
            let staffAfterRemoval = targetShift.assigned_staff.filter(staff =>
                !(staff.employee_id === originalAssignment.employee_id && staff.position === originalAssignment.position)
            );

            const isDuplicate = staffAfterRemoval.some(a =>
                a.employee_id === updatedAssignmentData.employee_id &&
                a.position === updatedAssignmentData.position
            );

            if (isDuplicate) {
                alert("העובד כבר משובץ לתפקיד זה במשמרת זו.");
                setSelectedAssignment(null);
                return;
            }

            updatedStaff = [...staffAfterRemoval, updatedAssignmentData];
        } else {
            updatedStaff = targetShift.assigned_staff.map(staff =>
                (staff.employee_id === originalAssignment.employee_id && staff.position === originalAssignment.position)
                    ? updatedAssignmentData
                    : staff
            );
        }

        try {
            // שמור היסטוריה לundo
            setEditHistory([...editHistory, {
                shiftId: targetShift.id,
                oldStaff: targetShift.assigned_staff,
                newStaff: updatedStaff,
                timestamp: Date.now()
            }]);
            setLastEditedShift({
                shiftId: targetShift.id,
                employeeName: originalAssignment.employee_name,
                oldPosition: originalAssignment.position,
                newPosition: updatedAssignmentData.position
            });

            await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: updatedStaff });
            await loadScheduleData();
        } catch (error) {
            console.error("Error saving assignment:", error);
            alert("שגיאה בשמירת השינויים.");
        } finally {
            setSelectedAssignment(null);
        }
    };

    const handleUndoLastEdit = async () => {
        if (editHistory.length === 0) return;
        
        const lastEdit = editHistory[editHistory.length - 1];
        try {
            await base44.entities.WorkShift.update(lastEdit.shiftId, { assigned_staff: lastEdit.oldStaff });
            setEditHistory(editHistory.slice(0, -1));
            setLastEditedShift(null);
            await loadScheduleData();
        } catch (error) {
            console.error("Error undoing edit:", error);
            alert("שגיאה בשחזור השינוי");
        }
    };

    const handleAssignmentDelete = async (assignmentToDelete) => {
        setIsAssignmentEditorOpen(false);

        const assignmentDate = new Date(assignmentToDelete.date);
        const dateString = format(assignmentDate, 'yyyy-MM-dd');

        // Match by canon(position) on BOTH sides: the card passes the canonical
        // ROW name ("מלצר") while the stored assignment may be a feminine/variant
        // ("מלצרית") — an exact compare misses it and the delete "can't find" the
        // shift. canon() unifies them.
        const samePerson = (a) => a.employee_id === assignmentToDelete.employee_id && canon(a.position) === canon(assignmentToDelete.position);
        let targetShift = null;
        for (const s of week) {
            if (s.date === dateString && s.shift_type === assignmentToDelete.shift_type && s.assigned_staff?.some(samePerson)) {
                targetShift = s;
                break;
            }
        }

        if (!targetShift) {
            console.error("Could not find shift for assignment deletion.");
            alert("שגיאה: לא נמצאה המשמרת למחיקת השיבוץ.");
            return;
        }

        const updatedStaff = targetShift.assigned_staff.filter(staff => !samePerson(staff));

        try {
            await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: updatedStaff });
            await loadScheduleData();
        } catch (error) {
            console.error("Error deleting assignment:", error);
            alert("שגיאה במחיקת השיבוץ.");
        } finally {
            setSelectedAssignment(null);
        }
    };

    const handleShiftEditorSave = async (updatedShiftData) => {
        if (!dialogContext || !dialogContext.shift) return;
        try {
            await base44.entities.WorkShift.update(dialogContext.shift.id, updatedShiftData);
            setIsShiftEditorOpen(false);
            setDialogContext(null);
            await loadScheduleData();
        } catch (error) {
            console.error("Error saving shift details:", error);
            alert("שגיאה בשמירת פרטי המשמרת");
        }
    };

    const handlePrevWeek = () => {
        setCurrentDate(subDays(currentDate, 7));
    };

    const handleNextWeek = () => {
        setCurrentDate(addDays(currentDate, 7));
    };

    const handleFilterChange = (filterType, value) => {
        if (filterType === 'reset') {
            setFilters({ shiftType: 'all', department: 'all', employee: 'all' });
        } else {
            setFilters(prev => ({ ...prev, [filterType]: value }));
        }
    };

    const isFilterActive = filters.shiftType !== 'all' || filters.department !== 'all' || filters.employee !== 'all';

    // Save the per-tenant schedule config (shifts + hidden positions) and refresh.
    const handleSaveScheduleConfig = async (cfg) => {
        await base44.functions.setScheduleConfig(cfg);
        const r = await base44.functions.getScheduleConfig({}).then(x => x?.data || x || {}).catch(() => ({}));
        setScheduleCfg(r);
    };

    const handleMoveShift = async () => {
        if (!moveShiftDialog || !moveShiftDate) return;
        try {
            await base44.entities.WorkShift.update(moveShiftDialog.shift.id, { date: moveShiftDate });
            setMoveShiftDialog(null);
            setMoveShiftDate('');
            await loadScheduleData();
        } catch (e) {
            alert('שגיאה בהעברת המשמרת');
        }
    };

    const handleClearAssignments = async () => {
        const positionsToClear = clearDepartment === 'all' ? null : DEPARTMENT_DEFINITIONS[clearDepartment]?.positionNames;

        // Determine which shifts to clear: only the currently displayed week (days array), and optionally a specific day
        const currentWeekDates = days.map(d => format(d, 'yyyy-MM-dd'));
        const shiftsToProcess = week.filter(s => {
            if (!currentWeekDates.includes(s.date)) return false;
            if (clearScope !== 'week' && s.date !== clearScope) return false;
            return true;
        });

        // Save snapshot for undo
        const snapshot = shiftsToProcess.map(s => ({ id: s.id, date: s.date, assigned_staff: s.assigned_staff || [] }));
        setUndoSnapshot(snapshot);

        try {
            const updates = shiftsToProcess.map(shift => {
                const newStaff = positionsToClear
                    ? (shift.assigned_staff || []).filter(a => !positionsToClear.includes(a.position))
                    : [];
                return base44.entities.WorkShift.update(shift.id, { assigned_staff: newStaff });
            });
            await Promise.all(updates);
            setClearDialog(false);
            await loadScheduleData();
        } catch (e) {
            alert('שגיאה בניקוי השיבוצים');
        }
    };

    const handleUndoClear = async () => {
        if (!undoSnapshot) return;
        try {
            await Promise.all(undoSnapshot.map(s => base44.entities.WorkShift.update(s.id, { assigned_staff: s.assigned_staff })));
            setUndoSnapshot(null);
            await loadScheduleData();
        } catch (e) {
            alert('שגיאה בשחזור השיבוצים');
        }
    };

    const isMyAssignment = (assignment) => {
        return currentEmployee && assignment.employee_id === currentEmployee.id;
    };

    // חוזק משמרת: ממוצע דירוגי העובדים המשובצים ביום ומשמרת מסוימים
    const getShiftStrength = (day, shiftType) => {
        const shift = getShiftFor(day, shiftType);
        if (!shift?.assigned_staff?.length) return null;
        const rated = shift.assigned_staff
            .map(a => employees.find(e => e.id === a.employee_id)?.manager_quality_rating || 0)
            .filter(r => r > 0);
        if (!rated.length) return null;
        return (rated.reduce((s, r) => s + r, 0) / rated.length).toFixed(1);
    };

    const strengthLabel = (avg) => {
        if (!avg) return null;
        const n = parseFloat(avg);
        if (n >= 4.5) return { text: 'חזקה מאוד 💪', color: 'text-green-700 bg-green-50' };
        if (n >= 3.5) return { text: 'חזקה 👍', color: 'text-[#44512C] bg-[#F4ECD8]' };
        if (n >= 2.5) return { text: 'בינונית 😐', color: 'text-yellow-700 bg-[#FAF5E8]' };
        return { text: 'חלשה ⚠️', color: 'text-red-700 bg-red-50' };
    };

    // זיהוי פתיחה/סגירה לפי TipReport — לפי הבחירה הידנית של המנהל
    const getAssignmentTipRole = (assignment, dateStr, shiftType) => {
        const report = tipReports.find(r => r.date === dateStr && r.shift_type === shiftType);
        if (!report) return null;
        const empId = assignment.employee_id;
        if (report.closing_employee_ids?.includes(empId)) return 'closing';
        if (report.opening_employee_ids?.includes(empId)) return 'opening';
        return null;
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <div className="p-4 md:p-6" dir="rtl">
            {/* Undo banners */}
            {lastEditedShift && (
                <div className="mb-4 flex items-center justify-between bg-[#F4ECD8] border border-[#D9BD83] rounded-lg px-4 py-3">
                    <span className="text-[#2E3819] font-medium text-sm">
                        🔄 שינוי אחרון: {lastEditedShift.employeeName} - מ"{lastEditedShift.oldPosition}" ל"{lastEditedShift.newPosition}"
                    </span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-blue-400 text-[#44512C] hover:bg-[#F4ECD8]" onClick={handleUndoLastEdit}>
                            <RotateCcw className="w-4 h-4 ml-1" />
                            ביטול שינוי אחרון
                        </Button>
                        <Button size="sm" variant="ghost" className="text-[#44512C]" onClick={() => setLastEditedShift(null)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {undoSnapshot && (
                <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                    <span className="text-amber-800 font-medium text-sm">השיבוצים נמחקו. ניתן לשחזר תוך כמה שניות.</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100" onClick={handleUndoClear}>
                            <RotateCcw className="w-4 h-4 ml-1" />
                            שחזור
                        </Button>
                        <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => setUndoSnapshot(null)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* בחר הלבוש - מודגש וזעיר */}
            {currentEmployee && (
                <div className="mb-4 p-3 bg-gradient-to-r from-[#F4ECD8] to-[#F4ECD8] rounded-lg border-2 border-purple-200">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">🎨 התאימו את הדמות שלכם</h3>
                    <ApparelCustomizer 
                        employeeId={currentEmployee.id}
                        employeeAvatar={currentEmployee.avatar_url}
                        onAvatarUpdate={async (newUrl) => {
                            await base44.entities.Employee.update(currentEmployee.id, { avatar_url: newUrl });
                        }}
                        balance={0}
                    />
                </div>
            )}

            {/* Filters - for desktop */}
            <div className="hidden lg:block">
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="w-5 h-5" />
                            סינון תצוגה
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {currentEmployee && (
                                <div>
                                    <Label className="font-medium mb-2 block">תצוגה מהירה</Label>
                                    <Button
                                        variant={filters.employee === currentEmployee.id ? "default" : "outline"}
                                        onClick={() => handleFilterChange('employee', filters.employee === currentEmployee.id ? 'all' : currentEmployee.id)}
                                        className="w-full"
                                    >
                                        <Crown className="w-4 h-4 ml-2" />
                                        📌 המשמרות שלי בלבד
                                    </Button>
                                </div>
                            )}
                            <div>
                                <Label className="font-medium mb-2 block">סוג משמרת</Label>
                                <Select value={filters.shiftType} onValueChange={(value) => handleFilterChange('shiftType', value)}>
                                    <SelectTrigger><SelectValue placeholder="כל המשמרות" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל המשמרות</SelectItem>
                                        <SelectItem value="lunch">צהריים</SelectItem>
                                        <SelectItem value="dinner">ערב</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="font-medium mb-2 block">מחלקה {managedDept && <span className="text-xs text-gray-400 mr-1">(נעול למחלקה שלך)</span>}</Label>
                                <Select value={filters.department} onValueChange={(value) => handleFilterChange('department', value)} disabled={!!managedDept}>
                                    <SelectTrigger><SelectValue placeholder="כל המחלקות" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל המחלקות</SelectItem>
                                        <SelectItem value="floor">סידור פלור</SelectItem>
                                        <SelectItem value="kitchen">סידור מטבח</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="font-medium mb-2 block">עובד</Label>
                                <Select value={filters.employee} onValueChange={(value) => handleFilterChange('employee', value)}>
                                    <SelectTrigger><SelectValue placeholder="כל העובדים" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל העובדים</SelectItem>
                                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-end">
                                <Button variant="outline" onClick={() => handleFilterChange('reset')} className="w-full">
                                    <RotateCcw className="w-4 h-4 ml-2" />
                                    נקה הכל
                                </Button>
                            </div>
                        </div>
                        {isFilterActive && (
                            <div className="mt-4 flex gap-2 flex-wrap">
                                {filters.shiftType !== 'all' && <Badge variant="secondary" className="cursor-pointer" onClick={() => handleFilterChange('shiftType', 'all')}>משמרת: {shiftTypesConfig[filters.shiftType]?.label} <X className="w-3 h-3 mr-1" /></Badge>}
                                {filters.department !== 'all' && <Badge variant="secondary" className="cursor-pointer" onClick={() => handleFilterChange('department', 'all')}>מחלקה: {DEPARTMENT_DEFINITIONS[filters.department]?.name} <X className="w-3 h-3 mr-1" /></Badge>}
                                {filters.employee !== 'all' && <Badge variant="secondary" className="cursor-pointer" onClick={() => handleFilterChange('employee', 'all')}>עובד: {employees.find(e => e.id === filters.employee)?.full_name} <X className="w-3 h-3 mr-1" /></Badge>}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="hidden lg:block">
                <CardHeader>
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <CardTitle className="flex items-center gap-2">
                            <CalendarIcon className="w-6 h-6" />
                            סידור עבודה
                            {isAdminLike && (
                                <>
                                    <ShiftNotificationBell currentEmployee={currentEmployee} isManager={true} />
                                    <button
                                        onClick={() => setPhoneSettingOpen(true)}
                                        title="הגדר מספר WhatsApp לקבלת התראות"
                                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <span className="text-lg">💬</span>
                                    </button>
                                </>
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Button variant="outline" onClick={handlePrevWeek}><ChevronRight className="w-4 h-4 ml-2" /> שבוע קודם</Button>
                            <span className="font-semibold text-lg whitespace-nowrap">
                                {format(weekInterval.start, 'dd/MM')} - {format(weekInterval.end, 'dd/MM/yyyy')}
                            </span>
                            <Button variant="outline" onClick={handleNextWeek}>שבוע הבא <ChevronLeft className="w-4 h-4 mr-2" /></Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {isAdminLike && (
                                <Button onClick={() => setIsBulkAssignOpen(true)} className="bg-[#44512C] hover:bg-[#7A3722] text-white">
                                    <UserPlus className="w-4 h-4 ml-2" /> שיבוץ עובד
                                </Button>
                            )}
                            {isAdminLike && (
                                <Button variant="outline" onClick={() => setShowScheduleSettings(true)} className="border-[#D9BD83] text-[#44512C] hover:bg-[#F4ECD8]">
                                    ⚙️ הגדרות סידור
                                </Button>
                            )}
                            <Button variant="outline" onClick={handleCopyAvailabilityLink} className={copied ? "bg-green-50 border-green-400 text-green-700" : ""}>
                                {copied ? <Check className="w-4 h-4 ml-2 text-green-600" /> : <Link className="w-4 h-4 ml-2" />}
                                {copied ? "הועתק!" : "העתק לינק לזמינות"}
                            </Button>
                            <Button
                                variant="outline"
                                className="border-[#D9BD83] text-[#A04A2E] hover:bg-[#F4ECD8]"
                                onClick={async () => {
                                    if (!confirm('להעתיק את כל המשמרות מהשבוע שעבר לשבוע הזה?\nשיבוצים שכבר קיימים בשבוע הנוכחי לא ייפגעו.')) return;
                                    try {
                                        const source = format(addDays(weekInterval.start, -7), 'yyyy-MM-dd');
                                        const target = format(weekInterval.start, 'yyyy-MM-dd');
                                        const res = await base44.functions.copyShiftsFromLastWeek({ source_week_start: source, target_week_start: target });
                                        const d = res?.data || {};
                                        alert(`הועתקו ${d.created || 0} משמרות. ${d.skipped ? `${d.skipped} דולגו (כבר קיימות).` : ''}`);
                                        await loadScheduleData();
                                    } catch (e) {
                                        alert('שגיאה בהעתקה: ' + (e?.data?.message || e?.message || ''));
                                    }
                                }}
                            >
                                <Copy className="w-4 h-4 ml-2" />
                                העתק משבוע שעבר
                            </Button>
                            <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => setClearDialog(true)}>
                                <Trash2 className="w-4 h-4 ml-2" />
                                נקה שיבוצים
                            </Button>
                            <Button onClick={() => handleEditShift(null)}><Plus className="w-4 h-4 ml-2" />צור משמרת חדשה</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {/* מקרא צבעים */}
                    <div className="flex gap-3 mb-3 text-xs flex-wrap">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300 inline-block"></span> 🔴 סגירה (מניהול טיפים)</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 border border-[#D9BD83] inline-block"></span> 🟣 פתיחה (מניהול טיפים)</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-r from-green-400 to-yellow-400 inline-block"></span> 👑 המשמרת שלי</span>
                    </div>
                    <div className="grid grid-cols-[200px_repeat(7,1fr)] min-w-[1200px]">
                        <div className="sticky top-0 bg-gray-100 z-10"></div>
                        {days.map(day => {
                            const lunchStrength = isAdminLike ? strengthLabel(getShiftStrength(day, 'lunch')) : null;
                            const dinnerStrength = isAdminLike ? strengthLabel(getShiftStrength(day, 'dinner')) : null;
                            return (
                            <div key={day.toISOString()} className={`text-center font-bold p-2 border-b sticky top-0 bg-gray-100 z-10 ${isToday(day) ? 'border-2 border-orange-400' : ''}`}>
                                <div>{format(day, 'EEEE', { locale: he })}</div>
                                <div>{format(day, 'dd/MM')}</div>
                                {lunchStrength && (
                                    <div className={`text-xs font-normal mt-0.5 rounded px-1 ${lunchStrength.color}`}>
                                        צ: {lunchStrength.text}
                                    </div>
                                )}
                                {dinnerStrength && (
                                    <div className={`text-xs font-normal mt-0.5 rounded px-1 ${dinnerStrength.color}`}>
                                        ע: {dinnerStrength.text}
                                    </div>
                                )}
                            </div>
                            );
                        })}

                        {Object.entries(shiftTypesConfig)
                            .filter(([type]) => filters.shiftType === 'all' || type === filters.shiftType)
                            .map(([type, config]) => {
                                const shiftPositions = getOrderedPositionsForShift(positions, type, { hidden: hiddenPositions, shiftPositions: config.positions });
                                const finalFilteredPositions = filterPositionsByDepartment(shiftPositions, filters.department);

                                return (
                                    <React.Fragment key={type}>
                                        <div className={`col-span-8 p-2 font-bold text-center text-lg ${config.color} flex items-center justify-center gap-2`}>
                                            {config.label}
                                        </div>

                                        {finalFilteredPositions.map((position, positionIdx) => (
                                            <React.Fragment key={position.id}>
                                                <div className="flex items-center justify-between p-2 border-r border-b font-semibold bg-gray-50 sticky left-0 z-10">
                                                    <span className="truncate">{position.position_name}</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">
                                                            (
                                                            {days.reduce((total, day) => {
                                                                const s = getShiftFor(day, type);
                                                                let assignments = (s?.assigned_staff || [])
                                                                    .filter(a => canon(a.position) === canon(position.position_name));
                                                                if (filters.employee !== 'all') {
                                                                    assignments = assignments.filter(a => a.employee_id === filters.employee);
                                                                }
                                                                return total + assignments.length;
                                                            }, 0)}
                                                            )
                                                        </span>
                                                    </div>
                                                </div>
                                                {days.map(day => {
                                                    const shift = getShiftFor(day, type);
                                                    let assignments = (shift?.assigned_staff || [])
                                                        .filter(a => canon(a.position) === canon(position.position_name));

                                                    if (filters.employee !== 'all') {
                                                        assignments = assignments.filter(a => a.employee_id === filters.employee);
                                                    }

                                                    const dateStr = format(day, 'yyyy-MM-dd');
                                                    return (
                                                       <div key={day.toISOString()} className="p-2 border-b border-r min-h-[60px] space-y-1 group relative">
                                                            {shift && positionIdx === 0 && (
                                                                <button
                                                                    title="העבר משמרת לתאריך אחר"
                                                                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border rounded p-0.5 text-gray-500 hover:text-[#44512C] z-10"
                                                                    onClick={(e) => { e.stopPropagation(); setMoveShiftDialog({ shift }); setMoveShiftDate(shift.date); }}
                                                                >
                                                                    <MoveRight className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            {assignments.map(assignment => {
                                                                const tipRole = getAssignmentTipRole(assignment, dateStr, type);
                                                                const emp = employees.find(e => e.id === assignment.employee_id);
                                                                const rating = emp?.manager_quality_rating || 0;
                                                                // === No-show detection ===
                                                                // For PAST shifts (date < today, OR today + start time more than 30 min ago)
                                                                // where the employee is scheduled but no ShiftTracking exists → mark as "הבריז".
                                                                const todayStr = format(new Date(), 'yyyy-MM-dd');
                                                                const isPastDay = dateStr < todayStr;
                                                                const isTodayLate = (() => {
                                                                    if (dateStr !== todayStr) return false;
                                                                    if (!assignment.start_time) return false;
                                                                    const [sh, sm] = String(assignment.start_time).split(':').map(Number);
                                                                    const now = new Date();
                                                                    const startMin = (sh * 60) + (sm || 0);
                                                                    const nowMin = (now.getHours() * 60) + now.getMinutes();
                                                                    return nowMin > startMin + 30;
                                                                })();
                                                                const noShowEligible = isPastDay || isTodayLate;
                                                                const clockKey = `${assignment.employee_id}|${dateStr}`;
                                                                const track = clockIns.get(clockKey);
                                                                const noShow = noShowEligible && !track;
                                                                let cardClass = 'bg-[#F4ECD8] hover:bg-[#E8D9B5]';
                                                                if (noShow) {
                                                                    cardClass = 'bg-red-50 border-2 border-dashed border-red-400 hover:bg-red-100 opacity-75';
                                                                } else if (isMyAssignment(assignment)) {
                                                                    cardClass = 'bg-gradient-to-r from-green-400 to-yellow-400 text-gray-900 font-bold shadow-lg border-2 border-yellow-500 hover:shadow-xl';
                                                                } else if (tipRole === 'closing') {
                                                                    cardClass = 'bg-red-100 border border-red-300 hover:bg-red-200';
                                                                } else if (tipRole === 'opening') {
                                                                    cardClass = 'bg-[#F4ECD8] border border-[#D9BD83] hover:bg-purple-200';
                                                                }
                                                                return (
                                                                <div
                                                                    key={assignment.employee_id}
                                                                    className={`p-1 rounded text-center cursor-pointer transition-colors relative ${cardClass}`}
                                                                    onClick={() => handleEditAssignment(day, type, position.position_name, assignment)}
                                                                >
                                                                    {isAdminLike && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setRatingDialog({ employee: emp || { id: assignment.employee_id, full_name: assignment.employee_name } }); }}
                                                                            className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                            title={`דרג עובד${rating > 0 ? ` (${rating}/5)` : ''}`}
                                                                        >
                                                                            <Star className={`w-3 h-3 ${rating > 0 ? 'fill-yellow-400 text-yellow-500' : 'text-gray-400'}`} />
                                                                        </button>
                                                                    )}
                                                                    {isAdminLike && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); quickDeleteAssignment(day, type, position.position_name, assignment); }}
                                                                            className="absolute top-0.5 right-0.5 text-red-400 hover:text-red-600 z-10"
                                                                            title="הסר שיבוץ"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                    <p className="font-semibold text-sm truncate flex items-center justify-center gap-1">
                                                                        {isMyAssignment(assignment) && <Crown className="w-3 h-3 text-yellow-700" />}
                                                                        {tipRole === 'closing' && <span title="סגירה" className="text-xs">🔴</span>}
                                                                        {tipRole === 'opening' && <span title="פתיחה" className="text-xs">🟣</span>}
                                                                        {noShow && <span title="לא נכנס לשעון" className="text-xs">⚠️</span>}
                                                                        <span className={noShow ? 'line-through text-red-700' : ''}>{assignment.employee_name}</span>
                                                                    </p>
                                                                    <p className={`text-xs ${noShow ? 'text-red-700 line-through' : ''}`}>{assignment.start_time} - {assignment.end_time}</p>
                                                                    {noShow && (
                                                                        <p className="text-[10px] font-bold text-red-700 bg-red-100 rounded px-1 mt-0.5 leading-tight">
                                                                            🚫 לא נכנס לשעון
                                                                        </p>
                                                                    )}
                                                                    {assignment.notes && (
                                                                        <p className="text-xs text-orange-700 bg-orange-50 rounded px-1 mt-0.5 text-right leading-tight" title={assignment.notes}>
                                                                            📝 {assignment.notes}
                                                                        </p>
                                                                    )}

                                                                </div>
                                                                );
                                                            })}
                                                            <div
                                                                className="flex justify-center items-center h-full text-gray-400 cursor-pointer hover:bg-gray-100 rounded"
                                                                onClick={() => handleQuickAssign(day, type, position.position_name)}
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                    </div>
                </CardContent>
            </Card>

            <div className="lg:hidden">
                <MobileScheduleView
                    week={week}
                    positions={positions}
                    employees={employees}
                    filters={filters}
                    onCellClick={handleQuickAssign}
                    onAssignmentClick={handleEditAssignment}
                    onAssignmentDelete={quickDeleteAssignment}
                    currentEmployeeId={currentEmployee?.id}
                    tipReports={tipReports}
                    isAdmin={isAdminLike}
                    strengthLabel={strengthLabel}
                    shiftTypesConfig={shiftTypesConfig}
                    hiddenPositions={hiddenPositions}
                />
                {isAdminLike && (
                    <Button onClick={() => setShowScheduleSettings(true)} className="fixed bottom-36 right-4 z-20 h-14 px-4 rounded-full shadow-lg bg-[#44512C] hover:bg-[#7A3722] text-white gap-1">
                        ⚙️ הגדרות סידור
                    </Button>
                )}
                {isAdminLike && (
                    <Button onClick={() => setIsBulkAssignOpen(true)} className="fixed bottom-52 right-4 z-20 h-14 px-4 rounded-full shadow-lg bg-[#7A3722] hover:bg-[#44512C] text-white gap-1">
                        <UserPlus className="w-5 h-5" /> שיבוץ עובד
                    </Button>
                )}
                <Sheet>
                    <SheetTrigger asChild>
                        <Button className="fixed bottom-20 right-4 z-20 h-14 w-14 rounded-full shadow-lg">
                            <Filter className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>סינון תצוגה</SheetTitle>
                        </SheetHeader>
                        <div className="p-4">
                            <ScheduleFilters
                                filters={filters}
                                onFilterChange={handleFilterChange}
                                employees={employees}
                                currentEmployeeId={currentEmployee?.id}
                                shiftTypesConfig={shiftTypesConfig}
                            />
                        </div>
                    </SheetContent>
                </Sheet>
                <div className="fixed bottom-4 left-4 z-20">
                    <Button
                        onClick={() => setWhatsappDialogOpen(true)}
                        className="h-14 w-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white"
                    >
                        <MessageCircle className="h-6 w-6" />
                    </Button>
                </div>
                {isAdminLike && (
                    <div className="fixed bottom-4 right-4 z-20">
                        <ShiftNotificationBell currentEmployee={currentEmployee} isManager={true} />
                    </div>
                )}
            </div>

            {isAdminLike && (
                <ScheduleSettingsDialog
                    open={showScheduleSettings}
                    onClose={() => setShowScheduleSettings(false)}
                    initialShifts={scheduleCfg?.shifts}
                    initialHidden={scheduleCfg?.hidden_positions}
                    allPositions={positions}
                    onSave={handleSaveScheduleConfig}
                />
            )}

            {isQuickAssignOpen && (
                <QuickAssignDialog
                    isOpen={isQuickAssignOpen}
                    onOpenChange={setIsQuickAssignOpen}
                    context={dialogContext}
                    employees={employees}
                    positions={positions}
                    onAction={handleQuickAssignAction}
                />
            )}

            {isShiftEditorOpen && (
                <ShiftEditDialog
                    isOpen={isShiftEditorOpen}
                    onOpenChange={setIsShiftEditorOpen}
                    shift={dialogContext?.shift}
                    onSave={handleShiftEditorSave}
                />
            )}

            <BulkAssignDialog
                open={isBulkAssignOpen}
                onClose={() => setIsBulkAssignOpen(false)}
                employees={employees}
                positions={positions}
                days={days}
                shiftTypesConfig={shiftTypesConfig}
                onSubmit={handleBulkAssign}
            />

            {isAssignmentEditorOpen && (
                <AssignmentEditDialog
                    isOpen={isAssignmentEditorOpen}
                    onOpenChange={setIsAssignmentEditorOpen}
                    assignment={selectedAssignment}
                    employees={employees}
                    positions={positions}
                    onSave={handleAssignmentSave}
                    onDelete={handleAssignmentDelete}
                    weekDays={days}
                    availabilityNote={(() => {
                        if (!selectedAssignment) return null;
                        const dateStr = format(new Date(selectedAssignment.date), 'yyyy-MM-dd');
                        return availabilities.find(av => av.employee_id === selectedAssignment.employee_id && av.date === dateStr)?.reason || null;
                    })()}
                    onSwitchShiftType={async (assignment, newShiftType) => {
                        const dateString = format(new Date(assignment.date), 'yyyy-MM-dd');
                        const sourceShift = week.find(s => s.date === dateString && s.shift_type === assignment.shift_type);
                        if (!sourceShift) return;
                        const targetTimes = newShiftType === 'lunch' ? { start: '12:00', end: '17:00' } : { start: '17:00', end: '23:00' };
                        // Remove from source
                        const newSourceStaff = sourceShift.assigned_staff.filter(
                            a => !(a.employee_id === assignment.employee_id && a.position === assignment.position)
                        );
                        // Find or will-create target shift on SAME date but other shift_type
                        const targetShift = week.find(s => s.date === dateString && s.shift_type === newShiftType);
                        // The moved assignment gets the new shift's default times. Keep
                        // position + employee identity.
                        const moved = {
                            ...assignment,
                            start_time: targetTimes.start,
                            end_time: targetTimes.end,
                        };
                        delete moved.shift_type;
                        try {
                            await base44.entities.WorkShift.update(sourceShift.id, { assigned_staff: newSourceStaff });
                            if (targetShift) {
                                const alreadyIn = (targetShift.assigned_staff || []).some(
                                    a => a.employee_id === assignment.employee_id && a.position === assignment.position
                                );
                                if (!alreadyIn) {
                                    const newTargetStaff = [...(targetShift.assigned_staff || []), moved];
                                    await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: newTargetStaff });
                                }
                            } else {
                                await base44.entities.WorkShift.create({
                                    date: dateString,
                                    shift_type: newShiftType,
                                    start_time: targetTimes.start,
                                    end_time: targetTimes.end,
                                    assigned_staff: [moved],
                                    positions_needed: {},
                                });
                            }
                            setIsAssignmentEditorOpen(false);
                            setSelectedAssignment(null);
                            await loadScheduleData();
                        } catch (e) {
                            alert('שגיאה בהעברת השיבוץ למשמרת אחרת');
                        }
                    }}
                    onMoveShift={async (assignment, newDate) => {
                        const dateString = format(new Date(assignment.date), 'yyyy-MM-dd');
                        const sourceShift = week.find(s => s.date === dateString && s.shift_type === assignment.shift_type);
                        if (!sourceShift) return;
                        // Remove from source shift
                        const newSourceStaff = sourceShift.assigned_staff.filter(
                            a => !(a.employee_id === assignment.employee_id && a.position === assignment.position)
                        );
                        // Find or will-create target shift
                        let targetShift = week.find(s => s.date === newDate && s.shift_type === assignment.shift_type);
                        const movedAssignment = { ...assignment, date: newDate };
                        delete movedAssignment.shift_type; // don't double-store
                        try {
                            await base44.entities.WorkShift.update(sourceShift.id, { assigned_staff: newSourceStaff });
                            if (targetShift) {
                                const newTargetStaff = [...(targetShift.assigned_staff || []), { ...assignment }];
                                await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: newTargetStaff });
                            } else {
                                await base44.entities.WorkShift.create({
                                    date: newDate,
                                    shift_type: assignment.shift_type,
                                    start_time: sourceShift.start_time,
                                    end_time: sourceShift.end_time,
                                    assigned_staff: [{ ...assignment }],
                                    positions_needed: {}
                                });
                            }
                            setIsAssignmentEditorOpen(false);
                            setSelectedAssignment(null);
                            await loadScheduleData();
                        } catch (e) {
                            alert('שגיאה בהעברת השיבוץ');
                        }
                    }}
                />
            )}

            {/* Move Shift Dialog */}
            <Dialog open={!!moveShiftDialog} onOpenChange={(o) => { if (!o) setMoveShiftDialog(null); }}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MoveRight className="w-5 h-5" />
                            העבר משמרת לתאריך אחר
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-gray-600">
                            {moveShiftDialog && `משמרת ${shiftTypesConfig[moveShiftDialog.shift.shift_type]?.label} מתאריך ${moveShiftDialog.shift.date}`}
                        </p>
                        <div>
                            <label className="text-sm font-medium mb-1 block">תאריך חדש</label>
                            <Input
                                type="date"
                                value={moveShiftDate}
                                onChange={(e) => setMoveShiftDate(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setMoveShiftDialog(null)}>ביטול</Button>
                        <Button onClick={handleMoveShift} disabled={!moveShiftDate}>
                            <MoveRight className="w-4 h-4 ml-2" />
                            העבר משמרת
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manager Phone Dialog */}
            <Dialog open={phoneSettingOpen} onOpenChange={setPhoneSettingOpen}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            💬 הגדר מספר WhatsApp למנהל
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-gray-600">הכנס מספר טלפון של המנהל לקבלת התראות WhatsApp על בקשות החלפת משמרת.</p>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠️ יש לכלול קידומת מדינה, לדוגמה: <span className="font-bold">+972501234567</span></p>
                        <Input
                            placeholder="+972501234567"
                            value={managerPhoneInput}
                            onChange={e => setManagerPhoneInput(e.target.value)}
                            dir="ltr"
                        />
                        {managerPhone && <p className="text-xs text-green-700">מספר נוכחי: {managerPhone}</p>}
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setPhoneSettingOpen(false)}>ביטול</Button>
                        <Button onClick={handleSaveManagerPhone} disabled={!managerPhoneInput}>שמור</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isAdminLike && (
                <ScheduleInsights
                    week={week}
                    employees={employees}
                    tipReports={tipReports}
                />
            )}

            <SendScheduleWhatsAppDialog
                open={whatsappDialogOpen}
                onClose={() => setWhatsappDialogOpen(false)}
                week={week}
                days={days}
                availabilities={availabilities}
                onSaved={loadScheduleData}
            />

            {/* Employee Rating Dialog */}
            {ratingDialog && (
                <EmployeeRatingDialog
                    employee={ratingDialog.employee}
                    open={!!ratingDialog}
                    onClose={() => setRatingDialog(null)}
                    onSaved={(updatedEmp) => {
                        setEmployees(prev => prev.map(e => e.id === updatedEmp.id ? updatedEmp : e));
                        setRatingDialog(null);
                    }}
                />
            )}

            {/* Clear Assignments Dialog */}
            <Dialog open={clearDialog} onOpenChange={(o) => { setClearDialog(o); if (!o) { setClearScope('week'); setClearDepartment('all'); } }}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="w-5 h-5" />
                            נקה שיבוצים
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium mb-1 block">טווח מחיקה</label>
                            <Select value={clearScope} onValueChange={setClearScope}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="week">כל השבוע ({format(weekInterval.start, 'dd/MM')} - {format(weekInterval.end, 'dd/MM')})</SelectItem>
                                    {days.map(d => (
                                        <SelectItem key={format(d, 'yyyy-MM-dd')} value={format(d, 'yyyy-MM-dd')}>
                                            יום ספציפי: {format(d, 'EEEE dd/MM', { locale: he })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">מחלקה</label>
                            <Select value={clearDepartment} onValueChange={setClearDepartment}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">כל החטיבות</SelectItem>
                                    <SelectItem value="floor">🍽️ פלור בלבד</SelectItem>
                                    <SelectItem value="kitchen">👨‍🍳 מטבח בלבד</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">💡 לאחר המחיקה תופיע אפשרות שחזור מיידית.</p>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setClearDialog(false)}>ביטול</Button>
                        <Button variant="destructive" onClick={handleClearAssignments}>
                            <Trash2 className="w-4 h-4 ml-2" />
                            נקה שיבוצים
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}