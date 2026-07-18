// Learn the rhythm of a business's cash from its own bank history.
//
// A cash forecast is only as good as its assumptions, so instead of asking the
// owner when the card clearing lands or when payroll leaves, this reads it off
// the statement: group each category's transactions into daily events, measure
// the gap between them, and classify the cadence. Every pattern carries the
// evidence that produced it, because a projection the owner cannot audit is a
// projection they cannot trust.
import { CATEGORY_LABELS } from './bankStatement.js';
const DAY = 86400_000;
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dayOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const domOf = (d) => Number(d.slice(8, 10));
function median(xs) {
    if (!xs.length)
        return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Collapse a category's transactions into one event per day. */
function toEvents(txs) {
    const byDay = new Map();
    for (const t of txs)
        byDay.set(t.date, (byDay.get(t.date) || 0) + Math.abs(t.amount));
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }));
}
function classify(events) {
    // Two events a month apart is already a monthly rhythm — payroll leaves once
    // a month, so a three-event minimum would misread the single most predictable
    // outflow a business has as "irregular".
    if (events.length < 2)
        return { cadence: 'irregular', weekday: null, day_of_month: null, share: 0 };
    if (events.length === 2) {
        const gap = (Date.parse(events[1].date) - Date.parse(events[0].date)) / DAY;
        if (gap >= 24 && gap <= 36) {
            return { cadence: 'monthly', weekday: null, day_of_month: domOf(events[0].date), share: 0.5 };
        }
        return { cadence: 'irregular', weekday: null, day_of_month: null, share: 0 };
    }
    const gaps = [];
    for (let i = 1; i < events.length; i++) {
        gaps.push((Date.parse(events[i].date) - Date.parse(events[i - 1].date)) / DAY);
    }
    const g = median(gaps);
    // Weekly: the gap says so AND one weekday dominates. Both must agree —
    // a 7-day median gap with scattered weekdays is just frequent activity.
    if (g >= 5 && g <= 10) {
        const hist = new Array(7).fill(0);
        for (const e of events)
            hist[dayOf(e.date)]++;
        const top = hist.indexOf(Math.max(...hist));
        const share = hist[top] / events.length;
        if (share >= 0.7)
            return { cadence: 'weekly', weekday: top, day_of_month: null, share };
    }
    if (g >= 24 && g <= 36 && events.length >= 2) {
        const doms = events.map((e) => domOf(e.date));
        const mid = Math.round(median(doms));
        const share = doms.filter((d) => Math.abs(d - mid) <= 3).length / doms.length;
        if (share >= 0.6)
            return { cadence: 'monthly', weekday: null, day_of_month: mid, share };
    }
    if (g >= 50 && g <= 75) {
        const doms = events.map((e) => domOf(e.date));
        return { cadence: 'bimonthly', weekday: null, day_of_month: Math.round(median(doms)), share: 0.6 };
    }
    return { cadence: 'irregular', weekday: null, day_of_month: null, share: 0 };
}
export function detectPatterns(txs) {
    const byCat = new Map();
    for (const t of txs) {
        if (!byCat.has(t.category))
            byCat.set(t.category, []);
        byCat.get(t.category).push(t);
    }
    // Normalise against the period the STATEMENT covers, not the span of each
    // category's own events. Measuring payroll's run-rate over the 30 days
    // between its two appearances reports a month's salary as if it were paid
    // twice; measuring card income from its first appearance hides the weeks it
    // was absent. Both errors are large and both point the wrong way.
    const allDates = txs.map((t) => t.date).sort();
    const windowDays = Math.max(1, (Date.parse(allDates[allDates.length - 1]) - Date.parse(allDates[0])) / DAY);
    const FREQ = { weekly: 4.35, monthly: 1, bimonthly: 0.5, irregular: 0 };
    const out = [];
    for (const [category, list] of byCat) {
        const events = toEvents(list);
        if (!events.length)
            continue;
        const total = events.reduce((n, e) => n + e.total, 0);
        const observedMonthly = windowDays >= 20 ? (total / windowDays) * 30.4 : total;
        const c = classify(events);
        const perEvent = median(events.map((e) => e.total));
        const cadenceMonthly = FREQ[c.cadence] ? perEvent * FREQ[c.cadence] : observedMonthly;
        const dir = (list[0].amount >= 0) ? 'in' : 'out';
        // When the two measures disagree, take the pessimistic one: the lower figure
        // for income, the higher for expenses. A forecast that overstates cash is
        // the one that gets a business into trouble.
        const monthlyTotal = dir === 'in'
            ? Math.min(cadenceMonthly, observedMonthly)
            : Math.max(cadenceMonthly, observedMonthly);
        const bigger = Math.max(cadenceMonthly, observedMonthly);
        const smaller = Math.min(cadenceMonthly, observedMonthly);
        const diverged = bigger > 0 && smaller / bigger < 0.6 && c.cadence !== 'irregular';
        // Keep the per-event figure consistent with the chosen monthly total, or
        // the daily series and the headline number would tell different stories.
        const amount = FREQ[c.cadence] ? monthlyTotal / FREQ[c.cadence] : perEvent;
        let confidence = 'low';
        let evidence;
        if (c.cadence === 'weekly') {
            confidence = c.share >= 0.9 && events.length >= 6 ? 'high' : 'medium';
            evidence = `${Math.round(c.share * 100)}% מהתנועות ביום ${HE_DAYS[c.weekday]} (${events.length} מקרים)`;
        }
        else if (c.cadence === 'monthly') {
            confidence = events.length >= 3 ? 'high' : 'medium';
            evidence = `חודשי סביב ה-${c.day_of_month} לחודש (${events.length} מקרים)`;
        }
        else if (c.cadence === 'bimonthly') {
            confidence = 'medium';
            evidence = `כל חודשיים בערך, סביב ה-${c.day_of_month} (${events.length} מקרים)`;
        }
        else {
            // Not predictable per-event, but the monthly run-rate still is — spread it
            // as a daily drip rather than pretending the money never moves.
            confidence = events.length >= 6 ? 'medium' : 'low';
            evidence = `לא קבוע — ${events.length} תנועות, ממוצע ${Math.round(monthlyTotal).toLocaleString()} ₪ לחודש`;
        }
        if (diverged) {
            // Worth saying out loud: a clearing provider that changed mid-period, or
            // a cost that started or stopped, reads as a clean cadence but does not
            // describe the future.
            confidence = confidence === 'high' ? 'medium' : confidence;
            evidence += ` · שים לב: לפי הקצב ${Math.round(cadenceMonthly).toLocaleString()} ₪ לחודש אבל בפועל נראו ${Math.round(observedMonthly).toLocaleString()} ₪ — ייתכן ששינית ספק/הסדר באמצע התקופה`;
        }
        out.push({
            category,
            label: CATEGORY_LABELS[category]?.he || category,
            dir,
            cadence: c.cadence,
            weekday: c.weekday,
            day_of_month: c.day_of_month,
            amount: Math.round(amount),
            monthly_total: Math.round(monthlyTotal),
            occurrences: events.length,
            confidence,
            evidence,
            cadence_monthly: Math.round(cadenceMonthly),
            observed_monthly: Math.round(observedMonthly),
            diverged,
        });
    }
    out.sort((a, b) => b.monthly_total - a.monthly_total);
    return out;
}
const ymd = (d) => d.toISOString().slice(0, 10);
/**
 * Turn patterns into dated future events between `from` (exclusive) and `to`.
 * `skip` lets the caller suppress categories it will schedule more precisely
 * from real obligations — projecting both would double-count the same money.
 */
