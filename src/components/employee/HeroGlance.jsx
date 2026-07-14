import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Clock, Flame, Hourglass } from 'lucide-react';

// Compact "at a glance" strip for the EmployeeHome hero: next shift · streak ·
// hours this week. Each stat loads independently and fails soft to '—' so a
// single slow/broken query never blanks the strip. Numbers count up for polish.
const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function useCountUp(target, on = true) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!on || target == null) { setVal(target || 0); return; }
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setVal(target); return; }
        let raf; const t0 = performance.now(); const dur = 800;
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            setVal(Math.round(target * (1 - Math.pow(1 - p, 3)) * 10) / 10);
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, on]);
    return val;
}

export default function HeroGlance({ user, currentEmployee }) {
    const [nextShift, setNextShift] = useState(undefined); // undefined=loading, null=none
    const [streak, setStreak] = useState(null);
    const [weekHours, setWeekHours] = useState(null);

    useEffect(() => {
        if (!user) return;
        const empId = currentEmployee?.id || user?.id;
        const name = (currentEmployee?.full_name || user?.full_name || '').trim().toLowerCase();
        const mineAssign = (a) =>
            (a?.employee_id && a.employee_id === empId) ||
            (a?.employee_name && name && a.employee_name.trim().toLowerCase() === name);

        // Next upcoming shift from the schedule
        (async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const nowHM = format(new Date(), 'HH:mm');
                const shifts = await base44.entities.WorkShift.list('-date', 250);
                const up = [];
                (shifts || []).forEach(ws => {
                    const d = String(ws.date).slice(0, 10);
                    if (d < todayStr) return;
                    (ws.assigned_staff || []).forEach(a => {
                        if (mineAssign(a) && a.start_time) {
                            if (d === todayStr && a.start_time < nowHM) return; // already started
                            up.push({ date: d, start: a.start_time, shift_type: ws.shift_type });
                        }
                    });
                });
                up.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
                setNextShift(up[0] || null);
            } catch { setNextShift(null); }
        })();

        // Streak + week hours from the clock (ShiftTracking)
        (async () => {
            try {
                const tracks = await base44.entities.ShiftTracking.list();
                const mine = (tracks || []).filter(t =>
                    (t.employee_id && t.employee_id === empId) ||
                    (t.employee_name && name && (t.employee_name || '').trim().toLowerCase() === name)
                );
                const days = new Set(mine.map(t => String(t.date || t.shift_start).slice(0, 10)));
                // Streak: consecutive days worked, counting back from today (or yesterday).
                let s = 0; const cur = new Date();
                for (let i = 0; i < 90; i++) {
                    const ds = format(cur, 'yyyy-MM-dd');
                    if (days.has(ds)) { s++; cur.setDate(cur.getDate() - 1); }
                    else if (i === 0) { cur.setDate(cur.getDate() - 1); } // allow "didn't work yet today"
                    else break;
                }
                setStreak(s);
                const weekAgo = format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd');
                const h = mine
                    .filter(t => String(t.date || t.shift_start).slice(0, 10) >= weekAgo)
                    .reduce((acc, t) => acc + (Number(t.effective_hours) || Number(t.total_hours) || 0), 0);
                setWeekHours(Math.round(h * 10) / 10);
            } catch { setStreak(0); setWeekHours(0); }
        })();
    }, [user, currentEmployee]);

    const streakVal = useCountUp(streak ?? 0, streak != null);
    const hoursVal = useCountUp(weekHours ?? 0, weekHours != null);

    const nextLabel = nextShift === undefined ? '…'
        : nextShift === null ? 'אין'
            : (() => {
                const d = new Date(nextShift.date + 'T00:00:00');
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const tomStr = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
                const when = nextShift.date === todayStr ? 'היום' : nextShift.date === tomStr ? 'מחר' : DAY_HE[d.getDay()];
                return `${when} ${nextShift.start}`;
            })();

    const Tile = ({ icon: Icon, label, value }) => (
        <div className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 text-white/70 text-[10px] font-semibold uppercase tracking-wide">
                <Icon className="w-3 h-3" strokeWidth={2.5} />
                <span className="truncate">{label}</span>
            </div>
            <div className="text-white font-extrabold text-base sm:text-lg truncate leading-tight mt-0.5 tabular-nums">{value}</div>
        </div>
    );

    return (
        <div className="flex gap-2 mt-5">
            <Tile icon={Clock} label="המשמרת הבאה" value={nextLabel} />
            <Tile icon={Flame} label="רצף ימים" value={streak == null ? '…' : `${streakVal}`} />
            <Tile icon={Hourglass} label="שעות השבוע" value={weekHours == null ? '…' : `${hoursVal}`} />
        </div>
    );
}
