import React, { useState, useEffect, useCallback } from 'react';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, Users, DollarSign, Clock, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/shared/PageHeader';

function ReportsInner() {
    const [tipReports, setTipReports] = useState([]);
    const [workShifts, setWorkShifts] = useState([]);
    const [shiftEndReports, setShiftEndReports] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadReports = useCallback(async () => {
        setLoading(true);
        try {
            const { base44 } = await import('@/api/base44Client');
            
            const [reports, shifts, employeeList, endReports] = await Promise.all([
                base44.entities.TipReport.list('-date', 500),
                base44.entities.WorkShift.list('-date', 500),
                base44.entities.Employee.list(),
                base44.entities.ShiftEndReport.list('-shift_date', 500)
            ]);
            
            // Filter by date range or month/year
            let filteredReports, filteredShifts, filteredEndReports;
            
            if (startDate && endDate) {
                // Filter by custom date range
                filteredReports = reports.filter(report => {
                    const reportDate = new Date(report.date);
                    return reportDate >= new Date(startDate) && reportDate <= new Date(endDate);
                });
                
                filteredShifts = shifts.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    return shiftDate >= new Date(startDate) && shiftDate <= new Date(endDate);
                });
                
                filteredEndReports = endReports.filter(report => {
                    const reportDate = new Date(report.shift_date);
                    // Adjust end date to include the whole day
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    return reportDate >= new Date(startDate) && reportDate <= end;
                });
            } else {
                // Filter by month/year
                filteredReports = reports.filter(report => {
                    const reportDate = new Date(report.date);
                    return reportDate.getMonth() + 1 === selectedMonth && 
                           reportDate.getFullYear() === selectedYear;
                });

                filteredShifts = shifts.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    return shiftDate.getMonth() + 1 === selectedMonth && 
                           shiftDate.getFullYear() === selectedYear;
                });
                
                filteredEndReports = endReports.filter(report => {
                    const reportDate = new Date(report.shift_date);
                    return reportDate.getMonth() + 1 === selectedMonth && 
                           reportDate.getFullYear() === selectedYear;
                });
            }

            setTipReports(filteredReports);
            setWorkShifts(filteredShifts);
            setShiftEndReports(filteredEndReports);
            setEmployees(employeeList);
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear, startDate, endDate]);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const handleDeleteShiftReport = async (reportId) => {
        try {
            const { base44 } = await import('@/api/base44Client');
            await base44.entities.ShiftEndReport.delete(reportId);
            // Reload the reports after deletion
            loadReports();
        } catch (error) {
            console.error('Error deleting shift report:', error);
            alert('שגיאה במחיקת הדוח');
        }
    };

    const getMonthlyTotals = () => {
        const totals = tipReports.reduce((acc, report) => {
            acc.totalTips += report.total_tips_collected || 0;
            acc.totalPayouts += report.net_tips_for_distribution || 0;
            acc.totalHours += report.staff_details?.reduce((sum, staff) => sum + (staff.effective_hours || 0), 0) || 0;
            return acc;
        }, { totalTips: 0, totalPayouts: 0, totalHours: 0 });

        // Add hours from work shifts for non-tip employees
        const workShiftHours = workShifts.reduce((acc, shift) => {
            return acc + (shift.assigned_staff || []).reduce((sum, staff) => {
                const startTime = staff.start_time;
                const endTime = staff.end_time;
                if (startTime && endTime) {
                    const hours = calculateHours(startTime, endTime);
                    const breakMinutes = staff.total_break_minutes || 0;
                    const effectiveHours = Math.max(0, hours - (breakMinutes / 60));
                    return sum + effectiveHours;
                }
                return sum;
            }, 0);
        }, 0);

        totals.totalHours += workShiftHours;
        return totals;
    };

    const calculateHours = (start, end) => {
        if (!start || !end || !start.includes(':') || !end.includes(':')) {
            return 0;
        }

        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);

        let startDate = new Date(0, 0, 0, startH, startM, 0);
        let endDate = new Date(0, 0, 0, endH, endM, 0);

        if (endDate < startDate) {
            endDate.setDate(endDate.getDate() + 1);
        }

        const diff = endDate - startDate;
        return diff / (1000 * 60 * 60);
    };

    const getEmployeeMonthlyData = () => {
        const employeeData = {};
        
        // איחוד לפי employee_id אם קיים, אחרת לפי שם
        const getKey = (id, name) => (id && id.trim()) ? id.trim() : `name_${(name || '').trim().toLowerCase()}`;
        
        // בנה map משם → id מרשימת העובדים, לאיחוד כשיש ID ב-workShifts אבל לא בטיפים
        const nameToIdMap = {};
        employees.forEach(e => {
            if (e.full_name && e.id) nameToIdMap[e.full_name.trim().toLowerCase()] = e.id;
        });

        // Process tip reports (waiters, bartenders, etc.)
        tipReports.forEach(report => {
            report.staff_details?.forEach(staff => {
                if (!staff.employee_name && !staff.employee_id) return;
                // נסה למצוא ID לפי שם אם אין ID
                const resolvedId = staff.employee_id?.trim() || nameToIdMap[staff.employee_name?.trim().toLowerCase()] || '';
                const key = getKey(resolvedId, staff.employee_name);
                if (!employeeData[key]) {
                    employeeData[key] = {
                        name: staff.employee_name,
                        totalHours: 0,
                        totalTips: 0,
                        totalMealCost: 0,
                        totalSupplement: 0, 
                        shifts: 0,
                        employeeType: 'tip_based' 
                    };
                }
                
                const empData = employeeData[key];
                empData.totalHours += Number(staff.effective_hours) || 0;
                empData.totalTips += Number(staff.final_tip) || 0;
                empData.totalMealCost += Number(staff.meal_cost) || 0;
                empData.totalSupplement += Number(staff.supplement) || 0;
                empData.shifts += 1;
            });
        });

        // Process work shifts (kitchen, dishwashers, cashiers, etc.)
        workShifts.forEach(shift => {
            (shift.assigned_staff || []).forEach(staff => {
                if (!staff.employee_name && !staff.employee_id) return;
                const resolvedId = staff.employee_id?.trim() || nameToIdMap[staff.employee_name?.trim().toLowerCase()] || '';
                const key = getKey(resolvedId, staff.employee_name);
                if (!employeeData[key]) {
                    employeeData[key] = {
                        name: staff.employee_name,
                        totalHours: 0,
                        totalTips: 0,
                        totalMealCost: 0,
                        totalSupplement: 0, 
                        shifts: 0,
                        employeeType: 'hourly', 
                        position: staff.position
                    };
                }

                const empData = employeeData[key];
                
                // Calculate hours for this shift
                if (staff.start_time && staff.end_time) {
                    const hours = calculateHours(staff.start_time, staff.end_time);
                    const breakMinutes = Number(staff.total_break_minutes) || 0;
                    const effectiveHours = Math.max(0, hours - (breakMinutes / 60));

                    empData.totalHours += Number(effectiveHours) || 0;
                    empData.shifts += 1;
                    empData.position = staff.position;
                }
            });
        });
        
        return Object.values(employeeData);
    };

    const exportToCSV = () => {
        const employeeData = getEmployeeMonthlyData();
        const headers = ['שם עובד', 'תפקיד', 'סוג עובד', 'סה״כ שעות', 'סה״כ טיפים', 'סה״כ השלמה', 'עלות ארוחות', 'מספר משמרות', 'ממוצע לשעה'];
        
        const csvContent = [
            headers.join(','),
            ...employeeData.map(emp => [
                emp.name,
                emp.position || 'לא צוין',
                emp.employeeType === 'tip_based' ? 'עובד טיפים' : 'עובד שכר',
                (Number(emp.totalHours) || 0).toFixed(2),
                (Number(emp.totalTips) || 0).toFixed(2),
                (Number(emp.totalSupplement) || 0).toFixed(2),
                (Number(emp.totalMealCost) || 0).toFixed(2),
                emp.shifts,
                Number(emp.totalHours) > 0 ? (((Number(emp.totalTips) || 0) + (Number(emp.totalSupplement) || 0)) / Number(emp.totalHours)).toFixed(2) : '0.00'
            ].join(','))
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `דוח_משכורות_מלא_${selectedMonth}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportShiftEndReportsToCSV = () => {
        const headers = [
            'תאריך', 'משמרת', 'שם מנהל', 'הכנסה', 'סועדים', 'דירוג כללי',
            'Wolt', 'Cibus', 'Ten Bis', 'ValueCard', 'Mishoha', 'סה"כ משלוחים',
            'כסף משלוחים (אשראי)', 'כסף משלוחים (מזומן)', 'סה"כ כסף (משלוחים)'
        ];

        const csvRows = shiftEndReports.map(report => {
            const deliveryData = report.delivery_data || {};
            return [
                format(new Date(report.shift_date), 'dd/MM/yyyy', { locale: he }),
                report.shift_type === 'dinner' ? 'ערב' : 'צהריים',
                `"${report.manager_name || ''}"`,
                report.total_revenue || 0,
                report.total_covers || 0,
                report.overall_rating || 0,
                deliveryData.wolt_deliveries || 0,
                deliveryData.cibus_deliveries || 0,
                deliveryData.ten_bis_deliveries || 0,
                deliveryData.valuecard_deliveries || 0,
                deliveryData.mishoha_deliveries || 0,
                deliveryData.total_deliveries || 0,
                deliveryData.credit_deliveries_amount || 0,
                deliveryData.cash_deliveries_amount || 0,
                deliveryData.total_deliveries_amount || 0,
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'דוחות_סיום_משמרת.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const monthlyTotals = getMonthlyTotals();
    const employeeMonthlyData = getEmployeeMonthlyData();

    // חישוב סיכומים מדוחות סוף משמרת
    const shiftEndReportTotals = shiftEndReports.reduce((acc, report) => {
        acc.totalRevenue += report.total_revenue || 0;
        acc.totalCovers += report.total_covers || 0;
        return acc;
    }, { totalRevenue: 0, totalCovers: 0 });

    const filteredEmployeeData = selectedEmployee === 'all' ? 
        employeeMonthlyData : 
        employeeMonthlyData.filter(emp => (emp.name || '').includes(selectedEmployee));

    return (
        <div className="p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <PageHeader
                    title="דוחות טיפים ומשכורות"
                    subtitle="ניהול ומעקב אחר חלוקת טיפים ונתוני משכורות"
                    icon={FileText}
                    action={
                        <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
                            <Download className="w-4 h-4 ml-2" />
                            ייצא ל-CSV
                        </Button>
                    }
                />

                {/* Enhanced Filters */}
                <Card>
                    <CardHeader>
                        <CardTitle>סינון דוחות</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-4 flex-wrap items-end">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">חודש</label>
                                <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({length: 12}, (_, i) => (
                                            <SelectItem key={i+1} value={(i+1).toString()}>
                                                {format(new Date(2000, i, 1), 'MMMM', { locale: he })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">שנה</label>
                                <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                                    <SelectTrigger className="w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[2024, 2025, 2026].map(year => (
                                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="w-4 h-4 flex items-center justify-center text-gray-400">או</div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">מתאריך</label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => {
                                        setStartDate(e.target.value);
                                        setSelectedMonth(0); // Clear month/year selection
                                        setSelectedYear(0);
                                    }}
                                    className="w-40"
                                />
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">עד תאריך</label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setSelectedMonth(0); // Clear month/year selection
                                        setSelectedYear(0);
                                    }}
                                    className="w-40"
                                />
                            </div>

                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setSelectedMonth(new Date().getMonth() + 1); // Reset to current month
                                    setSelectedYear(new Date().getFullYear()); // Reset to current year
                                }}
                                disabled={!startDate && !endDate}
                            >
                                נקה תאריכים
                            </Button>
                        </div>

                        <div className="flex gap-4">
                            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="כל העובדים" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">כל העובדים</SelectItem>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.full_name}>{emp.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Monthly Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">סה״כ הכנסות (דוחות)</CardTitle>
                            <DollarSign className="w-4 h-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">₪{shiftEndReportTotals.totalRevenue.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">סה"כ סועדים</CardTitle>
                            <Users className="w-4 h-4 text-[#44512C]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-[#44512C]">{shiftEndReportTotals.totalCovers.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">סה״כ טיפים חודשי</CardTitle>
                            <DollarSign className="w-4 h-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">₪{monthlyTotals.totalTips.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">חולק לעובדים (טיפים)</CardTitle>
                            <Users className="w-4 h-4 text-[#44512C]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-[#44512C]">₪{monthlyTotals.totalPayouts.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">סה״כ שעות כל העובדים</CardTitle>
                            <Clock className="w-4 h-4 text-[#A04A2E]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-[#A04A2E]">{(Number(monthlyTotals.totalHours) || 0).toFixed(1)}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Employee Monthly Table - Enhanced */}
                <Card>
                    <CardHeader>
                        <CardTitle>סיכום חודשי מלא - כל העובדים</CardTitle>
                        <p className="text-sm text-gray-600">כולל עובדי טיפים ועובדי שכר (מטבח, קופה, שוטפים וכו')</p>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>שם עובד</TableHead>
                                    <TableHead>תפקיד</TableHead>
                                    <TableHead>סוג עובד</TableHead>
                                    <TableHead>סה״כ שעות</TableHead>
                                    <TableHead>סה״כ טיפים</TableHead>
                                    <TableHead>סה״כ השלמה</TableHead> {/* New table header */}
                                    <TableHead>עלות ארוחות</TableHead>
                                    <TableHead>מספר משמרות</TableHead>
                                    <TableHead>ממוצע לשעה</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredEmployeeData
                                    .sort((a, b) => b.totalHours - a.totalHours) 
                                    .map((emp, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{emp.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={emp.employeeType === 'tip_based' ? 'bg-[#F4ECD8]' : 'bg-gray-50'}>
                                                {emp.position || 'לא צוין'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={emp.employeeType === 'tip_based' ? 'default' : 'secondary'}>
                                                {emp.employeeType === 'tip_based' ? 'עובד טיפים' : 'עובד שכר'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-semibold">{(Number(emp.totalHours) || 0).toFixed(2)}</TableCell>
                                        <TableCell className={Number(emp.totalTips) > 0 ? "text-green-600 font-bold" : "text-gray-400"}>
                                            ₪{(Number(emp.totalTips) || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell className={Number(emp.totalSupplement) > 0 ? "text-orange-600 font-bold" : "text-gray-400"}>
                                            ₪{(Number(emp.totalSupplement) || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell>₪{(Number(emp.totalMealCost) || 0).toFixed(2)}</TableCell>
                                        <TableCell>{emp.shifts}</TableCell>
                                        <TableCell className="font-medium">
                                            ₪{Number(emp.totalHours) > 0 ? (((Number(emp.totalTips) || 0) + (Number(emp.totalSupplement) || 0)) / Number(emp.totalHours)).toFixed(2) : '0.00'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Daily Reports Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>דוחות חלוקת טיפים יומיים</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>תאריך</TableHead>
                                    <TableHead>סוג משמרת</TableHead>
                                    <TableHead>טיפים נאספו</TableHead>
                                    <TableHead>חולק לעובדים</TableHead>
                                    <TableHead>מספר עובדים</TableHead>
                                    <TableHead>סטטוס</TableHead>
                                    <TableHead>פעולות</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tipReports.map((report) => (
                                    <TableRow key={report.id}>
                                        <TableCell className="font-medium">
                                            {format(new Date(report.date), 'dd/MM/yyyy', { locale: he })}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={report.shift_type === 'dinner' ? 'default' : 'secondary'}>
                                                {report.shift_type === 'dinner' ? 'ערב' : 'צהריים'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>₪{report.total_tips_collected?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell className="text-green-600 font-bold">
                                            ₪{report.net_tips_for_distribution?.toFixed(2) || '0.00'}
                                        </TableCell>
                                        <TableCell>{report.staff_details?.length || 0}</TableCell>
                                        <TableCell>
                                            <Badge variant={report.status === 'locked' ? 'default' : 'secondary'}>
                                                {report.status === 'locked' ? 'נעול' : report.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button asChild variant="outline" size="sm">
                                                <Link to={createPageUrl(`TipReportDetails?id=${report.id}`)}>
                                                    צפה בפירוט
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* דוחות סיום משמרת */}
                <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle>דוחות סיום משמרת</CardTitle>
                        <Button onClick={exportShiftEndReportsToCSV} variant="outline" size="sm">
                            <Download className="w-4 h-4 ml-2" />
                            ייצא דוחות משמרת
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>תאריך</TableHead>
                                    <TableHead>משמרת</TableHead>
                                    <TableHead>שם מנהל</TableHead>
                                    <TableHead>הכנסה</TableHead>
                                    <TableHead>סועדים</TableHead>
                                    <TableHead>דירוג כללי</TableHead>
                                    <TableHead>פעולות</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shiftEndReports.map((report) => (
                                    <TableRow key={report.id}>
                                        <TableCell className="font-medium">
                                            {format(new Date(report.shift_date), 'dd/MM/yyyy', { locale: he })}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={report.shift_type === 'dinner' ? 'default' : 'secondary'}>
                                                {report.shift_type === 'dinner' ? 'ערב' : 'צהריים'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{report.manager_name}</TableCell>
                                        <TableCell className="text-green-600 font-bold">
                                            ₪{report.total_revenue?.toLocaleString() || '0'}
                                        </TableCell>
                                        <TableCell>{report.total_covers || 0}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{report.overall_rating || 0}/5 ⭐</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link to={createPageUrl(`ShiftEndReportDetails?id=${report.id}`)}>
                                                        צפה בפירוט
                                                    </Link>
                                                </Button>
                                                <Button asChild variant="ghost" size="sm">
                                                    <Link to={createPageUrl(`ShiftEndReportDetails?id=${report.id}&edit=true`)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Link>
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent dir="rtl">
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>מחיקת דוח סיום משמרת</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                האם אתה בטוח שברצונך למחוק את הדוח מתאריך {format(new Date(report.shift_date), 'dd/MM/yyyy', { locale: he })}?
                                                                פעולה זו לא ניתנת לביטול.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                onClick={() => handleDeleteShiftReport(report.id)}
                                                                className="bg-red-600 hover:bg-red-700"
                                                            >
                                                                מחק דוח
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function Reports() {
    return (
        <PageGuard pageName="Reports" pageTitle="דוחות">
            <ReportsInner />
        </PageGuard>
    );
}