import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Clock, DollarSign, Star, Trophy, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';

const TIP_POSITIONS = ['מלצר', 'ברמן', 'ראנר'];

function calcHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 24 * 60;
    return (end - start) / 60;
}

const SORT_OPTIONS = [
    { value: 'totalHours', label: '⏱️ הכי הרבה שעות', icon: Clock, color: 'text-blue-600' },
    { value: 'totalTipEarnings', label: '💰 הכי הרבה טיפים', icon: DollarSign, color: 'text-green-600' },
    { value: 'hourlyAvg', label: '⚡ ממוצע שעתי גבוה', icon: TrendingUp, color: 'text-purple-600' },
    { value: 'totalDays', label: '📅 הכי הרבה ימי עבודה', icon: Star, color: 'text-orange-600' },
    { value: 'totalOvertime', label: '🔥 הכי הרבה שעות נוספות', icon: Trophy, color: 'text-red-600' },
    { value: 'thursdayDays', label: '📆 הכי הרבה ימי חמישי', icon: Star, color: 'text-indigo-600' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function EmployeeRankingReport({ workShifts, employees, selectedMonth, tipReports }) {
    const [sortBy, setSortBy] = useState('totalHours');

    const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

    const data = useMemo(() => {
        return employees.map(emp => {
            let totalHours = 0;
            let totalOvertime = 0;
            const workDates = new Set();

            workShifts.forEach(ws => {
                if (!ws.date || ws.date < monthStart || ws.date > monthEnd) return;
                (ws.assigned_staff || []).forEach(a => {
                    if (a.employee_id !== emp.id) return;
                    if (TIP_POSITIONS.includes(a.position)) return;
                    const hours = calcHours(a.start_time, a.end_time) - (a.total_break_minutes || 0) / 60;
                    if (hours <= 0) return;
                    workDates.add(ws.date);
                    totalHours += hours;
                    totalOvertime += Math.max(0, hours - 8);
                });
            });

            let totalTipEarnings = 0;
            let totalTipHours = 0;
            tipReports.forEach(report => {
                if (!report.date || report.date < monthStart || report.date > monthEnd) return;
                const s = (report.staff_details || []).find(s =>
                    s.employee_id === emp.id ||
                    (emp.full_name && s.employee_name && s.employee_name.trim().toLowerCase() === emp.full_name.trim().toLowerCase())
                );
                if (!s) return;
                workDates.add(report.date);
                totalTipEarnings += s.total_earnings || s.final_tip || 0;
                totalTipHours += s.effective_hours || 0;
            });

            const totalDays = workDates.size;
            const hourlyAvg = totalTipHours > 0 ? totalTipEarnings / totalTipHours : 0;

            // ספירת ימי חמישי (day=4)
            let thursdayDays = 0;
            workDates.forEach(dateStr => {
                const d = new Date(dateStr);
                if (d.getDay() === 4) thursdayDays++;
            });

            return { emp, totalHours, totalOvertime, totalTipEarnings, totalTipHours, totalDays, hourlyAvg, thursdayDays };
        }).filter(d => d.totalDays > 0);
    }, [workShifts, employees, tipReports, monthStart, monthEnd]);

    const sorted = useMemo(() => {
        return [...data].sort((a, b) => b[sortBy] - a[sortBy]);
    }, [data, sortBy]);

    const currentSort = SORT_OPTIONS.find(o => o.value === sortBy);

    if (data.length === 0) return null;

    return (
        <Card className="border-2 border-amber-200 bg-amber-50 mb-6">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-2 text-amber-800">
                        <Trophy className="w-5 h-5" />
                        דירוג עובדים - {format(selectedMonth, 'MMMM yyyy', { locale: he })}
                    </CardTitle>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-56 bg-white border-amber-300">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {sorted.map((d, idx) => {
                        const medal = MEDALS[idx] || `#${idx + 1}`;
                        const value = d[sortBy];
                        let displayValue = '';
                        if (sortBy === 'totalTipEarnings' || sortBy === 'hourlyAvg') {
                            displayValue = `₪${value.toFixed(2)}`;
                        } else if (sortBy === 'totalDays') {
                            displayValue = `${value} ימים`;
                        } else if (sortBy === 'thursdayDays') {
                            displayValue = `${value} ימי חמישי`;
                        } else {
                            displayValue = `${value.toFixed(2)} שעות`;
                        }

                        return (
                            <div key={d.emp.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 bg-white transition-all ${idx === 0 ? 'border-yellow-300 shadow-md' : idx === 1 ? 'border-gray-300' : idx === 2 ? 'border-orange-200' : 'border-gray-100'}`}>
                                <span className="text-2xl w-8 text-center flex-shrink-0">{medal}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800 truncate">{d.emp.full_name}</p>
                                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                                        {d.totalHours > 0 && <span>⏱️ {d.totalHours.toFixed(1)} ש'</span>}
                                        {d.totalTipEarnings > 0 && <span>💰 ₪{d.totalTipEarnings.toFixed(0)}</span>}
                                        {d.hourlyAvg > 0 && <span>⚡ ₪{d.hourlyAvg.toFixed(0)}/ש'</span>}
                                        <span>📅 {d.totalDays} ימים</span>
                                        {d.thursdayDays > 0 && <span>📆 {d.thursdayDays} חמישי</span>}
                                    </div>
                                </div>
                                <div className={`text-xl font-black flex-shrink-0 ${currentSort?.color}`}>
                                    {displayValue}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}