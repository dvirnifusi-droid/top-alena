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
import { useToast } from '@/components/ui/use-toast';
import { awardAvailabilityCoins } from '@/functions/awardAvailabilityCoins';



const DEFAULT_AVAILABILITY_TYPES = {
    available: { label: '✅ פנוי/ה', color: 'bg-green-100 text-green-800 border-green-300' },
    unavailable: { label: '❌ לא פנוי/ה', color: 'bg-red-100 text-red-800 border-red-300' },
    partial: { label: '⏰ פנוי/ה חלקית', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    preferred_off: { label: '🙏 מעדיף/ה לא', color: 'bg-orange-100 text-orange-800 border-orange-300' },
};

const DEFAULT_SHIFT_OPTIONS = [
    { value: 'lunch', label: 'צהריים' },
    { value: 'dinner', label: 'ערב' },
    { value: 'both', label: 'שתיהן' },
];

const getWeekDays = (offsetDays) => {
    const weekStart = startOfWeek(addDays(new Date(), offsetDays), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
};

const initDayData = (days) => {
    const init = {};
    days.forEach(day => {
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
     const { toast } = useToast();
     const [selectedEmployee, setSelectedEmployee] = useState(null);
     const [selectedWeekOffset, setSelectedWeekOffset] = useState(7); // 7=next week, 14=+2, 21=+3
     const [employeeEmail, setEmployeeEmail] = useState('');
     const [accessCode, setAccessCode] = useState('');
     const [useCodeAuth, setUseCodeAuth] = useState(true);
     const [allEmployees, setAllEmployees] = useState([]);
     const [settings, setSettings] = useState(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState(null);
     const [saving, setSaving] = useState(false);
     const [submitted, setSubmitted] = useState(false);
    const [coinsAwarded, setCoinsAwarded] = useState(0);
     const [existingAvailabilities, setExistingAvailabilities] = useState([]);
     const [dayData, setDayData] = useState(() => initDayData(getWeekDays(7)));
     const [selectedDepartment, setSelectedDepartment] = useState(null);
     const [loginDepartment, setLoginDepartment] = useState(null);
     
     const AVAILABILITY_TYPES = settings ? Object.fromEntries(settings.availability_types.map(t => [t.key, { label: t.label, color: t.color }])) : DEFAULT_AVAILABILITY_TYPES;
     const SHIFT_OPTIONS = settings?.shift_options || DEFAULT_SHIFT_OPTIONS;
     const DEPARTMENTS = settings?.departments || [];
     const POSITIONS = selectedDepartment ? settings?.departments?.find(d => d.key === selectedDepartment)?.positions || [] : [];

     useEffect(() => {
         loadData();
     }, []);

     // When week offset changes and employee is logged in, rebuild dayData for the new week
     useEffect(() => {
         if (!selectedEmployee) return;
         const deptConfig = settings?.departments?.find(d => d.key === selectedDepartment);
         const defaultPosition = deptConfig?.default_position ? [deptConfig.default_position] : deptConfig?.positions?.length > 0 ? [deptConfig.positions[0]] : [];
         const newWeekDays = getWeekDays(selectedWeekOffset);
         const newDayData = initDayData(newWeekDays);
         existingAvailabilities.forEach(a => {
             if (newDayData[a.date]) {
                 newDayData[a.date] = { availability_type: a.availability_type || 'available', shift_preference: a.shift_preference || 'both', reason: a.reason || '', positions: a.positions?.length > 0 ? a.positions : defaultPosition };
             }
         });
         if (defaultPosition.length > 0) {
             Object.keys(newDayData).forEach(dateStr => {
                 if (!existingAvailabilities.find(a => a.date === dateStr)) newDayData[dateStr].positions = defaultPosition;
             });
         }
         setDayData(newDayData);
     }, [selectedWeekOffset, selectedEmployee]);

     const loadData = async () => {
         setLoading(true);
         try {
             await Promise.all([loadEmployees(), loadSettings()]);
         } catch (e) {
             console.error(e);
         }
         setLoading(false);
     };

     const loadSettings = async () => {
         try {
             const existingSettings = await base44.entities.AvailabilityFormSettings.list();
             if (existingSettings.length > 0) {
                 setSettings(existingSettings[0]);
             } else {
                 const defaultSettings = {
                     positions: DEFAULT_POSITIONS,
                     availability_types: Object.values(DEFAULT_AVAILABILITY_TYPES).map((v, i) => ({
                         key: Object.keys(DEFAULT_AVAILABILITY_TYPES)[i],
                         label: v.label,
                         color: v.color
                     })),
                     shift_options: DEFAULT_SHIFT_OPTIONS,
                     default_days_unavailable: [],
                     week_starts_offset: 7,
                 };
                 const created = await base44.entities.AvailabilityFormSettings.create(defaultSettings);
                 setSettings(created);
             }
         } catch (e) {
             console.error('Error loading settings:', e);
             setSettings({
                 positions: DEFAULT_POSITIONS,
                 availability_types: Object.values(DEFAULT_AVAILABILITY_TYPES).map((v, i) => ({
                     key: Object.keys(DEFAULT_AVAILABILITY_TYPES)[i],
                     label: v.label,
                     color: v.color
                 })),
                 shift_options: DEFAULT_SHIFT_OPTIONS,
                 default_days_unavailable: [],
                 week_starts_offset: 7,
             });
         }
     };

     const loadEmployees = async () => {
         try {
             const emps = await base44.entities.Employee.filter({ status: 'active' });
             setAllEmployees(emps);
         } catch (e) {
             console.error(e);
             setError('שגיאה בטעינת רשימת העובדים');
         }
     };

     const loadCurrentEmployee = async () => {
         if (!employeeEmail) {
             setError('בחר עובד מהרשימה');
             return;
         }
         
         if (useCodeAuth && !accessCode) {
             setError('הכנס את קוד הגישה שלך');
             return;
         }

         setLoading(true);
         try {
             const emp = allEmployees.find(e => e.email && e.email.toLowerCase() === employeeEmail.toLowerCase());
             if (!emp) {
                 setError('לא נמצא עובד עם מייל זה.');
                 setLoading(false);
                 return;
             }
             
             if (useCodeAuth) {
                 if (emp.access_code !== accessCode) {
                     setError('קוד הגישה אינו נכון. בדוק את ההקלדה.');
                     setAccessCode('');
                     setLoading(false);
                     return;
                 }
             } else {
                 if (emp.access_code) {
                     setError('עובד זה דורש קוד גישה. בחר בהתחברות באמצעות קוד.');
                     setLoading(false);
                     return;
                 }
             }
             
             setSelectedEmployee(emp);
             const dept = loginDepartment || emp.department || DEPARTMENTS[0]?.key || null;
             setSelectedDepartment(dept);

             const existing = await base44.entities.EmployeeAvailability.filter({ employee_id: emp.id });
                  setExistingAvailabilities(existing);
                  const currentWeekDays = getWeekDays(selectedWeekOffset);
                  const newDayData = initDayData(currentWeekDays);

             // Auto-set default position based on department config
             const deptConfig = settings?.departments?.find(d => d.key === dept);
             const defaultPosition = deptConfig?.default_position
                 ? [deptConfig.default_position]
                 : deptConfig?.positions?.length > 0
                     ? [deptConfig.positions[0]]
                     : [];

             existing.forEach(a => {
                if (newDayData[a.date]) {
                    newDayData[a.date] = {
                        availability_type: a.availability_type || 'available',
                        shift_preference: a.shift_preference || 'both',
                        reason: a.reason || '',
                        positions: a.positions?.length > 0 ? a.positions : defaultPosition,
                    };
                }
             });

             // For days without existing data, set default position if kitchen
             if (defaultPosition.length > 0) {
                Object.keys(newDayData).forEach(dateStr => {
                    if (!existing.find(a => a.date === dateStr)) {
                        newDayData[dateStr].positions = defaultPosition;
                    }
                });
             }

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
                    department: selectedDepartment,
                };
                if (existing) {
                    await base44.entities.EmployeeAvailability.update(existing.id, record);
                } else {
                    await base44.entities.EmployeeAvailability.create(record);
                }
            }
            // Count available shifts (each day can have 1 or 2 shifts based on preference)
            const availableShifts = Object.values(dayData).reduce((count, data) => {
                if (data.availability_type === 'unavailable') return count;
                return count + (data.shift_preference === 'both' ? 2 : 1);
            }, 0);

            // Award coins: 5 coins per available shift
            if (availableShifts > 0) {
                const coinsToAward = availableShifts * 5;
                const res = await awardAvailabilityCoins({
                    employee_id: selectedEmployee.id,
                    employee_name: selectedEmployee.full_name,
                    availableShifts,
                    coinsToAward,
                });
                const awarded = res?.data?.coinsAwarded || coinsToAward;
                setCoinsAwarded(awarded);
                toast({
                    title: `🪙 +${awarded} מטבעות נוספו!`,
                    description: `קיבלת ${awarded} מטבעות על הגשת סידור עם ${availableShifts} משמרות פנויות`,
                    duration: 5000,
                });
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
        setEmployeeEmail('');
        setAccessCode('');
        setUseCodeAuth(true);
        setSelectedWeekOffset(7);
        setDayData(initDayData(getWeekDays(7)));
        setExistingAvailabilities([]);
        setSelectedDepartment(null);
        setLoginDepartment(null);
    };

    if (loading) return (
         <div className="flex items-center justify-center h-screen">
             <Loader2 className="w-10 h-10 animate-spin text-primary" />
         </div>
     );

     if (!selectedEmployee) return (
         <div className="p-4 sm:p-8 max-w-2xl mx-auto" dir="rtl">
             <Card className="p-8">
                 <CardHeader>
                     <CardTitle className="flex items-center gap-2 text-2xl">
                         <CalendarDays className="w-8 h-8 text-primary" />
                         הגשת זמינות לסידור
                     </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                     <p className="text-gray-600">
                         בחר את שמך והכנס את קוד הגישה שלך:
                     </p>

                     {error && (
                         <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                             {error}
                         </div>
                     )}

                     <div>
                         <Label className="mb-3 block font-semibold">בחר את שמך:</Label>
                         <Select value={employeeEmail} onValueChange={setEmployeeEmail}>
                             <SelectTrigger className="h-12 text-base">
                                 <SelectValue placeholder="בחר את שמך..." />
                             </SelectTrigger>
                             <SelectContent>
                                 {allEmployees.map(emp => (
                                     <SelectItem key={emp.id} value={emp.email}>
                                         {emp.full_name}
                                     </SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                     </div>

                     {DEPARTMENTS.length > 0 && (
                         <div>
                             <Label className="mb-3 block font-semibold">בחר חטיבה:</Label>
                             <div className="flex gap-2">
                                 {DEPARTMENTS.map(dept => (
                                     <button
                                         key={dept.key}
                                         onClick={() => setLoginDepartment(dept.key)}
                                         className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all border-2 ${
                                             loginDepartment === dept.key
                                                 ? 'bg-primary text-white border-primary'
                                                 : 'bg-white text-gray-700 border-gray-300 hover:border-primary/50'
                                         }`}
                                     >
                                         {dept.label}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     )}

                     <div>
                         <div className="flex gap-2 mb-3">
                             <button
                                 onClick={() => { setUseCodeAuth(true); setAccessCode(''); setError(null); }}
                                 className={`flex-1 px-3 py-2 rounded-lg font-semibold transition-all ${
                                     useCodeAuth
                                         ? 'bg-primary text-white'
                                         : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                 }`}
                             >
                                 קוד גישה
                             </button>
                             <button
                                 onClick={() => { setUseCodeAuth(false); setAccessCode(''); setError(null); }}
                                 className={`flex-1 px-3 py-2 rounded-lg font-semibold transition-all ${
                                     !useCodeAuth
                                         ? 'bg-primary text-white'
                                         : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                 }`}
                             >
                                 דרך מייל
                             </button>
                         </div>
                         
                         {useCodeAuth && (
                             <input
                                 type="password"
                                 placeholder="הכנס את קוד הגישה שלך"
                                 value={accessCode}
                                 onChange={(e) => setAccessCode(e.target.value)}
                                 onKeyPress={(e) => e.key === 'Enter' && loadCurrentEmployee()}
                                 className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base text-center tracking-widest"
                             />
                         )}
                         
                         {!useCodeAuth && (
                             <p className="text-sm text-gray-600 text-center py-3">
                                 אתה מאומת דרך כתובת המייל שלך
                             </p>
                         )}
                     </div>

                     <Button 
                         onClick={loadCurrentEmployee} 
                         disabled={!employeeEmail || (useCodeAuth && !accessCode) || loading || (DEPARTMENTS.length > 0 && !loginDepartment)}
                         size="lg"
                         className="w-full h-12 text-base"
                     >
                         {loading ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <User className="w-5 h-5 ml-2" />}
                         התחבר
                     </Button>
                 </CardContent>
             </Card>
         </div>
     );

     // Department Selection
     if (!selectedDepartment) return (
        <div className="flex items-center justify-center min-h-screen p-4" dir="rtl">
            <Card className="max-w-md w-full p-8">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">בחר את החטיבה שלך</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-center text-gray-600 text-sm">
                        שלום {selectedEmployee.full_name}! בחר איזו חטיבה אתה משתייך:
                    </p>
                    <div className="space-y-3">
                        {DEPARTMENTS.map(dept => (
                            <Button
                                key={dept.key}
                                onClick={() => setSelectedDepartment(dept.key)}
                                className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90"
                            >
                                {dept.label}
                            </Button>
                        ))}
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setSelectedEmployee(null)}
                        className="w-full mt-6"
                    >
                        חזור
                    </Button>
                </CardContent>
            </Card>
        </div>
     );

     if (submitted) return (
        <div className="flex items-center justify-center h-screen p-8" dir="rtl">
            <Card className="max-w-md w-full text-center p-10">
                <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">הבקשה נשלחה בהצלחה!</h2>
                <p className="text-gray-500 mb-2">שלום {selectedEmployee?.full_name}!</p>
                <p className="text-gray-500 mb-4">המנהל יראה את הזמינות שלך ויוכל לשבץ אותך בסידור.</p>
                {coinsAwarded > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center justify-center gap-3">
                        <span className="text-4xl">🪙</span>
                        <div>
                            <p className="font-bold text-yellow-800 text-lg">+{coinsAwarded} מטבעות!</p>
                            <p className="text-yellow-700 text-sm">קיבלת מטבעות על הגשת סידור</p>
                        </div>
                    </div>
                )}
                <div className="flex gap-2 flex-col">
                    <Button onClick={() => setSubmitted(false)} className="bg-blue-600 hover:bg-blue-700">
                        עדכן שוב
                    </Button>
                    <Button onClick={handleReset} variant="outline">
                        עובד אחר
                    </Button>
                </div>
            </Card>
        </div>
    );

    // Fill availability
    const weekDays = getWeekDays(selectedWeekOffset);
    const currentDept = DEPARTMENTS.find(d => d.key === selectedDepartment);

    const WEEK_OPTIONS = [
        { offset: 7, label: 'שבוע הבא' },
        { offset: 14, label: 'עוד שבועיים' },
        { offset: 21, label: 'עוד שלושה שבועות' },
    ];

    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto" dir="rtl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-2 mb-1">
                    <CalendarDays className="w-8 h-8 text-primary" />
                    הגשת זמינות לסידור
                </h1>
                <p className="text-gray-500">
                    שלום <strong>{selectedEmployee.full_name}</strong>! ({currentDept?.label})
                </p>
            </div>

            {/* Week selector */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {WEEK_OPTIONS.map(opt => (
                    <button
                        key={opt.offset}
                        onClick={() => setSelectedWeekOffset(opt.offset)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all ${
                            selectedWeekOffset === opt.offset
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-primary/50'
                        }`}
                    >
                        {opt.label}
                        <span className="block text-xs font-normal opacity-75">
                            {format(getWeekDays(opt.offset)[0], 'dd/MM')} – {format(getWeekDays(opt.offset)[6], 'dd/MM')}
                        </span>
                    </button>
                ))}
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

                                        <button
                                            onClick={() => updateDay(dateStr, 'availability_type', 'available') || updateDay(dateStr, 'shift_preference', 'both') || updateDay(dateStr, 'reason', '') || updateDay(dateStr, 'positions', [])}
                                            className="text-sm text-red-600 hover:text-red-800 font-semibold mt-2"
                                        >
                                            נקה יום זה
                                        </button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="mt-8 flex justify-end gap-3">
                <Button
                    variant="outline"
                    onClick={() => setSelectedDepartment(null)}
                    className="text-lg px-10"
                >
                    חזור
                </Button>
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="text-lg px-10"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <CheckCircle2 className="w-5 h-5 ml-2" />}
                    {existingAvailabilities.length > 0 ? 'עדכן זמינות' : 'שלח זמינות'}
                </Button>
            </div>
        </div>
    );
}