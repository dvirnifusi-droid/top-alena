import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, addDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { User } from '@/entities/User';
import { ArrowLeftRight } from 'lucide-react';
import ShiftSwapRequestDialog from '../scheduling/ShiftSwapRequestDialog';
import { Employee } from '@/entities/Employee';
import { RestaurantProfile } from '@/entities/RestaurantProfile';

function CalendarIcon({ className }) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8 2v4m8-4v4M3 10h18"/><rect x="2" y="3" width="20" height="19" rx="2" ry="2"/><path d="M3 10h18"/></svg>;
}

async function loadShiftsForWeek(weekStart) {
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const currentUser = await base44.auth.me();
    const allShifts = await base44.entities.WorkShift.list();
    const weekShifts = [];

    allShifts.forEach(shift => {
        if (!shift.date) return;
        if (shift.date >= weekStartStr && shift.date <= weekEndStr) {
            const userAssignment = (shift.assigned_staff || []).find(
                a => a.employee_name && currentUser.full_name &&
                    a.employee_name.toLowerCase() === currentUser.full_name.toLowerCase()
            );
            if (userAssignment) {
                weekShifts.push({
                    date: new Date(shift.date + 'T00:00:00'),
                    dateStr: shift.date,
                    shift_type: shift.shift_type,
                    start_time: userAssignment.start_time || shift.start_time,
                    end_time: userAssignment.end_time || shift.end_time,
                    position: userAssignment.position
                });
            }
        }
    });

    weekShifts.sort((a, b) => a.date - b.date);
    return weekShifts;
}

function ShiftsList({ shifts, loading, currentEmployee, allEmployees, managerPhone }) {
    const [swapShift, setSwapShift] = useState(null);
    const totalHours = shifts.reduce((acc, shift) => {
        if (!shift.start_time || !shift.end_time) return acc;
        const [startH, startM] = shift.start_time.split(':').map(Number);
        const [endH, endM] = shift.end_time.split(':').map(Number);
        let hours = (endH * 60 + endM - startH * 60 - startM) / 60;
        if (hours < 0) hours += 24;
        return acc + hours;
    }, 0);

    if (loading) return <div className="text-center py-4 text-gray-500">טוען...</div>;

    if (shifts.length === 0) {
        return <p className="text-gray-500 text-center py-4">אין משמרות בשבוע זה</p>;
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {shifts.map((shift) => (
                    <div key={`${shift.dateStr}-${shift.shift_type}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                            <p className="font-semibold text-sm">
                                {format(shift.date, 'EEEE', { locale: he })}
                            </p>
                            <p className="text-xs text-gray-600">{format(shift.date, 'dd/MM')}</p>
                        </div>
                        <div className="text-right">
                            <Badge variant={shift.shift_type === 'lunch' ? 'default' : 'secondary'} className="mb-1 block w-fit ml-auto">
                                {shift.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב'}
                            </Badge>
                            <p className="text-xs text-gray-700">
                                {shift.start_time && shift.end_time
                                    ? `${shift.start_time} - ${shift.end_time}`
                                    : 'שעות לא קבועות'}
                            </p>
                            <p className="text-xs text-blue-600 font-medium">{shift.position}</p>
                            {currentEmployee && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-1 h-6 text-xs border-orange-300 text-orange-600 hover:bg-orange-50"
                                    onClick={() => setSwapShift({ ...shift, date: shift.dateStr })}
                                >
                                    <ArrowLeftRight className="w-3 h-3 ml-1" />
                                    בקש החלפה
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {swapShift && currentEmployee && (
                <ShiftSwapRequestDialog
                    open={!!swapShift}
                    onClose={() => setSwapShift(null)}
                    myShift={swapShift}
                    employees={allEmployees}
                    currentEmployee={currentEmployee}
                    managerPhone={managerPhone}
                />
            )}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-900">סה"כ שעות בשבוע:</span>
                    <span className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)} שעות</span>
                </div>
            </div>
        </>
    );
}

export default function WeeklyScheduleSummary({ userId, currentEmployee }) {
    const [activeTab, setActiveTab] = useState('current');
    const [currentShifts, setCurrentShifts] = useState([]);
    const [nextShifts, setNextShifts] = useState([]);
    const [loadingCurrent, setLoadingCurrent] = useState(true);
    const [loadingNext, setLoadingNext] = useState(false);
    const [nextLoaded, setNextLoaded] = useState(false);
    const [allEmployees, setAllEmployees] = useState([]);
    const [managerPhone, setManagerPhone] = useState('');

    useEffect(() => {
        Employee.filter({ status: 'active' }).then(setAllEmployees);
        RestaurantProfile.list().then(list => {
            if (list.length > 0 && list[0].manager_whatsapp_phone) {
                setManagerPhone(list[0].manager_whatsapp_phone);
            }
        }).catch(() => {});
    }, []);

    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const nextWeekStart = addDays(currentWeekStart, 7);

    useEffect(() => {
        if (!userId) return;
        setLoadingCurrent(true);
        loadShiftsForWeek(currentWeekStart)
            .then(setCurrentShifts)
            .finally(() => setLoadingCurrent(false));
    }, [userId]);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'next' && !nextLoaded) {
            setLoadingNext(true);
            loadShiftsForWeek(nextWeekStart)
                .then(setNextShifts)
                .finally(() => { setLoadingNext(false); setNextLoaded(true); });
        }
    };

    const currentLabel = `${format(currentWeekStart, 'dd/MM')} - ${format(addDays(currentWeekStart, 6), 'dd/MM')}`;
    const nextLabel = `${format(nextWeekStart, 'dd/MM')} - ${format(addDays(nextWeekStart, 6), 'dd/MM')}`;

    return (
        <Card className="border-2 border-blue-200 mb-6">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    סידור העבודה שלך
                </CardTitle>
                {/* Tabs */}
                <div className="flex gap-2 mt-2">
                    <button
                        onClick={() => handleTabChange('current')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            activeTab === 'current'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        השבוע ({currentLabel})
                    </button>
                    <button
                        onClick={() => handleTabChange('next')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            activeTab === 'next'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        שבוע הבא ({nextLabel})
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                {activeTab === 'current' && (
                    <ShiftsList shifts={currentShifts} loading={loadingCurrent} currentEmployee={currentEmployee} allEmployees={allEmployees} managerPhone={managerPhone} />
                )}
                {activeTab === 'next' && (
                    <ShiftsList shifts={nextShifts} loading={loadingNext} currentEmployee={currentEmployee} allEmployees={allEmployees} managerPhone={managerPhone} />
                )}
            </CardContent>
        </Card>
    );
}