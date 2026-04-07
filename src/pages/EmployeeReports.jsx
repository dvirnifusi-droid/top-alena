import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Clock, DollarSign, BarChart3, Calendar, Target, AlertCircle, FileDown, Pencil, Users, Trash2, Plus, Save, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// Split daily hours into regular / 125% / 150% overtime buckets
function calcOvertimeBreakdown(dailyHours) {
    const regular = Math.min(dailyHours, 8);
    const h125 = dailyHours > 8 ? Math.min(dailyHours - 8, 2) : 0;
    const h150 = dailyHours > 10 ? dailyHours - 10 : 0;
    return { regular, h125, h150 };
}

export default function EmployeeReportsPage() {
    return (
        <PageGuard pageName="EmployeeReports" pageTitle="דוחות עובדים">
            <EmployeeReportsInner />
        </PageGuard>
    );
}

function EmployeeReportsInner() {
    const { toast } = useToast();
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
    // Add manual shift
    const [showAddShift, setShowAddShift] = useState(false);
    const [addShiftForm, setAddShiftForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), shift_type: 'dinner', position: '', start_time: '', end_time: '', break_minutes: 0 });
    const [savingAddShift, setSavingAddShift] = useState(false);
    // Rates per position for gross calculation
    const [positionRates, setPositionRates] = useState({}); // { positionName: rate }
    // All positions for the selected employee (including manually added)
    const [employeePositions, setEmployeePositions] = useState([]); // [{ position_name, rate }]
    const [newPositionName, setNewPositionName] = useState('');
    const [customPositionInput, setCustomPositionInput] = useState('');
    const [savingRates, setSavingRates] = useState(false);

    const handleAddManualShift = async () => {
        if (!selectedEmployeeId) { toast({ title: 'שגיאה', description: 'לא נבחר עובד', variant: 'destructive' }); return; }
        if (!addShiftForm.date) { toast({ title: 'שגיאה', description: 'חסר תאריך', variant: 'destructive' }); return; }
        if (!addShiftForm.start_time) { toast({ title: 'שגיאה', description: 'חסרה שעת כניסה', variant: 'destructive' }); return; }
        if (!addShiftForm.end_time) { toast({ title: 'שגיאה', description: 'חסרה שעת יציאה', variant: 'destructive' }); return; }
        setSavingAddShift(true);
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const newEntry = { employee_id: selectedEmployeeId, employee_name: emp?.full_name || '', position: addShiftForm.position, start_time: addShiftForm.start_time, end_time: addShiftForm.end_time, total_break_minutes: Number(addShiftForm.break_minutes) || 0, status: 'scheduled' };
        const existing = await base44.entities.WorkShift.filter({ date: addShiftForm.date, shift_type: addShiftForm.shift_type });
        if (existing.length > 0) {
            await base44.entities.WorkShift.update(existing[0].id, { assigned_staff: [...(existing[0].assigned_staff || []), newEntry] });
        } else {
            await base44.entities.WorkShift.create({ date: addShiftForm.date, shift_type: addShiftForm.shift_type, start_time: addShiftForm.start_time, end_time: addShiftForm.end_time, assigned_staff: [newEntry] });
        }
        setSavingAddShift(false);
        setShowAddShift(false);
        await loadReportData();
    };

    const handleDeleteShiftEntry = async (entry) => {
        if (!confirm(`למחוק את המשמרת מתאריך ${entry.date}?`)) return;
        const ws = workShifts.find(w => w.id === entry.workShiftId);
        if (!ws) return;
        const updatedStaff = (ws.assigned_staff || []).filter(a =>
            !(a.employee_id === selectedEmployeeId && a.start_time === entry.start_time && a.end_time === entry.end_time && ws.date === entry.date)
        );
        await base44.entities.WorkShift.update(ws.id, { assigned_staff: updatedStaff });
        await loadReportData();
    };
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

        const tipEntries = allTipEntries.filter(e => inPeriod(e.date) && (!e.position || TIP_POSITIONS.includes(e.position)));

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

    // --- Excel Export helpers ---
    const downloadCsv = (rows, filename) => {
        const bom = '\uFEFF';
        const csv = bom + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    const exportHourlyShiftsExcel = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MM-yyyy');
        const rows = [['שם עובד', 'תאריך', 'משמרת', 'תפקיד', 'כניסה', 'יציאה', 'הפסקה (דק\')', 'שעות נטו', 'תעריף לשעה', 'ברוטו']];
        filteredData.hourlyShiftEntries
            .sort((a, b) => a.date.localeCompare(b.date))
            .forEach(e => {
                const rate = parseFloat(positionRates[e.position] || 0);
                const gross = rate > 0 ? parseFloat((e.net_hours * rate).toFixed(2)) : '';
                rows.push([
                    emp?.full_name || '',
                    format(new Date(e.date), 'dd/MM/yyyy'),
                    e.shift_type === 'lunch' ? 'צהריים' : 'ערב',
                    e.position,
                    e.start_time,
                    e.end_time,
                    e.break_minutes || 0,
                    parseFloat(e.net_hours.toFixed(2)),
                    rate || '',
                    gross,
                ]);
            });
        const total = filteredData.hourlyShiftEntries.reduce((s, e) => s + e.net_hours, 0);
        const totalGross = filteredData.hourlyShiftEntries.reduce((s, e) => {
            const rate = parseFloat(positionRates[e.position] || 0);
            return s + (rate > 0 ? e.net_hours * rate : 0);
        }, 0);
        rows.push(['', '', '', '', '', '', 'סה"כ:', parseFloat(total.toFixed(2)), '', totalGross > 0 ? parseFloat(totalGross.toFixed(2)) : '']);
        downloadCsv(rows, `שעות_סידור_${emp?.full_name || ''}_${monthLabel}.csv`);
    };

    const exportTipsExcel = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MM-yyyy');
        const rows = [['שם עובד', 'תאריך', 'משמרת', 'תפקיד', 'שעות', 'טיפ ברוטו', 'ארוחה', 'בונוס', 'השלמה', 'סה"כ']];
        filteredData.tipEntries.forEach(e => rows.push([
            emp?.full_name || '',
            format(new Date(e.date), 'dd/MM/yyyy'),
            e.shift_type === 'lunch' ? 'צהריים' : 'ערב',
            e.position || '',
            parseFloat((e.effectiveHours || 0).toFixed(2)),
            parseFloat((e.grossTip || 0).toFixed(2)),
            parseFloat((e.meal_cost || 0).toFixed(2)),
            parseFloat((e.sales_bonus || 0).toFixed(2)),
            parseFloat((e.supplement || 0).toFixed(2)),
            parseFloat((e.totalEarnings || 0).toFixed(2)),
        ]));
        const totalEarnings = filteredData.tipEntries.reduce((s, e) => s + (e.totalEarnings || 0), 0);
        rows.push(['', '', '', '', '', '', '', '', 'סה"כ:', parseFloat(totalEarnings.toFixed(2))]);
        downloadCsv(rows, `טיפים_${emp?.full_name || ''}_${monthLabel}.csv`);
    };

    const exportMonthlySummaryExcel = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MM-yyyy');
        const rows = [['שם עובד', 'שבוע', 'שעות', 'שעות רגילות', 'שעות נוספות']];
        monthlyBreakdown.weeks.forEach(w => rows.push([
            emp?.full_name || '',
            w.label,
            w.hours,
            w.regular,
            w.overtime,
        ]));
        rows.push(['', 'סה"כ חודשי:', parseFloat(monthlyBreakdown.totalHours), parseFloat(monthlyBreakdown.totalRegular), parseFloat(monthlyBreakdown.totalOvertime)]);
        const totalTipEarnings = filteredData.tipEntries.reduce((s, e) => s + (e.totalEarnings || 0), 0);
        const totalTipHours = filteredData.tipEntries.reduce((s, e) => s + (e.effectiveHours || 0), 0);
        rows.push([]);
        rows.push(['סיכום טיפים', '', '', '', '']);
        rows.push(['שעות טיפים', parseFloat(totalTipHours.toFixed(2)), '', '', '']);
        rows.push(['סה"כ טיפים', parseFloat(totalTipEarnings.toFixed(2)), '', '', '']);
        downloadCsv(rows, `סיכום_חודשי_${emp?.full_name || ''}_${monthLabel}.csv`);
    };

    const sendWhatsApp = (text) => {
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const sendHourlyShiftsWhatsApp = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: he });
        let text = `📋 *דוח שעות סידור - ${emp?.full_name || ''}*\n📅 ${monthLabel}\n\n`;
        // Group by date for overtime calc
        const byDate = {};
        filteredData.hourlyShiftEntries.forEach(e => {
            byDate[e.date] = (byDate[e.date] || 0) + e.net_hours;
        });
        let totRegular = 0, totH125 = 0, totH150 = 0;
        Object.values(byDate).forEach(h => {
            const { regular, h125, h150 } = calcOvertimeBreakdown(h);
            totRegular += regular; totH125 += h125; totH150 += h150;
        });
        filteredData.hourlyShiftEntries
            .sort((a, b) => a.date.localeCompare(b.date))
            .forEach(e => {
                text += `${format(new Date(e.date), 'dd/MM/yyyy')} | ${e.shift_type === 'lunch' ? 'צהריים' : 'ערב'} | ${e.position} | ${e.start_time}-${e.end_time} | ${e.net_hours.toFixed(2)} ש'\n`;
            });
        const total = filteredData.hourlyShiftEntries.reduce((s, e) => s + e.net_hours, 0);
        text += `\n*סה"כ: ${total.toFixed(2)} שעות*\n`;
        text += `-- פירוט שעות --\n`;
        text += `שעות רגילות (100%): ${totRegular.toFixed(2)}\n`;
        text += `שעות 125%: ${totH125.toFixed(2)}\n`;
        text += `שעות 150%: ${totH150.toFixed(2)}`;
        sendWhatsApp(text);
    };

    const sendTipsWhatsApp = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: he });
        let text = `💰 *דוח טיפים - ${emp?.full_name || ''}*\n📅 ${monthLabel}\n\n`;
        filteredData.tipEntries.forEach(e => {
            text += `${format(new Date(e.date), 'dd/MM/yyyy')} | ${e.shift_type === 'lunch' ? 'צהריים' : 'ערב'} | ${e.effectiveHours?.toFixed(1)} ש' | ₪${e.totalEarnings?.toFixed(2)}\n`;
        });
        const total = filteredData.tipEntries.reduce((s, e) => s + (e.totalEarnings || 0), 0);
        text += `\n*סה"כ טיפים: ₪${total.toFixed(2)}*`;
        sendWhatsApp(text);
    };

    const sendMonthlySummaryWhatsApp = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: he });
        let text = `📊 *סיכום חודשי - ${emp?.full_name || ''}*\n📅 ${monthLabel}\n\n`;
        monthlyBreakdown.weeks.forEach(w => {
            text += `📆 ${w.label}: ${w.hours} ש'`;
            if (w.overtime > 0) text += ` (כולל ${w.overtime} נוספות)`;
            text += '\n';
        });
        text += `\n*סה"כ שעות: ${monthlyBreakdown.totalHours}*\n*שעות רגילות: ${monthlyBreakdown.totalRegular}*\n*שעות נוספות: ${monthlyBreakdown.totalOvertime}*`;
        const totalTipEarnings = filteredData.tipEntries.reduce((s, e) => s + (e.totalEarnings || 0), 0);
        if (totalTipEarnings > 0) {
            text += `\n\n💰 *סה"כ טיפים: ₪${totalTipEarnings.toFixed(2)}*`;
        }
        sendWhatsApp(text);
    };

    // When employee changes, pre-fill rates from their positions config
    React.useEffect(() => {
        if (!selectedEmployeeId || selectedEmployeeId === 'all') return;
        const emp = employees.find(e => e.id === selectedEmployeeId);
        const savedPositions = (emp?.positions || []).filter(p => p.position_name);
        setEmployeePositions(savedPositions.map(p => ({ position_name: p.position_name, rate: p.rate || 0 })));
        const rates = {};
        savedPositions.forEach(p => { if (p.rate) rates[p.position_name] = p.rate; });
        setPositionRates(rates);
    }, [selectedEmployeeId, employees]);

    const savePositionRates = async () => {
        if (!selectedEmployeeId || selectedEmployeeId === 'all') return;
        setSavingRates(true);
        const positionsToSave = employeePositions.map(p => ({
            position_name: p.position_name,
            pay_type: 'hourly',
            rate: parseFloat(positionRates[p.position_name] || 0),
        }));
        await base44.entities.Employee.update(selectedEmployeeId, { positions: positionsToSave });
        setEmployees(prev => prev.map(e => e.id === selectedEmployeeId ? { ...e, positions: positionsToSave } : e));
        setSavingRates(false);
    };

    const addPosition = () => {
        const name = (newPositionName === '__custom__' ? customPositionInput : newPositionName).trim();
        if (!name || name === '__custom__' || employeePositions.find(p => p.position_name === name)) return;
        setEmployeePositions(prev => [...prev, { position_name: name, rate: 0 }]);
        setNewPositionName('');
        setCustomPositionInput('');
    };

    const removePosition = (name) => {
        setEmployeePositions(prev => prev.filter(p => p.position_name !== name));
        setPositionRates(prev => { const n = { ...prev }; delete n[name]; return n; });
    };

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
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900">דוחות עובדים</h1>
                        <p className="text-slate-600 mt-1">
                            {isAdmin ? 'מעקב שעות עבודה, טיפים וביצועים לכל העובדים' : `הדוח האישי שלך - ${selectedEmployee?.full_name || ''}`}
                        </p>
                    </div>
                    {isAdmin && (
                        <Button
                            onClick={() => { setExportSelectedEmps(employees.map(e => e.id)); setShowExport(true); }}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                        >
                            <FileDown className="w-4 h-4" />
                            ייצוא לרואה חשבון
                        </Button>
                    )}
                </div>

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
                                            <SelectItem value="all">👥 כל העובדים (דוח מרוכז)</SelectItem>
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
                                            {Array.from({ length: 24 }, (_, i) => -i).map(offset => {
                                                const month = subMonths(new Date(), -offset);
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

                {/* תצוגת כל העובדים - דוח מרוכז */}
                {selectedEmployeeId === 'all' && (
                    <AllEmployeesSummary
                        workShifts={workShifts}
                        employees={employees}
                        selectedMonth={selectedMonth}
                        tipReports={tipReports}
                        onExport={() => { setExportSelectedEmps(employees.map(e => e.id)); setShowExport(true); }}
                    />
                )}

                {selectedEmployeeId !== 'all' && (
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
                        <div className="flex justify-end gap-2 mb-4">
                            <Button onClick={sendMonthlySummaryWhatsApp} variant="outline" className="flex items-center gap-2 border-green-400 text-green-600 hover:bg-green-50">
                                <span>📱</span>
                                שלח לוואטסאפ
                            </Button>
                            <Button onClick={exportMonthlySummaryExcel} variant="outline" className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                                <FileDown className="w-4 h-4" />
                                ייצוא סיכום חודשי לאקסל
                            </Button>
                        </div>
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
                        <div className="flex justify-end gap-2 mb-4">
                            <Button onClick={sendHourlyShiftsWhatsApp} variant="outline" className="flex items-center gap-2 border-green-400 text-green-600 hover:bg-green-50" disabled={filteredData.hourlyShiftEntries.length === 0}>
                                <span>📱</span>
                                שלח לוואטסאפ
                            </Button>
                            <Button onClick={exportHourlyShiftsExcel} variant="outline" className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50" disabled={filteredData.hourlyShiftEntries.length === 0}>
                                <FileDown className="w-4 h-4" />
                                ייצוא שעות סידור לאקסל
                            </Button>
                        </div>

                        {/* תעריפים לפי תפקיד */}
                        {isAdmin && selectedEmployeeId && selectedEmployeeId !== 'all' && (
                            <Card className="mb-4 border-2 border-orange-200 bg-orange-50">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-orange-800">💵 תעריפים לפי תפקיד (ברוטו)</CardTitle>
                                        <Button size="sm" onClick={savePositionRates} disabled={savingRates} className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1">
                                            {savingRates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            שמור תעריפים
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 mb-4">
                                        {employeePositions.length === 0 && (
                                            <p className="text-sm text-gray-400">אין תפקידים מוגדרים. הוסף תפקיד למטה.</p>
                                        )}
                                        {employeePositions.map(pos => (
                                            <div key={pos.position_name} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border">
                                                <span className="font-medium text-gray-800 min-w-[120px]">{pos.position_name}</span>
                                                <span className="text-gray-400 text-sm">₪</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="0"
                                                    value={positionRates[pos.position_name] || ''}
                                                    onChange={e => setPositionRates(prev => ({ ...prev, [pos.position_name]: e.target.value }))}
                                                    className="w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                                />
                                                <span className="text-gray-400 text-xs">/שעה</span>
                                                <button onClick={() => removePosition(pos.position_name)} className="mr-auto text-gray-400 hover:text-red-500 p-1">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 border-t pt-3">
                                        <select
                                            value={newPositionName}
                                            onChange={e => setNewPositionName(e.target.value)}
                                            className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                                        >
                                            <option value="">-- בחר תפקיד להוספה --</option>
                                            {[...new Set([
                                                ...employees.flatMap(e => (e.positions || []).map(p => p.position_name).filter(Boolean)),
                                                ...workShifts.flatMap(ws => (ws.assigned_staff || []).map(a => a.position).filter(Boolean))
                                            ])]
                                            .filter(pos => !employeePositions.find(p => p.position_name === pos))
                                            .sort()
                                            .map(pos => (
                                                <option key={pos} value={pos}>{pos}</option>
                                            ))}
                                            <option value="__custom__">+ הקלד תפקיד חדש...</option>
                                        </select>
                                        {newPositionName === '__custom__' && (
                                            <input
                                                type="text"
                                                placeholder="שם תפקיד חדש"
                                                autoFocus
                                                value={customPositionInput}
                                                onChange={e => setCustomPositionInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') addPosition(); }}
                                                className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                            />
                                        )}
                                        <Button size="sm" onClick={addPosition} variant="outline" className="border-orange-400 text-orange-600 hover:bg-orange-100" disabled={!newPositionName || (newPositionName === '__custom__' && !customPositionInput.trim())}>
                                            <Plus className="w-4 h-4" />
                                            הוסף
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

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
                            {(() => {
                            const totalGross = filteredData.hourlyShiftEntries.reduce((s, e) => {
                                const rate = parseFloat(positionRates[e.position] || 0);
                                return s + (rate > 0 ? e.net_hours * rate : 0);
                            }, 0);
                            const byDate2 = {};
                            filteredData.hourlyShiftEntries.forEach(e => { byDate2[e.date] = (byDate2[e.date] || 0) + e.net_hours; });
                            let r = 0, h1 = 0, h2 = 0;
                            Object.values(byDate2).forEach(h => { const b = calcOvertimeBreakdown(h); r += b.regular; h1 += b.h125; h2 += b.h150; });
                            return (
                                <>
                                <tr className="border-t-2 border-gray-400 bg-blue-50">
                                    <td colSpan={isAdmin ? 7 : 6} className="py-3 px-4 font-bold text-right text-blue-800">סה"כ שעות לתקופה:</td>
                                    <td className="py-3 px-4 font-bold text-xl text-blue-700">{calculations.totalHourlyHours}</td>
                                    <td className="py-3 px-4 font-bold text-xl text-orange-600">{totalGross > 0 ? `₪${totalGross.toFixed(2)}` : ''}</td>
                                </tr>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                    <td colSpan={isAdmin ? 9 : 7} className="py-2 px-4">
                                        <div className="flex flex-wrap gap-4 text-xs font-semibold">
                                            <span className="text-green-700">✅ שעות רגילות (100%): {r.toFixed(2)}</span>
                                            <span className="text-orange-600">⚡ שעות 125%: {h1.toFixed(2)}</span>
                                            <span className="text-red-600">🔥 שעות 150%: {h2.toFixed(2)}</span>
                                        </div>
                                    </td>
                                </tr>
                                </>
                            );
                            })()}
                            </div>

                        <Card className="border-2">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>פירוט משמרות לפי סידור עבודה</CardTitle>
                                        <p className="text-sm text-gray-500 mt-1">תפקידים שאינם מלצר/ברמן/ראנר (אלו נמצאים בטאב הטיפים)</p>
                                    </div>
                                    {isAdmin && (
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => { setAddShiftForm({ date: format(selectedMonth, 'yyyy-MM') + '-01', shift_type: 'dinner', position: '', start_time: '', end_time: '', break_minutes: 0 }); setShowAddShift(true); }} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white">
                                                <Plus className="w-4 h-4" />
                                                הוסף משמרת ידנית
                                            </Button>
                                            {filteredData.hourlyShiftEntries.length > 0 && (
                                                <Button size="sm" variant="outline" onClick={() => { setExportSelectedEmps([selectedEmployeeId]); setShowExport(true); }} className="flex items-center gap-2">
                                                    <FileDown className="w-4 h-4" />
                                                    ייצא עובד זה
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
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
                                                            <th className="text-right py-3 px-4 font-bold text-orange-600">ברוטו</th>
                                                            {isAdmin && <th className="py-3 px-4" colSpan={2}></th>}
                                                        </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                                         const sorted = [...filteredData.hourlyShiftEntries].sort((a, b) => a.date.localeCompare(b.date));
                                                                         const toMins = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                                                                         const overlaps = (a, b) => toMins(a.start_time) < toMins(b.end_time) && toMins(a.end_time) > toMins(b.start_time);
                                                                         const rowClass = (entry, idx) => {
                                                                             const sameDate = sorted.filter((e, i) => i !== idx && e.date === entry.date);
                                                                             if (sameDate.length === 0) return 'border-b border-gray-200 hover:bg-slate-50';
                                                                             const hasOverlap = sameDate.some(e => overlaps(entry, e));
                                                                             return hasOverlap ? 'border-b border-red-900 bg-red-900/20' : 'border-b border-red-200 bg-red-50';
                                                                         };
                                                                         return sorted.map((entry, idx) => (
                                                                         <tr key={idx} className={rowClass(entry, idx)}>
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
                                                                         <td className="py-3 px-4 font-bold text-orange-600">
                                                                         {positionRates[entry.position] > 0 ? `₪${(entry.net_hours * parseFloat(positionRates[entry.position])).toFixed(2)}` : '-'}
                                                                         </td>
                                                                         {isAdmin && (
                                                                         <td className="py-3 px-4">
                                                                         <button onClick={() => setEditShift({ entry, workShiftId: entry.workShiftId })} className="text-gray-500 hover:text-blue-600 p-1">
                                                                         <Pencil className="w-3.5 h-3.5" />
                                                                         </button>
                                                                         </td>
                                                                         )}
                                                                         {isAdmin && (
                                                                         <td className="py-3 px-2">
                                                                         <button onClick={() => handleDeleteShiftEntry(entry)} className="text-gray-400 hover:text-red-600 p-1">
                                                                         <Trash2 className="w-3.5 h-3.5" />
                                                                         </button>
                                                                         </td>
                                                                         )}
                                                                         </tr>
                                                                         ));
                                                                         })()}
                                                                         {(() => {
                                                                         const totalGross = filteredData.hourlyShiftEntries.reduce((s, e) => {
                                                                         const rate = parseFloat(positionRates[e.position] || 0);
                                                                         return s + (rate > 0 ? e.net_hours * rate : 0);
                                                                         }, 0);
                                                                         const byDate2 = {};
                                                                         filteredData.hourlyShiftEntries.forEach(e => { byDate2[e.date] = (byDate2[e.date] || 0) + e.net_hours; });
                                                                         let r = 0, h1 = 0, h2 = 0;
                                                                         Object.values(byDate2).forEach(h => { const b = calcOvertimeBreakdown(h); r += b.regular; h1 += b.h125; h2 += b.h150; });
                                                                         return (
                                                                         <>
                                                                         <tr className="border-t-2 border-gray-400 bg-blue-50">
                                                                         <td colSpan={isAdmin ? 7 : 6} className="py-3 px-4 font-bold text-right text-blue-800">סה"כ שעות לתקופה:</td>
                                                                         <td className="py-3 px-4 font-bold text-xl text-blue-700">{calculations.totalHourlyHours}</td>
                                                                         <td className="py-3 px-4 font-bold text-xl text-orange-600">{totalGross > 0 ? `₪${totalGross.toFixed(2)}` : ''}</td>
                                                                         </tr>
                                                                         <tr className="bg-slate-50 border-t border-slate-200">
                                                                         <td colSpan={isAdmin ? 9 : 7} className="py-2 px-4">
                                                                         <div className="flex flex-wrap gap-4 text-xs font-semibold">
                                                                            <span className="text-green-700">✅ שעות רגילות (100%): {r.toFixed(2)}</span>
                                                                            <span className="text-orange-600">⚡ שעות 125%: {h1.toFixed(2)}</span>
                                                                            <span className="text-red-600">🔥 שעות 150%: {h2.toFixed(2)}</span>
                                                                         </div>
                                                                         </td>
                                                                         </tr>
                                                                         </>
                                                                         );
                                                                         })()}
                                                                         </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TAB: טיפים */}
                    <TabsContent value="tips">
                        <div className="flex justify-end gap-2 mb-4">
                            <Button onClick={sendTipsWhatsApp} variant="outline" className="flex items-center gap-2 border-green-400 text-green-600 hover:bg-green-50" disabled={filteredData.tipEntries.length === 0}>
                                <span>📱</span>
                                שלח לוואטסאפ
                            </Button>
                            <Button onClick={exportTipsExcel} variant="outline" className="flex items-center gap-2 border-green-300 text-green-700 hover:bg-green-50" disabled={filteredData.tipEntries.length === 0}>
                                <FileDown className="w-4 h-4" />
                                ייצוא דוח טיפים לאקסל
                            </Button>
                        </div>
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
                )}

            {/* דיאלוג ייצוא */}
            {showExport && (
                <ExportToAccountantDialog
                    open={showExport}
                    onClose={() => setShowExport(false)}
                    employees={employees}
                    selectedEmployees={exportSelectedEmps}
                    hourlyData={(() => {
                        const map = {};
                        workShifts.forEach(ws => {
                            const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
                            const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
                            if (!ws.date || ws.date < monthStart || ws.date > monthEnd) return;
                            (ws.assigned_staff || []).forEach(a => {
                                if (!exportSelectedEmps.includes(a.employee_id)) return;
                                const hours = calcHours(a.start_time, a.end_time);
                                if (hours <= 0) return;
                                if (!map[a.employee_id]) map[a.employee_id] = [];
                                map[a.employee_id].push({
                                    date: ws.date,
                                    shift_type: ws.shift_type,
                                    position: a.position,
                                    start_time: a.start_time,
                                    end_time: a.end_time,
                                    break_minutes: a.total_break_minutes || 0,
                                    net_hours: hours - (a.total_break_minutes || 0) / 60,
                                });
                            });
                        });
                        return map;
                    })()}
                    tipData={(() => {
                        const map = {};
                        tipReports.forEach(report => {
                            const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
                            const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
                            if (!report.date || report.date < monthStart || report.date > monthEnd) return;
                            (report.staff_details || []).forEach(s => {
                                const emp = employees.find(e =>
                                    e.id === s.employee_id ||
                                    (e.full_name && s.employee_name && e.full_name.toLowerCase() === s.employee_name.toLowerCase())
                                );
                                if (!emp || !exportSelectedEmps.includes(emp.id)) return;
                                if (!map[emp.id]) map[emp.id] = [];
                                map[emp.id].push({
                                    date: report.date,
                                    shift_type: report.shift_type,
                                    position: s.position,
                                    effectiveHours: s.effective_hours || 0,
                                    totalEarnings: s.total_earnings || s.final_tip || 0,
                                });
                            });
                        });
                        return map;
                    })()}
                    monthLabel={format(selectedMonth, 'MMMM yyyy', { locale: he })}
                />
            )}

            {/* דיאלוג הוספת משמרת ידנית */}
            {showAddShift && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                        <h2 className="text-lg font-bold">הוסף משמרת ידנית - {employees.find(e => e.id === selectedEmployeeId)?.full_name}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>תאריך</Label>
                                <Input type="date" value={addShiftForm.date} onChange={e => setAddShiftForm(p => ({ ...p, date: e.target.value }))} />
                            </div>
                            <div>
                                <Label>סוג משמרת</Label>
                                <select value={addShiftForm.shift_type} onChange={e => setAddShiftForm(p => ({ ...p, shift_type: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                                    <option value="dinner">ערב</option>
                                    <option value="lunch">צהריים</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <Label>תפקיד</Label>
                            <Input value={addShiftForm.position} onChange={e => setAddShiftForm(p => ({ ...p, position: e.target.value }))} placeholder="לדוגמה: מטבח, שליח..." />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>שעת כניסה</Label>
                                <Input type="time" value={addShiftForm.start_time} onChange={e => setAddShiftForm(p => ({ ...p, start_time: e.target.value }))} />
                            </div>
                            <div>
                                <Label>שעת יציאה</Label>
                                <Input type="time" value={addShiftForm.end_time} onChange={e => setAddShiftForm(p => ({ ...p, end_time: e.target.value }))} />
                            </div>
                        </div>
                        <div>
                            <Label>הפסקה (דקות)</Label>
                            <Input type="number" min={0} value={addShiftForm.break_minutes} onChange={e => setAddShiftForm(p => ({ ...p, break_minutes: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button onClick={handleAddManualShift} disabled={savingAddShift} className="flex-1 bg-green-600 hover:bg-green-700">
                                {savingAddShift ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                הוסף משמרת
                            </Button>
                            <Button variant="outline" onClick={() => setShowAddShift(false)}>ביטול</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* דיאלוג עריכת משמרת */}
            {editShift && (
                <ShiftEditInlineDialog
                    open={!!editShift}
                    onClose={() => setEditShift(null)}
                    shiftEntry={editShift.entry}
                    workShiftId={editShift.workShiftId}
                    employeeId={selectedEmployeeId}
                    onSaved={loadReportData}
                />
            )}
        </div>
    </div>
    );
}

function AllEmployeesSummary({ workShifts, employees, selectedMonth, tipReports, onExport }) {
    const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

    const data = employees.map(emp => {
        // hourly shifts grouped by position, calculate overtime per shift entry directly
        const hourlyByPosition = {};
        const overtimeByPosition = {}; // pos -> { regular, h125, h150 }
        const workDates = new Set();
        workShifts.forEach(ws => {
            if (!ws.date || ws.date < monthStart || ws.date > monthEnd) return;
            (ws.assigned_staff || []).forEach(a => {
                if (a.employee_id !== emp.id) return;
                if (TIP_POSITIONS.includes(a.position)) return;
                const hours = calcHours(a.start_time, a.end_time) - (a.total_break_minutes || 0) / 60;
                if (hours <= 0) return;
                workDates.add(ws.date);
                const pos = a.position || 'לא מוגדר';
                if (!hourlyByPosition[pos]) hourlyByPosition[pos] = 0;
                hourlyByPosition[pos] += hours;
                // Calculate overtime for THIS shift entry directly by position
                const { regular, h125, h150 } = calcOvertimeBreakdown(hours);
                if (!overtimeByPosition[pos]) overtimeByPosition[pos] = { regular: 0, h125: 0, h150: 0 };
                overtimeByPosition[pos].regular += regular;
                overtimeByPosition[pos].h125 += h125;
                overtimeByPosition[pos].h150 += h150;
            });
        });

        let totalRegular = 0, totalH125 = 0, totalH150 = 0;
        Object.values(overtimeByPosition).forEach(({ regular, h125, h150 }) => {
            totalRegular += regular;
            totalH125 += h125;
            totalH150 += h150;
        });

        // tip shifts grouped by position
        const tipByPosition = {};
        const tipDates = new Set();
        tipReports.forEach(report => {
            if (!report.date || report.date < monthStart || report.date > monthEnd) return;
            const s = (report.staff_details || []).find(s =>
                s.employee_id === emp.id ||
                (emp.full_name && s.employee_name && s.employee_name.trim().toLowerCase() === emp.full_name.trim().toLowerCase())
            );
            if (!s) return;
            if (s.position && !TIP_POSITIONS.includes(s.position)) return;
            tipDates.add(report.date);
            const pos = s.position || 'מלצר';
            if (!tipByPosition[pos]) tipByPosition[pos] = { hours: 0, earnings: 0 };
            tipByPosition[pos].hours += s.effective_hours || 0;
            tipByPosition[pos].earnings += s.total_earnings || s.final_tip || 0;
        });

        const totalDays = new Set([...workDates, ...tipDates]).size;
        const totalHourlyHours = Object.values(hourlyByPosition).reduce((s, h) => s + h, 0);
        const totalTipEarnings = Object.values(tipByPosition).reduce((s, p) => s + p.earnings, 0);

        return { emp, hourlyByPosition, overtimeByPosition, tipByPosition, totalDays, totalHourlyHours, totalTipEarnings, totalRegular, totalH125, totalH150 };
    }).filter(d => d.totalDays > 0);

    const sendAllWhatsApp = () => {
        const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: he });
        let text = `📊 *דוח עובדים - ${monthLabel}*\n${'─'.repeat(30)}\n\n`;

        // סיכום לפי תפקיד
        text += `📊 *סיכום כללי לפי תפקיד:*\n`;
        Object.entries(positionSummary).forEach(([pos, s]) => {
            if (s.isTip) {
                text += `  📌 ${pos} | עובדים: ${s.empSet.size} | שעות: ${s.hours.toFixed(2)} | טיפ: ₪${s.earnings.toFixed(2)}\n`;
            } else {
                text += `  📌 ${pos} | עובדים: ${s.empSet.size} | שעות: ${s.hours.toFixed(2)} | 100%: ${s.regular.toFixed(2)} | 125%: ${s.h125.toFixed(2)} | 150%: ${s.h150.toFixed(2)}\n`;
            }
        });
        text += `${'─'.repeat(30)}\n\n`;

        // פירוט לפי עובד
        data.forEach(({ emp, hourlyByPosition, tipByPosition, totalDays, totalRegular, totalH125, totalH150 }) => {
            text += `👤 *${emp.full_name}* - סה"כ ${totalDays} ימי עבודה\n`;
            Object.entries(hourlyByPosition).forEach(([pos, hours]) => {
                text += `  📌 ${pos} - סה"כ ${hours.toFixed(2)} שעות\n`;
            });
            if (Object.keys(hourlyByPosition).length > 0) {
                text += `  -- פירוט שעות --\n`;
                text += `  שעות רגילות (100%): ${totalRegular.toFixed(2)}\n`;
                text += `  שעות 125%: ${totalH125.toFixed(2)}\n`;
                text += `  שעות 150%: ${totalH150.toFixed(2)}\n`;
            }
            Object.entries(tipByPosition).forEach(([pos, { hours, earnings }]) => {
                text += `  📌 ${pos} - סה"כ ${hours.toFixed(2)} שעות, סה"כ טיפ: ₪${earnings.toFixed(2)}\n`;
            });
            text += '\n';
        });
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    // Build cross-employee position summary
    const positionSummary = {}; // { pos: { hours, regular, h125, h150, earnings, isTip, empSet } }
    data.forEach(({ emp, hourlyByPosition, overtimeByPosition, tipByPosition }) => {
        // hourly positions - use per-position overtime directly
        Object.entries(hourlyByPosition).forEach(([pos, hours]) => {
            if (!positionSummary[pos]) positionSummary[pos] = { hours: 0, regular: 0, h125: 0, h150: 0, earnings: 0, isTip: false, empSet: new Set() };
            const ot = overtimeByPosition?.[pos] || { regular: 0, h125: 0, h150: 0 };
            positionSummary[pos].hours += hours;
            positionSummary[pos].regular += ot.regular;
            positionSummary[pos].h125 += ot.h125;
            positionSummary[pos].h150 += ot.h150;
            positionSummary[pos].empSet.add(emp.id);
        });
        // tip positions
        Object.entries(tipByPosition).forEach(([pos, { hours, earnings }]) => {
            if (!positionSummary[pos]) positionSummary[pos] = { days: 0, hours: 0, regular: 0, h125: 0, h150: 0, earnings: 0, isTip: true, empSet: new Set() };
            positionSummary[pos].hours += hours;
            positionSummary[pos].earnings += earnings;
            positionSummary[pos].empSet.add(emp.id);
            positionSummary[pos].isTip = true;
        });
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xl font-bold">דוח כללי - {format(selectedMonth, 'MMMM yyyy', { locale: he })}</h2>
                <div className="flex gap-2">
                    <Button onClick={sendAllWhatsApp} variant="outline" className="flex items-center gap-2 border-green-400 text-green-600 hover:bg-green-50" disabled={data.length === 0}>
                        <span>📱</span>
                        שלח לוואטסאפ
                    </Button>
                    <Button onClick={onExport} className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2">
                        <FileDown className="w-4 h-4" />
                        ייצוא לרואה חשבון
                    </Button>
                </div>
            </div>

            {/* סיכום מרוכז לפי תפקיד */}
            {Object.keys(positionSummary).length > 0 && (
                <Card className="border-2 border-purple-200 bg-purple-50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-purple-800">📊 סיכום כללי לפי תפקיד - כל העובדים</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b-2 border-purple-300 bg-purple-100">
                                    <tr>
                                        <th className="text-right py-2 px-3">תפקיד</th>
                                        <th className="text-right py-2 px-3">עובדים</th>
                                        <th className="text-right py-2 px-3">סה"כ שעות</th>
                                        <th className="text-right py-2 px-3 text-green-700">רגילות (100%)</th>
                                        <th className="text-right py-2 px-3 text-orange-600">125%</th>
                                        <th className="text-right py-2 px-3 text-red-600">150%</th>
                                        <th className="text-right py-2 px-3 text-blue-700">סה"כ טיפ / עלות</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(positionSummary).map(([pos, s]) => (
                                        <tr key={pos} className="border-b border-purple-100 hover:bg-purple-50">
                                            <td className="py-2 px-3 font-semibold">{pos}</td>
                                            <td className="py-2 px-3 text-gray-600">{s.empSet.size}</td>
                                            <td className="py-2 px-3 font-bold text-blue-700">{s.hours.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-green-700">{s.isTip ? '-' : s.regular.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-orange-600">{s.isTip ? '-' : s.h125.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-red-600">{s.isTip ? '-' : s.h150.toFixed(2)}</td>
                                            <td className="py-2 px-3 font-bold">{s.isTip ? `₪${s.earnings.toFixed(2)}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {data.length === 0 ? (
                <p className="text-center text-gray-500 py-12">אין נתונים לחודש זה</p>
            ) : data.map(({ emp, hourlyByPosition, tipByPosition, totalDays, totalHourlyHours, totalTipEarnings, totalRegular, totalH125, totalH150 }) => (
                <Card key={emp.id} className="border-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <CardTitle className="text-lg">{emp.full_name}</CardTitle>
                                <p className="text-sm text-gray-500 mt-0.5">סה"כ <span className="font-bold text-gray-700">{totalDays}</span> ימי עבודה</p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {totalHourlyHours > 0 && <Badge className="bg-blue-100 text-blue-800">שעות: {totalHourlyHours.toFixed(2)}</Badge>}
                                {totalTipEarnings > 0 && <Badge className="bg-green-100 text-green-800">טיפים: ₪{totalTipEarnings.toFixed(2)}</Badge>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {Object.entries(hourlyByPosition).map(([pos, hours]) => (
                                <div key={pos} className="flex items-center justify-between p-2 rounded-lg bg-blue-50 border border-blue-100">
                                    <span className="font-medium text-gray-700">📌 {pos}</span>
                                    <span className="font-bold text-blue-700">סה"כ {hours.toFixed(2)} שעות</span>
                                </div>
                            ))}
                            {totalHourlyHours > 0 && (
                                <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-slate-100 border border-slate-200 text-xs mt-1">
                                    <span className="font-semibold text-slate-600">פירוט שעות נוספות:</span>
                                    <span className="text-green-700 font-medium">רגילות (100%): {totalRegular.toFixed(2)}</span>
                                    {totalH125 > 0 && <span className="text-orange-600 font-medium">125%: {totalH125.toFixed(2)}</span>}
                                    {totalH150 > 0 && <span className="text-red-600 font-medium">150%: {totalH150.toFixed(2)}</span>}
                                </div>
                            )}
                            {Object.entries(tipByPosition).map(([pos, { hours, earnings }]) => (
                                <div key={pos} className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-100">
                                    <span className="font-medium text-gray-700">📌 {pos}</span>
                                    <div className="flex gap-4 text-sm">
                                        <span className="text-green-700">סה"כ {hours.toFixed(2)} שעות</span>
                                        <span className="font-bold text-green-800">סה"כ טיפ: ₪{earnings.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}