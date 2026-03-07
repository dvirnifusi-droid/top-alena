import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Clock, DollarSign, BarChart3, Calendar, Target, AlertCircle, FileDown, Pencil, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, eachWeekOfInterval, addDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import ExportToAccountantDialog from '../components/reports/ExportToAccountantDialog';
import ShiftEditInlineDialog from '../components/reports/ShiftEditInlineDialog';

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
    // Export dialog
    const [showExport, setShowExport] = useState(false);
    const [exportSelectedEmps, setExportSelectedEmps] = useState([]);
    // Edit shift inline
    const [editShift, setEditShift] = useState(null); // { entry, workShiftId }
    const WEEKLY_GOAL_HOURS = 40; // יעד שעות שבועי ברירת מחדל
    const OVERTIME_THRESHOLD = 8; // שעות נוספות מעל X שעות ביום

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
        if (!selectedEmployeeId) return { tipEntries: [], shifts: [], hourlyShiftEntries: [] };

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
                    workShiftId: ws.id,
                });
            });
        });

        return { tipEntries, shifts: empShifts, hourlyShiftEntries };
    }, [shifts, tipReports, workShifts, selectedEmployeeId, filterPeriod, selectedMonth, employees]);

    // חישוב פילוח שבועי לחודש הנוכחי (לטאב החדש)
    const monthlyBreakdown = useMemo(() => {
        if (!selectedEmployeeId) return { weeks: [], totalRegular: 0, totalOvertime: 0, totalHours: 0 };

        const monthStart = startOfMonth(selectedMonth);
        const monthEnd = endOfMonth(selectedMonth);

        // כל משמרות העובד בחודש
        const monthEntries = [];
        workShifts.forEach(ws => {
            if (!ws.date || ws.date < format(monthStart, 'yyyy-MM-dd') || ws.date > format(monthEnd, 'yyyy-MM-dd')) return;
            (ws.assigned_staff || []).forEach(a => {
                if (a.employee_id !== selectedEmployeeId) return;
                const hours = calcHours(a.start_time, a.end_time) - (a.total_break_minutes || 0) / 60;
                if (hours <= 0) return;
                monthEntries.push({ date: ws.date, hours });
            });
        });

        // קיבוץ לשבועות
        const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });
        const weeks = weekStarts.map((ws) => {
            const we = addDays(ws, 6);
            const wsStr = format(ws, 'yyyy-MM-dd');
            const weStr = format(we, 'yyyy-MM-dd');
            const weekHours = monthEntries
                .filter(e => e.date >= wsStr && e.date <= weStr)
                .reduce((s, e) => s + e.hours, 0);
            const overtime = Math.max(0, weekHours - WEEKLY_GOAL_HOURS);
            const regular = weekHours - overtime;
            return {
                label: `${format(ws, 'dd/MM')} - ${format(we, 'dd/MM')}`,
                hours: parseFloat(weekHours.toFixed(1)),
                regular: parseFloat(regular.toFixed(1)),
                overtime: parseFloat(overtime.toFixed(1)),
                goal: WEEKLY_GOAL_HOURS,
            };
        });

        const totalHours = weeks.reduce((s, w) => s + w.hours, 0);
        const totalOvertime = weeks.reduce((s, w) => s + w.overtime, 0);
        const totalRegular = totalHours - totalOvertime;

        return { weeks, totalRegular: totalRegular.toFixed(1), totalOvertime: totalOvertime.toFixed(1), totalHours: totalHours.toFixed(1) };
    }, [workShifts, selectedEmployeeId, selectedMonth]);

    // חישובים
    const calculations = useMemo(() => {
        const { tipEntries, shifts: filteredShifts, hourlyShiftEntries } = filteredData;

        const totalTipEarnings = tipEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
        const totalTipHours = tipEntries.reduce((sum, e) => sum + (e.effectiveHours || 0), 0);
        const totalShiftHours = filteredShifts.reduce((sum, s) => sum + (s.effective_hours || s.total_hours || 0), 0);
        const hourlyAverage = totalTipHours > 0 ? totalTipEarnings / totalTipHours : 0;
        const totalHourlyHours = hourlyShiftEntries.reduce((sum, e) => sum + e.net_hours, 0);

        return {
            totalTipShifts: tipEntries.length,
            totalTrackedShifts: filteredShifts.length,
            totalTipHours: totalTipHours.toFixed(1),
            totalShiftHours: totalShiftHours.toFixed(1),
            totalTipEarnings: totalTipEarnings.toFixed(2),
            hourlyAverage: hourlyAverage.toFixed(2),
            totalHourlyShifts: hourlyShiftEntries.length,
            totalHourlyHours: totalHourlyHours.toFixed(2),
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

                <Tabs defaultValue="monthly" className="w-full">
                    <TabsList className="mb-6">
                        <TabsTrigger value="monthly" className="flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            סיכום חודשי
                        </TabsTrigger>
                        <TabsTrigger value="hourly" className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            שעות עבודה (סידור)
                            {calculations.totalHourlyShifts > 0 && (
                                <Badge className="mr-1 bg-blue-600 text-white text-xs">{calculations.totalHourlyShifts}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="tips" className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            טיפים
                            {calculations.totalTipShifts > 0 && (
                                <Badge className="mr-1 bg-green-600 text-white text-xs">{calculations.totalTipShifts}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB: סיכום חודשי */}
                    <TabsContent value="monthly">
                        {/* כרטיסי סיכום */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <Card className="border-2 border-blue-200">
                                <CardContent className="p-5">
                                    <p className="text-sm text-gray-500 mb-1">סה"כ שעות בחודש</p>
                                    <p className="text-3xl font-bold text-blue-600">{monthlyBreakdown.totalHours}</p>
                                    <p className="text-xs text-gray-400 mt-1">שעות</p>
                                </CardContent>
                            </Card>
                            <Card className="border-2 border-green-200">
                                <CardContent className="p-5">
                                    <p className="text-sm text-gray-500 mb-1">שעות רגילות</p>
                                    <p className="text-3xl font-bold text-green-600">{monthlyBreakdown.totalRegular}</p>
                                    <p className="text-xs text-gray-400 mt-1">עד {WEEKLY_GOAL_HOURS} שעות/שבוע</p>
                                </CardContent>
                            </Card>
                            <Card className="border-2 border-orange-200">
                                <CardContent className="p-5">
                                    <p className="text-sm text-gray-500 mb-1">שעות נוספות</p>
                                    <p className="text-3xl font-bold text-orange-600">{monthlyBreakdown.totalOvertime}</p>
                                    <p className="text-xs text-gray-400 mt-1">מעל {WEEKLY_GOAL_HOURS} שעות/שבוע</p>
                                </CardContent>
                            </Card>
                            <Card className={`border-2 ${parseFloat(monthlyBreakdown.totalHours) >= WEEKLY_GOAL_HOURS * 4 ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                <CardContent className="p-5">
                                    <p className="text-sm text-gray-500 mb-1">עמידה ביעד חודשי</p>
                                    <p className={`text-3xl font-bold ${parseFloat(monthlyBreakdown.totalHours) >= WEEKLY_GOAL_HOURS * 4 ? 'text-green-600' : 'text-red-500'}`}>
                                        {Math.round((parseFloat(monthlyBreakdown.totalHours) / (WEEKLY_GOAL_HOURS * 4)) * 100)}%
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">יעד: {WEEKLY_GOAL_HOURS * 4} שעות</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* גרף שעות שבועי */}
                        <Card className="border-2 mb-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5" />
                                    פילוח שעות שבועי - {format(selectedMonth, 'MMMM yyyy', { locale: he })}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {monthlyBreakdown.weeks.length === 0 ? (
                                    <p className="text-center text-gray-500 py-8">אין נתונים לחודש זה</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={monthlyBreakdown.weeks} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip
                                                formatter={(value, name) => [`${value} שעות`, name === 'regular' ? 'שעות רגילות' : 'שעות נוספות']}
                                                labelFormatter={(label) => `שבוע: ${label}`}
                                            />
                                            <ReferenceLine y={WEEKLY_GOAL_HOURS} stroke="#f97316" strokeDasharray="5 5" label={{ value: `יעד ${WEEKLY_GOAL_HOURS}ש׳`, position: 'right', fontSize: 11, fill: '#f97316' }} />
                                            <Bar dataKey="regular" stackId="a" fill="#3b82f6" name="regular" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="overtime" stackId="a" fill="#f97316" name="overtime" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>

                        {/* טבלת פירוט שבועות */}
                        <Card className="border-2">
                            <CardHeader>
                                <CardTitle>השוואת שעות ליעד שבועי</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {monthlyBreakdown.weeks.map((week, idx) => {
                                        const pct = Math.min(100, Math.round((week.hours / WEEKLY_GOAL_HOURS) * 100));
                                        const overGoal = week.hours >= WEEKLY_GOAL_HOURS;
                                        return (
                                            <div key={idx} className="p-3 rounded-lg border bg-slate-50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm">{week.label}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold">{week.hours} שעות</span>
                                                        {week.overtime > 0 && (
                                                            <Badge className="bg-orange-100 text-orange-700 text-xs">+{week.overtime} נוספות</Badge>
                                                        )}
                                                        {overGoal ? (
                                                            <Badge className="bg-green-100 text-green-700 text-xs">✅ יעד הושג</Badge>
                                                        ) : (
                                                            <Badge className="bg-red-100 text-red-600 text-xs flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3" />
                                                                חסר {(WEEKLY_GOAL_HOURS - week.hours).toFixed(1)} ש׳
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className={`h-2 rounded-full transition-all ${overGoal ? 'bg-green-500' : 'bg-blue-500'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1">{pct}% מהיעד ({WEEKLY_GOAL_HOURS} שעות)</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TAB: שעות עבודה */}
                    <TabsContent value="hourly">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                            <Card className="border-2 border-blue-200">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-600">משמרות מהסידור</p>
                                            <p className="text-2xl font-bold text-blue-600">{calculations.totalHourlyShifts}</p>
                                        </div>
                                        <BarChart3 className="w-8 h-8 text-blue-600 opacity-50" />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border-2 border-green-200">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-600">סה"כ שעות נטו</p>
                                            <p className="text-2xl font-bold text-green-600">{calculations.totalHourlyHours}</p>
                                        </div>
                                        <Clock className="w-8 h-8 text-green-600 opacity-50" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border-2">
                            <CardHeader>
                                <CardTitle>פירוט משמרות לפי סידור עבודה</CardTitle>
                                <p className="text-sm text-gray-500">תפקידים שאינם מלצר/ברמן/ראנר (אלו נמצאים בטאב הטיפים)</p>
                            </CardHeader>
                            <CardContent>
                                {loading2 ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                    </div>
                                ) : filteredData.hourlyShiftEntries.length === 0 ? (
                                    <p className="text-center text-gray-500 py-8">אין משמרות בסידור העבודה לתקופה זו לעובד זה</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="border-b-2 border-gray-300 bg-slate-50">
                                                <tr>
                                                    <th className="text-right py-3 px-4">תאריך</th>
                                                    <th className="text-right py-3 px-4">משמרת</th>
                                                    <th className="text-right py-3 px-4">תפקיד</th>
                                                    <th className="text-right py-3 px-4">כניסה</th>
                                                    <th className="text-right py-3 px-4">יציאה</th>
                                                    <th className="text-right py-3 px-4">הפסקה (דק')</th>
                                                    <th className="text-right py-3 px-4 font-bold text-blue-700">שעות נטו</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredData.hourlyShiftEntries
                                                    .sort((a, b) => a.date.localeCompare(b.date))
                                                    .map((entry, idx) => (
                                                    <tr key={idx} className="border-b border-gray-200 hover:bg-slate-50">
                                                        <td className="py-3 px-4">{format(new Date(entry.date), 'dd/MM/yyyy', { locale: he })}</td>
                                                        <td className="py-3 px-4">
                                                            <Badge variant={entry.shift_type === 'lunch' ? 'default' : 'secondary'}>
                                                                {entry.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-3 px-4 text-gray-700 font-medium">{entry.position}</td>
                                                        <td className="py-3 px-4">{entry.start_time}</td>
                                                        <td className="py-3 px-4">{entry.end_time}</td>
                                                        <td className="py-3 px-4 text-gray-500">{entry.break_minutes > 0 ? entry.break_minutes : '-'}</td>
                                                        <td className="py-3 px-4 font-bold text-blue-700">{entry.net_hours.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="border-t-2 border-gray-400 bg-blue-50">
                                                    <td colSpan={6} className="py-3 px-4 font-bold text-right text-blue-800">סה"כ שעות לתקופה:</td>
                                                    <td className="py-3 px-4 font-bold text-xl text-blue-700">{calculations.totalHourlyHours}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TAB: טיפים */}
                    <TabsContent value="tips">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}