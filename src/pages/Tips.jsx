import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { TipReport } from '@/entities/TipReport';
import PageGuard from '../components/shared/PageGuard';
import { WorkShift } from '@/entities/WorkShift';
import { Employee } from '@/entities/Employee';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, CalendarIcon, Save, Printer, UserPlus, Trash2, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MINIMUM_WAGE = 32; // שכר מינימום לשעה

// --- New Constants for Deductions ---
const RESTAURANT_HOURLY_DEDUCTION = 3;
const RUNNER_HOURLY_PAY = 40;

const TIP_ELIGIBLE_POSITIONS = ['מלצר', 'ברמן'];

function UnlockedReportsAlert() {
    const [unlockedReports, setUnlockedReports] = useState([]);
    const [missingReports, setMissingReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [shiftFilter, setShiftFilter] = useState('all');

    useEffect(() => {
        Promise.all([
            TipReport.list('-date', 500),
            WorkShift.filter({})
        ]).then(([allTipReports, allWorkShifts]) => {
            setUnlockedReports(allTipReports.filter(r => r.status !== 'locked'));

            // מצא משמרות שאין להן דוח טיפים כלל
            const reportKeys = new Set(allTipReports.map(r => `${r.date}_${r.shift_type}`));
            const today = format(new Date(), 'yyyy-MM-dd');
            const missing = allWorkShifts
                .filter(ws => ws.date < today && !reportKeys.has(`${ws.date}_${ws.shift_type}`))
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 30);
            setMissingReports(missing);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    if (loading || (unlockedReports.length === 0 && missingReports.length === 0)) return null;

    const filteredUnlocked = shiftFilter === 'all' ? unlockedReports : unlockedReports.filter(r => r.shift_type === shiftFilter);
    const filteredMissing = shiftFilter === 'all' ? missingReports : missingReports.filter(r => r.shift_type === shiftFilter);

    return (
        <div className="max-w-7xl mx-auto mb-4 border-2 border-orange-300 bg-orange-50 rounded-xl" dir="rtl">
            <div className="p-4 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <h3 className="font-bold text-orange-800">דוחות טיפים שלא ננעלו ({filteredUnlocked.length}) | חסרים לחלוטין ({filteredMissing.length})</h3>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsOpen(!isOpen)}
                    className="border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                    {isOpen ? '▼ הסתר' : '▶ הצג'}
                </Button>
            </div>
            {isOpen && (
                <div className="px-4 pb-4">
                    <div className="flex gap-1 my-3">
                        {[['all','הכל'],['lunch','צהריים'],['dinner','ערב']].map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setShiftFilter(val)}
                                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                                    shiftFilter === val ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-100'
                                }`}
                            >{label}</button>
                        ))}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-orange-200">
                                    <th className="text-right py-1 px-2 text-orange-700">תאריך</th>
                                    <th className="text-right py-1 px-2 text-orange-700">משמרת</th>
                                    <th className="text-right py-1 px-2 text-orange-700">סה"כ טיפים</th>
                                    <th className="text-right py-1 px-2 text-orange-700">סטטוס</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUnlocked.map(r => (
                                    <tr key={r.id} className="border-b border-orange-100">
                                        <td className="py-1 px-2">{r.date}</td>
                                        <td className="py-1 px-2">{r.shift_type === 'lunch' ? 'צהריים' : 'ערב'}</td>
                                        <td className="py-1 px-2 font-medium">₪{(r.total_tips_collected || 0).toFixed(2)}</td>
                                        <td className="py-1 px-2">
                                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {r.status === 'draft' ? 'טיוטה' : r.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredMissing.length > 0 && (
                        <div className="mt-4">
                            <h4 className="font-bold text-red-700 mb-2 flex items-center gap-1">❌ משמרות ללא דוח טיפים כלל ({filteredMissing.length})</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-red-200">
                                            <th className="text-right py-1 px-2 text-red-700">תאריך</th>
                                            <th className="text-right py-1 px-2 text-red-700">משמרת</th>
                                            <th className="text-right py-1 px-2 text-red-700">סטטוס</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMissing.map((ws, i) => (
                                            <tr key={i} className="border-b border-red-100">
                                                <td className="py-1 px-2">{ws.date}</td>
                                                <td className="py-1 px-2">{ws.shift_type === 'lunch' ? 'צהריים' : 'ערב'}</td>
                                                <td className="py-1 px-2">
                                                    <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full font-medium">לא נפתח</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function TipsInner() {
    const [date, setDate] = useState(new Date());
    const [shiftType, setShiftType] = useState('dinner');
    const [totalTips, setTotalTips] = useState('');
    const [staffDetails, setStaffDetails] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [existingReport, setExistingReport] = useState(null);
    const [allEmployees, setAllEmployees] = useState([]);

    const fetchAllEmployees = useCallback(async () => {
        try {
            const employees = await Employee.list();
            setAllEmployees(employees);
        } catch (error) {
            toast.error("שגיאה בטעינת רשימת העובדים");
        }
    }, []);

    useEffect(() => {
        fetchAllEmployees();
    }, [fetchAllEmployees]);

    const fetchShiftData = useCallback(async () => {
        if (!date) return;
        setIsLoading(true);
        try {
            const dateString = format(date, 'yyyy-MM-dd');
            
            // Check for existing TipReport
            const reports = await TipReport.filter({ date: dateString, shift_type: shiftType });
            if (reports.length > 0) {
                const report = reports[0];
                setExistingReport(report);
                setTotalTips(report.total_tips_collected.toString());
                setStaffDetails(report.staff_details.map(staff => ({
                    ...staff,
                    start_time: staff.start_time ? format(parseISO(`1970-01-01T${staff.start_time}`), 'HH:mm') : '',
                    end_time: staff.end_time ? format(parseISO(`1970-01-01T${staff.end_time}`), 'HH:mm') : '',
                })));
            } else {
                // Fetch from WorkShift for a new report
                setExistingReport(null);
                const shifts = await WorkShift.filter({ date: dateString, shift_type: shiftType });
                if (shifts.length > 0) {
                    const shift = shifts[0];
                    const details = shift.assigned_staff?.map(staff => {
                         return {
                            employee_id: staff.employee_id,
                            employee_name: staff.employee_name,
                            position: staff.position,
                            start_time: staff.start_time,
                            end_time: staff.end_time,
                            break_minutes: staff.total_break_minutes || 0,
                            breaks: staff.breaks || [],
                            meal_cost: 0,
                            sales_bonus: 0
                         };
                    }) || [];
                    setStaffDetails(details);
                } else {
                    setStaffDetails([]);
                }
                setTotalTips('');
            }
        } catch (error) {
            toast.error('שגיאה בטעינת נתוני המשמרת');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [date, shiftType, allEmployees]);

    useEffect(() => {
        if (allEmployees.length > 0) {
            fetchShiftData();
        }
    }, [date, shiftType, allEmployees, fetchShiftData]);


    const handleStaffDetailChange = (index, field, value) => {
        const newDetails = [...staffDetails];
        newDetails[index][field] = value;
        setStaffDetails(newDetails);
    };

    const calculatedResults = useMemo(() => {
        const numericTotalTips = parseFloat(totalTips) || 0;
        let distributableTips = numericTotalTips;

        let totalRestaurantDeduction = 0;
        let totalRunnerDeduction = 0;
        
        let totalTipEligibleHours = 0;

        // Calculate hours and deductions
        const processedStaff = staffDetails.map(staff => {
            const start = staff.start_time ? parseISO(`1970-01-01T${staff.start_time}:00`) : null;
            const end = staff.end_time ? parseISO(`1970-01-01T${staff.end_time}:00`) : null;
            
            let totalHours = 0;
            if (start && end) {
                let diff = (end - start) / (1000 * 60 * 60);
                if (diff < 0) diff += 24; // Handles overnight shifts
                totalHours = diff;
            }
            
            const breakHours = (parseFloat(staff.break_minutes) || 0) / 60;
            const effectiveHours = Math.max(0, totalHours - breakHours);
            
            // Calculate deductions for runners
            if (staff.position === 'ראנר') {
                const runnerPay = effectiveHours * RUNNER_HOURLY_PAY;
                totalRunnerDeduction += runnerPay;
                distributableTips -= runnerPay;
            }
            
            // Calculate hours for restaurant deduction and tip pool
            if (TIP_ELIGIBLE_POSITIONS.includes(staff.position) || staff.position === 'ראנר') {
                 totalRestaurantDeduction += effectiveHours * RESTAURANT_HOURLY_DEDUCTION;
                 if (TIP_ELIGIBLE_POSITIONS.includes(staff.position)) {
                    totalTipEligibleHours += effectiveHours;
                 }
            }

            return { ...staff, totalHours, effectiveHours };
        });
        
        // Apply restaurant deduction
        distributableTips -= totalRestaurantDeduction;
        
        const tipPerHour = totalTipEligibleHours > 0 ? Math.max(0, distributableTips) / totalTipEligibleHours : 0;

        // Final calculation for each staff member
        const finalStaffDetails = processedStaff.map(staff => {
            let grossTip = 0;
            let supplement = 0;

            // Runners get fixed pay, no tip from pool
            if (staff.position === 'ראנר') {
                grossTip = staff.effectiveHours * RUNNER_HOURLY_PAY;
            } 
            // Tip-eligible positions get from the pool
            else if (TIP_ELIGIBLE_POSITIONS.includes(staff.position)) {
                grossTip = staff.effectiveHours * tipPerHour;
            }
            
            const hourlyDeduction = staff.effectiveHours * RESTAURANT_HOURLY_DEDUCTION;
            const mealCost = parseFloat(staff.meal_cost) || 0;
            const salesBonus = parseFloat(staff.sales_bonus) || 0;

            const finalTip = grossTip - mealCost + salesBonus;
            
            const hourlyRateFromTips = staff.effectiveHours > 0 ? finalTip / staff.effectiveHours : 0;
            if (TIP_ELIGIBLE_POSITIONS.includes(staff.position) && hourlyRateFromTips < MINIMUM_WAGE) {
                supplement = (MINIMUM_WAGE - hourlyRateFromTips) * staff.effectiveHours;
            }

            const totalEarnings = finalTip + supplement;

            return { ...staff, grossTip, finalTip, supplement, totalEarnings };
        });

        return {
            staffDetails: finalStaffDetails,
            tipPerHour,
            totalRestaurantDeduction: totalRestaurantDeduction,
            totalRunnerDeduction: totalRunnerDeduction,
            netTipsForDistribution: Math.max(0, distributableTips)
        };
    }, [staffDetails, totalTips]);

    const handleSaveReport = async () => {
         setIsLoading(true);
         try {
              const reportData = {
                  date: format(date, 'yyyy-MM-dd'),
                  shift_type: shiftType,
                  total_tips_collected: parseFloat(totalTips) || 0,
                  runner_deduction: calculatedResults.totalRunnerDeduction,
                  restaurant_deduction: calculatedResults.totalRestaurantDeduction,
                  net_tips_for_distribution: calculatedResults.netTipsForDistribution,
                  tip_per_hour: calculatedResults.tipPerHour,
                  staff_details: calculatedResults.staffDetails.map(s => ({
                      employee_id: s.employee_id,
                      employee_name: s.employee_name,
                      position: s.position,
                      start_time: s.start_time,
                      end_time: s.end_time,
                      break_minutes: s.break_minutes || 0,
                      meal_cost: s.meal_cost || 0,
                      sales_bonus: s.sales_bonus || 0,
                      total_hours: s.totalHours,
                      effective_hours: s.effectiveHours,
                      hourly_deduction: s.effectiveHours * RESTAURANT_HOURLY_DEDUCTION,
                      gross_tip: s.grossTip,
                      final_tip: s.finalTip,
                      supplement: s.supplement,
                      total_earnings: s.totalEarnings,
                      employee_signature: s.employee_signature || null,
                  })),
                  status: existingReport?.status || 'draft',
              };

              if (existingReport) {
                  await TipReport.update(existingReport.id, reportData);
                  toast.success("דוח טיפים עודכן בהצלחה!");
              } else {
                  await TipReport.create(reportData);
                  toast.success("דוח טיפים נשמר בהצלחה!");
              }
              fetchShiftData();
          } catch (error) {
              toast.error("שגיאה בשמירת הדוח");
              console.error(error);
          } finally {
              setIsLoading(false);
          }
      };

    const handleAddStaff = () => {
        setStaffDetails([
            ...staffDetails,
            { employee_id: '', employee_name: '', position: '', start_time: '', end_time: '', break_minutes: 0, meal_cost: 0, sales_bonus: 0 }
        ]);
    };

    const handleRemoveStaff = (index) => {
        const newDetails = staffDetails.filter((_, i) => i !== index);
        setStaffDetails(newDetails);
    };

    return (
        <div className="p-4 md:p-8" dir="rtl">
            <UnlockedReportsAlert />
            <Card className="max-w-7xl mx-auto">
                <CardHeader>
                    <CardTitle className="text-2xl">ניהול טיפים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-gray-50">
                        <div>
                            <Label>תאריך</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="ml-2 h-4 w-4" />
                                        {format(date, 'PPP', { locale: he })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div>
                            <Label>משמרת</Label>
                            <Select value={shiftType} onValueChange={setShiftType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dinner">ערב</SelectItem>
                                    <SelectItem value="lunch">צהריים</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>סה"כ טיפים שנאספו (₪)</Label>
                            <Input
                                type="number"
                                value={totalTips}
                                onChange={(e) => setTotalTips(e.target.value)}
                                placeholder="הזן סכום"
                                disabled={existingReport?.status === 'locked'}
                            />
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="text-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-500" />
                            <p>טוען נתונים...</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">הפרשה למסעדה</CardTitle></CardHeader>
                                    <CardContent><p className="text-2xl font-bold">₪{calculatedResults.totalRestaurantDeduction.toFixed(2)}</p></CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">הפרשה לראנרים</CardTitle></CardHeader>
                                    <CardContent><p className="text-2xl font-bold">₪{calculatedResults.totalRunnerDeduction.toFixed(2)}</p></CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">קופה לחלוקה</CardTitle></CardHeader>
                                    <CardContent><p className="text-2xl font-bold text-green-600">₪{calculatedResults.netTipsForDistribution.toFixed(2)}</p></CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">טיפ לשעה</CardTitle></CardHeader>
                                    <CardContent><p className="text-2xl font-bold text-blue-600">₪{calculatedResults.tipPerHour.toFixed(2)}</p></CardContent>
                                </Card>
                            </div>
                            
                            {/* Staff Details Table */}
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>שם העובד</TableHead>
                                            <TableHead>תפקיד</TableHead>
                                            <TableHead>שעת כניסה</TableHead>
                                            <TableHead>שעת יציאה</TableHead>
                                            <TableHead>הפסקות</TableHead>
                                            <TableHead>שעות אפקטיבי</TableHead>
                                            <TableHead>ארוחת עובד (₪)</TableHead>
                                            <TableHead>בונוס מכירות (₪)</TableHead>
                                            <TableHead>טיפ ברוטו</TableHead>
                                            <TableHead>טיפ נטו</TableHead>
                                            <TableHead>השלמה לשכר מינימום</TableHead>
                                            <TableHead>סה"כ</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calculatedResults.staffDetails.map((staff, index) => (
                                            <TableRow key={index}>
                                                <TableCell>
                                                    <Select value={staff.employee_id} onValueChange={(value) => {
                                                        const employee = allEmployees.find(e => e.id === value);
                                                        handleStaffDetailChange(index, 'employee_id', value);
                                                        handleStaffDetailChange(index, 'employee_name', employee?.full_name || '');
                                                    }}>
                                                        <SelectTrigger><SelectValue placeholder="בחר עובד" /></SelectTrigger>
                                                        <SelectContent>{allEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <Select value={staff.position} onValueChange={(value) => handleStaffDetailChange(index, 'position', value)}>
                                                        <SelectTrigger className="w-32"><SelectValue placeholder="בחר תפקיד" /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="מלצר">מלצר</SelectItem>
                                                            <SelectItem value="ראנר">ראנר</SelectItem>
                                                            <SelectItem value="ברמן">ברמן</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell><Input type="time" value={staff.start_time} onChange={e => handleStaffDetailChange(index, 'start_time', e.target.value)} /></TableCell>
                                                <TableCell><Input type="time" value={staff.end_time} onChange={e => handleStaffDetailChange(index, 'end_time', e.target.value)} /></TableCell>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <Input type="number" value={staff.break_minutes} onChange={e => handleStaffDetailChange(index, 'break_minutes', e.target.value)} className="w-24"/>
                                                        {staff.breaks && staff.breaks.length > 0 && (
                                                            <div className="text-xs text-gray-500 space-y-0.5">
                                                                {staff.breaks.map((b, bi) => (
                                                                    <div key={bi} className="bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                                                                        🕐 {b.break_start ? b.break_start.slice(11,16) : '?'} – {b.break_end ? b.break_end.slice(11,16) : '?'}
                                                                        {b.duration_minutes ? ` (${Math.round(b.duration_minutes)} ד')` : ''}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{staff.effectiveHours.toFixed(2)}</TableCell>
                                                <TableCell><Input type="number" value={staff.meal_cost} onChange={e => handleStaffDetailChange(index, 'meal_cost', e.target.value)} className="w-24"/></TableCell>
                                                <TableCell><Input type="number" value={staff.sales_bonus} onChange={e => handleStaffDetailChange(index, 'sales_bonus', e.target.value)} className="w-24"/></TableCell>
                                                <TableCell>₪{staff.grossTip.toFixed(2)}</TableCell>
                                                <TableCell>₪{staff.finalTip.toFixed(2)}</TableCell>
                                                <TableCell>₪{staff.supplement.toFixed(2)}</TableCell>
                                                <TableCell className="font-bold">₪{staff.totalEarnings.toFixed(2)}</TableCell>
                                                <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveStaff(index)}><Trash2 className="w-4 h-4 text-red-500"/></Button></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="flex justify-start gap-2 flex-wrap">
                                <Button variant="outline" onClick={handleAddStaff}><UserPlus className="w-4 h-4 ml-2"/>הוסף עובד ידנית</Button>
                                <Button variant="outline" className="border-blue-400 text-blue-600 hover:bg-blue-50" onClick={async () => {
                                    const dateString = format(date, 'yyyy-MM-dd');
                                    const shifts = await WorkShift.filter({ date: dateString, shift_type: shiftType });
                                    if (shifts.length > 0) {
                                        const shift = shifts[0];
                                        setStaffDetails(prev => prev.map(staff => {
                                            const wsStaff = shift.assigned_staff?.find(s => s.employee_id === staff.employee_id);
                                            if (wsStaff) {
                                                return {
                                                    ...staff,
                                                    start_time: wsStaff.start_time || staff.start_time,
                                                    end_time: wsStaff.end_time || staff.end_time,
                                                    break_minutes: wsStaff.total_break_minutes ?? staff.break_minutes,
                                                    breaks: wsStaff.breaks || staff.breaks || [],
                                                };
                                            }
                                            return staff;
                                        }));
                                        toast.success("נתוני הסידור סונכרנו בהצלחה");
                                    } else {
                                        toast.error("לא נמצא סידור עבור תאריך ומשמרת זו");
                                    }
                                }}>🔄 סנכרן שעות מסידור</Button>
                            </div>
                        </>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 flex-wrap">
                   <Button variant="outline" disabled={isLoading}><Printer className="w-4 h-4 ml-2"/>הדפס דוח</Button>
                   <Button onClick={handleSaveReport} disabled={isLoading || existingReport?.status === 'locked'}>
                       {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2"/> : <Save className="w-4 h-4 ml-2"/>}
                       {existingReport ? 'עדכן דוח' : 'שמור דוח'}
                   </Button>
                   {existingReport && existingReport.status !== 'locked' && (
                       <Button
                           variant="default"
                           className="bg-green-600 hover:bg-green-700 text-white"
                           disabled={isLoading}
                           onClick={async () => {
                               setIsLoading(true);
                               try {
                                   // שמור + נעל בבת אחת תוך שימוש ב-calculatedResults הקיים
                                   const reportData = {
                                       date: format(date, 'yyyy-MM-dd'),
                                       shift_type: shiftType,
                                       total_tips_collected: parseFloat(totalTips) || 0,
                                       runner_deduction: calculatedResults.totalRunnerDeduction,
                                       restaurant_deduction: calculatedResults.totalRestaurantDeduction,
                                       net_tips_for_distribution: calculatedResults.netTipsForDistribution,
                                       tip_per_hour: calculatedResults.tipPerHour,
                                       staff_details: calculatedResults.staffDetails.map(s => ({
                                           employee_id: s.employee_id,
                                           employee_name: s.employee_name,
                                           position: s.position,
                                           start_time: s.start_time,
                                           end_time: s.end_time,
                                           break_minutes: s.break_minutes || 0,
                                           meal_cost: s.meal_cost || 0,
                                           sales_bonus: s.sales_bonus || 0,
                                           total_hours: s.totalHours,
                                           effective_hours: s.effectiveHours,
                                           hourly_deduction: s.effectiveHours * RESTAURANT_HOURLY_DEDUCTION,
                                           gross_tip: s.grossTip,
                                           final_tip: s.finalTip,
                                           supplement: s.supplement,
                                           total_earnings: s.totalEarnings,
                                           employee_signature: s.employee_signature || null,
                                       })),
                                       status: 'locked',
                                       locked_by: 'manager',
                                       locked_at: new Date().toISOString(),
                                   };
                                   await TipReport.update(existingReport.id, reportData);
                                   toast.success("דוח ננעל בהצלחה! הנתונים יופיעו בדוחות העובדים.");
                                   fetchShiftData();
                               } catch (e) {
                                   toast.error("שגיאה בנעילת הדוח");
                               } finally {
                                   setIsLoading(false);
                               }
                           }}
                       >
                           <Lock className="w-4 h-4 ml-2"/>
                           נעל דוח
                       </Button>
                   )}
                   {existingReport?.status === 'locked' && (
                       <div className="flex items-center gap-2">
                           <span className="text-green-600 font-semibold text-sm flex items-center gap-1">
                               <Lock className="w-4 h-4"/> דוח נעול
                           </span>
                           <Button
                               variant="outline"
                               size="sm"
                               className="border-orange-400 text-orange-600"
                               disabled={isLoading}
                               onClick={async () => {
                                   setIsLoading(true);
                                   try {
                                       await TipReport.update(existingReport.id, { status: 'draft', locked_by: null, locked_at: null });
                                       toast.success("הדוח שוחרר לעריכה");
                                       fetchShiftData();
                                   } catch (e) {
                                       toast.error("שגיאה");
                                   } finally {
                                       setIsLoading(false);
                                   }
                               }}
                           >
                               <Unlock className="w-4 h-4 ml-1"/> שחרר לעריכה
                           </Button>
                       </div>
                   )}
                </CardFooter>
            </Card>
        </div>
    );
}

export default function TipsPage() {
    return (
        <PageGuard pageName="Tips" pageTitle="ניהול טיפים">
            <TipsInner />
        </PageGuard>
    );
}