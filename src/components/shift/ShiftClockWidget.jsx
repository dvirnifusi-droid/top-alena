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
    const [showEndShiftDialog, setShowEndShiftDialog] = useState(false);
    const [feedbackRatings, setFeedbackRatings] = useState({ atmosphere: 0, sales: 0, effort: 0 });
    const [feedbackNotes, setFeedbackNotes] = useState('');
    const [editBreakMinutes, setEditBreakMinutes] = useState('');
    const [editBreakByManager, setEditBreakByManager] = useState(false);
    const [managerPassword, setManagerPassword] = useState('');
    const [breakEditUnlocked, setBreakEditUnlocked] = useState(false);
    const MANAGER_CODE = '1234'; // קוד מנהל - ניתן לשנות
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

        // יצירת ShiftTracking
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

        // בדוק אם העובד מופיע בסידור עבודה של היום
        const employeeRecord = await findEmployeeRecord(user);
        const employeeId = employeeRecord?.id || user.id;

        const workShifts = await base44.entities.WorkShift.filter({ date: today });
        
        // מצא את השיבוץ של העובד (בכל משמרה)
        let assignmentFound = null;
        let targetShift = null;
        
        for (const ws of workShifts) {
            const assignment = (ws.assigned_staff || []).find(a => a.employee_id === employeeId);
            if (assignment) {
                assignmentFound = assignment;
                targetShift = ws;
                break;
            }
        }

        // אם העובד לא בסידור, הוסף אותו תחת "בלתם"
        if (!assignmentFound) {
            const hour = new Date().getHours();
            const shiftType = hour < 16 ? 'lunch' : 'dinner';

            let shift = workShifts.find(ws => ws.shift_type === shiftType);
            if (!shift) {
                shift = await base44.entities.WorkShift.create({
                    date: today,
                    shift_type: shiftType,
                    start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                    end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                    assigned_staff: [],
                    positions_needed: {},
                });
            }

            const updatedStaff = [...(shift.assigned_staff || []), {
                employee_id: employeeId,
                employee_name: user.full_name,
                position: 'בלתם',
                start_time: format(new Date(now), 'HH:mm'),
                end_time: '',
                breaks: [],
                notes: 'נוסף אוטומטית',
                had_meal: false,
                meal_details: '',
                total_break_minutes: 0,
            }];
            await base44.entities.WorkShift.update(shift.id, { assigned_staff: updatedStaff });
        } else if (assignmentFound.position === 'בלתם' || !assignmentFound.start_time) {
            // עדכן את שעת ההתחלה של העובד בסידור אם הוא בתפקיד "בלתם" או ללא שעה
            const updatedStaff = [...(targetShift.assigned_staff || [])].map(a =>
                a.employee_id === employeeId
                    ? { ...a, start_time: format(new Date(now), 'HH:mm') }
                    : a
            );
            await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: updatedStaff });
        }

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
        setShowEndShiftDialog(true);
    };

    const submitEndShift = async () => {
        setShowEndShiftDialog(false);
        setActionLoading(true);
        const now = new Date().toISOString();
        const today = format(new Date(), 'yyyy-MM-dd');
        const startMs = new Date(activeShift.shift_start).getTime();
        const totalHours = (new Date(now).getTime() - startMs) / 3600000;
        const effectiveHours = Math.max(0, totalHours - (activeShift.total_break_minutes || 0) / 60);

        const finalBreakMinutes = breakEditUnlocked && editBreakMinutes !== '' ? parseInt(editBreakMinutes) : (activeShift.total_break_minutes || 0);
        const finalEffectiveHours = Math.max(0, totalHours - finalBreakMinutes / 60);

        // 1. עדכון ShiftTracking
        await base44.entities.ShiftTracking.update(activeShift.id, {
            shift_end: now,
            status: 'completed',
            total_hours: Math.round(totalHours * 100) / 100,
            effective_hours: Math.round(finalEffectiveHours * 100) / 100,
            total_break_minutes: finalBreakMinutes,
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
                    total_break_minutes: finalBreakMinutes,
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
            hours_worked: Math.round(finalEffectiveHours * 100) / 100,
            sales_amount: 0,
            area: '',
            notes: `כניסה: ${format(new Date(activeShift.shift_start), 'HH:mm')} | יציאה: ${format(new Date(now), 'HH:mm')} | הפסקות: ${finalBreakMinutes} דק'${breakEditUnlocked ? ' (עודכן מנהל)' : ''}`,
        });

        // 5. שמירת משוב עובד
        if (feedbackRatings.atmosphere > 0 || feedbackRatings.sales > 0 || feedbackRatings.effort > 0) {
            await base44.entities.Incident.create({
                incident_number: `FEEDBACK-${Date.now()}`,
                title: `משוב עובד: ${user.full_name} - ${today}`,
                    description: `🍽️ **אכל:** ${activeShift?.had_meal ? `כן - ${activeShift.meal_details || ''}` : 'לא'}\n💧 **שתה:** ${feedbackRatings.drank || 'לא צוין'}${feedbackRatings.drank === 'כן' && feedbackRatings.drankDetails ? ` - ${feedbackRatings.drankDetails}` : ''}\n☕ **הפסקה:** ${breakEditUnlocked && editBreakMinutes !== '' ? `${editBreakMinutes} דקות (עודכן ע"י מנהל)` : activeShift?.total_break_minutes > 0 ? `${activeShift.total_break_minutes} דקות` : 'לא'}\n\n🏢 **אווירה:** ${feedbackRatings.atmosphere}/5\n💰 **תחושת מכירה:** ${feedbackRatings.sales}/5\n💪 **מאמץ אישי:** ${feedbackRatings.effort}/5${feedbackNotes ? `\n\n📝 **הערות:**\n${feedbackNotes}` : ''}`,
                category: 'staff',
                severity: 'low',
                status: 'closed',
                visibility_level: 'managers_only',
                reported_by: user.full_name,
                incident_date: now,
            });
        }

        setFeedbackRatings({ atmosphere: 0, sales: 0, effort: 0 });
        setFeedbackNotes('');
        setEditBreakMinutes('');
        setBreakEditUnlocked(false);
        setEditBreakByManager(false);
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

            {/* דיאלוג סיום משמרת + שאלון משוב */}
            <Dialog open={showEndShiftDialog} onOpenChange={setShowEndShiftDialog}>
                <DialogContent dir="rtl" className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Square className="w-5 h-5 text-red-500" />
                            סיום משמרת - שאלון קצר
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-gray-500 mb-4">לפני שאתה יוצא, איך הייתה המשמרת? (אופציונלי)</p>

                    <div className="space-y-5">
                        {/* מידע אוטומטי מהמשמרת */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-2">
                            <p className="font-semibold text-blue-800 mb-1">📋 נתוני המשמרת שלך:</p>
                            {activeShift?.had_meal ? (
                                <p className="text-blue-700">🍽️ אכלת: {activeShift.meal_details || 'כן'}</p>
                            ) : (
                                <p className="text-orange-600">🍽️ לא נרשמה ארוחה</p>
                            )}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                {activeShift?.total_break_minutes > 0 ? (
                                    <p className="text-blue-700">☕ הפסקות: {editBreakMinutes !== '' ? editBreakMinutes : activeShift.total_break_minutes} דקות</p>
                                ) : (
                                    <p className="text-orange-600">☕ לא נרשמה הפסקה</p>
                                )}
                                {!breakEditUnlocked ? (
                                    <button
                                        onClick={() => setEditBreakByManager(true)}
                                        className="text-xs text-blue-600 underline hover:text-blue-800"
                                    >
                                        ✏️ עריכת מנהל
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            value={editBreakMinutes}
                                            onChange={e => setEditBreakMinutes(e.target.value)}
                                            placeholder={String(activeShift?.total_break_minutes || 0)}
                                            className="w-16 border rounded px-2 py-1 text-sm text-center"
                                        />
                                        <span className="text-xs text-gray-500">דק'</span>
                                    </div>
                                )}
                            </div>

                            {/* דיאלוג קוד מנהל */}
                            {editBreakByManager && !breakEditUnlocked && (
                                <div className="mt-2 bg-white border border-gray-300 rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-medium text-gray-700">🔒 הכנס קוד מנהל לעריכה:</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={managerPassword}
                                            onChange={e => setManagerPassword(e.target.value)}
                                            placeholder="קוד מנהל"
                                            className="flex-1 border rounded px-2 py-1 text-sm text-center"
                                        />
                                        <button
                                            onClick={() => {
                                                if (managerPassword === MANAGER_CODE) {
                                                    setBreakEditUnlocked(true);
                                                    setEditBreakMinutes(String(activeShift?.total_break_minutes || 0));
                                                    setEditBreakByManager(false);
                                                    setManagerPassword('');
                                                } else {
                                                    alert('קוד שגוי');
                                                    setManagerPassword('');
                                                }
                                            }}
                                            className="bg-blue-600 text-white text-xs px-3 py-1 rounded"
                                        >אשר</button>
                                        <button onClick={() => { setEditBreakByManager(false); setManagerPassword(''); }} className="text-xs text-gray-400">ביטול</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* שאלה: האם שתית */}
                        <div>
                            <p className="text-sm font-medium mb-2">💧 האם שתית מספיק?</p>
                            <div className="flex gap-2 items-center">
                                {['כן', 'לא'].map(opt => (
                                    <button key={opt}
                                        onClick={() => setFeedbackRatings(prev => ({ ...prev, drank: opt }))}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${feedbackRatings.drank === opt ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300 text-gray-600 hover:border-blue-300'}`}
                                    >{opt}</button>
                                ))}
                                {feedbackRatings.drank === 'כן' && (
                                    <input
                                        className="flex-1 border rounded-lg px-3 py-2 text-sm text-right"
                                        placeholder="מה שתית?"
                                        value={feedbackRatings.drankDetails || ''}
                                        onChange={e => setFeedbackRatings(prev => ({ ...prev, drankDetails: e.target.value }))}
                                    />
                                )}
                            </div>
                        </div>

                        {[
                            { key: 'atmosphere', label: '🏢 אווירה במשמרת' },
                            { key: 'sales', label: '💰 תחושת מכירה' },
                            { key: 'effort', label: '💪 מאמץ אישי' },
                        ].map(({ key, label }) => (
                            <div key={key}>
                                <p className="text-sm font-medium mb-2">{label}</p>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            onClick={() => setFeedbackRatings(prev => ({ ...prev, [key]: star }))}
                                            className={`w-10 h-10 rounded-full text-lg transition-all ${feedbackRatings[key] >= star ? 'bg-yellow-400 text-white scale-110' : 'bg-gray-100 text-gray-400 hover:bg-yellow-100'}`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                    {feedbackRatings[key] > 0 && (
                                        <span className="text-sm text-gray-500 self-center mr-1">{feedbackRatings[key]}/5</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        <div>
                            <p className="text-sm font-medium mb-2">📝 הערות נוספות (אופציונלי)</p>
                            <Textarea
                                value={feedbackNotes}
                                onChange={e => setFeedbackNotes(e.target.value)}
                                placeholder="משהו שרצית לשתף על המשמרת..."
                                rows={3}
                                className="text-right"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={submitEndShift}
                            className="flex-1 text-sm text-gray-400 hover:text-gray-600 py-2"
                        >
                            דלג ולסיים
                        </button>
                        <button
                            onClick={submitEndShift}
                            disabled={actionLoading}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold text-sm"
                        >
                            שלח ולסיים משמרת
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

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