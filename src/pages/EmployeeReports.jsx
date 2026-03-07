import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Clock, DollarSign, BarChart3, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';
import { he } from 'date-fns/locale';

// TIP-based positions (excluded from hourly salary report)
const TIP_POSITIONS = ['מלצר', 'ברמן', 'ראנר'];

// Calculate hours between two time strings (handles overnight)
function calcHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 24 * 60; // overnight
    return (end - start) / 60;
}

export default function EmployeeReportsPage() {
    return (
        <PageGuard pageName="EmployeeReports" pageTitle="דוחות עובדים">
            <EmployeeReportsInner />
        </PageGuard>
    );
}

function EmployeeReportsInner() {
    const [user, setUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [tipReports, setTipReports] = useState([]);
    const [myEmployeeRecord, setMyEmployeeRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(''); // Employee entity id
    const [filterPeriod, setFilterPeriod] = useState('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [loading2, setLoading2] = useState(false);
    const [workShifts, setWorkShifts] = useState([]);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const currentUser = await base44.auth.me();
            setUser(currentUser);
            const admin = currentUser?.role === 'admin';
            setIsAdmin(admin);

            // טוען עובדים תמיד (כדי למצוא את רשומת העובד הנוכחי)
            const emps = await base44.entities.Employee.list();
            setEmployees(emps);

            // מצא את רשומת העובד של המשתמש הנוכחי לפי אימייל
            const myEmp = emps.find(e => e.email && currentUser?.email && e.email.toLowerCase() === currentUser.email.toLowerCase());
            setMyEmployeeRecord(myEmp || null);

            if (!admin) {
                setSelectedEmployeeId(myEmp?.id || '');
            } else {
                setSelectedEmployeeId(myEmp?.id || (emps[0]?.id || ''));
            }

            await loadReportData();
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    };

    const loadReportData = async () => {
        setLoading2(true);
        try {
            const [allShifts, allTipReports, allWorkShifts] = await Promise.all([
                base44.entities.ShiftTracking.list(),
                base44.entities.TipReport.list(),
                base44.entities.WorkShift.list('-date', 500),
            ]);
            setShifts(allShifts);
            setTipReports(allTipReports);
            setWorkShifts(allWorkShifts);
        } catch (error) {
            console.error('Error loading report data:', error);
        }
        setLoading2(false);
    };

    const filteredData = useMemo(() => {
        if (!selectedEmployeeId) return { tipEntries: [], shifts: [] };

        const selectedEmp = employees.find(e => e.id === selectedEmployeeId);

        // חילוץ נתוני טיפים מתוך TipReport.staff_details
        // מחפש לפי employee_id OR לפי שם עובד (כי ייתכן אי-התאמת IDs)
        const allTipEntries = [];
        tipReports.forEach(report => {
            const staffEntry = (report.staff_details || []).find(s =>
                s.employee_id === selectedEmployeeId ||
                (selectedEmp?.full_name && s.employee_name && 
                 s.employee_name.trim().toLowerCase() === selectedEmp.full_name.trim().toLowerCase())
            );
            if (staffEntry) {
                const grossTip = staffEntry.gross_tip ?? staffEntry.grossTip ?? 0;
                const finalTip = staffEntry.final_tip ?? staffEntry.finalTip ?? grossTip;
                const mealCost = staffEntry.meal_cost ?? 0;
                const salesBonus = staffEntry.sales_bonus ?? 0;
                const supplement = staffEntry.supplement ?? 0;
                const totalEarnings = staffEntry.total_earnings ?? staffEntry.totalEarnings ?? (finalTip + supplement);
                allTipEntries.push({
                    date: report.date,
                    shift_type: report.shift_type,
                    effectiveHours: staffEntry.effective_hours ?? staffEntry.effectiveHours ?? 0,
                    totalHours: staffEntry.total_hours ?? staffEntry.totalHours ?? 0,
                    grossTip,
                    finalTip,
                    supplement,
                    totalEarnings,
                    meal_cost: mealCost,
                    sales_bonus: salesBonus,
                    position: staffEntry.position || '',
                });
            }
        });

        // סנן לפי תקופה
        const inPeriod = (dateStr) => {
            const d = new Date(dateStr);
            if (filterPeriod === 'week') {
                const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
                const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
                return d >= weekStart && d <= weekEnd;
            } else if (filterPeriod === 'month') {
                const monthStart = startOfMonth(selectedMonth);
                const monthEnd = endOfMonth(selectedMonth);
                return d >= monthStart && d <= monthEnd;
            }
            return true;
        };

        const tipEntries = allTipEntries.filter(e => inPeriod(e.date));

        // משמרות ShiftTracking לפי שם עובד
        const empShifts = shifts.filter(s =>
            s.employee_name && selectedEmp?.full_name &&
            s.employee_name === selectedEmp.full_name &&
            inPeriod(s.date)
        );

        // משמרות מסידור העבודה לעובדים שאינם על טיפים
        const hourlyShiftEntries = [];
        workShifts.forEach(ws => {
            if (!inPeriod(ws.date)) return;
            (ws.assigned_staff || []).forEach(a => {
                if (a.employee_id !== selectedEmployeeId) return;
                if (TIP_POSITIONS.includes(a.position)) return; // טיפ-based - לא כאן
                const hours = calcHours(a.start_time, a.end_time);
                if (hours <= 0) return;
                hourlyShiftEntries.push({
                    date: ws.date,
                    shift_type: ws.shift_type,
                    position: a.position,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    hours,
                    break_minutes: a.total_break_minutes || 0,
                    net_hours: hours - (a.total_break_minutes || 0) / 60,
                });
            });
        });

        return { tipEntries, shifts: empShifts, hourlyShiftEntries };
    }, [shifts, tipReports, workShifts, selectedEmployeeId, filterPeriod, selectedMonth, employees]);

    // חישובים
    const calculations = useMemo(() => {
        const { tipEntries, shifts: filteredShifts } = filteredData;

        const totalTipEarnings = tipEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
        const totalTipHours = tipEntries.reduce((sum, e) => sum + (e.effectiveHours || 0), 0);
        const totalShiftHours = filteredShifts.reduce((sum, s) => sum + (s.effective_hours || s.total_hours || 0), 0);
        const hourlyAverage = totalTipHours > 0 ? totalTipEarnings / totalTipHours : 0;

        return {
            totalTipShifts: tipEntries.length,
            totalTrackedShifts: filteredShifts.length,
            totalTipHours: totalTipHours.toFixed(1),
            totalShiftHours: totalShiftHours.toFixed(1),
            totalTipEarnings: totalTipEarnings.toFixed(2),
            hourlyAverage: hourlyAverage.toFixed(2),
        };
    }, [filteredData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || { full_name: user?.full_name };

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold text-slate-900 mb-2">דוחות עובדים</h1>
                <p className="text-slate-600 mb-2">
                    {isAdmin ? 'מעקב שעות עבודה, טיפים וביצועים לכל העובדים' : `הדוח האישי שלך - ${selectedEmployee?.full_name || ''}`}
                </p>

                {/* Filters */}
                <Card className="mb-8 border-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            סינונים
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {isAdmin && (
                                <div>
                                    <label className="text-sm font-medium mb-2 block">בחר עובד</label>
                                    <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="בחר עובד" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>
                                                    {emp.full_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            
                            <div>
                                <label className="text-sm font-medium mb-2 block">תקופה</label>
                                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="week">השבוע</SelectItem>
                                        <SelectItem value="month">החודש</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {filterPeriod === 'month' && (
                                <div>
                                    <label className="text-sm font-medium mb-2 block">חודש</label>
                                    <Select 
                                        value={format(selectedMonth, 'yyyy-MM')}
                                        onValueChange={(val) => setSelectedMonth(new Date(val + '-01'))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[0, -1, -2, -3, -4, -5].map(offset => {
                                                const month = subMonths(new Date(), offset);
                                                return (
                                                    <SelectItem key={offset} value={format(month, 'yyyy-MM')}>
                                                        {format(month, 'MMMM yyyy', { locale: he })}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Card className="border-2 border-blue-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">משמרות בטיפים</p>
                                    <p className="text-2xl font-bold text-blue-600">{calculations.totalTipShifts}</p>
                                </div>
                                <BarChart3 className="w-8 h-8 text-blue-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-green-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">שעות (סגירת טיפים)</p>
                                    <p className="text-2xl font-bold text-green-600">{calculations.totalTipHours}</p>
                                </div>
                                <Clock className="w-8 h-8 text-green-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-orange-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">סה"כ טיפים</p>
                                    <p className="text-2xl font-bold text-orange-600">₪{calculations.totalTipEarnings}</p>
                                </div>
                                <DollarSign className="w-8 h-8 text-orange-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-purple-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">ממוצע לשעה</p>
                                    <p className="text-2xl font-bold text-purple-600">₪{calculations.hourlyAverage}</p>
                                </div>
                                <TrendingUp className="w-8 h-8 text-purple-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tips Details Table */}
                <Card className="border-2">
                    <CardHeader>
                        <CardTitle>פירוט טיפים לפי משמרת</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading2 ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            </div>
                        ) : filteredData.tipEntries.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">אין נתוני טיפים לתקופה זו</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b-2 border-gray-300 bg-slate-50">
                                        <tr>
                                            <th className="text-right py-3 px-4">תאריך</th>
                                            <th className="text-right py-3 px-4">משמרת</th>
                                            <th className="text-right py-3 px-4">תפקיד</th>
                                            <th className="text-right py-3 px-4">שעות</th>
                                            <th className="text-right py-3 px-4">טיפ ברוטו</th>
                                            <th className="text-right py-3 px-4">ארוחה</th>
                                            <th className="text-right py-3 px-4">בונוס</th>
                                            <th className="text-right py-3 px-4">השלמה לשכר</th>
                                            <th className="text-right py-3 px-4 font-bold text-green-700">סה"כ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.tipEntries.map((entry, idx) => (
                                            <tr key={idx} className="border-b border-gray-200 hover:bg-slate-50">
                                                <td className="py-3 px-4">{format(new Date(entry.date), 'dd/MM/yyyy', { locale: he })}</td>
                                                <td className="py-3 px-4">
                                                    <Badge variant={entry.shift_type === 'lunch' ? 'default' : 'secondary'}>
                                                        {entry.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-4 text-gray-600">{entry.position || '-'}</td>
                                                <td className="py-3 px-4">{(entry.effectiveHours || 0).toFixed(2)}</td>
                                                <td className="py-3 px-4 text-blue-600">₪{(entry.grossTip || 0).toFixed(2)}</td>
                                                <td className="py-3 px-4 text-red-500">
                                                    {entry.meal_cost > 0 ? `-₪${entry.meal_cost.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="py-3 px-4 text-green-600">
                                                    {entry.sales_bonus > 0 ? `+₪${entry.sales_bonus.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="py-3 px-4 text-purple-600">
                                                    {entry.supplement > 0 ? `+₪${entry.supplement.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="py-3 px-4 font-bold text-green-700">₪{(entry.totalEarnings || 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-gray-400 bg-green-50">
                                            <td colSpan={8} className="py-3 px-4 font-bold text-right text-green-800">סה"כ לתקופה:</td>
                                            <td className="py-3 px-4 font-bold text-xl text-green-700">₪{calculations.totalTipEarnings}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}