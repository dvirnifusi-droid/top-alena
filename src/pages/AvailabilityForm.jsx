import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import { CheckCircle2, Loader2, CalendarDays, User } from 'lucide-react';

const POSITIONS = [
    'מלצר', 'ברמן', 'ראנר', 'מארח/ת', 'טבח', 'מנהל משמרת',
    'קופה + אריזות', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'שוטף כלים', 'מתלמד מטבח'
];

const AVAILABILITY_TYPES = {
    available: { label: '✅ פנוי/ה', color: 'bg-green-100 text-green-800 border-green-300' },
    unavailable: { label: '❌ לא פנוי/ה', color: 'bg-red-100 text-red-800 border-red-300' },
    partial: { label: '⏰ פנוי/ה חלקית', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    preferred_off: { label: '🙏 מעדיף/ה לא', color: 'bg-orange-100 text-orange-800 border-orange-300' },
};

const SHIFT_OPTIONS = [
    { value: 'lunch', label: 'צהריים' },
    { value: 'dinner', label: 'ערב' },
    { value: 'both', label: 'שתיהן' },
];

const nextWeekStart = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 0 });
const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 0 });
const weekDays = eachDayOfInterval({ start: nextWeekStart, end: nextWeekEnd });

const initDayData = () => {
    const init = {};
    weekDays.forEach(day => {
        init[format(day, 'yyyy-MM-dd')] = {
            availability_type: 'available',
            shift_preference: 'both',
            reason: '',
            positions: [],
        };
    });
    return init;
};

