import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Clock, DollarSign, BarChart3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';
import { he } from 'date-fns/locale';

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
    const [tipsData, setTipsData] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [filterPeriod, setFilterPeriod] = useState('month'); // week, month, custom
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [loading2, setLoading2] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const currentUser = await base44.auth.me();
            setUser(currentUser);
            setIsAdmin(currentUser?.role === 'admin');
            setSelectedEmployeeId(currentUser?.id || '');

            // טוען עובדים (רק אם מנהל)
            if (currentUser?.role === 'admin') {
                const emps = await base44.entities.Employee.list();
                setEmployees(emps);
            }

            // טוען משמרות וטיפים
            await loadReportData();
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    };

    const loadReportData = async () => {
        setLoading2(true);
        try {
            const allShifts = await base44.entities.ShiftTracking.list();
            const allTips = await base44.entities.TipReport.list();
            setShifts(allShifts);
            setTipsData(allTips);
        } catch (error) {
            console.error('Error loading report data:', error);
        }
        setLoading2(false);
    };

    // סנן נתונים לפי עובד ותאריך
    const filteredData = useMemo(() => {
        let filtered = { shifts: [], tips: [] };
        const empId = selectedEmployeeId;

        // סנן משמרות
        const empShifts = shifts.filter(s => s.employee_id === empId);
        
        // סנן לפי תאריך
        let dateFiltered = empShifts;
        if (filterPeriod === 'week') {
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
            const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
            dateFiltered = empShifts.filter(s => {
                const date = new Date(s.date);
                return date >= weekStart && date <= weekEnd;
            });
        } else if (filterPeriod === 'month') {
            const monthStart = startOfMonth(selectedMonth);
            const monthEnd = endOfMonth(selectedMonth);
            dateFiltered = empShifts.filter(s => {
                const date = new Date(s.date);
                return date >= monthStart && date <= monthEnd;
            });
        }
        
        filtered.shifts = dateFiltered;

        // סנן טיפים לאותו עובד וזמן
        const empTips = tipsData.filter(t => t.employee_id === empId);
        filtered.tips = empTips.filter(t => {
            const tipsDate = new Date(t.date || t.created_date);
            if (filterPeriod === 'week') {
                const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
                const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
                return tipsDate >= weekStart && tipsDate <= weekEnd;
            } else if (filterPeriod === 'month') {
                const monthStart = startOfMonth(selectedMonth);
                const monthEnd = endOfMonth(selectedMonth);
                return tipsDate >= monthStart && tipsDate <= monthEnd;
            }
            return true;
        });

        return filtered;
    }, [shifts, tipsData, selectedEmployeeId, filterPeriod, selectedMonth]);

    // חישובים
    const calculations = useMemo(() => {
        const { shifts: filteredShifts, tips: filteredTips } = filteredData;

        let totalHours = 0;
        let totalEffectiveHours = 0;
        
        filteredShifts.forEach(shift => {
            totalHours += shift.total_hours || 0;
            totalEffectiveHours += shift.effective_hours || 0;
        });

        const totalTips = filteredTips.reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const hourlyAverage = totalEffectiveHours > 0 ? totalTips / totalEffectiveHours : 0;

        return {
            totalShifts: filteredShifts.length,
            totalHours: totalHours.toFixed(1),
            totalEffectiveHours: totalEffectiveHours.toFixed(1),
            totalTips: totalTips.toFixed(2),
            hourlyAverage: hourlyAverage.toFixed(2)
        };
    }, [filteredData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    const displayEmployeeId = selectedEmployeeId;
    const selectedEmployee = employees.find(e => e.id === displayEmployeeId) || { full_name: user?.full_name };

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold text-slate-900 mb-2">דוחות עובדים</h1>
                <p className="text-slate-600 mb-8">מעקב שעות עבודה, טיפים וביצועים</p>

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Card className="border-2 border-blue-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">משמרות</p>
                                    <p className="text-2xl font-bold text-blue-600">{calculations.totalShifts}</p>
                                </div>
                                <BarChart3 className="w-8 h-8 text-blue-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-green-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">שעות עבודה</p>
                                    <p className="text-2xl font-bold text-green-600">{calculations.totalEffectiveHours}</p>
                                    <p className="text-xs text-gray-500">(כולל {calculations.totalHours})</p>
                                </div>
                                <Clock className="w-8 h-8 text-green-600 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-orange-200">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">טיפים כסף</p>
                                    <p className="text-2xl font-bold text-orange-600">₪{calculations.totalTips}</p>
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

                {/* Details Table */}
                <Card className="border-2">
                    <CardHeader>
                        <CardTitle>פרטים מלאים</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading2 ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            </div>
                        ) : filteredData.shifts.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">אין נתונים לתקופה זו</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b-2 border-gray-300">
                                        <tr>
                                            <th className="text-right py-3 px-4">תאריך</th>
                                            <th className="text-right py-3 px-4">משמרת</th>
                                            <th className="text-right py-3 px-4">שעות</th>
                                            <th className="text-right py-3 px-4">טיפים</th>
                                            <th className="text-right py-3 px-4">הערות</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.shifts.map((shift) => {
                                            const relatedTips = filteredData.tips.filter(t => {
                                                const tipsDate = format(new Date(t.date || t.created_date), 'yyyy-MM-dd');
                                                return tipsDate === shift.date;
                                            });
                                            const dayTips = relatedTips.reduce((sum, t) => sum + (t.total_amount || 0), 0);

                                            return (
                                                <tr key={shift.id} className="border-b border-gray-200 hover:bg-slate-50">
                                                    <td className="py-3 px-4">{format(new Date(shift.date), 'dd/MM/yyyy', { locale: he })}</td>
                                                    <td className="py-3 px-4">
                                                        <Badge variant={shift.shift_type === 'lunch' ? 'default' : 'secondary'}>
                                                            {shift.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4 font-semibold">{(shift.effective_hours || 0).toFixed(1)}</td>
                                                    <td className="py-3 px-4 text-orange-600 font-semibold">₪{dayTips.toFixed(2)}</td>
                                                    <td className="py-3 px-4 text-xs text-gray-600">{shift.personal_notes || '-'}</td>
                                                </tr>
                                            );
                                        })}
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