import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { User } from '@/entities/User';
import { Employee } from '@/entities/Employee';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Clock, Coffee, Play, Square, UtensilsCrossed, CheckCircle } from 'lucide-react';
import LootBox from '../gamification/LootBox';
import GearUpDialog from './GearUpDialog';
import GearReturnDialog from './GearReturnDialog';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

// Promise wrapper around navigator.geolocation. Resolves with {lat,lng} or
// rejects with a short code: 'denied' | 'unavailable' | 'timeout'.
function readPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('unavailable'));
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                if (err.code === 1) reject(new Error('denied'));
                else if (err.code === 2) reject(new Error('unavailable'));
                else reject(new Error('timeout'));
            },
            { timeout: 8000, maximumAge: 15000, enableHighAccuracy: true },
        );
    });
}

export default function ShiftClockWidget() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const [user, setUser] = useState(null);
    const [celebrate, setCelebrate] = useState(false);
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
    const [showLootBox, setShowLootBox] = useState(false);
    const [lootBoxEmployee, setLootBoxEmployee] = useState(null);
    const [managerPassword, setManagerPassword] = useState('');
    const [breakEditUnlocked, setBreakEditUnlocked] = useState(false);
    const MANAGER_CODE = '1234'; // קוד מנהל - ניתן לשנות
    const [showGearUp, setShowGearUp] = useState(false);
    const [showGearReturn, setShowGearReturn] = useState(false);
    const [myDevices, setMyDevices] = useState({ ipad: null, terminal: null });
    const [pendingEndShift, setPendingEndShift] = useState(false);
    const [scheduledEnd, setScheduledEnd] = useState(null); // Date — pulls from WorkShift assignment
    const [gearConfig, setGearConfig] = useState(null); // GearConfig — when to show gear up/return dialogs
    const timerRef = useRef(null);

    // Does the employee's position match the admin's allow-list?
    // Empty/missing list = everyone allowed. Case-insensitive substring
    // match either direction (e.g. "מלצר" matches "מלצר בכיר").
    const positionAllowed = (allowList, candidatePositions) => {
        if (!Array.isArray(allowList) || allowList.length === 0) return true;
        const cands = (candidatePositions || []).map(p => String(p || '').trim().toLowerCase()).filter(Boolean);
        return allowList.some(a => {
            const al = String(a || '').trim().toLowerCase();
            return cands.some(c => c.includes(al) || al.includes(c));
        });
    };

    // Load the scheduled end time for the current shift assignment, so we can highlight
    // the 'סיום משמרת' button once the time has passed.
    useEffect(() => {
        if (!activeShift) { setScheduledEnd(null); return; }
        (async () => {
            try {
                const startDate = new Date(activeShift.shift_start);
                const y = startDate.getFullYear();
                const m = String(startDate.getMonth()+1).padStart(2,'0');
                const d = String(startDate.getDate()).padStart(2,'0');
                const today = `${y}-${m}-${d}`;
                const workShifts = await base44.entities.WorkShift.filter({ date: today });
                for (const w of (workShifts || [])) {
                    for (const s of (w.assigned_staff || [])) {
                        const matches = s.employee_id === activeShift.employee_id ||
                            (s.employee_name && activeShift.employee_name && s.employee_name.trim().toLowerCase() === activeShift.employee_name.trim().toLowerCase());
                        if (matches && s.end_time && /^\d{2}:\d{2}$/.test(s.end_time)) {
                            const [hh, mm] = s.end_time.split(':').map(Number);
                            const end = new Date(startDate);
                            end.setHours(hh, mm, 0, 0);
                            if (end <= startDate) end.setDate(end.getDate() + 1);
                            setScheduledEnd(end);
                            return;
                        }
                    }
                }
            } catch { /* silently ignore - this is a nice-to-have */ }
        })();
    }, [activeShift?.id]);

    useEffect(() => {
        timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    useEffect(() => {
        User.me().then(u => {
            setUser(u);
            loadActiveShift(u);
        }).catch(() => setLoading(false));
        // Non-fatal: gear-dialog gating config (per-tenant, admin-managed).
        // Missing/failed load → default behavior (enabled, kitchen heuristic).
        base44.functions.getGearConfig().then(res => {
            const data = res?.data ?? res;
            if (data) setGearConfig(data);
        }).catch(() => {});
    }, []);

    // Geofence heartbeat — only while a shift is active. Server auto-closes
    // when the employee strays past 500m. We don't show errors to the user
    // for missed pings (e.g. permission revoked) — the worst case is the
    // shift stays open and a manager closes it.
    useEffect(() => {
        if (!activeShift || activeShift.status !== 'active') return;
        let cancelled = false;
        const sendPing = async () => {
            if (cancelled || !navigator.geolocation) return;
            try {
                const pos = await readPosition();
                const res = await base44.functions.shiftHeartbeat({
                    shift_id: activeShift.id,
                    lat: pos.lat,
                    lng: pos.lng,
                });
                if (res?.data?.closed) {
                    setActiveShift(null);
                    alert('המשמרת שלך נסגרה אוטומטית — התרחקת מהעסק.');
                }
            } catch {
                /* silent */
            }
        };
        // First ping 30s after mount, then every 2 min.
        const t0 = setTimeout(sendPing, 30_000);
        const interval = setInterval(sendPing, 120_000);
        return () => { cancelled = true; clearTimeout(t0); clearInterval(interval); };
    }, [activeShift?.id, activeShift?.status]);

    const loadActiveShift = async (u) => {
        if (!u) { setLoading(false); return; }
        try {
            // Use raw-SQL function — Prisma findMany on ShiftTracking crashes
            // due to schema drift (0x00 bytes, DateTime parse failures).
            const res = await base44.functions.getMyActiveShift({});
            setActiveShift(res?.data?.shift || null);
        } catch (e) {
            console.error('loadActiveShift failed:', e);
            setActiveShift(null);
        } finally {
            setLoading(false);
        }
    };

    // Find employee record matching the current user by email, then by name
    const findEmployeeRecord = async (u) => {
        const allEmployees = await Employee.filter({ status: 'active' });
        // 1. חיפוש לפי אימייל (מדויק)
        const byEmail = allEmployees.find(emp => emp.email && u.email && emp.email.toLowerCase() === u.email.toLowerCase());
        if (byEmail) return byEmail;
        // 2. fallback: חיפוש לפי שם מלא
        const byName = allEmployees.find(emp => emp.full_name && u.full_name && emp.full_name.trim().toLowerCase() === u.full_name.trim().toLowerCase());
        return byName || null;
    };

    // 🎉 Clock-in celebration — confetti + haptic + a "great day" banner.
    const fireClockInCelebration = () => {
        try { navigator.vibrate?.([40, 30, 60]); } catch { /* no haptics */ }
        try {
            const colors = ['#FFD700', '#22C55E', '#FF6B35', '#4d96ff', '#C77DFF'];
            const end = Date.now() + 1400;
            const frame = () => {
                confetti({ particleCount: 4, angle: 60, spread: 62, origin: { x: 0 }, colors });
                confetti({ particleCount: 4, angle: 120, spread: 62, origin: { x: 1 }, colors });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
            confetti({ particleCount: 130, spread: 95, origin: { y: 0.6 }, colors });
        } catch { /* canvas-confetti unavailable */ }
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 3200);
    };

    const startShift = async () => {
        setActionLoading(true);
        try {
            // Best-effort coords — server-side clockInWithLocation enforces
            // geofence when configured and uses raw SQL to insert (bypasses
            // Prisma drift on ShiftTracking that crashes direct .create()).
            let lat = null, lng = null;
            try {
                const coords = await readPosition();
                lat = coords.lat; lng = coords.lng;
            } catch { /* fall through; server blocks if geofence required */ }

            let shift;
            try {
                const res = await base44.functions.clockInWithLocation({ lat, lng });
                shift = res?.data?.shift;
            } catch (err) {
                const code = err?.data?.code || err?.code;
                if (code === 'location_required') {
                    alert('צריך לאשר הרשאת מיקום כדי להיכנס למשמרת');
                } else if (code === 'outside_geofence') {
                    const d = err?.data?.distance_m;
                    alert(d ? `אתה במרחק ${d} מ' מהעסק — לא ניתן להיכנס מכאן.` : 'אתה מחוץ לטווח המסעדה.');
                } else {
                    alert('שגיאה בכניסה למשמרת: ' + (err?.data?.message || err?.message || 'בלתי ידועה'));
                }
                setActionLoading(false);
                return;
            }
            // ✅ Clock-in succeeded — celebrate!
            fireClockInCelebration();
            const now = new Date().toISOString();
            const today = format(new Date(), 'yyyy-MM-dd');

            // Schedule bookkeeping — only touches the WorkShift matching the
            // current shift_type (lunch < 16:00 IL, dinner otherwise). This is
            // critical: an employee can work lunch + evening on the same day,
            // and we must NEVER overwrite the lunch assignment when they clock
            // into the evening (and vice versa). Wrapped in try/catch so any
            // WorkShift drift doesn't prevent the gear-up dialog from opening.
            let employeeRecordForGearCheck = null;
            let assignmentForGearCheck = null;
            try {
                const employeeRecord = await findEmployeeRecord(user);
                employeeRecordForGearCheck = employeeRecord;
                // Use the id + name the BACKEND resolved for the ShiftTracking row
                // (shift.employee_id/name) so the auto-added schedule assignment
                // carries the SAME employee_id as the clock-in record. Otherwise
                // Google-auth users got assignment=User.id but tracking=Employee.id,
                // and the schedule read it as "לא נכנס לשעון" though they clocked in.
                const employeeId = shift?.employee_id || employeeRecord?.id || user.id;
                const employeeName = shift?.employee_name || employeeRecord?.full_name || user.full_name;

                // Israel local hour (server already runs UTC; add +3 with mod
                // 24 to handle wrap). Lunch < 16:00 IL, dinner otherwise.
                const ilHour = (new Date().getUTCHours() + 3) % 24;
                const currentShiftType = ilHour < 16 ? 'lunch' : 'dinner';

                const workShifts = await base44.entities.WorkShift.filter({ date: today });
                // STRICT: only consider WorkShift records of the current type.
                const shiftsOfThisType = workShifts.filter(w => w.shift_type === currentShiftType);

                let assignmentFound = null;
                let targetShift = null;
                for (const ws of shiftsOfThisType) {
                    const assignment = (ws.assigned_staff || []).find(a =>
                        a.employee_id === employeeId ||
                        (a.employee_name && employeeName && a.employee_name.toLowerCase() === employeeName.toLowerCase())
                    );
                    if (assignment) { assignmentFound = assignment; targetShift = ws; break; }
                }
                assignmentForGearCheck = assignmentFound;

                if (!assignmentFound) {
                    // No assignment in this shift_type — create or extend a
                    // WorkShift of THIS type. Lunch-shift assignments stay
                    // untouched (and vice versa).
                    let ws = shiftsOfThisType[0];
                    if (!ws) {
                        ws = await base44.entities.WorkShift.create({
                            date: today,
                            shift_type: currentShiftType,
                            start_time: currentShiftType === 'lunch' ? '12:00' : '17:00',
                            end_time: currentShiftType === 'lunch' ? '17:00' : '23:00',
                            assigned_staff: [],
                            positions_needed: {},
                        });
                    }
                    const updatedStaff = [...(ws.assigned_staff || []), {
                        employee_id: employeeId,
                        employee_name: employeeName,
                        position: 'בלתם',
                        start_time: format(new Date(now), 'HH:mm'),
                        end_time: '',
                        breaks: [],
                        notes: 'נוסף אוטומטית',
                        had_meal: false,
                        meal_details: '',
                        total_break_minutes: 0,
                    }];
                    await base44.entities.WorkShift.update(ws.id, { assigned_staff: updatedStaff });
                } else if (assignmentFound.position === 'בלתם' || !assignmentFound.start_time) {
                    const updatedStaff = [...(targetShift.assigned_staff || [])].map(a =>
                        (a.employee_id === employeeId || (a.employee_name && employeeName && a.employee_name.toLowerCase() === employeeName.toLowerCase()))
                            ? { ...a, employee_id: employeeId, start_time: format(new Date(now), 'HH:mm') }
                            : a
                    );
                    await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: updatedStaff });
                }
            } catch (e) {
                console.warn('schedule bookkeeping failed (non-fatal):', e);
            }

            setActiveShift(shift);
            // Skip gear-up dialog for kitchen staff — they don't get iPads/terminals.
            const KITCHEN_POSITIONS = ['טבח', 'מנהל מטבח', 'שוטף כלים', 'kitchen', 'sous chef', 'dishwasher', 'cook'];
            const isKitchen = (() => {
                try {
                    // Check the shift assignment we just made/found.
                    const assignmentPosition = String(assignmentForGearCheck?.position || '').toLowerCase();
                    if (KITCHEN_POSITIONS.some(k => assignmentPosition.includes(k.toLowerCase()))) return true;
                    // Fallback: check the Employee record's primary position.
                    const empPositions = (employeeRecordForGearCheck?.positions || []).map(p => String(p?.position_name || '').toLowerCase());
                    return empPositions.some(p => KITCHEN_POSITIONS.some(k => p.includes(k.toLowerCase())));
                } catch { return false; }
            })();
            // Config-aware gate (GearConfig) — admin can disable the dialog or
            // limit it to specific positions. gearConfig may be stale here
            // (loaded once at mount) — acceptable.
            const cfg = gearConfig || {};
            const gearInEnabled = cfg.clock_in_enabled !== false;
            const inPositions = Array.isArray(cfg.clock_in_positions) ? cfg.clock_in_positions : [];
            const candidateNames = [
                assignmentForGearCheck?.position,
                ...((employeeRecordForGearCheck?.positions || []).map(p => p?.position_name)),
            ].filter(Boolean);
            // Explicit position list overrides the kitchen heuristic; empty list keeps it.
            const showGear = gearInEnabled && (inPositions.length ? positionAllowed(inPositions, candidateNames) : !isKitchen);
            if (showGear) setShowGearUp(true);
        } catch (err) {
            // If even ShiftTracking.create fails, surface a real error to the user.
            const data = err?.data || {};
            alert('שגיאה בכניסה למשמרת: ' + (data?.message || err?.message || 'בלתי ידועה'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleGearUpDone = (devices) => {
        setShowGearUp(false);
        if (devices) setMyDevices(devices);
    };

    const loadMyDevices = async (userId) => {
        const all = await base44.entities.DeviceAsset.filter({ current_holder_id: userId });
        const ipad = all.find(d => d.device_type === 'ipad' && d.status === 'in_use') || null;
        const terminal = all.find(d => d.device_type === 'terminal' && d.status === 'in_use') || null;
        setMyDevices({ ipad, terminal });
    };

    // All ShiftTracking writes go through patchShiftRaw — direct Prisma
    // .update() on this table currently crashes (schema drift / 0x00 bytes).
    const patchShift = async (fields) => {
        const res = await base44.functions.patchShiftRaw({ shift_id: activeShift.id, fields });
        return res?.data?.shift || null;
    };

    const startBreak = async () => {
        setActionLoading(true);
        try {
            const now = new Date().toISOString();
            const breaks = [...(activeShift.breaks || []), { break_start: now }];
            const updated = await patchShift({ status: 'on_break', breaks });
            if (updated) setActiveShift(updated);
        } catch (e) {
            alert('שגיאה בתחילת הפסקה: ' + (e?.data?.message || e?.message || ''));
        } finally {
            setActionLoading(false);
        }
    };

    const endBreak = async () => {
        setActionLoading(true);
        try {
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
            const updated = await patchShift({ status: 'active', breaks, total_break_minutes: totalBreakMinutes });
            if (updated) setActiveShift(updated);
        } catch (e) {
            alert('שגיאה בסיום הפסקה: ' + (e?.data?.message || e?.message || ''));
        } finally {
            setActionLoading(false);
        }
    };

    const saveMeal = async () => {
        setActionLoading(true);
        try {
            const updated = await patchShift({ had_meal: true, meal_details: mealDetails });
            if (updated) setActiveShift(updated);
            setShowMealDialog(false);
            setMealDetails('');
        } catch (e) {
            alert('שגיאה בשמירת ארוחה: ' + (e?.data?.message || e?.message || ''));
        } finally {
            setActionLoading(false);
        }
    };

    const endShift = async () => {
        // Config-aware gate (GearConfig) — admin can disable the gear-return
        // dialog or limit it to specific positions.
        const cfg = gearConfig || {};
        const outEnabled = cfg.clock_out_enabled !== false;
        const outPositions = Array.isArray(cfg.clock_out_positions) ? cfg.clock_out_positions : [];
        let outAllowed = outEnabled;
        if (outAllowed && outPositions.length) {
            // Component may have been remounted mid-shift (refresh), so state
            // from clock-in isn't reliable — resolve the Employee record fresh
            // (same pattern as submitEndShift).
            let candidateNames = [];
            try {
                const employeeRecord = await findEmployeeRecord(user);
                candidateNames = (employeeRecord?.positions || []).map(p => p?.position_name).filter(Boolean);
            } catch { /* no record resolved → empty candidates → not in allow-list */ }
            outAllowed = positionAllowed(outPositions, candidateNames);
        }
        if (!outAllowed) {
            // Skip gear return — go straight to the end-shift feedback dialog,
            // exactly like handleGearReturnDone does.
            setPendingEndShift(true);
            setShowGearReturn(false);
            setShowEndShiftDialog(true);
            return;
        }
        // טען ציוד פעיל של העובד לפני פתיחת דיאלוג החזרה
        if (user) await loadMyDevices(user.id);
        setPendingEndShift(true);
        setShowGearReturn(true);
    };

    const handleGearReturnDone = (result) => {
        setShowGearReturn(false);
        // ALWAYS continue to the feedback dialog — even if gear-return was skipped
        // or had no devices to return. Otherwise shift stays 'active' forever.
        setShowEndShiftDialog(true);
        setPendingEndShift(false);
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

        // 1. עדכון ShiftTracking via raw SQL (Prisma update broken on this table)
        // CRITICAL: this is the ONLY step that actually closes the shift. If it
        // fails, we must NOT clear activeShift below — otherwise the UI lies to
        // the employee (says "you're out") while the DB still has status='active'.
        let closedSuccessfully = false;
        try {
            const result = await patchShift({
                shift_end: now,
                status: 'completed',
                total_hours: Math.round(totalHours * 100) / 100,
                effective_hours: Math.round(finalEffectiveHours * 100) / 100,
                total_break_minutes: finalBreakMinutes,
            });
            closedSuccessfully = !!result;
        } catch (e) {
            console.error('[submitEndShift] patchShift failed:', e);
            alert('⚠️ שגיאה בסיום המשמרת!\n\n' + (e?.data?.message || e?.message || 'שגיאת רשת') + '\n\nהמשמרת לא נסגרה. נסה שוב או פנה למנהל.');
            setActionLoading(false);
            return; // bail out — don't clear state, don't show loot box
        }
        if (!closedSuccessfully) {
            alert('⚠️ סיום המשמרת לא אושר ע"י השרת. נסה שוב או פנה למנהל.');
            setActionLoading(false);
            return;
        }
        // Verify the DB actually has status='completed' by reloading.
        try {
            const verified = await base44.functions.getMyActiveShift({});
            if (verified?.data?.shift) {
                console.warn('[submitEndShift] server still returns an active shift after close — investigating');
            }
        } catch (e) { /* non-fatal */ }

        // 2. מצא את רשומת העובד לפי אימייל (כמו WorkScheduling)
        const employeeRecord = await findEmployeeRecord(user);
        const employeeId = employeeRecord?.id || user.id;
        const employeeName = employeeRecord?.full_name || user.full_name;
        console.log('[EndShift] user.id:', user.id, '| employeeRecord.id:', employeeRecord?.id, '| employeeName:', employeeName);

        // 3. עדכון WorkShift - חפש גם ביום הנוכחי וגם בתאריך תחילת המשמרת (לכיסוי משמרות לילה)
        // Wrapped: WorkShift entity is currently broken (schema drift — missing
        // createdAt column). Failure here must not block shift-end.
        const shiftDate = format(new Date(activeShift.shift_start), 'yyyy-MM-dd');
        const today2 = format(new Date(), 'yyyy-MM-dd');
        const datesToSearch = [...new Set([shiftDate, today2])];

        let workShiftUpdated = false;
        try {
        const shiftStartHour = new Date(activeShift.shift_start).getHours() + new Date(activeShift.shift_start).getMinutes() / 60;
        // קבע את סוג המשמרת לפי שעת הכניסה (UTC+3 ישראל)
        const shiftStartLocalHour = (new Date(activeShift.shift_start).getUTCHours() + 3) % 24;
        const expectedShiftType = shiftStartLocalHour < 16 ? 'lunch' : 'dinner';

        for (const dateToSearch of datesToSearch) {
            if (workShiftUpdated) break;
            const workShifts = await base44.entities.WorkShift.filter({ date: dateToSearch });

            // STRICT: only update the WorkShift matching this ShiftTracking's
            // shift_type. An employee can have a separate lunch and dinner
            // assignment on the same day — closing the evening shift must not
            // overwrite the lunch assignment's hours.
            const matchingShifts = workShifts.filter(w => w.shift_type === expectedShiftType);

            for (const ws of matchingShifts) {
                const staff = ws.assigned_staff || [];
                const idx = staff.findIndex(s =>
                    s.employee_id === employeeId ||
                    (s.employee_name && employeeName && s.employee_name.toLowerCase() === employeeName.toLowerCase())
                );
                if (idx !== -1) {
                    const updatedStaff = [...staff];
                    updatedStaff[idx] = {
                        ...updatedStaff[idx],
                        employee_id: employeeId,
                        start_time: format(new Date(activeShift.shift_start), 'HH:mm'),
                        end_time: format(new Date(now), 'HH:mm'),
                        total_break_minutes: finalBreakMinutes,
                        had_meal: activeShift.had_meal || false,
                        meal_details: activeShift.meal_details || '',
                        breaks: activeShift.breaks || [],
                    };
                    await base44.entities.WorkShift.update(ws.id, { assigned_staff: updatedStaff });
                    workShiftUpdated = true;
                    break;
                }
            }
        }
        } catch (e) {
            console.warn('WorkShift bookkeeping failed (non-fatal):', e);
        }

        // 4. שמירה בטיפים (Shift entity) — non-fatal
        try {
        await base44.entities.Shift.create({
            employee_id: employeeId,
            employee_name: user.full_name,
            date: shiftDate,
            hours_worked: Math.round(finalEffectiveHours * 100) / 100,
            sales_amount: 0,
            area: '',
            notes: `כניסה: ${format(new Date(activeShift.shift_start), 'HH:mm')} | יציאה: ${format(new Date(now), 'HH:mm')} | הפסקות: ${finalBreakMinutes} דק'${breakEditUnlocked ? ' (עודכן מנהל)' : ''}`,
        });
        } catch (e) {
            console.warn('Shift tip-row create failed (non-fatal):', e);
        }

        // 5. שמירת משוב עובד — non-fatal
        if (feedbackRatings.atmosphere > 0 || feedbackRatings.sales > 0 || feedbackRatings.effort > 0) {
            try {
            await base44.entities.Incident.create({
                incident_number: `FEEDBACK-${Date.now()}`,
                title: `משוב עובד: ${user.full_name} - ${today}`,
                    description: `🍽️ **אכל:** ${activeShift?.had_meal ? `כן - ${activeShift.meal_details || ''}` : 'לא'}\n💧 **שתה:** ${feedbackRatings.drank || 'לא צוין'}${feedbackRatings.drank === 'כן' && feedbackRatings.drankDetails ? ` - ${feedbackRatings.drankDetails}` : ''}\n☕ **הפסקה:** ${breakEditUnlocked && editBreakMinutes !== '' ? `${editBreakMinutes} דקות (עודכן ע"י מנהל)` : activeShift?.total_break_minutes > 0 ? `${activeShift.total_break_minutes} דקות` : 'לא'}\n\n🏢 **אווירה:** ${feedbackRatings.atmosphere}/5\n💰 **תחושת מכירה:** ${feedbackRatings.sales}/5\n💪 **מאמץ אישי:** ${feedbackRatings.effort}/5${feedbackRatings.funWith ? `\n\n🤝 **הכי כיף לעבוד עם:** ${feedbackRatings.funWith}` : ''}${feedbackRatings.grateful1 || feedbackRatings.grateful2 || feedbackRatings.grateful3 ? `\n\n🙏 **תודה על:**\n${[feedbackRatings.grateful1, feedbackRatings.grateful2, feedbackRatings.grateful3].filter(Boolean).map((g, i) => `${i+1}. ${g}`).join('\n')}` : ''}${feedbackNotes ? `\n\n📝 **הערות:**\n${feedbackNotes}` : ''}`,
                category: 'staff',
                severity: 'low',
                status: 'closed',
                visibility_level: 'managers_only',
                reported_by: user.full_name,
                incident_date: now,
            });
            } catch (e) {
                console.warn('Feedback Incident create failed (non-fatal):', e);
            }
        }

        setFeedbackRatings({ atmosphere: 0, sales: 0, effort: 0 });
        setFeedbackNotes('');
        setEditBreakMinutes('');
        setBreakEditUnlocked(false);
        setEditBreakByManager(false);

        // הפתעה מהמסעדה — רק אם מילא לפחות שאלה אחת בשאלון
        const filledSurvey = feedbackRatings.atmosphere > 0 || feedbackRatings.sales > 0 || feedbackRatings.effort > 0 || feedbackRatings.drank;
        setActiveShift(null);
        setActionLoading(false);
        if (filledSurvey) {
          const empRecord = await findEmployeeRecord(user);
          setLootBoxEmployee({ id: empRecord?.id || user.id, name: user.full_name });
          setShowLootBox(true);
        }
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
            {/* 🎉 חגיגת כניסה לשעון */}
            {celebrate && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
                    <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 text-center border-4 animate-in zoom-in-50 fade-in duration-300" style={{ borderColor: 'var(--brand-primary, #22C55E)' }}>
                        <div className="text-6xl mb-2 animate-bounce">💪</div>
                        <h2 className="text-2xl font-black text-gray-800">יום מעולה, {user?.full_name?.split(' ')[0] || 'עובד'}!</h2>
                        <p className="font-bold text-lg mt-1" style={{ color: 'var(--brand-primary, #22C55E)' }}>בהצלחה במשמרת 🚀</p>
                    </div>
                </div>
            )}
            <Card className={`mb-4 rounded-2xl border shadow-sm ${isOnBreak ? 'border-yellow-400 bg-yellow-50' : isActive ? 'border-green-400 bg-green-50' : 'border-[#EADFC8] bg-white'}`}>
                <CardContent className="p-4">
                    {/* שם + שעה + תאריך */}
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div>
                            <h2 className="text-base font-bold text-slate-800">
                                {user?.full_name || 'עובד'}
                            </h2>
                            <p className="text-xs text-slate-500">
                                {format(currentTime, 'dd/MM/yyyy')} · {format(currentTime, 'EEEE') === 'Sunday' ? 'ראשון' : format(currentTime, 'EEEE') === 'Monday' ? 'שני' : format(currentTime, 'EEEE') === 'Tuesday' ? 'שלישי' : format(currentTime, 'EEEE') === 'Wednesday' ? 'רביעי' : format(currentTime, 'EEEE') === 'Thursday' ? 'חמישי' : format(currentTime, 'EEEE') === 'Friday' ? 'שישי' : 'שבת'}
                            </p>
                        </div>
                        <div className="text-left">
                            <div className="text-2xl font-mono font-bold text-slate-800 tabular-nums">
                                {format(currentTime, 'HH:mm:ss')}
                            </div>
                            {activeShift && (
                                <p className="text-xs text-slate-500 text-center mt-0.5">
                                    {isOnBreak ? '☕ בהפסקה' : `⏱️ ${getElapsedDisplay(activeShift.shift_start)}`}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* סטטוס + כפתורים */}
                    {!activeShift ? (
                        <div className="text-center">
                            <p className="text-slate-500 mb-2 text-xs">טרם נרשמה כניסה למשמרת היום</p>
                            <Button
                                onClick={startShift}
                                disabled={actionLoading}
                                className="bg-green-600 hover:bg-green-700 text-white py-3 text-base font-bold rounded-xl w-full shadow-md shadow-green-600/25 animate-pulse hover:animate-none transition-all"
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

                                {(() => {
                                    const isOverdue = scheduledEnd && currentTime > scheduledEnd;
                                    const overdueMin = isOverdue ? Math.floor((currentTime - scheduledEnd) / 60000) : 0;
                                    return (
                                        <div className="col-span-2 space-y-1.5">
                                            {isOverdue && (
                                                <div className="bg-red-100 border-2 border-red-400 rounded-lg p-2 text-center animate-pulse">
                                                    <div className="text-xs font-black text-red-900">⏰ המשמרת שלך הסתיימה ב-{scheduledEnd.getHours().toString().padStart(2,'0')}:{scheduledEnd.getMinutes().toString().padStart(2,'0')}</div>
                                                    <div className="text-[10px] text-red-700">לחצי על "סיום משמרת" — עברו {overdueMin >= 60 ? `${Math.floor(overdueMin/60)} שעות` : `${overdueMin} דק'`}</div>
                                                </div>
                                            )}
                                            <Button
                                                onClick={endShift}
                                                disabled={actionLoading || isOnBreak}
                                                className={`w-full text-white ${isOverdue
                                                    ? 'bg-red-600 hover:bg-red-700 ring-4 ring-red-300 animate-pulse shadow-lg shadow-red-500/50'
                                                    : 'bg-red-600 hover:bg-red-700'}`}
                                            >
                                                <Square className="w-4 h-4 ml-1" />
                                                סיום משמרת
                                            </Button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* דיאלוג סיום משמרת + שאלון משוב */}
            <Dialog open={showEndShiftDialog} onOpenChange={setShowEndShiftDialog}>
                <DialogContent dir="rtl" className="max-w-md w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Square className="w-4 h-4 text-red-500" />
                            סיום משמרת - שאלון קצר
                        </DialogTitle>
                    </DialogHeader>
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-y border-purple-200 px-4 py-2 shrink-0 flex items-center gap-2">
                      <span className="text-xl">🎁</span>
                      <p className="text-sm text-purple-700 font-semibold">מלא את השאלון ותקבל הפתעה מ{brandName}! 🎉</p>
                    </div>

                    <div className="overflow-y-auto flex-1 px-4 py-3">
                    <div className="space-y-4 pb-2">
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
                            <p className="text-sm font-medium mb-2">💧 האם שתית?</p>
                            <div className="flex gap-2 items-center flex-wrap">
                                {['כן', 'לא'].map(opt => (
                                    <button key={opt}
                                        onClick={() => setFeedbackRatings(prev => ({ ...prev, drank: opt }))}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${feedbackRatings.drank === opt ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300 text-gray-600 hover:border-blue-300'}`}
                                    >{opt}</button>
                                ))}
                                {feedbackRatings.drank === 'כן' && (
                                    <input
                                        className="flex-1 border rounded-lg px-3 py-2 text-sm text-right min-w-[120px]"
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

                        {/* עם מי היה הכי כיף */}
                        <div>
                            <p className="text-sm font-medium mb-2">🤝 עם איזה חבר/ה היה לך הכי כיף לעבוד היום?</p>
                            <input
                                className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                                placeholder="שם החבר/ה..."
                                value={feedbackRatings.funWith || ''}
                                onChange={e => setFeedbackRatings(prev => ({ ...prev, funWith: e.target.value }))}
                            />
                        </div>

                        {/* 3 דברים להודות עליהם */}
                        <div>
                            <p className="text-sm font-medium mb-2">🙏 3 דברים שקרו היום שאתה אומר תודה עליהם</p>
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <input
                                        key={i}
                                        className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                                        placeholder={`דבר ${i}...`}
                                        value={feedbackRatings[`grateful${i}`] || ''}
                                        onChange={e => setFeedbackRatings(prev => ({ ...prev, [`grateful${i}`]: e.target.value }))}
                                    />
                                ))}
                            </div>
                        </div>

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
                    </div>{/* space-y-4 */}
                    </div>{/* overflow-y-auto */}

                    <div className="flex gap-2 px-4 py-3 border-t shrink-0">
                        <button
                            onClick={submitEndShift}
                            className="flex-1 text-sm text-gray-400 hover:text-gray-600 py-2 border rounded-lg"
                        >
                            דלג ולסיים
                        </button>
                        <button
                            onClick={submitEndShift}
                            disabled={actionLoading}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold text-sm"
                        >
                            שלח ולסיים משמרת
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* דיאלוג קבלת ציוד */}
            <GearUpDialog
                open={showGearUp}
                onClose={handleGearUpDone}
                shiftTrackingId={activeShift?.id}
                employeeId={user?.id}
                employeeName={user?.full_name}
            />

            {/* דיאלוג החזרת ציוד */}
            <GearReturnDialog
                open={showGearReturn}
                onClose={handleGearReturnDone}
                myDevices={myDevices}
                employeeId={user?.id}
            />

            {/* קופסת הפתעה */}
            {showLootBox && lootBoxEmployee && (
                <LootBox
                    employeeId={lootBoxEmployee.id}
                    employeeName={lootBoxEmployee.name}
                    onDone={() => setShowLootBox(false)}
                />
            )}

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