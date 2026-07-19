// The Hebrew calendar, and what each date does to a restaurant's takings.
//
// Dates are fetched from Hebcal rather than written down here. Hebrew dates move
// against the Gregorian calendar every year, and a hard-coded table would drift
// silently — putting "closed" on the wrong day and quietly corrupting the
// forecast. Fetched once per year and cached; if the fetch fails the forecast
// simply carries on without holiday adjustments.
//
// The revenue factors are the opposite: they are seeded with what is typical for
// an Israeli restaurant and are meant to be corrected by the owner, because only
// they know whether their room is full or shut on Sukkot.
import { prisma } from '../db.js';
const dbx = () => prisma;
// Seeded from how these days usually behave in Israel. Every one is editable,
// and the ones that matter most (Yom Kippur, Tisha B'Av) are the ones a wrong
// guess would distort furthest — so they are stated plainly rather than hidden.
function defaultFactor(titleEn, titleHe = '') {
    const t = `${titleEn} ${titleHe}`.toLowerCase();
    // Obscure calendrical markers that are not observed days. "ראש השנה למעשר
    // בהמה" contains "ראש השנה" and would otherwise cut a random August Friday by
    // a fifth — a silent, unexplainable dip in the forecast.
    if (/מעשר בהמה|rosh hashana la.?behemah|לאילנות/.test(t))
        return { factor: 1, closed: false };
    // Order matters: every "erev" test must precede the festival it belongs to.
    if (/erev yom kippur|ערב יום כיפור/.test(t))
        return { factor: 0.5, closed: false };
    if (/yom kippur|יום כיפור/.test(t))
        return { factor: 0, closed: true }; // the country stops
    if (/tish.?a b.av|תשעה באב/.test(t))
        return { factor: 0.2, closed: false };
    if (/erev (pesach|rosh hashana|sukkot|shavuot)|ערב (פסח|ראש השנה|סוכות|שבועות)/.test(t)) {
        return { factor: 0.4, closed: false }; // families eat at home
    }
    if (/ch.?.?m|chol hamoed|חוה|חול המועד/.test(t))
        return { factor: 1.4, closed: false };
    if (/purim|פורים/.test(t))
        return { factor: 1.5, closed: false };
    if (/yom haatzmaut|independence|יום העצמאות/.test(t))
        return { factor: 1.3, closed: false };
    if (/lag baomer|tu bishvat|hanukkah|chanukah|ל״ג בעומר|ט״ו בשבט|חנוכה/.test(t)) {
        return { factor: 1.15, closed: false };
    }
    if (/yom hashoah|yom hazikaron|memorial|יום הזיכרון|יום השואה/.test(t)) {
        return { factor: 0.5, closed: false };
    }
    if (/pesach|rosh hashana|sukkot|shavuot|shmini|simchat|פסח|ראש השנה|סוכות|שבועות|שמיני|שמחת/.test(t)) {
        return { factor: 0.8, closed: false }; // festival days themselves
    }
    return { factor: 1, closed: false };
}
async function ensureTable() {
    await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "HolidayCalendar" (
      holiday_date DATE PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      revenue_factor NUMERIC(5,2) DEFAULT 1,
      closed BOOLEAN DEFAULT false,
      edited BOOLEAN DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => { });
}
/**
 * Pull a year of holidays and cache them. A row the owner has edited is never
 * overwritten — the whole point of the table is their corrections.
 */
export async function syncHolidayCalendar(year) {
    await ensureTable();
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=off`
        + `&year=${year}&month=x&ss=off&mf=off&c=off&geo=none&s=off`;
    let items = [];
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const data = await res.json();
        items = (data.items || []).filter((i) => i.category === 'holiday');
    }
    catch {
        return { added: 0, total: 0 }; // no calendar is better than a wrong one
    }
    let added = 0;
    for (const it of items) {
        const date = String(it.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            continue;
        // hebrew title when available, else the transliterated one
        const name = String(it.hebrew || it.title || '').slice(0, 80);
        const { factor, closed } = defaultFactor(String(it.title || ''), String(it.hebrew || ''));
        try {
            await dbx().$executeRawUnsafe(`INSERT INTO "HolidayCalendar" (holiday_date, name, category, revenue_factor, closed)
         VALUES ($1::date,$2,$3,$4,$5)
         ON CONFLICT (holiday_date) DO UPDATE SET
           name = EXCLUDED.name, category = EXCLUDED.category,
           revenue_factor = EXCLUDED.revenue_factor, closed = EXCLUDED.closed
         WHERE "HolidayCalendar".edited = false`, date, name, String(it.subcat || ''), factor, closed);
            added++;
        }
        catch { /* one bad row must not stop the sync */ }
    }
    const c = await dbx().$queryRawUnsafe(`SELECT COUNT(*)::int c FROM "HolidayCalendar"`).catch(() => []);
    return { added, total: Number(c[0]?.c) || 0 };
}
export async function loadHolidays(fromKey, toKey) {
    await ensureTable();
    const rows = await dbx().$queryRawUnsafe(`SELECT holiday_date, name, category, revenue_factor, closed, edited
     FROM "HolidayCalendar" WHERE holiday_date >= $1::date AND holiday_date <= $2::date`, fromKey, toKey).catch(() => []);
    const m = new Map();
    for (const r of rows) {
        const d = r.holiday_date instanceof Date
            ? r.holiday_date.toISOString().slice(0, 10)
            : String(r.holiday_date).slice(0, 10);
        m.set(d, {
            date: d,
            name: r.name,
            category: r.category || '',
            revenue_factor: Number(r.revenue_factor ?? 1),
            closed: r.closed === true,
            edited: r.edited === true,
        });
    }
    return m;
}
/**
 * The revenue factor for a card settlement landing on `payoutDate`.
 *
 * Clearing is paid for sales made earlier, so a closed day does not shrink that
 * day's payout — it shrinks the one that arrives after it. Alena's clearing
 * lands every Wednesday for roughly the preceding week, so the factor is the
 * average across the seven days ending five days before the payout. Applying it
 * to the payout date itself would move the dip to the wrong week entirely.
 */
export function factorForPayout(payoutDate, holidays, lagDays = 5) {
    const end = Date.parse(payoutDate + 'T00:00:00Z') - lagDays * 86400_000;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(end - i * 86400_000).toISOString().slice(0, 10);
        sum += holidays.get(d)?.revenue_factor ?? 1;
    }
    return sum / 7;
}
//# sourceMappingURL=hebrewCalendar.js.map