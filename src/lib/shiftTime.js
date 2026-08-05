/**
 * One place for "how long was this shift" and "is this a legal shift".
 *
 * Both screens in the hours report used to answer these questions differently,
 * which is how a single reversed pair — 20:36 → 19:49, an obvious typo — became
 * 22.95 hours on the summary and vanished entirely from the per-employee table.
 * Same data, two rules, two answers.
 */

// A shift crossing midnight is real. A shift longer than this is a typo or a
// forgotten clock-out, and 21.78 hours has no business landing in payroll.
export const MAX_SHIFT_HOURS = 16;

export const toMin = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
};

/** Scheduled span in hours, treating end<=start as crossing midnight. */
export function spanHours(start, end) {
    const a = toMin(start);
    let b = toMin(end);
    if (a == null || b == null) return 0;
    if (b <= a) b += 24 * 60;
    return (b - a) / 60;
}

/**
 * Validate what a manager just typed, BEFORE it becomes payroll.
 * Overnight is allowed; an implausibly long result is not — that is almost
 * always the two fields entered the wrong way round.
 */
export function validateShiftTimes(start, end, { maxHours = MAX_SHIFT_HOURS } = {}) {
    if (!start || !end) return { ok: true, hours: 0 };   // blank is handled elsewhere
    const a = toMin(start), b = toMin(end);
    if (a == null || b == null) return { ok: false, hours: 0, error: 'שעה לא תקינה' };
    const hours = spanHours(start, end);
    if (hours > maxHours) {
        return {
            ok: false,
            hours,
            error: `${start} עד ${end} יוצא ${hours.toFixed(1)} שעות. `
                + `אם המשמרת חוצה חצות זה תקין עד ${maxHours} שעות — אחרת כנראה שהשעות הוזנו הפוך.`,
        };
    }
    return { ok: true, hours };
}

/**
 * THE rule for how many hours a scheduled shift is worth. Used by both the
 * per-employee table and the all-employees summary so they can't disagree:
 *   1. a usable clock wins — that's what actually happened;
 *   2. otherwise an owner-confirmed manual entry;
 *   3. otherwise it doesn't count as worked.
 * Returns null when the shift shouldn't be counted at all.
 */
export function resolveShiftHours({ staffEntry, clock }) {
    const brk = (Number(staffEntry?.total_break_minutes) || 0) / 60;
    const sched = spanHours(staffEntry?.start_time, staffEntry?.end_time);

    if (clock?.shift_start && clock?.shift_end) {
        const gross = (new Date(clock.shift_end) - new Date(clock.shift_start)) / 3600000;
        const clockBrk = (Number(clock.total_break_minutes) || 0) / 60;
        const usable = gross > 0.1 && gross <= MAX_SHIFT_HOURS;
        if (usable) {
            return { gross, net: Math.max(0, gross - clockBrk), source: 'clock' };
        }
        // Unusable clock (mis-tap or forgotten clock-out) falls through to the
        // schedule, but only if a manager stood behind those hours.
    }
    if (staffEntry?.manual_entry && sched > 0 && sched <= MAX_SHIFT_HOURS) {
        return { gross: sched, net: Math.max(0, sched - brk), source: 'manual' };
    }
    return null;
}