export default function AvailabilityForm() {
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [existingAvailabilities, setExistingAvailabilities] = useState([]);
    const [dayData, setDayData] = useState(initDayData);

    useEffect(() => {
        loadCurrentEmployee();
    }, []);

    const loadCurrentEmployee = async () => {
        setLoading(true);
        try {
            const user = await base44.auth.me();
            if (!user) {
                base44.auth.redirectToLogin();
                return;
            }
            const emps = await base44.entities.Employee.filter({ status: 'active' });
            const emp = emps.find(e => e.email && user.email && e.email.toLowerCase() === user.email.toLowerCase());
            if (!emp) {
                setError('לא נמצא פרופיל עובד עבור המשתמש שלך. פנה למנהל.');
                setLoading(false);
                return;
            }
            setSelectedEmployee(emp);

            const existing = await base44.entities.EmployeeAvailability.filter({ employee_id: emp.id });
            setExistingAvailabilities(existing);
            const newDayData = initDayData();
            existing.forEach(a => {
                if (newDayData[a.date]) {
                    newDayData[a.date] = {
                        availability_type: a.availability_type || 'available',
                        shift_preference: a.shift_preference || 'both',
                        reason: a.reason || '',
                        positions: a.positions || [],
                    };
                }
            });
            setDayData(newDayData);
        } catch (e) {
            console.error(e);
            setError('שגיאה בטעינת הנתונים');
        }
        setLoading(false);
    };

    const updateDay = (dateStr, field, value) => {
        setDayData(prev => ({
            ...prev,
            [dateStr]: { ...prev[dateStr], [field]: value }
        }));
    };

    const togglePosition = (dateStr, pos) => {
        const curr = dayData[dateStr]?.positions || [];
        const updated = curr.includes(pos) ? curr.filter(p => p !== pos) : [...curr, pos];
        updateDay(dateStr, 'positions', updated);
    };

    const handleSubmit = async () => {
        if (!selectedEmployee) return;
        setSaving(true);
        try {
            for (const [dateStr, data] of Object.entries(dayData)) {
                const existing = existingAvailabilities.find(a => a.date === dateStr);
                const record = {
                    employee_id: selectedEmployee.id,
                    employee_name: selectedEmployee.full_name,
                    date: dateStr,
                    availability_type: data.availability_type,
                    shift_preference: data.shift_preference,
                    reason: data.reason,
                    positions: data.positions,
                    available_from: data.availability_type === 'partial' ? data.available_from || '' : '',
                    available_until: data.availability_type === 'partial' ? data.available_until || '' : '',
                };
                if (existing) {
                    await base44.entities.EmployeeAvailability.update(existing.id, record);
                } else {
                    await base44.entities.EmployeeAvailability.create(record);
                }
            }
            setSubmitted(true);
        } catch (e) {
            console.error(e);
            alert('שגיאה בשמירת הבקשה');
        }
        setSaving(false);
    };

    const handleReset = () => {
        setSubmitted(false);
        setSelectedEmployee(null);
        setDayData(initDayData());
        setExistingAvailabilities([]);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center h-screen p-8" dir="rtl">
            <Card className="max-w-md w-full text-center p-10">
                <p className="text-xl text-red-500">{error}</p>
            </Card>
        </div>
    );

    if (submitted) return (
        <div className="flex items-center justify-center h-screen p-8" dir="rtl">
            <Card className="max-w-md w-full text-center p-10">
                <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">הבקשה נשלחה בהצלחה!</h2>
                <p className="text-gray-500 mb-2">שלום {selectedEmployee?.full_name}!</p>
                <p className="text-gray-500 mb-6">המנהל יראה את הזמינות שלך ויוכל לשבץ אותך בסידור.</p>
                <Button onClick={handleReset}>שלח עובד אחר / עדכן שוב</Button>
            </Card>
        </div>
    );

    // Step 1: Employee selection
    if (!selectedEmployee) return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-gray-50" dir="rtl">
            <Card className="max-w-md w-full p-8">
                <div className="text-center mb-6">
                    <CalendarDays className="w-16 h-16 text-primary mx-auto mb-3" />
                    <h1 className="text-2xl font-bold">הגשת זמינות לסידור</h1>
                    <p className="text-gray-500 mt-1">
                        שבוע {format(nextWeekStart, 'dd/MM')} – {format(nextWeekEnd, 'dd/MM/yyyy')}
                    </p>
                </div>
                <div className="space-y-4">
                    <div>
                        <Label className="mb-2 block text-base font-semibold">בחר/י את שמך מהרשימה</Label>
                        <Select onValueChange={handleSelectEmployee}>
                            <SelectTrigger className="h-12 text-base">
                                <SelectValue placeholder="בחר/י עובד..." />
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
                </div>
            </Card>
        </div>
    );

    // Step 2: Fill availability
    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto" dir="rtl">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <CalendarDays className="w-8 h-8 text-primary" />
                        הגשת זמינות לסידור
                    </h1>
                    <p className="text-gray-500 mt-1">
                        שלום <strong>{selectedEmployee.full_name}</strong>! שבוע{' '}
                        <strong>{format(nextWeekStart, 'dd/MM')} – {format(nextWeekEnd, 'dd/MM/yyyy')}</strong>
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                    <User className="w-4 h-4 ml-1" />
                    החלף עובד
                </Button>
            </div>

            <div className="space-y-4">
                {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const data = dayData[dateStr];
                    const typeConfig = AVAILABILITY_TYPES[data.availability_type];

                    return (
                        <Card key={dateStr} className={`border-2 ${data.availability_type === 'unavailable' ? 'opacity-60' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <CardTitle className="text-lg">
                                        {format(day, 'EEEE', { locale: he })}{' '}
                                        <span className="text-gray-500 font-normal">{format(day, 'dd/MM')}</span>
                                    </CardTitle>
                                    <Badge className={`border ${typeConfig.color} text-sm px-3 py-1`}>
                                        {typeConfig.label}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label className="mb-2 block">סטטוס זמינות</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(AVAILABILITY_TYPES).map(([key, cfg]) => (
                                            <button
                                                key={key}
                                                onClick={() => updateDay(dateStr, 'availability_type', key)}
                                                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                                                    data.availability_type === key
                                                        ? `${cfg.color} border-2 shadow-sm scale-105`
                                                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                                                }`}
                                            >
                                                {cfg.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {data.availability_type !== 'unavailable' && (
                                    <>
                                        <div>
                                            <Label className="mb-2 block">העדפת משמרת</Label>
                                            <div className="flex gap-2 flex-wrap">
                                                {SHIFT_OPTIONS.map(s => (
                                                    <button
                                                        key={s.value}
                                                        onClick={() => updateDay(dateStr, 'shift_preference', s.value)}
                                                        className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                                                            data.shift_preference === s.value
                                                                ? 'bg-primary text-primary-foreground border-primary'
                                                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                                                        }`}
                                                    >
                                                        {s.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="mb-2 block">תפקידים שאני יכול/ה למלא (אופציונלי)</Label>
                                            <div className="flex flex-wrap gap-2">
                                                {POSITIONS.map(pos => (
                                                    <button
                                                        key={pos}
                                                        onClick={() => togglePosition(dateStr, pos)}
                                                        className={`px-3 py-1 rounded-full border text-sm transition-all ${
                                                            data.positions.includes(pos)
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                                                        }`}
                                                    >
                                                        {pos}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div>
                                    <Label className="mb-2 block">הערה / סיבה (אופציונלי)</Label>
                                    <Textarea
                                        placeholder="לדוגמה: יש לי טיסה, מועדף לסיים עד 22:00..."
                                        value={data.reason}
                                        onChange={e => updateDay(dateStr, 'reason', e.target.value)}
                                        className="h-20"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="mt-8 flex justify-end">
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="text-lg px-10"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <CheckCircle2 className="w-5 h-5 ml-2" />}
                    שלח זמינות
                </Button>
            </div>
        </div>
    );
}