import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { Employee } from '@/entities/Employee';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Clock, Coffee, Play, Square, UtensilsCrossed, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function ShiftClockWidget() {
    const [user, setUser] = useState(null);
    const [activeShift, setActiveShift] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showMealDialog, setShowMealDialog] = useState(false);
    const [mealDetails, setMealDetails] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    useEffect(() => {
        User.me().then(u => {
            setUser(u);
            loadActiveShift(u);
        }).catch(() => setLoading(false));
    }, []);

    const loadActiveShift = async (u) => {
        if (!u) { setLoading(false); return; }
        const today = format(new Date(), 'yyyy-MM-dd');
        const shifts = await base44.entities.ShiftTracking.filter({
            employee_id: u.id,
            date: today
        });
        const active = shifts.find(s => s.status === 'active' || s.status === 'on_break');
        setActiveShift(active || null);
        setLoading(false);
    };

    // Find employee record matching the current user by email
    const findEmployeeRecord = async (u) => {
        const allEmployees = await Employee.filter({ status: 'active' });
        return allEmployees.find(emp => emp.email && u.email && emp.email.toLowerCase() === u.email.toLowerCase());
    };

    const startShift = async () => {
        setActionLoading(true);
        const now = new Date().toISOString();
        const today = format(new Date(), 'yyyy-MM-dd');
        const shift = await base44.entities.ShiftTracking.create({
            employee_id: user.id,
            employee_name: user.full_name,
            date: today,
            shift_start: now,
            status: 'active',
            breaks: [],
            total_break_minutes: 0,
            had_meal: false,
        });
        setActiveShift(shift);
        setActionLoading(false);
    };

    const startBreak = async () => {
        setActionLoading(true);
        const now = new Date().toISOString();
        const breaks = [...(activeShift.breaks || []), { break_start: now }];
        const updated = await base44.entities.ShiftTracking.update(activeShift.id, {
            status: 'on_break',
            breaks,
        });
        setActiveShift(updated);
        setActionLoading(false);
    };

    const endBreak = async () => {
        setActionLoading(true);
        const now = new Date().toISOString();
        const breaks = [...(activeShift.breaks || [])];
        const lastBreak = breaks[breaks.length - 1];
        if (lastBreak && !lastBreak.break_end) {
            const startMs = new Date(lastBreak.break_start).getTime();
            const endMs = new Date(now).getTime();
            lastBreak.break_end = now;
            lastBreak.duration_minutes = Math.round((endMs - startMs) / 60000);
        }
        const totalBreakMinutes = breaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
        const updated = await base44.entities.ShiftTracking.update(activeShift.id, {
            status: 'active',
            breaks,
            total_break_minutes: totalBreakMinutes,
        });
        setActiveShift(updated);
        setActionLoading(false);
    };

    const saveMeal = async () => {
        setActionLoading(true);
        const updated = await base44.entities.ShiftTracking.update(activeShift.id, {
            had_meal: true,
            meal_details: mealDetails,
        });
        setActiveShift(updated);
        setShowMealDialog(false);
        setMealDetails('');
        setActionLoading(false);
    };

    const endShift = async () => {
        if (!window.confirm('לסיים את המשמרת?')) return;
        setActionLoading(true);
        const now = new Date().toISOString();
        const today = format(new Date(), 'yyyy-MM-dd');
        const startMs = new Date(activeShift.shift_start).getTime();
        const totalHours = (new Date(now).getTime() - startMs) / 3600000;
        const effectiveHours = Math.max(0, totalHours - (activeShift.total_break_minutes || 0) / 60);

        // 1. עדכון ShiftTracking
        await base44.entities.ShiftTracking.update(activeShift.id, {
            shift_end: now,
            status: 'completed',
            total_hours: Math.round(totalHours * 100) / 100,
            effective_hours: Math.round(effectiveHours * 100) / 100,
        });

        // 2. מצא את רשומת העובד לפי אימייל (כמו WorkScheduling)
        const employeeRecord = await findEmployeeRecord(user);
        const employeeId = employeeRecord?.id || user.id;

        // 3. עדכון WorkShift - מצא את כל משמרות היום ועדכן את השיבוץ
        const workShifts = await base44.entities.WorkShift.filter({ date: today });
        for (const ws of workShifts) {
            const staff = ws.assigned_staff || [];
            const idx = staff.findIndex(s => s.employee_id === employeeId);
            if (idx !== -1) {
                const updatedStaff = [...staff];
                updatedStaff[idx] = {
                    ...updatedStaff[idx],
                    start_time: format(new Date(activeShift.shift_start), 'HH:mm'),
                    end_time: format(new Date(now), 'HH:mm'),
                    total_break_minutes: activeShift.total_break_minutes || 0,
                    had_meal: activeShift.had_meal || false,
                    meal_details: activeShift.meal_details || '',
                    breaks: activeShift.breaks || [],
                };
                await base44.entities.WorkShift.update(ws.id, { assigned_staff: updatedStaff });
                break;
            }
        }

        // 4. שמירה בטיפים (Shift entity)
        await base44.entities.Shift.create({
            employee_id: employeeId,
            employee_name: user.full_name,
            date: today,
            hours_worked: Math.round(effectiveHours * 100) / 100,
            sales_amount: 0,
            area: '',
            notes: `כניסה: ${format(new Date(activeShift.shift_start), 'HH:mm')} | יציאה: ${format(new Date(now), 'HH:mm')} | הפסקות: ${activeShift.total_break_minutes || 0} דק'`,
        });

        setActiveShift(null);
        setActionLoading(false);
    };

    const getElapsedDisplay = (startTime) => {
        if (!startTime) return '00:00:00';
        const diff = currentTime - new Date(startTime);
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (loading) return null;

    const isOnBreak = activeShift?.status === 'on_break';
    const isActive = activeShift?.status === 'active';

    return (
        <>
            <Card className={`mb-6 border-2 shadow-lg ${isOnBreak ? 'border-yellow-400 bg-yellow-50' : isActive ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}>
                <CardContent className="p-5">
                    {/* שם + שעה + תאריך */}
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">
                                {user?.full_name || 'עובד'}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {format(currentTime, 'dd/MM/yyyy')} · {format(currentTime, 'EEEE') === 'Sunday' ? 'ראשון' : format(currentTime, 'EEEE') === 'Monday' ? 'שני' : format(currentTime, 'EEEE') === 'Tuesday' ? 'שלישי' : format(currentTime, 'EEEE') === 'Wednesday' ? 'רביעי' : format(currentTime, 'EEEE') === 'Thursday' ? 'חמישי' : format(currentTime, 'EEEE') === 'Friday' ? 'שישי' : 'שבת'}
                            </p>
                        </div>
                        <div className="text-left">
                            <div className="text-3xl font-mono font-bold text-slate-800">
                                {format(currentTime, 'HH:mm:ss')}
                            </div>
                            {activeShift && (
                                <p className="text-xs text-slate-500 text-center mt-1">
                                    {isOnBreak ? '☕ בהפסקה' : `⏱️ ${getElapsedDisplay(activeShift.shift_start)}`}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* סטטוס + כפתורים */}
                    {!activeShift ? (
                        <div className="text-center">
                            <p className="text-slate-500 mb-3 text-sm">טרם נרשמה כניסה למשמרת היום</p>
                            <Button
                                onClick={startShift}
                                disabled={actionLoading}
                                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg rounded-xl w-full"
                            >
                                <Play className="w-5 h-5 ml-2" />
                                כניסה למשמרת
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-4 flex-wrap">
                                <Badge className={isOnBreak ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'}>
                                    {isOnBreak ? '☕ בהפסקה' : '✅ במשמרת'}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                    כניסה: {format(new Date(activeShift.shift_start), 'HH:mm')}
                                </span>
                                {activeShift.total_break_minutes > 0 && (
                                    <span className="text-xs text-slate-500">| הפסקות: {activeShift.total_break_minutes} דק'</span>
                                )}
                                {activeShift.had_meal && (
                                    <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">🍽️ אכל</Badge>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {!isOnBreak ? (
                                    <Button
                                        onClick={startBreak}
                                        disabled={actionLoading}
                                        variant="outline"
                                        className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                                    >
                                        <Coffee className="w-4 h-4 ml-1" />
                                        הפסקה
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={endBreak}
                                        disabled={actionLoading}
                                        className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                    >
                                        <Clock className="w-4 h-4 ml-1" />
                                        סיום הפסקה
                                    </Button>
                                )}

                                <Button
                                    onClick={() => setShowMealDialog(true)}
                                    disabled={actionLoading || activeShift.had_meal}
                                    variant="outline"
                                    className="border-orange-400 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                                >
                                    <UtensilsCrossed className="w-4 h-4 ml-1" />
                                    {activeShift.had_meal ? 'נרשמה ארוחה' : 'ארוחת עובד'}
                                </Button>

                                <Button
                                    onClick={endShift}
                                    disabled={actionLoading || isOnBreak}
                                    className="col-span-2 bg-red-600 hover:bg-red-700 text-white"
                                >
                                    <Square className="w-4 h-4 ml-1" />
                                    סיום משמרת
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* דיאלוג ארוחה */}
            <Dialog open={showMealDialog} onOpenChange={setShowMealDialog}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UtensilsCrossed className="w-5 h-5 text-orange-500" />
                            מה אכלת?
                        </DialogTitle>
                    </DialogHeader>
                    <Textarea
                        value={mealDetails}
                        onChange={e => setMealDetails(e.target.value)}
                        placeholder="פרט את הארוחה (למשל: שניצל + צ'יפס)"
                        rows={3}
                        className="text-right"
                    />
                    <div className="flex gap-2 mt-2">
                        <Button variant="outline" onClick={() => setShowMealDialog(false)} className="flex-1">ביטול</Button>
                        <Button onClick={saveMeal} disabled={actionLoading || !mealDetails.trim()} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white">
                            <CheckCircle className="w-4 h-4 ml-1" />
                            שמור
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}