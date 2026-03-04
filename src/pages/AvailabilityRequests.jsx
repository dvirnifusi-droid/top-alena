import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, Users, ChevronLeft, ChevronRight, CheckCircle2, Zap, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import PageGuard from '../components/shared/PageGuard';

const AVAILABILITY_TYPES = {
    available: { label: '✅ פנוי/ה', color: 'bg-green-100 text-green-800' },
    unavailable: { label: '❌ לא פנוי/ה', color: 'bg-red-100 text-red-800' },
    partial: { label: '⏰ חלקית', color: 'bg-yellow-100 text-yellow-800' },
    preferred_off: { label: '🙏 מעדיף לא', color: 'bg-orange-100 text-orange-800' },
};

const SHIFT_PREF = {
    lunch: 'צהריים',
    dinner: 'ערב',
    both: 'שתיהן',
};

function AvailabilityRequestsInner() {
     const [availabilities, setAvailabilities] = useState([]);
     const [employees, setEmployees] = useState([]);
     const [settings, setSettings] = useState(null);
     const [loading, setLoading] = useState(true);
     const [autoAssigning, setAutoAssigning] = useState(false);
     const [weekOffset, setWeekOffset] = useState(1); // 1 = next week, 0 = this week
     const [editingAvail, setEditingAvail] = useState(null);
     const [editData, setEditData] = useState(null);
     const [expandedUnavailable, setExpandedUnavailable] = useState(false);
     const [selectedDepartment, setSelectedDepartment] = useState(null);

    const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    useEffect(() => {
        loadData();
    }, [weekOffset]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [allAvail, allEmps, sett] = await Promise.all([
                base44.entities.EmployeeAvailability.list(),
                base44.entities.Employee.filter({ status: 'active' }),
                base44.entities.AvailabilityFormSettings.list(),
            ]);
            setAvailabilities(allAvail);
            setEmployees(allEmps);
            setSettings(sett[0] || null);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const getAvailForDay = (dateStr) => {
        return filteredAvails.filter(a => a.date === dateStr);
    };

    const getDepartmentLabel = (dept) => {
        return settings?.departments?.find(d => d.key === dept)?.label || dept;
    };

    const handleEditAvail = (avail) => {
        setEditingAvail(avail);
        setEditData({ ...avail });
        console.log('editing avail:', avail, 'settings:', settings);
    };

    const getAvailablePositions = (avail) => {
        const deptKey = avail?.department || selectedDepartment;
        const dept = settings?.departments?.find(d => d.key === deptKey);
        if (dept?.positions?.length > 0) return dept.positions;
        const all = settings?.departments?.flatMap(d => d.positions || []) || [];
        console.log('getAvailablePositions:', { deptKey, dept, all, settings });
        return all;
    };

    const handleSaveEdit = async () => {
        try {
            await base44.entities.EmployeeAvailability.update(editingAvail.id, editData);
            setAvailabilities(prev => prev.map(a => a.id === editingAvail.id ? editData : a));
            setEditingAvail(null);
            toast.success('זמינות עודכנה');
        } catch (e) {
            console.error(e);
            toast.error('שגיאה בעדכון זמינות');
        }
    };

    const handleAutoAssign = async () => {
        setAutoAssigning(true);
        try {
            let assigned = 0;

            for (const day of weekDays) {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayAvail = getAvailForDay(dateStr).filter(a =>
                    a.availability_type === 'available' || a.availability_type === 'partial'
                );

                for (const shiftType of ['lunch', 'dinner']) {
                    const eligible = dayAvail.filter(a =>
                        !a.shift_preference || a.shift_preference === 'both' || a.shift_preference === shiftType
                    );

                    if (eligible.length === 0) continue;

                    // Find or create WorkShift
                    const existingShifts = await base44.entities.WorkShift.filter({ date: dateStr, shift_type: shiftType });
                    let shift = existingShifts[0];

                    if (!shift) {
                        shift = await base44.entities.WorkShift.create({
                            date: dateStr,
                            shift_type: shiftType,
                            start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                            end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                            assigned_staff: [],
                        });
                    }

                    const currentStaff = shift.assigned_staff || [];
                    const newStaff = [...currentStaff];

                    for (const avail of eligible) {
                        // Skip if already assigned
                        const alreadyIn = currentStaff.some(s => s.employee_id === avail.employee_id);
                        if (alreadyIn) continue;

                        const emp = employees.find(e => e.id === avail.employee_id);
                        if (!emp) continue;

                        // Determine position
                        const position = avail.positions?.length > 0 ? avail.positions[0] : (emp.positions?.[0]?.position_name || 'מלצר');

                        newStaff.push({
                            employee_id: avail.employee_id,
                            employee_name: avail.employee_name || emp.full_name,
                            position,
                            start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                            end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                        });
                        assigned++;
                    }

                    if (newStaff.length !== currentStaff.length) {
                        await base44.entities.WorkShift.update(shift.id, { assigned_staff: newStaff });
                    }
                }
            }

            toast.success(`שובצו ${assigned} עובדים לסידור העבודה!`);
        } catch (e) {
            console.error(e);
            toast.error('שגיאה בשיבוץ האוטומטי');
        }
        setAutoAssigning(false);
    };

    const getFilteredAvailabilities = () => {
        if (!selectedDepartment) return availabilities;
        return availabilities.filter(a => a.department === selectedDepartment);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 animate-spin" />
        </div>
    );

    if (!selectedDepartment) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">בחר חטיבה לעדכון הזמינות</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-center text-gray-600 text-sm">
                            בחר איזו חטיבה אתה רוצה לעבוד איתה:
                        </p>
                        {settings?.departments?.map(dept => (
                            <Button
                                key={dept.key}
                                onClick={() => setSelectedDepartment(dept.key)}
                                className="w-full h-12 text-base font-semibold"
                                variant="outline"
                            >
                                {dept.label}
                            </Button>
                        ))}
                        {!settings?.departments || settings.departments.length === 0 && (
                            <p className="text-center text-red-600 text-sm">לא נמצאו חטיבות בהגדרות</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    const filteredAvails = getFilteredAvailabilities();
    const weekAvailabilities = filteredAvails.filter(a =>
        a.date >= format(weekStart, 'yyyy-MM-dd') && a.date <= format(weekEnd, 'yyyy-MM-dd')
    );

    const uniqueEmployeesSubmitted = new Set(weekAvailabilities.map(a => a.employee_id)).size;
    const currentDeptLabel = settings?.departments?.find(d => d.key === selectedDepartment)?.label;

    const groupByDepartment = (dayAvail) => {
        const grouped = {};
        dayAvail.forEach(a => {
            const dept = a.department || 'other';
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push(a);
        });
        return grouped;
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto" dir="rtl">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Users className="w-8 h-8 text-primary" />
                        בקשות זמינות - {currentDeptLabel}
                    </h1>
                    <p className="text-gray-500 mt-1">
                        שבוע {format(weekStart, 'dd/MM')} – {format(weekEnd, 'dd/MM/yyyy')} ·{' '}
                        <span className="font-semibold text-primary">{uniqueEmployeesSubmitted}</span> עובדים הגישו זמינות
                    </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDepartment(null)}>
                        חזור לבחירה
                    </Button>
                    <Button variant="outline" onClick={() => setWeekOffset(w => w - 1)}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" onClick={() => setWeekOffset(1)}>השבוע הבא</Button>
                    <Button variant="outline" onClick={() => setWeekOffset(w => w + 1)}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        onClick={handleAutoAssign}
                        disabled={autoAssigning || weekAvailabilities.length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {autoAssigning
                            ? <Loader2 className="w-4 h-4 animate-spin ml-2" />
                            : <Zap className="w-4 h-4 ml-2" />}
                        שבץ אוטומטית לסידור
                    </Button>
                </div>
            </div>

            {weekAvailabilities.length === 0 ? (
                <Card className="text-center p-12">
                    <p className="text-xl text-gray-400">אין בקשות זמינות לשבוע זה עדיין</p>
                    <p className="text-gray-400 mt-2">שלח לעובדים קישור לדף הגשת הזמינות</p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayAvail = getAvailForDay(dateStr);
                        const unavailableCount = dayAvail.filter(a => a.availability_type === 'unavailable').length;
                        const availableCount = dayAvail.filter(a => a.availability_type !== 'unavailable').length;

                        if (dayAvail.length === 0) return null;

                        return (
                            <div key={dateStr} className="space-y-3">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg">
                                            {format(day, 'EEEE', { locale: he })}{' '}
                                            <span className="text-gray-500 font-normal">{format(day, 'dd/MM')}</span>
                                            <span className="text-sm text-gray-400 font-normal mr-2">
                                                ({availableCount} פנויים)
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {Object.entries(groupByDepartment(dayAvail.filter(a => a.availability_type !== 'unavailable'))).map(([dept, deptAvails]) => (
                                            <div key={dept}>
                                                <h3 className="font-semibold text-sm text-gray-700 mb-2">{getDepartmentLabel(dept)}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {deptAvails.map(avail => {
                                                        const typeConfig = AVAILABILITY_TYPES[avail.availability_type] || AVAILABILITY_TYPES.available;
                                                        return (
                                                            <div key={avail.id} className={`p-3 rounded-lg border ${typeConfig.color.replace('text-', 'border-').replace('-800', '-300').replace('-100', '-50')}`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="font-bold">{avail.employee_name}</span>
                                                                    <div className="flex gap-1">
                                                                        <Badge className={typeConfig.color} className="text-xs">{typeConfig.label}</Badge>
                                                                        <Button size="sm" variant="ghost" onClick={() => handleEditAvail(avail)}>
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                {avail.shift_preference && avail.availability_type !== 'unavailable' && (
                                                                    <p className="text-sm text-gray-600">
                                                                        משמרת: <strong>{SHIFT_PREF[avail.shift_preference] || avail.shift_preference}</strong>
                                                                    </p>
                                                                )}
                                                                {avail.positions?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                                        {avail.positions.map(p => (
                                                                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {avail.reason && (
                                                                    <p className="text-xs text-gray-500 mt-2 italic">"{avail.reason}"</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                {unavailableCount > 0 && (
                                    <Card className="bg-red-50 border-red-200">
                                        <button
                                            onClick={() => setExpandedUnavailable(expandedUnavailable === dateStr ? null : dateStr)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-red-100 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-red-800">❌ לא פנויים ({unavailableCount})</span>
                                            </div>
                                            {expandedUnavailable === dateStr ? <ChevronUp className="w-4 h-4 text-red-800" /> : <ChevronDown className="w-4 h-4 text-red-800" />}
                                        </button>
                                        {expandedUnavailable === dateStr && (
                                            <CardContent className="pt-0">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {dayAvail.filter(a => a.availability_type === 'unavailable').map(avail => (
                                                        <div key={avail.id} className="p-3 rounded-lg bg-white border border-red-300">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-bold">{avail.employee_name}</span>
                                                                <Button size="sm" variant="ghost" onClick={() => handleEditAvail(avail)}>
                                                                    <Edit2 className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                            {avail.reason && (
                                                                <p className="text-xs text-gray-500 italic">"{avail.reason}"</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!editingAvail} onOpenChange={(open) => !open && setEditingAvail(null)}>
                <DialogContent dir="rtl" className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>עריכת זמינות - {editingAvail?.employee_name}</DialogTitle>
                    </DialogHeader>
                    {editData && (
                        <div className="space-y-4 py-4">
                            <div>
                                <Label className="font-semibold">סטטוס</Label>
                                <Select value={editData.availability_type} onValueChange={(val) => setEditData({...editData, availability_type: val})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(AVAILABILITY_TYPES).map(([key, cfg]) => (
                                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="font-semibold">תפקיד</Label>
                                <Select
                                    value={editData.positions?.[0] || ''}
                                    onValueChange={(val) => setEditData({...editData, positions: val ? [val] : []})}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="בחר תפקיד" />
                                    </SelectTrigger>
                                    <SelectContent position="popper" side="bottom" align="start" className="z-[9999]">
                                        {getAvailablePositions(editData).map(pos => (
                                            <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="font-semibold">הערות מנהל</Label>
                                <Textarea
                                    placeholder="הוסף הערות או שינויים..."
                                    value={editData.admin_notes || ''}
                                    onChange={(e) => setEditData({...editData, admin_notes: e.target.value})}
                                    className="h-20"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingAvail(null)}>ביטול</Button>
                        <Button onClick={handleSaveEdit} className="bg-primary">שמור שינויים</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function AvailabilityRequests() {
    return (
        <PageGuard pageName="AvailabilityRequests" pageTitle="בקשות זמינות">
            <AvailabilityRequestsInner />
        </PageGuard>
    );
}