export function projectFromPatterns(patterns, from, to, skip = new Set()) {
    const out = [];
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) + DAY);
    for (const p of patterns) {
        if (skip.has(p.category))
            continue;
        const sign = p.dir === 'in' ? 1 : -1;
        if (p.cadence === 'weekly' && p.weekday != null) {
            for (let d = new Date(start); d <= to; d = new Date(d.getTime() + DAY)) {
                if (d.getUTCDay() !== p.weekday)
                    continue;
                out.push({ date: ymd(d), amount: sign * p.amount, label: p.label, category: p.category,
                    source: `דפוס שבועי — ${p.evidence}`, confidence: p.confidence });
            }
        }
        else if (p.cadence === 'monthly' || p.cadence === 'bimonthly') {
            const step = p.cadence === 'monthly' ? 1 : 2;
            const dom = p.day_of_month || 1;
            let y = start.getUTCFullYear(), m = start.getUTCMonth();
            for (let i = 0; i < 24; i++) {
                // Clamp to the month's length so "the 31st" still lands in February.
                const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
                const d = new Date(Date.UTC(y, m, Math.min(dom, last)));
                if (d > to)
                    break;
                if (d >= start) {
                    out.push({ date: ymd(d), amount: sign * p.amount, label: p.label, category: p.category,
                        source: `דפוס ${p.cadence === 'monthly' ? 'חודשי' : 'דו-חודשי'} — ${p.evidence}`,
                        confidence: p.confidence });
                }
                m += step;
                if (m > 11) {
                    y += Math.floor(m / 12);
                    m = m % 12;
                }
            }
        }
        else {
            // Irregular: spread the monthly run-rate evenly across the horizon.
            const daily = p.monthly_total / 30.4;
            if (Math.abs(daily) < 1)
                continue;
            for (let d = new Date(start); d <= to; d = new Date(d.getTime() + DAY)) {
                out.push({ date: ymd(d), amount: sign * daily, label: `${p.label} (פריסה יומית)`,
                    category: p.category, source: `לא קבוע — ${p.evidence}`, confidence: 'low' });
            }
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
//# sourceMappingURL=cashPatterns.js.map