import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, Users, ChevronLeft, ChevronRight, CheckCircle2, Zap } from 'lucide-react';
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
    const [loading, setLoading] = useState(true);
    const [autoAssigning, setAutoAssigning] = useState(false);
    const [weekOffset, setWeekOffset] = useState(1); // 1 = next week, 0 = this week

    const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    useEffect(() => {
        loadData();
    }, [weekOffset]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [allAvail, allEmps] = await Promise.all([
                base44.entities.EmployeeAvailability.list(),
                base44.entities.Employee.filter({ status: 'active' }),
            ]);
            setAvailabilities(allAvail);
            setEmployees(allEmps);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const getAvailForDay = (dateStr) => {
        return availabilities.filter(a => a.date === dateStr);
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

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 animate-spin" />
        </div>
    );

    const weekAvailabilities = availabilities.filter(a =>
        a.date >= format(weekStart, 'yyyy-MM-dd') && a.date <= format(weekEnd, 'yyyy-MM-dd')
    );

    const uniqueEmployeesSubmitted = new Set(weekAvailabilities.map(a => a.employee_id)).size;

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto" dir="rtl">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Users className="w-8 h-8 text-primary" />
                        בקשות זמינות עובדים
                    </h1>
                    <p className="text-gray-500 mt-1">
                        שבוע {format(weekStart, 'dd/MM')} – {format(weekEnd, 'dd/MM/yyyy')} ·{' '}
                        <span className="font-semibold text-primary">{uniqueEmployeesSubmitted}</span> עובדים הגישו זמינות
                    </p>
                </div>
                <div className="flex gap-2 items-center">
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
                        if (dayAvail.length === 0) return null;

                        return (
                            <Card key={dateStr}>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">
                                        {format(day, 'EEEE', { locale: he })}{' '}
                                        <span className="text-gray-500 font-normal">{format(day, 'dd/MM')}</span>
                                        <span className="text-sm text-gray-400 font-normal mr-2">
                                            ({dayAvail.length} בקשות)
                                        </span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {dayAvail.map(avail => {
                                            const typeConfig = AVAILABILITY_TYPES[avail.availability_type] || AVAILABILITY_TYPES.available;
                                            return (
                                                <div key={avail.id} className={`p-3 rounded-lg border ${typeConfig.color.replace('text-', 'border-').replace('-800', '-300').replace('-100', '-50')}`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-bold">{avail.employee_name}</span>
                                                        <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
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
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
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