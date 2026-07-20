// Morning brief — daily 08:00 IL summary sent via WhatsApp to admin numbers.
// Numbers come from WHATSAPP_ADMIN_NUMBERS env (comma-separated). Each line of
// the brief is computed from real DB data (no LLM hallucination), and the
// brief is sent free-form (works inside the 24h Twilio session — owner is
// expected to text the bot at least daily; if not, we log a warning).
import { prisma } from '../db.js';
import { notifyOwner } from './waTemplates.js';
import { listTodayEvents, listOpenTasks } from './whatsappCalendar.js';
import { reportRecipientPhones } from './whatsappPermissions.js';
const ISRAEL_TZ = 'Asia/Jerusalem';
function israelYMD(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: ISRAEL_TZ });
}
function addDays(d, n) {
    const c = new Date(d);
    c.setUTCDate(c.getUTCDate() + n);
    return c;
}
function israelDayName(ymd) {
    const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    try {
        const d = new Date(`${ymd}T12:00:00.000Z`);
        return NAMES[d.getDay()];
    }
    catch {
        return '';
    }
}
// ── Brief sections ──────────────────────────────────────────────────────────
async function sectionTodayShift(today) {
    const all = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 1500 });
    const todayShifts = all.filter((s) => {
        const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
        return d === today;
    });
    if (!todayShifts.length)
        return '⚠️ אין סידור מוגדר להיום!';
    const lunchN = todayShifts.filter((s) => s.shift_type === 'lunch').reduce((n, s) => n + (s.assigned_staff?.length || 0), 0);
    const dinnerN = todayShifts.filter((s) => s.shift_type === 'dinner').reduce((n, s) => n + (s.assigned_staff?.length || 0), 0);
    const flags = [];
    if (lunchN < 3)
        flags.push('⚠️ צהריים דליל מאוד');
    if (dinnerN < 5)
        flags.push('⚠️ ערב דליל');
    return `☀️ צהריים: *${lunchN}* · 🌙 ערב: *${dinnerN}*${flags.length ? '\n  ' + flags.join(' | ') : ''}`;
}
async function sectionYesterdayTips(yesterday) {
    const reports = await prisma.tipReport.findMany({ orderBy: { date: 'desc' }, take: 20 });
    const matched = reports.filter((r) => {
        const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
        return d === yesterday;
    });
    if (!matched.length)
        return null;
    const tot = matched.reduce((n, r) => n + Number(r.total_tips_collected || 0), 0);
    const lunch = matched.find((r) => r.shift_type === 'lunch');
    const dinner = matched.find((r) => r.shift_type === 'dinner');
    const parts = [`סה"כ אתמול: *₪${tot.toFixed(0)}*`];
    if (lunch)
        parts.push(`צהריים ₪${Number(lunch.total_tips_collected || 0).toFixed(0)}`);
    if (dinner)
        parts.push(`ערב ₪${Number(dinner.total_tips_collected || 0).toFixed(0)}`);
    return parts.join(' · ');
}
async function sectionWaitingLeads() {
    try {
        const leads = await prisma.eventLead.findMany({
            where: { status: { in: ['pending', 'contacted', 'quoted'] } },
            take: 50,
        });
        if (!leads.length)
            return null;
        const pendingCount = leads.filter(l => l.status === 'pending').length;
        const quotedCount = leads.filter(l => l.status === 'quoted').length;
        // Anything pending for >24h is a flag
        const now = Date.now();
        const stale = leads.filter(l => {
            const created = l.created_date ? new Date(l.created_date).getTime() : 0;
            return l.status === 'pending' && (now - created) > 24 * 3600 * 1000;
        });
        const lines = [`לידים פתוחים: *${leads.length}*${pendingCount ? ` · ${pendingCount} ממתינים לטלפון` : ''}${quotedCount ? ` · ${quotedCount} בהצעת מחיר` : ''}`];
        if (stale.length)
            lines.push(`  🚨 ${stale.length} מחכים מעל 24h — עדיף לחזור היום`);
        return lines.join('\n');
    }
    catch {
        return null;
    }
}
async function sectionUnpaidInvoices() {
    try {
        const inv = await prisma.invoice.findMany({
            where: { payment_status: 'unpaid' },
            orderBy: { invoice_date: 'desc' },
            take: 200,
        });
        if (!inv.length)
            return null;
        const total = inv.reduce((s, i) => s + Number(i.total_amount || 0), 0);
        return `חשבוניות לא שולמו: *${inv.length}* (₪${total.toLocaleString('he-IL')})`;
    }
    catch {
        return null;
    }
}
// Curated rotation of motivational quotes. We pick by day-of-year so the
// sequence is deterministic and you don't see the same one two days in a row.
// 30 items → ~monthly rotation.
const MORNING_QUOTES = [
    '"היום הוא יום מצוין להתחיל משהו חדש." — תתחיל בקטן, תתמיד.',
    '"הצלחה היא הסכום של מאמצים קטנים שחוזרים על עצמם יום אחר יום." — רוברט קולייר',
    '"אנשים לא קונים מה שאתה עושה, הם קונים למה אתה עושה את זה." — סיימון סינק',
    '"אל תחכה. הזמן הנכון לעולם לא יגיע." — נפוליאון היל',
    '"המסעדן הטוב ביותר הוא זה שזוכר את שמות הלקוחות." — חוק זהב',
    '"איכות אינה מקרית. היא תמיד תוצאה של מאמץ מכוון." — ויליאם פוסטר',
    '"הצוות שלך הוא המוצר שלך." — ניהול שירות',
    '"מי שלא חולם בגדול, לא ידע איפה הוא היה יכול להיות." — דייוויד שוורץ',
    '"הלקוח לא תמיד צודק, אבל הוא תמיד הלקוח." — סם וולטון',
    '"המחיר נשכח, האיכות נשארת." — אלדריקו גוצ׳י',
    '"דברים גדולים בעסקים אף פעם לא נעשים על ידי אדם אחד. הם נעשים על ידי צוות." — סטיב ג׳ובס',
    '"ההצלחה זה לא סוף הדרך, הכישלון לא סופי, האומץ להמשיך הוא מה שנחשב." — צ׳רצ׳יל',
    '"אסטרטגיה בלי ביצוע היא חלום בהקיץ. ביצוע בלי אסטרטגיה זה סיוט." — סון דזה',
    '"דע מי הלקוח שלך — וקנה רחוק יותר ממנו." — ג׳ון פירפונט מורגן',
    '"הלקוח שאתה משאיר מאוכזב היום, הוא הביקורת השלילית של מחר." — חוק מסעדנות',
    '"אם אתה לא יכול למדוד את זה, אתה לא יכול לנהל את זה." — פיטר דרוקר',
    '"כל אחד יכול לבשל. רק מעטים יכולים לנהל מסעדה." — אנתוני בורדיין',
    '"הצלחה ארוכת טווח באה מהצוות הנכון, לא מהמתכון הנכון." — אינדוסטריית המסעדנות',
    '"שירות מעולה הוא לזכור את הלקוח לפני שהוא נכנס בדלת." — חוק המארחים',
    '"דאג למרכיבים שלך, והם ידאגו לך." — ז׳וזה אנדרס',
    '"השעה הראשונה של היום מגדירה את כל היום." — תורת ההרגלים',
    '"כסף מגיע אחרי הערך, לא לפני." — בעלי עסקים',
    '"לעובדים מאושרים יש לקוחות מאושרים." — ריצ׳רד ברנסון',
    '"הניצחון הגדול ביותר הוא לקום פעם אחת יותר ממה שנפלת." — אמרה יפנית',
    '"תהיה כל יום קצת יותר טוב ממה שהיית אתמול." — שיפור מתמיד',
    '"כל לקוח מאושר מביא אחריו עוד שלושה. כל לקוח מתוסכל לוקח איתו שבעה." — חוק 1:3:7',
    '"אם אתה לא נמצא בקרבת השולחנות, אתה לא מנהל את המסעדה." — ניהול שדה',
    '"כל בעיה היא הזדמנות במסווה." — ג׳ון רוקפלר',
    '"הסבלנות והעקביות מנצחות את הכישרון, אם הכישרון לא עקבי." — טים נוטקה',
    '"היום הוא היום היחיד שיש לך. תכבד אותו." — מנטליות הזן',
];
function motivationalQuoteOfTheDay() {
    // Day-of-year as a stable index across the rotation
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    const dayOfYear = Math.floor(diff / 86_400_000);
    return MORNING_QUOTES[dayOfYear % MORNING_QUOTES.length];
}
async function sectionPersonalTodayEvents(phone) {
    try {
        const events = await listTodayEvents(phone);
        if (!events.length)
            return null;
        return events.map(e => {
            const tm = e.when.toLocaleTimeString('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit' });
            return `  ${tm} · ${e.title}`;
        }).join('\n');
    }
    catch {
        return null;
    }
}
async function sectionPersonalOpenTasks(phone) {
    try {
        const tasks = await listOpenTasks(phone);
        if (!tasks.length)
            return null;
        const top = tasks.slice(0, 5);
        const more = tasks.length - top.length;
        return top.map(t => `  • ${t.title}`).join('\n') + (more > 0 ? `\n  …ועוד ${more}` : '');
    }
    catch {
        return null;
    }
}
async function sectionMissingAvailability() {
    try {
        const today = new Date();
        const dow = today.getDay();
        const nextSun = addDays(today, 7 - dow);
        const days = Array.from({ length: 7 }, (_, i) => israelYMD(addDays(nextSun, i)));
        const [emps, avails] = await Promise.all([
            prisma.employee.findMany({ where: { status: 'active' }, take: 500 }),
            prisma.employeeAvailability.findMany({ take: 5000 }),
        ]);
        const submittedByEmp = new Set();
        for (const a of avails) {
            const d = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10);
            if (days.includes(d))
                submittedByEmp.add(a.employee_id);
        }
        const missing = emps.filter((e) => !submittedByEmp.has(e.id));
        if (!missing.length)
            return null;
        if (missing.length === emps.length)
            return null; // probably too early in the week, nobody submitted yet
        return `זמינות חסרה לשבוע הבא: *${missing.length}/${emps.length}* עובדים`;
    }
    catch {
        return null;
    }
}
// ── Top-level brief ────────────────────────────────────────────────────────
export async function buildMorningBrief(forPhone) {
    const today = israelYMD();
    const yesterday = israelYMD(addDays(new Date(), -1));
    const todayName = israelDayName(today);
    const [todayShift, tips, leads, invoices, availMissing, myEvents, myTasks] = await Promise.all([
        sectionTodayShift(today),
        sectionYesterdayTips(yesterday),
        sectionWaitingLeads(),
        sectionUnpaidInvoices(),
        sectionMissingAvailability(),
        forPhone ? sectionPersonalTodayEvents(forPhone) : Promise.resolve(null),
        forPhone ? sectionPersonalOpenTasks(forPhone) : Promise.resolve(null),
    ]);
    const quote = motivationalQuoteOfTheDay();
    const lines = [
        `🌅 *בוקר טוב — ${todayName} ${today}*`,
        '',
        `💭 ${quote}`,
        '',
    ];
    if (myEvents) {
        lines.push('🗓 *הפגישות שלך היום*', myEvents, '');
    }
    if (myTasks) {
        lines.push('✅ *משימות פתוחות*', myTasks, '');
    }
    lines.push('📅 *סידור היום*', todayShift);
    if (tips) {
        lines.push('', '💰 *טיפים אתמול*', tips);
    }
    if (leads) {
        lines.push('', '🎯 *לידים*', leads);
    }
    if (invoices) {
        lines.push('', '🧾 *חשבוניות*', invoices);
    }
    if (availMissing) {
        lines.push('', '👥 *זמינות*', availMissing);
    }
    lines.push('', '_שלח/י "עזרה" לרשימת פקודות. בוקר טוב 🌿_');
    return lines.join('\n');
}
// ─── End-of-day brief (sent at 23:30) ──────────────────────────────────────
async function eodSales(today) {
    try {
        const orders = await prisma.beecommOrder.findMany({
            where: { OR: [{ date: today }, { created_date: today }] },
            take: 1000,
        }).catch(() => []);
        if (!orders.length)
            return null;
        const total = orders.reduce((s, o) => s + Number(o.total_ils ?? o.total ?? o.amount ?? 0), 0);
        // Average over last 4 same-DOW
        const allOrders = await prisma.beecommOrder.findMany({
            orderBy: { date: 'desc' }, take: 5000,
        }).catch(() => []);
        const todayDow = new Date(`${today}T12:00:00Z`).getDay();
        const byDate = {};
        for (const o of allOrders) {
            const d = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : String(o.date).slice(0, 10);
            if (d && d !== today && new Date(`${d}T12:00:00Z`).getDay() === todayDow) {
                byDate[d] = (byDate[d] || 0) + Number(o.total_ils ?? o.total ?? o.amount ?? 0);
            }
        }
        const samples = Object.values(byDate).slice(0, 4);
        const avg = samples.length ? samples.reduce((s, n) => s + n, 0) / samples.length : 0;
        const lines = [`הזמנות: *${orders.length}* · סה"כ: *₪${total.toLocaleString('he-IL')}*`];
        if (avg > 0) {
            const diffPct = Math.round(((total - avg) / avg) * 100);
            const arrow = diffPct >= 0 ? '⬆️' : '⬇️';
            lines.push(`${arrow} ${diffPct >= 0 ? '+' : ''}${diffPct}% מול ממוצע ${samples.length} ${samples.length === 1 ? 'שבוע' : 'שבועות'} אחורה (אותו יום)`);
        }
        return lines.join('\n');
    }
    catch {
        return null;
    }
}
async function eodTips(today) {
    const reports = await prisma.tipReport.findMany({ orderBy: { date: 'desc' }, take: 30 });
    const matched = reports.filter((r) => {
        const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
        return d === today;
    });
    if (!matched.length)
        return null;
    const totalTips = matched.reduce((n, r) => n + Number(r.total_tips_collected || 0), 0);
    const netDistr = matched.reduce((n, r) => n + Number(r.net_tips_for_distribution || 0), 0);
    const mgrCut = totalTips * 0.05;
    const lines = [
        `נאסף: *₪${totalTips.toFixed(0)}*`,
        `לחלוקה למלצרים: ₪${netDistr.toFixed(0)} · למנהל משמרת (5%): ₪${mgrCut.toFixed(0)}`,
    ];
    const locked = matched.filter((r) => r.status === 'locked').length;
    if (locked < matched.length)
        lines.push(`⚠️ ${matched.length - locked} דוחות עוד בטיוטה`);
    return lines.join('\n');
}
async function eodIncidentsToday(today) {
    try {
        const all = await prisma.incident.findMany({ orderBy: { id: 'desc' }, take: 100 });
        const matched = all.filter((i) => {
            const d = i.created_date ? String(i.created_date).slice(0, 10) : (i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '');
            return d === today;
        });
        if (!matched.length)
            return null;
        const sevCount = matched.reduce((m, i) => { const s = String(i.severity || 'low'); m[s] = (m[s] || 0) + 1; return m; }, {});
        const parts = Object.entries(sevCount).map(([s, n]) => `${s}: ${n}`);
        return `${matched.length} אירועים דווחו (${parts.join(' · ')})`;
    }
    catch {
        return null;
    }
}
async function eodLeadsClosed(today) {
    try {
        const all = await prisma.eventLead.findMany({ orderBy: { id: 'desc' }, take: 200 });
        const closedToday = all.filter((l) => {
            const d = l.updated_date ? String(l.updated_date).slice(0, 10) : '';
            return d === today && (l.status === 'won' || l.status === 'lost');
        });
        const newToday = all.filter((l) => {
            const d = l.created_date ? String(l.created_date).slice(0, 10) : '';
            return d === today;
        });
        if (!closedToday.length && !newToday.length)
            return null;
        const won = closedToday.filter((l) => l.status === 'won').length;
        const lost = closedToday.filter((l) => l.status === 'lost').length;
        const parts = [];
        if (newToday.length)
            parts.push(`חדשים: *${newToday.length}*`);
        if (won)
            parts.push(`✅ נסגרו: ${won}`);
        if (lost)
            parts.push(`❌ לא רלוונטיים: ${lost}`);
        return parts.join(' · ');
    }
    catch {
        return null;
    }
}
// Personal events for a specific date (used by EoD brief to show tomorrow).
async function sectionPersonalEventsForDate(phone, targetYmd) {
    try {
        const rows = await prisma.whatsAppMessage.findMany({
            where: { status: 'scheduled_event', contact_phone: phone, is_read: false },
            take: 200,
        });
        const events = [];
        for (const r of rows) {
            const raw = r.raw || {};
            if (!raw.event_at)
                continue;
            const at = new Date(raw.event_at);
            if (isNaN(at.getTime()))
                continue;
            const eventYMD = at.toLocaleDateString('en-CA', { timeZone: ISRAEL_TZ });
            if (eventYMD === targetYmd)
                events.push({ at, title: raw.title || r.body });
        }
        if (!events.length)
            return null;
        events.sort((a, b) => a.at.getTime() - b.at.getTime());
        return events.map(e => {
            const tm = e.at.toLocaleTimeString('he-IL', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit' });
            return `  ${tm} · ${e.title}`;
        }).join('\n');
    }
    catch {
        return null;
    }
}
async function eodTomorrowPreview(tomorrow) {
    const all = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 1500 });
    const tShifts = all.filter((s) => {
        const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
        return d === tomorrow;
    });
    const lunchN = tShifts.filter((s) => s.shift_type === 'lunch').reduce((n, s) => n + (s.assigned_staff?.length || 0), 0);
    const dinnerN = tShifts.filter((s) => s.shift_type === 'dinner').reduce((n, s) => n + (s.assigned_staff?.length || 0), 0);
    if (!lunchN && !dinnerN)
        return '⚠️ אין סידור למחר!';
    return `☀️ צהריים: ${lunchN} · 🌙 ערב: ${dinnerN}`;
}
export async function buildEndOfDayBrief(forPhone) {
    // Day-boundary: the EoD brief fires after the last shift closes, often past
    // midnight (e.g. 02:00). At 02:00 Thursday it is wrapping up WEDNESDAY's
    // service, so "today" (the day being summarized) is the previous calendar day
    // and "tomorrow" (the next service) is the current calendar day. Before ~06:00
    // Israel we shift both back by one; a pre-midnight run keeps the natural dates.
    const nowD = new Date();
    const hourIL = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(nowD), 10);
    const afterMidnight = hourIL < 6;
    const today = israelYMD(afterMidnight ? addDays(nowD, -1) : nowD);
    const tomorrow = israelYMD(afterMidnight ? nowD : addDays(nowD, 1));
    const todayName = israelDayName(today);
    const tomorrowName = israelDayName(tomorrow);
    const [sales, tips, incidents, leads, tomorrowPrev, myEventsTomorrow, myOpenTasks] = await Promise.all([
        eodSales(today),
        eodTips(today),
        eodIncidentsToday(today),
        eodLeadsClosed(today),
        eodTomorrowPreview(tomorrow),
        forPhone ? sectionPersonalEventsForDate(forPhone, tomorrow) : Promise.resolve(null),
        forPhone ? sectionPersonalOpenTasks(forPhone) : Promise.resolve(null),
    ]);
    const lines = [
        `🌙 *סיכום יום — ${todayName} ${today}*`,
        '',
    ];
    if (sales) {
        lines.push(`💰 *מכירות*`, sales, '');
    }
    if (tips) {
        lines.push(`💸 *טיפים*`, tips, '');
    }
    if (leads) {
        lines.push(`🎯 *לידים*`, leads, '');
    }
    if (incidents) {
        lines.push(`🚨 *אירועים*`, incidents, '');
    }
    lines.push(`📅 *סידור מחר (${tomorrowName})*`, tomorrowPrev, '');
    if (myEventsTomorrow) {
        lines.push(`🗓 *הפגישות שלך מחר*`, myEventsTomorrow, '');
    }
    if (myOpenTasks) {
        lines.push(`✅ *משימות פתוחות שנותרו*`, myOpenTasks, '');
    }
    lines.push('_לילה טוב 🌿_');
    return lines.join('\n');
}
export async function sendEndOfDayBrief() {
    const phones = await reportRecipientPhones();
    if (!phones.length) {
        console.warn('[eod-brief] no recipient (tenant owner) configured');
        return { sent: 0, failed: 0, details: [] };
    }
    const results = [];
    for (const phone of phones) {
        try {
            const text = await buildEndOfDayBrief(phone);
            const r = await notifyOwner(phone, 'סיכום יום', text, {
                link: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/Dashboard`,
            });
            results.push({ phone, ok: r.sent });
        }
        catch (e) {
            results.push({ phone, ok: false, error: e?.message || 'unknown' });
            console.warn('[eod-brief] send failed', { phone, err: e?.message });
        }
    }
    return { sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, details: results };
}
// Send the brief to all admins. Returns per-recipient delivery status.
// Each admin gets a brief PERSONALIZED with their own events + tasks
// (so several admins don't all see the same person's calendar).
export async function sendMorningBrief() {
    const phones = await reportRecipientPhones();
    if (!phones.length) {
        console.warn('[morning-brief] no recipient (tenant owner) configured; skipping');
        return { sent: 0, failed: 0, details: [] };
    }
    const results = [];
    for (const phone of phones) {
        try {
            const text = await buildMorningBrief(phone);
            const r = await notifyOwner(phone, 'בוקר טוב', text, {
                link: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/Dashboard`,
            });
            results.push({ phone, ok: r.sent });
        }
        catch (e) {
            console.warn('[morning-brief] send failed', { phone, err: e?.message });
            results.push({ phone, ok: false, error: e?.message || 'unknown' });
        }
    }
    return {
        sent: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        details: results,
    };
}
//# sourceMappingURL=morningBrief.js.map