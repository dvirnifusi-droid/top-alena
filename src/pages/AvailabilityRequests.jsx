import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, Users, ChevronLeft, ChevronRight, CheckCircle2, Zap, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import PageGuard from '../components/shared/PageGuard';

const AVAILABILITY_TYPES = {
    available: { label: '✅ פנוי/ה', color: 'bg-green-100 text-green-800' },
    unavailable: { label: '❌ לא פנוי/ה', color: 'bg-red-100 text-red-800' },
    partial: { label: '⏰ חלקית', color: 'bg-yellow-100 text-yellow-800' },
    preferred_off: { label: '🙏 מעדיף לא', color: 'bg-orange-100 text-orange-800' },
};

const SHIFT_PREF = {
    lunch: 'צהריים',
    dinner: 'ערב',
    both: 'שתיהן',
};

function AvailabilityRequestsInner() {
     const [currentUser, setCurrentUser] = useState(null);
     const [availabilities, setAvailabilities] = useState([]);
     const [employees, setEmployees] = useState([]);
     const [settings, setSettings] = useState(null);
     const [loading, setLoading] = useState(true);
     const [autoAssigning, setAutoAssigning] = useState(false);
     const [weekOffset, setWeekOffset] = useState(1); // 1 = next week, 0 = this week
     const [editingAvail, setEditingAvail] = useState(null);
     const [editData, setEditData] = useState(null);
     const [expandedUnavailable, setExpandedUnavailable] = useState(false);
     const [selectedDepartment, setSelectedDepartment] = useState(null);
     // Department managers are auto-locked to their own department.
     const managedDept = currentUser?.managed_department || null;
     useEffect(() => {
       if (managedDept && selectedDepartment !== managedDept) setSelectedDepartment(managedDept);
     }, [managedDept]); // eslint-disable-line react-hooks/exhaustive-deps
     const [singleAssignModal, setSingleAssignModal] = useState(null);
     const [singleAssignLoading, setSingleAssignLoading] = useState(false);

     // ---- filters ----
     const [filterSearch, setFilterSearch] = useState('');
     const [filterShift, setFilterShift] = useState('all');   // all | lunch | dinner
     const [filterStatus, setFilterStatus] = useState('all'); // all | available | partial | unavailable | preferred_off
     const [filterRole, setFilterRole] = useState('all');
     const clearFilters = () => { setFilterSearch(''); setFilterShift('all'); setFilterStatus('all'); setFilterRole('all'); };
     const filtersActive = filterSearch.trim() || filterShift !== 'all' || filterStatus !== 'all' || filterRole !== 'all';

     // Roster panel: collapsed by default. Holds both "didn't submit" and inactive lists.
     const [rosterOpen, setRosterOpen] = useState(false);
     const [inactiveEmployees, setInactiveEmployees] = useState([]);

    const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    useEffect(() => {
        loadData();
    }, [weekOffset]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [me, allAvail, allEmps, inactiveEmps, sett] = await Promise.all([
                base44.auth.me().catch(() => null),
                base44.entities.EmployeeAvailability.list(),
                base44.entities.Employee.filter({ status: 'active' }),
                base44.entities.Employee.filter({ status: 'inactive' }).catch(() => []),
                base44.entities.AvailabilityFormSettings.list(),
            ]);
            setCurrentUser(me);
            // Normalize ISO date strings to YYYY-MM-DD for downstream comparisons.
            setAvailabilities(allAvail.map(a => ({ ...a, date: typeof a.date === 'string' ? a.date.slice(0, 10) : a.date })));
            setEmployees(allEmps);
            setInactiveEmployees(inactiveEmps || []);
            setSettings(sett[0] || null);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const getAvailForDay = (dateStr) => {
        return filteredAvails.filter(a => a.date === dateStr);
    };

    const getDepartmentLabel = (dept) => {
        return settings?.departments?.find(d => d.key === dept)?.label || dept;
    };

    const handleEditAvail = (avail) => {
        setEditingAvail(avail);
        setEditData({ ...avail });
    };

    const getAvailablePositions = () => {
        return settings?.positions || [];
    };

    const handleSaveEdit = async () => {
        try {
            await base44.entities.EmployeeAvailability.update(editingAvail.id, editData);
            setAvailabilities(prev => prev.map(a => a.id === editingAvail.id ? editData : a));
            setEditingAvail(null);
            toast.success('זמינות עודכנה');
        } catch (e) {
            console.error(e);
            toast.error('שגיאה בעדכון זמינות');
        }
    };

    const handleAutoAssign = async () => {
         setAutoAssigning(true);
         try {
             let assigned = 0;

             for (const day of weekDays) {
                 const dateStr = format(day, 'yyyy-MM-dd');
                 const dayAvail = getAvailForDay(dateStr).filter(a =>
                     a.availability_type === 'available' || a.availability_type === 'partial'
                 );

                 for (const shiftType of ['lunch', 'dinner']) {
                     const eligible = dayAvail.filter(a =>
                         !a.shift_preference || a.shift_preference === 'both' || a.shift_preference === shiftType
                     );

                     if (eligible.length === 0) continue;

                     // Find or create WorkShift
                     const existingShifts = await base44.entities.WorkShift.filter({ date: dateStr, shift_type: shiftType });
                     let shift = existingShifts[0];

                     if (!shift) {
                         shift = await base44.entities.WorkShift.create({
                             date: dateStr,
                             shift_type: shiftType,
                             start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                             end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                             assigned_staff: [],
                         });
                     }

                     const currentStaff = shift.assigned_staff || [];
                     const newStaff = [...currentStaff];

                     for (const avail of eligible) {
                         // Skip if already assigned
                         const alreadyIn = currentStaff.some(s => s.employee_id === avail.employee_id);
                         if (alreadyIn) continue;

                         const emp = employees.find(e => e.id === avail.employee_id);
                         if (!emp) continue;

                         // Determine position
                         const position = avail.positions?.length > 0 ? avail.positions[0] : (emp.positions?.[0]?.position_name || 'מלצר');

                         newStaff.push({
                             employee_id: avail.employee_id,
                             employee_name: avail.employee_name || emp.full_name,
                             position,
                             start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                             end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                         });
                         assigned++;
                     }

                     if (newStaff.length !== currentStaff.length) {
                         await base44.entities.WorkShift.update(shift.id, { assigned_staff: newStaff });
                     }
                 }
             }

             toast.success(`שובצו ${assigned} עובדים לסידור העבודה!`);
         } catch (e) {
             console.error(e);
             toast.error('שגיאה בשיבוץ האוטומטי');
         }
         setAutoAssigning(false);
     };

     const handleSingleAssign = async (avail, shiftType) => {
         setSingleAssignLoading(true);
         try {
             const dateStr = avail.date;
             const existingShifts = await base44.entities.WorkShift.filter({ date: dateStr, shift_type: shiftType });
             let shift = existingShifts[0];

             if (!shift) {
                 shift = await base44.entities.WorkShift.create({
                     date: dateStr,
                     shift_type: shiftType,
                     start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                     end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                     assigned_staff: [],
                 });
             }

             const currentStaff = shift.assigned_staff || [];
             const alreadyIn = currentStaff.some(s => s.employee_id === avail.employee_id);

             if (alreadyIn) {
                 toast.info('העובד כבר שובץ למשמרת זו');
                 setSingleAssignModal(null);
                 setSingleAssignLoading(false);
                 return;
             }

             const emp = employees.find(e => e.id === avail.employee_id);
             if (!emp) {
                 toast.error('לא נמצא עובד');
                 setSingleAssignLoading(false);
                 return;
             }

             const position = avail.positions?.length > 0 ? avail.positions[0] : (emp.positions?.[0]?.position_name || 'מלצר');

             const newStaff = [...currentStaff, {
                 employee_id: avail.employee_id,
                 employee_name: avail.employee_name || emp.full_name,
                 position,
                 start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                 end_time: shiftType === 'lunch' ? '17:00' : '23:00',
             }];

             const updated = await base44.entities.WorkShift.update(shift.id, { assigned_staff: newStaff });
             // Verify the staff is actually in the response so we know the save took.
             const verified = (updated?.assigned_staff || []).some(s => s.employee_id === avail.employee_id);
             if (!verified) {
                 console.warn('[singleAssign] save returned but employee not present in response', { shiftId: shift.id, newStaff, updated });
                 toast.error('שגיאה: השיבוץ לא נשמר. בדוק את הרשת ונסה שוב.');
                 setSingleAssignLoading(false);
                 return;
             }
             toast.success(`${avail.employee_name} שובץ ל-${shiftType === 'lunch' ? 'צהריים' : 'ערב'} בהצלחה!`);
             setSingleAssignModal(null);
             await loadData(); // Refresh so the UI reflects the new assignment immediately
         } catch (e) {
             console.error('[singleAssign] failed:', e);
             toast.error('שגיאה בשיבוץ: ' + (e?.message || e));
         }
         setSingleAssignLoading(false);
     };

    const getFilteredAvailabilities = () => {
        if (!selectedDepartment) return availabilities;
        return availabilities.filter(a => a.department === selectedDepartment);
    };

    // Pull every position label from current employees (handles both string and {position_name} shapes).
    const allRoleOptions = React.useMemo(() => {
        const set = new Set();
        for (const e of employees) {
            if (typeof e.role === 'string' && e.role) set.add(e.role);
            const pos = Array.isArray(e.positions) ? e.positions : [];
            for (const p of pos) {
                const name = typeof p === 'string' ? p : (p?.position_name || p?.name);
                if (name) set.add(name);
            }
        }
        return [...set];
    }, [employees]);

    const applyFilters = (avails) => {
        let r = avails;
        const q = filterSearch.trim().toLowerCase();
        if (q) r = r.filter(a => (a.employee_name || '').toLowerCase().includes(q));
        if (filterShift !== 'all') {
            r = r.filter(a => a.shift_preference === filterShift || a.shift_preference === 'both');
        }
        if (filterStatus !== 'all') r = r.filter(a => a.availability_type === filterStatus);
        if (filterRole !== 'all') {
            r = r.filter(a => {
                const availPositions = Array.isArray(a.positions) ? a.positions : [];
                if (availPositions.includes(filterRole)) return true;
                const emp = employees.find(e => e.id === a.employee_id);
                if (!emp) return false;
                if (emp.role === filterRole) return true;
                const empPos = (Array.isArray(emp.positions) ? emp.positions : [])
                    .map(p => typeof p === 'string' ? p : (p?.position_name || p?.name));
                return empPos.includes(filterRole);
            });
        }
        return r;
    };

    // ---- WhatsApp reminder / deactivate helpers ----
    const normalizeWa = (p) => {
        if (!p) return null;
        let n = String(p).replace(/\D/g, '');
        if (n.startsWith('0')) n = '972' + n.slice(1);
        else if (!n.startsWith('972')) n = '972' + n;
        return n;
    };
    const reminderTextFor = (emp) => {
        const range = `${format(weekStart, 'dd/MM')}–${format(weekEnd, 'dd/MM')}`;
        return (
            `היי ${emp.full_name || ''} 🌿\n` +
            `הזכיר/ה לך — עדיין לא הוגש סידור זמינות לשבוע ${range}.\n` +
            `שלח/י כשתוכל/י, תודה!`
        );
    };
    const openReminderWa = (emp) => {
        const phone = normalizeWa(emp.phone);
        if (!phone) { toast.error('אין טלפון לעובד'); return; }
        const text = encodeURIComponent(reminderTextFor(emp));
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    };
    const deactivateEmployee = async (emp) => {
        if (!window.confirm(`להפוך את ${emp.full_name} ללא פעיל? הוא לא יופיע יותר ברשימות.`)) return;
        try {
            await base44.entities.Employee.update(emp.id, { status: 'inactive' });
            toast.success('העובד הועבר לסטטוס "לא פעיל"');
            await loadData();
        } catch {
            toast.error('שגיאה בעדכון');
        }
    };
    const reactivateEmployee = async (emp) => {
        if (!window.confirm(`להחזיר את ${emp.full_name} לפעיל?`)) return;
        try {
            await base44.entities.Employee.update(emp.id, { status: 'active' });
            toast.success('העובד הוחזר לפעיל');
            await loadData();
        } catch {
            toast.error('שגיאה בעדכון');
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 animate-spin" />
        </div>
    );

    if (!selectedDepartment) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">בחר חטיבה לעדכון הזמינות</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-center text-gray-600 text-sm">
                            בחר איזו חטיבה אתה רוצה לעבוד איתה:
                        </p>
                        {settings?.departments?.map(dept => (
                            <Button
                                key={dept.key}
                                onClick={() => setSelectedDepartment(dept.key)}
                                className="w-full h-12 text-base font-semibold"
                                variant="outline"
                            >
                                {dept.label}
                            </Button>
                        ))}
                        {!settings?.departments || settings.departments.length === 0 && (
                            <p className="text-center text-red-600 text-sm">לא נמצאו חטיבות בהגדרות</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    const filteredAvails = getFilteredAvailabilities();
    const weekAvailabilities = filteredAvails.filter(a =>
        a.date >= format(weekStart, 'yyyy-MM-dd') && a.date <= format(weekEnd, 'yyyy-MM-dd')
    );

    const uniqueEmployeesSubmitted = new Set(weekAvailabilities.map(a => a.employee_id)).size;
    const currentDeptLabel = settings?.departments?.find(d => d.key === selectedDepartment)?.label;

    // Active employees in the current department who haven't submitted this week.
    // Department membership is determined by:
    //   1. Employee.department (explicit), OR
    //   2. Employee.role / Employee.positions[] overlapping the selected
    //      department's positions list (so e.g. role "טבח" appears only under
    //      a department whose positions include "טבח").
    // If neither matches → the employee is hidden from this department's roster.
    const currentDept = settings?.departments?.find(d => d.key === selectedDepartment);
    const currentDeptPositions = new Set(
        (currentDept?.positions || [])
            .map(p => (typeof p === 'string' ? p : (p?.position_name || p?.name)))
            .filter(Boolean)
    );
    const empBelongsToCurrentDept = (e) => {
        if (e.department) return e.department === selectedDepartment;
        if (!currentDeptPositions.size) return true; // no settings yet — fall back to show all
        const empPosNames = [];
        if (typeof e.role === 'string' && e.role) empPosNames.push(e.role);
        (Array.isArray(e.positions) ? e.positions : []).forEach((p) => {
            const n = typeof p === 'string' ? p : (p?.position_name || p?.name);
            if (n) empPosNames.push(n);
        });
        return empPosNames.some((p) => currentDeptPositions.has(p));
    };

    const submittedIds = new Set(weekAvailabilities.map(a => a.employee_id));
    const notSubmittedEmployees = employees.filter(e => {
        if (e.status !== 'active') return false;
        if (submittedIds.has(e.id)) return false;
        return empBelongsToCurrentDept(e);
    });

    const groupByDepartment = (dayAvail) => {
        const grouped = {};
        dayAvail.forEach(a => {
            const dept = a.department || 'other';
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push(a);
        });
        return grouped;
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto" dir="rtl">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Users className="w-8 h-8 text-primary" />
                        בקשות זמינות - {currentDeptLabel}
                    </h1>
                    <p className="text-gray-500 mt-1">
                        שבוע {format(weekStart, 'dd/MM')} – {format(weekEnd, 'dd/MM/yyyy')} ·{' '}
                        <span className="font-semibold text-primary">{uniqueEmployeesSubmitted}</span> עובדים הגישו זמינות
                    </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDepartment(null)}>
                        חזור לבחירה
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    {[1, 2, 3].map(w => (
                        <Button
                            key={w}
                            variant={weekOffset === w ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setWeekOffset(w)}
                        >
                            {w === 1 ? 'שבוע הבא' : w === 2 ? 'עוד שבועיים' : 'עוד 3 שבועות'}
                        </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        onClick={handleAutoAssign}
                        disabled={autoAssigning || weekAvailabilities.length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {autoAssigning
                            ? <Loader2 className="w-4 h-4 animate-spin ml-2" />
                            : <Zap className="w-4 h-4 ml-2" />}
                        שבץ אוטומטית לסידור
                    </Button>
                </div>
            </div>

            {/* ---------- Filter bar ---------- */}
            <Card className="mb-4 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="🔎 חפש בשם..."
                        className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white">
                        <option value="all">כל המשמרות</option>
                        <option value="lunch">צהריים</option>
                        <option value="dinner">ערב</option>
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white">
                        <option value="all">כל הסטטוסים</option>
                        <option value="available">✅ פנוי</option>
                        <option value="partial">⏰ חלקית</option>
                        <option value="preferred_off">🙏 מעדיף לא</option>
                        <option value="unavailable">❌ לא פנוי</option>
                    </select>
                    <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white">
                        <option value="all">כל התפקידים</option>
                        {allRoleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {filtersActive && (
                        <button onClick={clearFilters} className="text-xs px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">
                            נקה ✕
                        </button>
                    )}
                </div>
            </Card>

            {/* ---------- Roster toggle (not-submitted + inactive) ---------- */}
            <div className="mb-4">
                <button
                    onClick={() => setRosterOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 bg-white border-2 border-amber-300 hover:bg-amber-50 transition rounded-2xl px-4 py-3"
                >
                    <span className="font-black text-amber-800 text-base">
                        👥 ניהול עובדים — לא הגישו ({notSubmittedEmployees.length}) · לא פעילים ({inactiveEmployees.length})
                    </span>
                    {rosterOpen
                        ? <ChevronUp className="w-5 h-5 text-amber-700" />
                        : <ChevronDown className="w-5 h-5 text-amber-700" />}
                </button>

                {rosterOpen && (
                    <div className="mt-3 space-y-3">
                        {/* --- Not submitted --- */}
                        <Card className="p-4 border-amber-300 bg-amber-50/40">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <p className="font-black text-amber-800">⏰ עובדים פעילים שעדיין לא הגישו ({notSubmittedEmployees.length})</p>
                                <p className="text-xs text-amber-700">📱 שולח תזכורת בוואטסאפ · 🚫 מעביר ללא פעיל</p>
                            </div>
                            {notSubmittedEmployees.length === 0 ? (
                                <p className="text-slate-400 text-sm text-center py-3">כל העובדים הפעילים בחטיבה הזו הגישו ✓</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {notSubmittedEmployees.map((emp) => (
                                        <div key={emp.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 p-2.5">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-sm truncate">{emp.full_name}</p>
                                                <p className="text-xs text-slate-500 truncate">{emp.phone || '—'} · {emp.role || ''}</p>
                                            </div>
                                            <button onClick={() => openReminderWa(emp)} title="שלח תזכורת בוואטסאפ" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1.5 rounded-lg">📱</button>
                                            <button onClick={() => deactivateEmployee(emp)} title="הפוך ללא פעיל" className="text-xs bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold px-2 py-1.5 rounded-lg">🚫</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* --- Inactive employees --- */}
                        <Card className="p-4 border-slate-300 bg-slate-50/60">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <p className="font-black text-slate-700">🚫 עובדים לא פעילים ({inactiveEmployees.length})</p>
                                <p className="text-xs text-slate-500">✅ מחזיר לפעיל</p>
                            </div>
                            {inactiveEmployees.length === 0 ? (
                                <p className="text-slate-400 text-sm text-center py-3">אין עובדים לא פעילים</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {inactiveEmployees.map((emp) => (
                                        <div key={emp.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-2.5">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-sm truncate">{emp.full_name}</p>
                                                <p className="text-xs text-slate-500 truncate">{emp.phone || '—'} · {emp.role || ''}</p>
                                            </div>
                                            <button onClick={() => reactivateEmployee(emp)} title="החזר לפעיל" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-lg">
                                                ✅ הפעל
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            {weekAvailabilities.length === 0 ? (
                <Card className="text-center p-12">
                    <p className="text-xl text-gray-400">אין בקשות זמינות לשבוע זה עדיין</p>
                    <p className="text-gray-400 mt-2">שלח לעובדים קישור לדף הגשת הזמינות</p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayAvail = applyFilters(getAvailForDay(dateStr));
                        const unavailableCount = dayAvail.filter(a => a.availability_type === 'unavailable').length;
                        const availableCount = dayAvail.filter(a => a.availability_type !== 'unavailable').length;

                        if (dayAvail.length === 0) return null;

                        return (
                            <div key={dateStr} className="space-y-3">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg">
                                            {format(day, 'EEEE', { locale: he })}{' '}
                                            <span className="text-gray-500 font-normal">{format(day, 'dd/MM')}</span>
                                            <span className="text-sm text-gray-400 font-normal mr-2">
                                                ({availableCount} פנויים)
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {Object.entries(groupByDepartment(dayAvail.filter(a => a.availability_type !== 'unavailable'))).map(([dept, deptAvails]) => (
                                            <div key={dept}>
                                                <h3 className="font-semibold text-sm text-gray-700 mb-2">{getDepartmentLabel(dept)}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {deptAvails.map(avail => {
                                                        const typeConfig = AVAILABILITY_TYPES[avail.availability_type] || AVAILABILITY_TYPES.available;
                                                        return (
                                                            <div key={avail.id} className={`p-3 rounded-lg border ${typeConfig.color.replace('text-', 'border-').replace('-800', '-300').replace('-100', '-50')}`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="font-bold">{avail.employee_name}</span>
                                                                    <div className="flex gap-1">
                                                                        <Badge className={typeConfig.color} className="text-xs">{typeConfig.label}</Badge>
                                                                        <Button size="sm" variant="ghost" onClick={() => handleEditAvail(avail)}>
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                {avail.shift_preference && avail.availability_type !== 'unavailable' && (
                                                                    <p className="text-sm text-gray-600">
                                                                        משמרת: <strong>{SHIFT_PREF[avail.shift_preference] || avail.shift_preference}</strong>
                                                                    </p>
                                                                )}
                                                                {avail.positions?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                                        {avail.positions.map(p => (
                                                                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {avail.reason && (
                                                                    <p className="text-xs text-gray-500 mt-2 italic">"{avail.reason}"</p>
                                                                )}
                                                                <div className="flex gap-1 mt-2 flex-wrap">
                                                                    {['lunch', 'dinner'].map(st => (
                                                                        <Button
                                                                            key={st}
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="text-xs h-7"
                                                                            onClick={() => setSingleAssignModal({ avail, shiftType: st })}
                                                                        >
                                                                            שבץ {st === 'lunch' ? 'צהריים' : 'ערב'}
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                                </div>
                                                                );
                                                                })}
                                                                </div>
                                                                </div>
                                                                ))}
                                    </CardContent>
                                </Card>

                                {unavailableCount > 0 && (
                                    <Card className="bg-red-50 border-red-200">
                                        <button
                                            onClick={() => setExpandedUnavailable(expandedUnavailable === dateStr ? null : dateStr)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-red-100 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-red-800">❌ לא פנויים ({unavailableCount})</span>
                                            </div>
                                            {expandedUnavailable === dateStr ? <ChevronUp className="w-4 h-4 text-red-800" /> : <ChevronDown className="w-4 h-4 text-red-800" />}
                                        </button>
                                        {expandedUnavailable === dateStr && (
                                            <CardContent className="pt-0">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {dayAvail.filter(a => a.availability_type === 'unavailable').map(avail => (
                                                        <div key={avail.id} className="p-3 rounded-lg bg-white border border-red-300">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-bold">{avail.employee_name}</span>
                                                                <Button size="sm" variant="ghost" onClick={() => handleEditAvail(avail)}>
                                                                    <Edit2 className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                            {avail.reason && (
                                                                <p className="text-xs text-gray-500 italic">"{avail.reason}"</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!editingAvail} onOpenChange={(open) => !open && setEditingAvail(null)}>
                 <DialogContent dir="rtl" className="sm:max-w-[425px]">
                     <DialogHeader>
                         <DialogTitle>עריכת זמינות - {editingAvail?.employee_name}</DialogTitle>
                     </DialogHeader>
                     {editData && (
                         <div className="space-y-4 py-4">
                             <div>
                                 <Label className="font-semibold">סטטוס</Label>
                                 <Select value={editData.availability_type} onValueChange={(val) => setEditData({...editData, availability_type: val})}>
                                     <SelectTrigger>
                                         <SelectValue />
                                     </SelectTrigger>
                                     <SelectContent>
                                         {Object.entries(AVAILABILITY_TYPES).map(([key, cfg]) => (
                                             <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                         ))}
                                     </SelectContent>
                                 </Select>
                             </div>
                             <div>
                                 <Label className="font-semibold">תפקיד</Label>
                                 <Select
                                     value={editData.positions?.[0] || ''}
                                     onValueChange={(val) => setEditData({...editData, positions: val ? [val] : []})}
                                 >
                                     <SelectTrigger>
                                         <SelectValue placeholder="בחר תפקיד" />
                                     </SelectTrigger>
                                     <SelectContent position="popper" side="bottom" align="start" className="z-[9999]">
                                         {getAvailablePositions().map(pos => (
                                             <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                                         ))}
                                     </SelectContent>
                                 </Select>
                             </div>
                             <div>
                                 <Label className="font-semibold">הערות מנהל</Label>
                                 <Textarea
                                     placeholder="הוסף הערות או שינויים..."
                                     value={editData.admin_notes || ''}
                                     onChange={(e) => setEditData({...editData, admin_notes: e.target.value})}
                                     className="h-20"
                                 />
                             </div>
                         </div>
                     )}
                     <DialogFooter>
                         <Button variant="outline" onClick={() => setEditingAvail(null)}>ביטול</Button>
                         <Button onClick={handleSaveEdit} className="bg-primary">שמור שינויים</Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>

             <Dialog open={!!singleAssignModal} onOpenChange={(open) => !open && setSingleAssignModal(null)}>
                 <DialogContent dir="rtl" className="sm:max-w-[300px]">
                     <DialogHeader>
                         <DialogTitle>שבוץ עובד - {singleAssignModal?.avail?.employee_name}</DialogTitle>
                     </DialogHeader>
                     <p className="text-sm text-gray-600 mb-4">
                         בטוח שברצונך לשבץ את {singleAssignModal?.avail?.employee_name} למשמרת {singleAssignModal?.shiftType === 'lunch' ? 'צהריים' : 'ערב'}?
                     </p>
                     <DialogFooter className="gap-2">
                         <Button variant="outline" onClick={() => setSingleAssignModal(null)}>ביטול</Button>
                         <Button 
                             onClick={() => handleSingleAssign(singleAssignModal.avail, singleAssignModal.shiftType)}
                             disabled={singleAssignLoading}
                             className="bg-green-600 hover:bg-green-700"
                         >
                             {singleAssignLoading ? <Loader2 className="w-3 h-3 animate-spin ml-2" /> : null}
                             אישור שיבוץ
                         </Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>
            </div>
    );
}

export default function AvailabilityRequests() {
    return (
        <PageGuard pageName="AvailabilityRequests" pageTitle="בקשות זמינות">
            <AvailabilityRequestsInner />
        </PageGuard>
    );
}