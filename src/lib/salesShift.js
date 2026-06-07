// Resolves which shift "now" belongs to, in Asia/Jerusalem time.
// Returns { date: 'YYYY-MM-DD', type: 'lunch'|'dinner' } or null when in the
// 03:00–05:59 IL dead window. Backend has an identical helper in load.ts —
// keep them in sync if you change the rule.
export function resolveCurrentShift(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = parseInt(get('hour'), 10);

    if (hour >= 6 && hour < 17) return { date: dateStr, type: 'lunch' };
    if (hour >= 17 && hour <= 23) return { date: dateStr, type: 'dinner' };
    if (hour >= 0 && hour < 3) {
        // After-midnight tail of last night's dinner shift.
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const y = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(yesterday);
        const yget = (t) => y.find(p => p.type === t)?.value;
        return { date: `${yget('year')}-${yget('month')}-${yget('day')}`, type: 'dinner' };
    }
    return null; // 03:00–05:59 dead window
}
