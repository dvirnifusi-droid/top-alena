import React, { useState, useMemo } from 'react';
import { format, getDay, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Calendar, Clock, Users, Star } from 'lucide-react';

function calcHours(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return mins / 60;
}

export default function ScheduleInsights({ week = [], employees = [], tipReports = [] }) {
    const [monthFilter, setMonthFilter] = useState('all');
    const [weekFilter, setWeekFilter] = useState('all');

    // חודשים זמינים
    const availableMonths = useMemo(() => {
        const months = new Set();
        week.forEach(shift => {
            if (shift.date) months.add(shift.date.substring(0, 7));
        });
        return Array.from(months).sort().reverse();
    }, [week]);

    // שבועות זמינים לחודש שנבחר
    const availableWeeks = useMemo(() => {
        if (monthFilter === 'all') return [];
        const monthStart = startOfMonth(parseISO(monthFilter + '-01'));
        const monthEnd = endOfMonth(monthStart);
        const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });
        return weekStarts.map(ws => {
            const we = endOfWeek(ws, { weekStartsOn: 0 });
            return {
                value: format(ws, 'yyyy-MM-dd'),
                label: `${format(ws, 'dd/MM')} - ${format(we, 'dd/MM')}`
            };
        });
    }, [monthFilter]);

    // איפוס פילטר שבוע כשמחליפים חודש
    const handleMonthChange = (val) => {
        setMonthFilter(val);
        setWeekFilter('all');
    };

    const filteredShifts = useMemo(() => {
        if (monthFilter === 'all') return week;
        const byMonth = week.filter(s => s.date?.startsWith(monthFilter));
        if (weekFilter === 'all') return byMonth;
        const ws = parseISO(weekFilter);
        const we = endOfWeek(ws, { weekStartsOn: 0 });
        return byMonth.filter(s => {
            const d = parseISO(s.date);
            return d >= ws && d <= we;
        });
    }, [week, monthFilter, weekFilter]);

    const filteredTipReports = useMemo(() => {
        if (monthFilter === 'all') return tipReports;
        const byMonth = tipReports.filter(r => r.date?.startsWith(monthFilter));
        if (weekFilter === 'all') return byMonth;
        const ws = parseISO(weekFilter);
        const we = endOfWeek(ws, { weekStartsOn: 0 });
        return byMonth.filter(r => {
            const d = parseISO(r.date);
            return d >= ws && d <= we;
        });
    }, [tipReports, monthFilter, weekFilter]);

    // חישוב נתונים לכל עובד
    const stats = useMemo(() => {
        const empStats = {};

        employees.forEach(emp => {
            empStats[emp.id] = {
                id: emp.id,
                name: emp.full_name,
                totalShifts: 0,
                totalHours: 0,
                closings: 0,
                openings: 0,
                thursdayClosings: 0,
                saturdayClosings: 0,
                thursdayShifts: 0,
                saturdayShifts: 0,
            };
        });

        // ספירת שיבוצים ושעות — משמרת ייחודית לפי תאריך+סוג לכל עובד
        filteredShifts.forEach(shift => {
            if (!shift.assigned_staff?.length || !shift.date) return;
            const dayOfWeek = getDay(parseISO(shift.date));

            // מזהה ייחודי של המשמרת
            const shiftKey = `${shift.date}_${shift.shift_type}`;

            // עובדים שכבר נספרו במשמרת זו (למנוע כפילות מתפקידים מרובים)
            const countedInShift = new Set();

            shift.assigned_staff.forEach(a => {
                if (!empStats[a.employee_id]) return;
                const s = empStats[a.employee_id];

                // שעות — לפי שעות השיבוץ הספציפי אם קיימות, אחרת לפי שעות המשמרת
                const hours = calcHours(a.start_time, a.end_time) || calcHours(shift.start_time, shift.end_time);
                s.totalHours += hours;

                // משמרות — ספירה ייחודית לכל עובד למשמרת
                const uniqueKey = `${shiftKey}_${a.employee_id}`;
                if (!countedInShift.has(uniqueKey)) {
                    countedInShift.add(uniqueKey);
                    s.totalShifts++;
                    if (dayOfWeek === 4) s.thursdayShifts++;
                    if (dayOfWeek === 6) s.saturdayShifts++;
                }
            });
        });

        // ספירת פתיחות וסגירות מ-TipReport
        filteredTipReports.forEach(report => {
            const dayOfWeek = report.date ? getDay(parseISO(report.date)) : -1;

            (report.closing_employee_ids || []).forEach(empId => {
                if (!empStats[empId]) return;
                empStats[empId].closings++;
                if (dayOfWeek === 4) empStats[empId].thursdayClosings++;
                if (dayOfWeek === 6) empStats[empId].saturdayClosings++;
            });

            (report.opening_employee_ids || []).forEach(empId => {
                if (!empStats[empId]) return;
                empStats[empId].openings++;
            });
        });

        return Object.values(empStats).filter(s => s.totalShifts > 0 || s.closings > 0 || s.openings > 0);
    }, [filteredShifts, filteredTipReports, employees]);

    const top = (field, n = 3) =>
        [...stats].sort((a, b) => b[field] - a[field]).filter(s => s[field] > 0).slice(0, n);

    const medals = ['🥇', '🥈', '🥉'];

    const InsightCard = ({ title, icon: Icon, color, items, field, unit = '' }) => (
        <Card className={`border-r-4 ${color}`}>
            <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
                {items.length === 0 ? (
                    <p className="text-xs text-gray-400">אין נתונים</p>
                ) : (
                    <div className="space-y-2">
                        {items.map((emp, i) => (
                            <div key={emp.id} className="flex items-center justify-between">
                                <span className="text-sm flex items-center gap-1">
                                    <span>{medals[i] || `${i + 1}.`}</span>
                                    <span className="font-medium">{emp.name}</span>
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                    {typeof emp[field] === 'number' && unit === 'שעות'
                                        ? `${emp[field].toFixed(1)} ${unit}`
                                        : `${emp[field]} ${unit}`}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <Card className="mt-6">
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        הסקת מסקנות מהסידור
                    </CardTitle>
                    <div className="flex gap-2">
                        <Select value={monthFilter} onValueChange={handleMonthChange}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="כל הזמנים" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל הזמנים</SelectItem>
                                {availableMonths.map(m => (
                                    <SelectItem key={m} value={m}>
                                        {format(parseISO(m + '-01'), 'MMMM yyyy', { locale: he })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {monthFilter !== 'all' && availableWeeks.length > 0 && (
                            <Select value={weekFilter} onValueChange={setWeekFilter}>
                                <SelectTrigger className="w-44">
                                    <SelectValue placeholder="כל השבועות" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">כל השבועות</SelectItem>
                                    {availableWeeks.map(w => (
                                        <SelectItem key={w.value} value={w.value}>
                                            {w.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <InsightCard
                        title="הכי הרבה סגירות החודש"
                        icon={Star}
                        color="border-red-400"
                        items={top('closings')}
                        field="closings"
                        unit="סגירות"
                    />
                    <InsightCard
                        title="סגירות בימי חמישי"
                        icon={Calendar}
                        color="border-orange-400"
                        items={top('thursdayClosings')}
                        field="thursdayClosings"
                        unit="סגירות"
                    />
                    <InsightCard
                        title="סגירות במוצ״ש (שבת)"
                        icon={Calendar}
                        color="border-yellow-500"
                        items={top('saturdayClosings')}
                        field="saturdayClosings"
                        unit="סגירות"
                    />
                    <InsightCard
                        title="הכי הרבה פתיחות"
                        icon={TrendingUp}
                        color="border-purple-400"
                        items={top('openings')}
                        field="openings"
                        unit="פתיחות"
                    />
                    <InsightCard
                        title="הכי הרבה משמרות"
                        icon={Users}
                        color="border-blue-400"
                        items={top('totalShifts')}
                        field="totalShifts"
                        unit="משמרות"
                    />
                    <InsightCard
                        title="הכי הרבה שעות"
                        icon={Clock}
                        color="border-green-500"
                        items={top('totalHours')}
                        field="totalHours"
                        unit="שעות"
                    />
                </div>
            </CardContent>
        </Card>
    );
}