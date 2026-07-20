// WhatsApp write-actions — LLM-based intent parser + confirmation flow.
//
// Architecture: admin texts a free-form Hebrew command, Gemini (small/fast model)
// classifies it into one of a fixed catalog of intents with extracted parameters.
// Each intent produces a HUMAN-CONFIRMABLE proposal (no DB write yet). Admin
// replies "כן" / "אישור" within 10 minutes → action runs. "לא" / "ביטול" → drop.
//
// Why LLM and not regex: Hebrew has too many word orders / synonyms.
// "סמן 503081 שולמה" / "החשבונית 503081 שולמה" / "תסמן ש-503081 שילמתי" all
// mean the same thing. The LLM normalizes — we verify the parsed params with
// hard checks before showing the confirmation, so a misparse can't sneak through.
import { prisma } from '../db.js';
import { invokeLLM } from './llm.js';
import { sendWhatsApp, sendSms } from './twilio.js';
import { sendTemplated, notifyStaff, sendClubMessage } from './waTemplates.js';
import { addScheduledEvent, addTask, completeTaskByMatch, setWakeAlarm, cancelWakeAlarm } from './whatsappCalendar.js';
import { createCalendarEvent, createTasksItem, isGoogleConnected } from './googleSync.js';
const INTENT_SCHEMA = {
    type: 'object',
    properties: {
        intent: {
            type: 'string',
            enum: ['invoice_mark_paid', 'invoice_mark_unpaid', 'lead_set_stage', 'shift_assign', 'remind_me', 'send_contract', 'event_add', 'event_add_batch', 'task_add', 'task_done', 'wake_alarm_set', 'wake_alarm_cancel', 'leave_request_decide', 'shift_swap_decide', 'broadcast_message', 'noop'],
            description: 'הפעולה הנדרשת. noop = לא פעולת כתיבה (השאר לראוטר אחר).',
        },
        invoice_number: { type: 'string', description: 'מספר חשבונית (לפעולות חשבונית)' },
        lead_search: { type: 'string', description: 'שם / מזהה ליד למציאה (לפעולות ליד)' },
        lead_stage: { type: 'string', enum: ['pending', 'contacted', 'quoted', 'won', 'lost'], description: 'שלב חדש לליד' },
        employee_search: { type: 'string', description: 'שם עובד (לפעולות סידור)' },
        shift_date: { type: 'string', description: 'תאריך משמרת YYYY-MM-DD או יחסי (היום/מחר)' },
        shift_type: { type: 'string', enum: ['lunch', 'dinner'], description: 'סוג משמרת' },
        position: { type: 'string', description: 'תפקיד (מלצר/ברמן/וכו)' },
        remind_at: { type: 'string', description: 'תאריך + שעה לתזכורת (ISO או יחסי)' },
        remind_text: { type: 'string', description: 'תוכן התזכורת' },
        contract_search: { type: 'string', description: 'מי לקוח / מספר חוזה למציאה (לפעולות send_contract)' },
        event_title: { type: 'string', description: 'כותרת אירוע אישי (event_add)' },
        event_at: { type: 'string', description: 'מתי האירוע (event_add) — ISO או יחסי כמו "מחר 14:00"' },
        event_lead_min: { type: 'integer', description: 'כמה דק לפני להזכיר (event_add). ברירת מחדל 15' },
        events: {
            type: 'array',
            description: 'רשימת אירועים מרובים (event_add_batch). כל פריט: title + when (ISO או יחסי) + lead_min אופציונלי.',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    when: { type: 'string' },
                    lead_min: { type: 'integer' },
                },
                required: ['title', 'when'],
            },
        },
        lead_min_default: { type: 'integer', description: 'תזכורת ברירת-מחדל לכל הפגישות בbatch (אם לקוח אומר "ושעתיים לפני").' },
        leave_employee: { type: 'string', description: 'שם עובד או חלק ממנו (לbקשת חופשה ממתינה)' },
        leave_decision: { type: 'string', enum: ['approved', 'rejected'], description: 'אישור/דחייה' },
        swap_search: { type: 'string', description: 'שם עובד או תאריך לבקשת החלפה' },
        swap_decision: { type: 'string', enum: ['approved', 'rejected'], description: 'אישור/דחייה' },
        broadcast_audience: { type: 'string', enum: ['club', 'employees', 'admins'], description: 'יעד שידור: מועדון/עובדים פעילים/אדמינים' },
        broadcast_message_text: { type: 'string', description: 'תוכן הודעת השידור' },
        task_title: { type: 'string', description: 'תיאור משימה (task_add)' },
        task_search: { type: 'string', description: 'שם משימה או id אחרון (task_done)' },
        wake_hhmm: { type: 'string', description: 'שעה בפורמט HH:MM לשעון מעורר יומי' },
        confidence: { type: 'number', description: '0-1 — בטחון בפירוש' },
        rationale: { type: 'string', description: 'הסבר קצר על הזיהוי, לדיבוג' },
    },
    required: ['intent', 'confidence'],
};
async function classifyIntent(body) {
    try {
        const out = await invokeLLM({
            prompt: [
                'אתה מסווג בקשות אדמין במסעדה בעברית.',
                'הבקשה תהיה הודעת WhatsApp קצרה. סווג אותה לאחת הפעולות הבאות וחלץ את הפרמטרים.',
                '',
                '⚠️ *חוקי זהב לחילוץ ספרות* — חובה לעקוב אחריהם בקפדנות:',
                '• הטקסט עברי אבל מספרים נכתבים בספרות לועזיות (16, 14:00, 09:30).',
                '• השעות נראות הפוך בעיניים בגלל RTL — אבל הן נכתבות ונקראות בסדר הספרות הרגיל.',
                '• אם הלקוח כתב "ב16:00" — השעה היא *16:00*, לא 19:00, לא 61:00, ולא שום ערך אחר.',
                '• אם הלקוח כתב "ב13:30" — השעה היא *13:30*, לא 19:30, לא 31:30.',
                '• "10:00-13:30" = מ-10:00 עד 13:30. אם צריך זמן יחיד — קח את הראשון (10:00).',
                '• לעולם אל "תפרש" או "תעגל" מספרים. תעתיק אותם בדיוק כפי שנכתבו.',
                '• "ב-9", "ב-9:00", "תשע בבוקר" → 09:00. "ב-9 בערב", "תשע בלילה" → 21:00.',
                '',
                '',
                '*invoice_mark_paid* — סימון חשבונית כשולמה. דוגמאות: "סמן 503081 שולמה", "חשבונית 12345 שילמתי", "תסמן שש-503081 שולם".',
                '*invoice_mark_unpaid* — להחזיר חשבונית ללא-שולמה. "החשבונית 503081 לא שולמה", "תבטל ש-12345 שולם".',
                '*lead_set_stage* — שינוי שלב של ליד אירוע. שלבים: pending (לטלפון), contacted (דיברנו), quoted (הצעת מחיר), won (נסגר), lost (לא רלוונטי). דוגמאות: "ליד דביר התקשרתי", "אישור הליד של משה", "דביר נסגר", "הליד של רוזנפלד לא רלוונטי".',
                '*shift_assign* — שיבוץ עובד למשמרת. דוגמאות: "שבץ עדן למחר ערב כמלצר", "תוסיף את משה לסידור צהריים היום", "שבץ את עדן למשמרת ערב מחר כמנהלת משמרת". חלץ employee_search (שם), shift_date (תאריך/יחסי), shift_type (lunch או dinner; "צהריים"→lunch, "ערב"→dinner), position (תפקיד).',
                '*remind_me* — תזכורת אישית. "תזכיר לי ב-14:00 לבדוק את האירוע", "תזכורת מחר בבוקר — לחזור לדביר".',
                '*send_contract* — שליחת חוזה אירוע ללקוח בוואטסאפ. דוגמאות: "שלח חוזה לדביר", "תשלח את החוזה של רוזנפלד", "שלח את חוזה 0042 ללקוח". חלץ contract_search (שם הלקוח או מספר החוזה).',
                '*event_add* — *אירוע יחיד* בלוח. חובה לחלץ *שני* שדות: event_title + event_at. אם event_at חסר → תחזיר noop במקום event_add!',
                '  דוגמאות מלאות:',
                '  • "פגישה עם דביר מחר ב-14:00" → event_title="פגישה עם דביר", event_at="מחר 14:00"',
                '  • "תכניס לי פגישה ללוז קובי הלוי 15:30 ביום רביעי" → event_title="קובי הלוי", event_at="רביעי 15:30"',
                '  • "תכניס פגישה ללוז לשבוע הבא קובי הלוי 15:30 ביום רביעי ותזכיר שעתיים לפני" → event_title="קובי הלוי", event_at="רביעי הבא 15:30", event_lead_min=120',
                '  • "שיחת זום עם הספק חמישי 11:00" → event_title="שיחת זום עם הספק", event_at="חמישי 11:00"',
                '  • "אסף זום בנושא אחמשים ראשון 16:00" → event_title="אסף זום בנושא אחמשים", event_at="ראשון 16:00"',
                '  המרת lead_min: "רבע שעה לפני"=15, "חצי שעה לפני"=30, "שעה לפני"=60, "שעתיים לפני"=120, "יום לפני"=1440.',
                '*event_add_batch* — *רשימת מספר פגישות* בהודעה אחת. דוגמה: "תכניס לי השבוע: ראשון 16:00 פגישה עם אסף · שלישי 13:00 פגישה עם מאור · רביעי 10:00-13:30 אסף". כל אירוע נפרד = פריט ב-events. שמור על שעות מדויקות בדיוק כפי שנכתבו. אם משהו לא מוגדר כשעה ("שני יום הולדת") — דלג עליו או הכנס אותו עם ערך when מעורפל ו-lead_min=0.\n  • אם הלקוח אומר "תזכיר X שעות לפני כל הפגישות" — חלץ lead_min_default (לדוגמה "שעתיים לפני" → 120, "יום לפני" → 1440).\n  • להוסיף כל אירוע גם אם השעה היא טווח (10:00-13:30 → קח את 10:00 כ-when).\n  • אם יש 2+ פגישות בהודעה — תמיד event_add_batch, גם אם המבנה לא מסודר.',
                '*task_add* — משימה לרשימה. "תוסיף משימה: להזמין יין", "צריך לחתום על חוזה רוזנפלד", "רשום לי: לבדוק את המקפיא". חלץ task_title.',
                '*task_done* — סימון משימה כבוצעה. "סיים יין", "בוצע: חוזה רוזנפלד", "תסמן את המקפיא כעשוי". חלץ task_search (כותרת חלקית או id).',
                '*wake_alarm_set* — שעון מעורר יומי. "תעיר אותי כל יום ב-07:30", "תזכיר לי כל בוקר 08:00 עם הסיכום". חלץ wake_hhmm.',
                '*wake_alarm_cancel* — ביטול שעון מעורר. "תבטל את השעון מעורר", "ביטול ההתעוררות".',
                '*leave_request_decide* — אישור/דחיית בקשת חופשה של עובד. "אשר חופשה לעדן", "אישור חופשה רוזנפלד", "דחה את הבקשה של משה". חלץ leave_employee + leave_decision (approved/rejected).',
                '*shift_swap_decide* — אישור/דחיית בקשת החלפת משמרת. "אשר את ההחלפה של עדן", "דחה החלפה ביום שני". חלץ swap_search + swap_decision.',
                '*broadcast_message* — שליחת הודעה ב-WhatsApp לאודיינס. "שלח לכל המועדון: מבצע סוף שבוע, הנחה 15%", "תודיע לעובדים: מחר אסיפת צוות ב-10:00". חלץ broadcast_audience (club / employees / admins) + broadcast_message_text. ⚠️ זוהי פעולה רחבת-טווח — תמיד תופיע באישור.',
                '*list_today* — שאלת קריאה (לא write) → noop. הקוראים יטפלו ב-"מה היום" / "מה התכנון".',
                '*noop* — כל דבר אחר (שאלת קריאה, ברכה, "עזרה", הודעת רעש).',
                '',
                'אם זה פעולת קריאה כמו "סידור היום" / "לידים" / "טיפים" — חזור noop.',
                'אם זה אישור/ביטול ("כן", "אישור", "לא", "ביטול") — חזור noop (יש לזה ראוטר נפרד).',
                'אם זה פקודה מעורפלת — confidence נמוך (<0.7), הראוטר ישאל ברירור.',
                '',
                '--- הבקשה ---',
                body,
                '--- סוף ---',
            ].join('\n'),
            responseSchema: INTENT_SCHEMA,
            // 400 was getting truncated to '{\\n  ' — Gemini 2.5 thinking model
            // burns the budget on internal reasoning. 2000 gives clear headroom
            // for both the thinking and the actual JSON payload (~150 tokens).
            maxOutputTokens: 2000,
            timeoutMs: 15000,
        });
        console.log('[whatsapp-actions] classify raw:', JSON.stringify({
            body: body.slice(0, 80),
            out_type: typeof out,
            out_keys: out && typeof out === 'object' ? Object.keys(out) : null,
            out_value: out,
        }));
        if (!out || out.intent === 'noop')
            return null;
        if (typeof out.confidence !== 'number' || out.confidence < 0.6)
            return null;
        return out;
    }
    catch (e) {
        console.warn('[whatsapp-actions] classify failed:', e?.message);
        return null;
    }
}
// ─── Proposal builders (parse intent → human confirmation text + execution payload) ──
async function proposeInvoiceMarkPaid(p) {
    const num = (p.invoice_number || '').trim();
    if (!num)
        return '❓ לא הבנתי איזו חשבונית. ציין את המספר (לדוגמה: "סמן 503081 שולמה").';
    const inv = await prisma.invoice.findFirst({ where: { invoice_number: num } });
    if (!inv)
        return `❓ לא מצאתי חשבונית עם מספר *${num}* במערכת.`;
    if (inv.payment_status === 'paid')
        return `ℹ️ חשבונית ${num} כבר מסומנת כשולמה.`;
    const sup = await prisma.supplier.findUnique({ where: { id: inv.supplier_id } }).catch(() => null);
    return {
        summary: [
            '💳 *לסמן חשבונית כשולמה?*',
            `🆔 חשבונית: ${num}`,
            `🏢 ${sup?.company_name || 'ספק לא ידוע'}`,
            `💰 ₪${Number(inv.total_amount || 0).toLocaleString('he-IL')}`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'invoice_mark_paid', invoice_id: inv.id, invoice_number: num },
    };
}
async function proposeInvoiceMarkUnpaid(p) {
    const num = (p.invoice_number || '').trim();
    if (!num)
        return '❓ ציין מספר חשבונית.';
    const inv = await prisma.invoice.findFirst({ where: { invoice_number: num } });
    if (!inv)
        return `❓ לא מצאתי חשבונית עם מספר *${num}*.`;
    if (inv.payment_status !== 'paid')
        return `ℹ️ חשבונית ${num} כבר לא מסומנת כשולמה.`;
    const sup = await prisma.supplier.findUnique({ where: { id: inv.supplier_id } }).catch(() => null);
    return {
        summary: [
            '↩️ *להחזיר חשבונית ללא-שולמה?*',
            `🆔 ${num} · 🏢 ${sup?.company_name || '—'} · 💰 ₪${Number(inv.total_amount || 0).toLocaleString('he-IL')}`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'invoice_mark_unpaid', invoice_id: inv.id, invoice_number: num },
    };
}
async function proposeLeadSetStage(p) {
    const search = (p.lead_search || '').trim();
    const stage = p.lead_stage;
    if (!search)
        return '❓ ציין את שם הליד.';
    if (!stage)
        return '❓ ציין שלב: pending / contacted / quoted / won / lost.';
    // Fuzzy search by name or phone
    const leads = await prisma.eventLead.findMany({
        where: { status: { in: ['pending', 'contacted', 'quoted'] } },
        take: 100,
    });
    const lower = search.toLowerCase();
    const matches = leads.filter((l) => String(l.contact_name || '').toLowerCase().includes(lower) ||
        String(l.contact_phone || '').includes(search.replace(/\D/g, '')));
    if (!matches.length)
        return `❓ לא מצאתי ליד פתוח שמתאים ל-"${search}".`;
    if (matches.length > 1) {
        return `❓ נמצאו ${matches.length} לידים שמתאימים — תוסיף מספר טלפון כדי לזהות:\n${matches.slice(0, 5).map((l) => `• ${l.contact_name} · ${l.contact_phone}`).join('\n')}`;
    }
    const lead = matches[0];
    const stageHe = { pending: 'מחכה לטלפון', contacted: 'דיברנו', quoted: 'הצעת מחיר', won: 'נסגר ✅', lost: 'לא רלוונטי ❌' }[stage];
    return {
        summary: [
            `🎯 *לעדכן שלב של ליד?*`,
            `👤 ${lead.contact_name || '—'} · 📞 ${lead.contact_phone || '—'}`,
            `📅 ${lead.event_date || '?'} · 👥 ${lead.guest_count || '?'}`,
            `מצב נוכחי: ${lead.status}  →  *${stageHe}*`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'lead_set_stage', lead_id: lead.id, stage, lead_name: lead.contact_name },
    };
}
async function proposeShiftAssign(p) {
    const search = (p.employee_search || '').trim();
    if (!search)
        return '❓ ציין שם עובד.';
    if (!p.shift_type)
        return '❓ צהריים או ערב?';
    if (!p.shift_date)
        return '❓ באיזה תאריך? (לדוגמה: "מחר", "ראשון", "22.6")';
    // Resolve date: pass-through ISO/YMD, or interpret היום/מחר/מחרתיים
    const TZ = 'Asia/Jerusalem';
    const today = new Date();
    const todayY = today.toLocaleDateString('en-CA', { timeZone: TZ });
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowY = tomorrow.toLocaleDateString('en-CA', { timeZone: TZ });
    const dayAfter = new Date(today);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
    const dayAfterY = dayAfter.toLocaleDateString('en-CA', { timeZone: TZ });
    // Accept Hebrew + English relative words + Hebrew day-of-week names.
    let dateStr = String(p.shift_date || '').trim().toLowerCase();
    // Strip leading "יום" / "ב-" / "ב" prefixes so 'יום רביעי' / 'ברביעי' / 'ב-רביעי' all work.
    dateStr = dateStr.replace(/^(יום\s+|ב[-־]?)/, '');
    // Day-of-week → next occurrence (1-7 days ahead, never today).
    const HE_DAYS = {
        'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
    };
    // Handle "ראשון הבא" / "שני הבא" → skip to next week's instance even if today is that day.
    const nextOccurrence = (targetDow, skipCurrent) => {
        const t = new Date();
        const todayDow = t.getDay();
        let delta = (targetDow - todayDow + 7) % 7;
        if (delta === 0)
            delta = skipCurrent ? 7 : 7; // never today
        if (delta < 1 && skipCurrent)
            delta = 7;
        const target = new Date(t);
        target.setUTCDate(target.getUTCDate() + delta);
        return target.toLocaleDateString('en-CA', { timeZone: TZ });
    };
    const dayMatch = dateStr.match(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(\s+הבא)?$/);
    if (/^(היום|today)$/.test(dateStr))
        dateStr = todayY;
    else if (/^(מחר|tomorrow)$/.test(dateStr))
        dateStr = tomorrowY;
    else if (/^(מחרתיים|day[\s-]?after[\s-]?tomorrow)$/.test(dateStr))
        dateStr = dayAfterY;
    else if (dayMatch) {
        dateStr = nextOccurrence(HE_DAYS[dayMatch[1]], true);
    }
    else if (/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/.test(dateStr)) {
        const m = dateStr.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);
        const dd = m[1];
        const mm = m[2];
        let yy = m[3] ? parseInt(m[3]) : today.getFullYear();
        if (yy < 100)
            yy += 2000;
        dateStr = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
        return `❓ לא הצלחתי לפענח את התאריך "${p.shift_date}". נסה "מחר", "ראשון", "רביעי הבא", או YYYY-MM-DD.`;
    // Find employee — fuzzy by full_name
    const emps = await prisma.employee.findMany({ where: { status: 'active' }, take: 500 });
    const lower = search.toLowerCase();
    const matches = emps.filter((e) => String(e.full_name || '').toLowerCase().includes(lower));
    if (!matches.length)
        return `❓ לא מצאתי עובד פעיל בשם "${search}".`;
    if (matches.length > 1)
        return `❓ נמצאו ${matches.length} עובדים: ${matches.slice(0, 5).map((e) => e.full_name).join(', ')}. תוסיף שם משפחה.`;
    const emp = matches[0];
    // Resolve position: explicit if given, else first scheduleable from emp.positions
    // (same logic as AvailabilityRequests handleSingleAssign — keeps the schedule
    // grid able to render the new assignment).
    const SCHEDULE_POSITIONS_LUNCH = ['קופה + אריזות', 'מלצר', 'חומוס', 'טבח', 'מתלמד פלור', 'בלתם'];
    const SCHEDULE_POSITIONS_DINNER = ['מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור', 'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם'];
    const NORMALIZE = {
        'מלצרית': 'מלצר', 'ברמנית': 'ברמן', 'ראנרית': 'ראנר', 'מארחת': 'מארח/ת', 'מארח': 'מארח/ת',
        'מנהלת משמרת': 'מנהל משמרת', 'טבחית': 'טבח', 'שוטפת כלים': 'שוטף כלים',
        'מתלמדת פלור': 'מתלמד פלור', 'מתלמדת מטבח': 'מתלמד מטבח',
        'קופה ואריזות': 'קופה + אריזות', 'קופה +אריזות': 'קופה + אריזות',
    };
    const canon = (s) => NORMALIZE[String(s || '').trim()] || String(s || '').trim();
    const order = p.shift_type === 'lunch' ? SCHEDULE_POSITIONS_LUNCH : SCHEDULE_POSITIONS_DINNER;
    let position = '';
    if (p.position) {
        const c = canon(p.position);
        if (order.includes(c))
            position = c;
    }
    if (!position) {
        const empPositions = (emp.positions || []).map((x) => x?.position_name || x).filter(Boolean);
        for (const pp of empPositions) {
            const c = canon(pp);
            if (order.includes(c)) {
                position = c;
                break;
            }
        }
    }
    if (!position)
        position = 'מלצר';
    // Default times by shift type — same as the UI default
    const times = p.shift_type === 'lunch' ? { start: '12:00', end: '17:00' } : { start: '17:00', end: '23:00' };
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const dayName = dayNames[new Date(`${dateStr}T12:00:00Z`).getDay()];
    return {
        summary: [
            '📅 *לשבץ עובד למשמרת?*',
            `👤 ${emp.full_name}`,
            `🗓 ${dayName} ${dateStr}`,
            `🍽 ${p.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב'} (${times.start}-${times.end})`,
            `🏷 ${position}`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: {
            type: 'shift_assign',
            employee_id: emp.id,
            employee_name: emp.full_name,
            date: dateStr,
            shift_type: p.shift_type,
            position,
            start_time: times.start,
            end_time: times.end,
        },
    };
}
// Parse Hebrew/English relative time expression to an absolute ISO date.
// Accepts: ISO ('2026-06-25T14:00'), HH:MM (today/tomorrow if past),
// "מחר 14:00", "בעוד שעה", "בעוד 30 דקות", "ראשון 09:00".
// Compute Israel's current UTC offset as "+HH:MM" so we can build ISO strings
// that represent a wall-clock Israel time correctly, regardless of server TZ.
// Handles DST automatically via Intl.
function israelOffsetSuffix(forDate = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset',
        }).formatToParts(forDate);
        const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+3';
        const m = tz.match(/GMT([+\-]?\d{1,2})(?::?(\d{2}))?/);
        if (!m)
            return '+03:00';
        const raw = m[1];
        const sign = raw.startsWith('-') ? '-' : '+';
        const hh = String(Math.abs(parseInt(raw, 10))).padStart(2, '0');
        const mm = (m[2] || '00').padStart(2, '0');
        return `${sign}${hh}:${mm}`;
    }
    catch {
        return '+03:00';
    }
}
function israelYmd(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
function israelDow(d = new Date()) {
    // 0=Sun..6=Sat, reading the LOCAL Israeli day, not the server's UTC day.
    const ymd = israelYmd(d);
    // Construct a UTC noon Date so getUTCDay matches the Israeli weekday.
    return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}
// Build a Date representing `${ymd}T${hh}:${mm}:00` AS WALL-CLOCK ISRAEL TIME.
// Uses the actual Israel offset (incl. DST) so the resulting Date.getTime()
// is correct in milliseconds-since-epoch regardless of server timezone.
function dateAtIsraelLocal(ymd, h, m) {
    const probe = new Date(`${ymd}T12:00:00Z`);
    const offset = israelOffsetSuffix(probe);
    return new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${offset}`);
}
function parseRemindAt(raw) {
    if (!raw)
        return null;
    const s = String(raw).trim().toLowerCase();
    // ISO datetime — if no timezone, treat as Israel-local (not UTC).
    const iso = s.match(/^\d{4}-\d{2}-\d{2}[t\s]\d{1,2}:\d{2}(?::\d{2})?/i);
    if (iso) {
        const matched = iso[0].replace(' ', 'T');
        const hasTz = /(Z|[+\-]\d{2}:?\d{2})$/i.test(s);
        if (hasTz) {
            const d = new Date(s);
            if (!isNaN(d.getTime()))
                return d;
        }
        const [datePart, timePart] = matched.split('T');
        const [hh, mm] = timePart.split(':');
        const d = dateAtIsraelLocal(datePart, parseInt(hh), parseInt(mm));
        if (!isNaN(d.getTime()))
            return d;
    }
    // Relative "in N units" — Hebrew + English.
    const relHe = s.match(/בעוד\s*(\d+)?\s*(שניות|שניה|דקות|דק'?|דקה|שעות|שעה|ימים|יום)/);
    const relEn = s.match(/in\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)/);
    if (relHe || relEn) {
        const wordToNum = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
        const m = (relHe || relEn);
        const nRaw = m[1] || '1';
        const n = /^\d+$/.test(nRaw) ? parseInt(nRaw) : (wordToNum[nRaw] || 1);
        const unit = m[2];
        let ms = 60_000;
        if (/שעה|שעות|hour/i.test(unit))
            ms = 3600_000;
        else if (/יום|ימים|day/i.test(unit))
            ms = 86_400_000;
        else if (/שני|sec/i.test(unit))
            ms = 1000;
        return new Date(Date.now() + n * ms);
    }
    // HH:MM with optional date keyword (היום / מחר / מחרתיים / day-of-week).
    // CRITICAL: previously we did `new Date(toLocaleString(...))` + `setHours()`,
    // which on a UTC server produced a Date that was off by Israel's UTC offset
    // (15:30 IL came out as 18:30 IL when displayed). Now we build the ISO
    // string directly with the proper offset suffix so the wall clock is honest.
    const hhmm = s.match(/(\d{1,2}):(\d{2})/);
    if (hhmm) {
        const h = parseInt(hhmm[1]);
        const m = parseInt(hhmm[2]);
        let targetYmd = israelYmd();
        if (/מחר|tomorrow/.test(s)) {
            const t = new Date(`${targetYmd}T12:00:00Z`);
            t.setUTCDate(t.getUTCDate() + 1);
            targetYmd = israelYmd(t);
        }
        else if (/מחרתיים|day\s+after\s+tomorrow/.test(s)) {
            const t = new Date(`${targetYmd}T12:00:00Z`);
            t.setUTCDate(t.getUTCDate() + 2);
            targetYmd = israelYmd(t);
        }
        else {
            const HE_DAYS = {
                'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
                'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
            };
            for (const [name, dow] of Object.entries(HE_DAYS)) {
                if (new RegExp(`(^|\\s|ב[-־]?|יום\\s+)${name}(\\s+הבא|\\s|$)`, 'i').test(s)) {
                    const todayDow = israelDow();
                    let delta = (dow - todayDow + 7) % 7;
                    if (delta === 0)
                        delta = 7; // never today
                    const t = new Date(`${targetYmd}T12:00:00Z`);
                    t.setUTCDate(t.getUTCDate() + delta);
                    targetYmd = israelYmd(t);
                    break;
                }
            }
        }
        let candidate = dateAtIsraelLocal(targetYmd, h, m);
        // Bare HH:MM with no date keyword and the time already passed today → tomorrow.
        if (candidate.getTime() < Date.now() + 60_000 &&
            !/מחר|tomorrow|מחרתיים|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday/i.test(s)) {
            const t = new Date(`${targetYmd}T12:00:00Z`);
            t.setUTCDate(t.getUTCDate() + 1);
            candidate = dateAtIsraelLocal(israelYmd(t), h, m);
        }
        return candidate;
    }
    return null;
}
async function proposeRemindMe(p) {
    if (!p.remind_at)
        return '❓ מתי? לדוגמה: "תזכיר לי מחר ב-14:00 לבדוק את האירוע".';
    if (!p.remind_text)
        return '❓ על מה? לדוגמה: "תזכיר לי ב-14:00 לבדוק את האירוע".';
    const when = parseRemindAt(p.remind_at);
    if (!when)
        return `❓ לא הצלחתי לפענח את הזמן "${p.remind_at}". נסה "מחר 14:00" או "בעוד שעה".`;
    if (when.getTime() <= Date.now())
        return '❓ הזמן שנתת כבר עבר.';
    const whenIso = when.toISOString();
    const whenHe = when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
    return {
        summary: [
            `⏰ *לקבוע תזכורת?*`,
            `🕒 ${whenHe}`,
            `📝 ${p.remind_text}`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'remind_me', deliver_at: whenIso, remind_text: p.remind_text },
    };
}
async function proposeSendContract(p) {
    const search = (p.contract_search || '').trim();
    if (!search)
        return '❓ ציין שם לקוח או מספר חוזה.';
    // First try contract_number exact match.
    let match = await prisma.eventContract.findFirst({
        where: { contract_number: { contains: search, mode: 'insensitive' } },
        orderBy: { id: 'desc' },
    }).catch(() => null);
    if (!match) {
        // Fuzzy by customer_name
        const all = await prisma.eventContract.findMany({
            where: { status: { in: ['draft', 'sent'] } },
            orderBy: { id: 'desc' }, take: 100,
        });
        const lower = search.toLowerCase();
        const matches = all.filter((c) => String(c.customer_name || '').toLowerCase().includes(lower) ||
            String(c.customer_phone || '').includes(search.replace(/\D/g, '')));
        if (matches.length === 0)
            return `❓ לא מצאתי חוזה (draft/sent) שמתאים ל-"${search}".`;
        if (matches.length > 1) {
            return `❓ נמצאו ${matches.length} חוזים — תוסיף מספר חוזה (${matches.slice(0, 5).map((c) => `${c.contract_number} · ${c.customer_name}`).join(' | ')}).`;
        }
        match = matches[0];
    }
    if (!match.customer_phone)
        return `⚠️ לחוזה ${match.contract_number} אין מספר טלפון של לקוח — לא יכול לשלוח.`;
    return {
        summary: [
            `📑 *לשלוח חוזה ללקוח?*`,
            `📄 ${match.contract_number || match.id.slice(-6)}`,
            `👤 ${match.customer_name || '—'}`,
            `📞 ${match.customer_phone}`,
            match.event_date ? `📅 ${match.event_date}` : null,
            match.subtotal_ils ? `💰 ₪${Number(match.subtotal_ils).toLocaleString('he-IL')}` : null,
            '',
            'ענה *כן* לשליחה או *לא* לביטול.',
        ].filter(Boolean).join('\n'),
        exec: {
            type: 'send_contract',
            contract_id: match.id,
            contract_number: match.contract_number,
            customer_name: match.customer_name,
            customer_phone: match.customer_phone,
            public_token: match.public_token,
        },
    };
}
async function proposeEventAdd(p) {
    if (!p.event_title)
        return '❓ מה תיאור האירוע? (לדוגמה: "פגישה עם דביר מחר ב-14:00")';
    if (!p.event_at)
        return '❓ מתי האירוע? (לדוגמה: "מחר 14:00", "ראשון 09:30", "בעוד שעה")';
    const when = parseRemindAt(p.event_at);
    if (!when)
        return `❓ לא הצלחתי לפענח את הזמן "${p.event_at}".`;
    if (when.getTime() <= Date.now())
        return '❓ הזמן שנתת כבר עבר.';
    const lead = p.event_lead_min || 15;
    const whenHe = when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
    return {
        summary: [
            '🗓 *להוסיף אירוע ללוח הזמנים?*',
            `📝 ${p.event_title}`,
            `🕒 ${whenHe}`,
            `⏰ תזכורת ${lead} דקות לפני + ברגע ההתחלה`,
            '',
            'ענה *כן* לשמירה או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'event_add', title: p.event_title, when: when.toISOString(), lead_min: lead },
    };
}
async function proposeEventAddBatch(p) {
    const items = (p.events || []).filter(e => e && e.title && e.when);
    // If extraction failed entirely (LLM returned event_add_batch intent but
    // didn't fill the events array), return null so the webhook router falls
    // through to the conversation agent — it has tools to do this better.
    if (!items.length)
        return null;
    // Parse each "when" → ISO; drop ones that can't be parsed and warn.
    const leadDefault = typeof p.lead_min_default === 'number' ? p.lead_min_default : 15;
    const parsed = [];
    const skipped = [];
    for (const it of items) {
        const when = parseRemindAt(it.when);
        if (!when || isNaN(when.getTime()) || when.getTime() <= Date.now()) {
            skipped.push(`${it.title} (${it.when})`);
            continue;
        }
        parsed.push({
            title: it.title,
            whenIso: when.toISOString(),
            whenHe: when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }),
            lead_min: typeof it.lead_min === 'number' ? it.lead_min : leadDefault,
        });
    }
    if (!parsed.length)
        return `❓ לא הצלחתי לפענח אף אחת מהפגישות:\n${skipped.join('\n')}`;
    const lines = [
        `🗓 *להוסיף ${parsed.length} פגישות ללוח?*`,
        '',
        ...parsed.map((e, i) => `${i + 1}. ${e.whenHe} · ${e.title}  _(תזכורת ${e.lead_min} דק' לפני)_`),
    ];
    if (skipped.length)
        lines.push('', `⚠️ דילגתי: ${skipped.join(', ')} (לא הצלחתי לפענח זמן)`);
    lines.push('', 'ענה *כן* כדי להוסיף את כולן או *לא* לביטול.');
    return { summary: lines.join('\n'), exec: { type: 'event_add_batch', items: parsed } };
}
async function proposeTaskAdd(p) {
    if (!p.task_title)
        return '❓ מה המשימה? (לדוגמה: "להזמין יין")';
    return {
        summary: [
            '✅ *להוסיף משימה לרשימה?*',
            `📌 ${p.task_title}`,
            '',
            'ענה *כן* להוספה או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'task_add', title: p.task_title },
    };
}
async function proposeTaskDone(p) {
    if (!p.task_search)
        return '❓ איזו משימה? (שם או id מהרשימה — שלח "מה היום" לראות אותן)';
    return {
        summary: [
            '✔️ *לסמן משימה כבוצעה?*',
            `📌 "${p.task_search}"`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'task_done', search: p.task_search },
    };
}
async function proposeLeaveRequestDecide(p) {
    const search = (p.leave_employee || '').trim();
    const decision = p.leave_decision;
    if (!search)
        return '❓ ציין שם עובד.';
    if (!decision)
        return '❓ אישור או דחייה?';
    const all = await prisma.leaveRequest.findMany({
        where: { status: 'pending' },
        orderBy: { id: 'desc' }, take: 100,
    }).catch(() => []);
    const lower = search.toLowerCase();
    const matches = all.filter((r) => String(r.employee_name || '').toLowerCase().includes(lower));
    if (!matches.length)
        return `❓ לא מצאתי בקשת חופשה ממתינה ל-"${search}".`;
    if (matches.length > 1)
        return `❓ נמצאו ${matches.length} בקשות — תוסיף עוד פרטים: ${matches.slice(0, 5).map((r) => `${r.employee_name} (${String(r.start_date).slice(0, 10)})`).join(' · ')}`;
    const lr = matches[0];
    const decisionHe = decision === 'approved' ? 'אישור ✅' : 'דחייה ❌';
    return {
        summary: [
            `🏖️ *${decisionHe} בקשת חופשה?*`,
            `👤 ${lr.employee_name}`,
            `📅 ${String(lr.start_date).slice(0, 10)} → ${String(lr.end_date).slice(0, 10)}`,
            lr.leave_type ? `🏷 ${lr.leave_type}` : null,
            lr.reason ? `💬 "${lr.reason}"` : null,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].filter(Boolean).join('\n'),
        exec: { type: 'leave_request_decide', id: lr.id, decision, employee_name: lr.employee_name },
    };
}
async function proposeShiftSwapDecide(p) {
    const search = (p.swap_search || '').trim();
    const decision = p.swap_decision;
    if (!search)
        return '❓ ציין שם עובד או תאריך.';
    if (!decision)
        return '❓ אישור או דחייה?';
    const all = await prisma.shiftSwapRequest.findMany({
        where: { status: 'pending' },
        orderBy: { id: 'desc' }, take: 100,
    }).catch(() => []);
    const lower = search.toLowerCase();
    const matches = all.filter((r) => String(r.requester_name || '').toLowerCase().includes(lower) ||
        String(r.target_name || '').toLowerCase().includes(lower) ||
        String(r.shift_date).slice(0, 10).includes(search));
    if (!matches.length)
        return `❓ לא מצאתי בקשת החלפה ממתינה ל-"${search}".`;
    if (matches.length > 1)
        return `❓ נמצאו ${matches.length} בקשות — תוסיף עוד פרטים.`;
    const sw = matches[0];
    const decisionHe = decision === 'approved' ? 'אישור ✅' : 'דחייה ❌';
    return {
        summary: [
            `🔄 *${decisionHe} החלפת משמרת?*`,
            `👤 מבקש: ${sw.requester_name}`,
            sw.target_name ? `↔️ מחליף עם: ${sw.target_name}` : null,
            `📅 ${String(sw.shift_date).slice(0, 10)} · ${sw.shift_type === 'lunch' ? 'צהריים' : 'ערב'}`,
            sw.position ? `🏷 ${sw.position}` : null,
            sw.message ? `💬 "${sw.message}"` : null,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].filter(Boolean).join('\n'),
        exec: { type: 'shift_swap_decide', id: sw.id, decision, requester_name: sw.requester_name },
    };
}
async function proposeBroadcastMessage(p) {
    const aud = p.broadcast_audience;
    const text = (p.broadcast_message_text || '').trim();
    if (!aud)
        return '❓ למי לשלוח? (מועדון / עובדים / אדמינים)';
    if (!text)
        return '❓ מה התוכן?';
    // Audience count preview
    let count = 0;
    let label = '';
    try {
        if (aud === 'club') {
            const c = await prisma.customer.count({ where: { marketing_consent: true } }).catch(() => 0);
            count = c;
            label = 'לקוחות מועדון (עם הסכמת שיווק)';
        }
        else if (aud === 'employees') {
            const c = await prisma.employee.count({ where: { status: 'active' } }).catch(() => 0);
            count = c;
            label = 'עובדים פעילים';
        }
        else if (aud === 'admins') {
            count = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').filter(Boolean).length;
            label = 'מנהלים (WHATSAPP_ADMIN_NUMBERS)';
        }
    }
    catch { /* best effort */ }
    return {
        summary: [
            `📢 *לשלוח שידור ל-${label}?*`,
            `👥 כמות נמענים: *${count}*`,
            '',
            `💬 ההודעה:`,
            `"${text}"`,
            '',
            `⚠️ זוהי שליחה רחבה — אחרי "כן" אי-אפשר לבטל.`,
            'ענה *כן* לשליחה או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'broadcast_message', audience: aud, text },
    };
}
async function proposeWakeSet(p) {
    const hhmm = (p.wake_hhmm || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(hhmm))
        return '❓ באיזו שעה? (פורמט HH:MM, לדוגמה "07:30")';
    const [h, m] = hhmm.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59)
        return '❓ שעה לא תקינה.';
    const normalized = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return {
        summary: [
            '☀️ *לקבוע שעון מעורר יומי?*',
            `🕒 ${normalized} (כל בוקר, כולל סיכום אירועים + משימות)`,
            '',
            'ענה *כן* לאישור או *לא* לביטול.',
        ].join('\n'),
        exec: { type: 'wake_alarm_set', hhmm: normalized },
    };
}
async function proposeWakeCancel(_p) {
    return {
        summary: '☀️ *לבטל את השעון מעורר היומי?*\n\nענה *כן* לאישור או *לא* לביטול.',
        exec: { type: 'wake_alarm_cancel' },
    };
}
// ─── Executors (run after admin confirms) ───────────────────────────────────
async function executeAction(exec) {
    switch (exec.type) {
        case 'invoice_mark_paid':
            await prisma.invoice.update({
                where: { id: exec.invoice_id },
                data: { payment_status: 'paid' },
            });
            return `✅ חשבונית *${exec.invoice_number}* סומנה כשולמה.`;
        case 'invoice_mark_unpaid':
            await prisma.invoice.update({
                where: { id: exec.invoice_id },
                data: { payment_status: 'unpaid' },
            });
            return `✅ חשבונית *${exec.invoice_number}* הוחזרה ללא-שולמה.`;
        case 'lead_set_stage':
            await prisma.eventLead.update({
                where: { id: exec.lead_id },
                data: { status: exec.stage, updated_date: new Date().toISOString() },
            });
            return `✅ הליד של *${exec.lead_name}* עודכן ל-${exec.stage}.`;
        case 'shift_assign': {
            // Mirror the AvailabilityRequests.handleSingleAssign flow: list recent
            // shifts client-side and filter by sliced YMD; create if missing.
            const all = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
            let shift = all.find((s) => {
                const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
                return d === exec.date && s.shift_type === exec.shift_type;
            });
            if (!shift) {
                shift = await prisma.workShift.create({
                    data: {
                        date: new Date(`${exec.date}T00:00:00.000Z`),
                        shift_type: exec.shift_type,
                        start_time: exec.start_time,
                        end_time: exec.end_time,
                        assigned_staff: [],
                    },
                });
            }
            const currentStaff = shift.assigned_staff || [];
            if (currentStaff.some((s) => s.employee_id === exec.employee_id)) {
                return `ℹ️ ${exec.employee_name} כבר משובץ למשמרת הזו.`;
            }
            const newStaff = [...currentStaff, {
                    employee_id: exec.employee_id,
                    employee_name: exec.employee_name,
                    position: exec.position,
                    start_time: exec.start_time,
                    end_time: exec.end_time,
                }];
            await prisma.workShift.update({ where: { id: shift.id }, data: { assigned_staff: newStaff } });
            return `✅ ${exec.employee_name} שובץ כ-${exec.position} ל-${exec.shift_type === 'lunch' ? 'צהריים' : 'ערב'} ${exec.date}.`;
        }
        case 'send_contract': {
            const publicUrl = `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/EventContractSign?token=${exec.public_token}`;
            const msg = [
                `שלום ${exec.customer_name || ''} 🌿`,
                '',
                `מצורף החוזה הדיגיטלי לאירוע שלך — חוזה מס' ${exec.contract_number || ''}.`,
                `אפשר לעיין ולחתום ישירות מהטלפון:`,
                publicUrl,
                '',
                '_נא לחתום עד 48 שעות לפני האירוע._',
                '',
                'תודה,',
                `${(await (await import('./brandName.js')).getBrandName())} אירועים 🔥`,
            ].join('\n');
            // Event contract with a signing deadline: high value, low volume. Sent
            // free-form (in-window) with a guaranteed SMS so a customer who has not
            // messaged still receives the signing link. A dedicated contract template
            // is a future refinement — a duplicate on a once-a-week booking beats a
            // lost signature.
            await sendWhatsApp(exec.customer_phone, msg).catch(() => { });
            await sendSms(exec.customer_phone, msg).catch(() => { });
            // Mark the contract status as 'sent' so the EventContracts UI shows it.
            await prisma.eventContract.update({
                where: { id: exec.contract_id },
                data: { status: 'sent', sent_at: new Date(), sent_via: 'whatsapp_agent' },
            }).catch(() => { });
            return `✅ החוזה ${exec.contract_number} נשלח ל-${exec.customer_name} (${exec.customer_phone}).`;
        }
        case 'event_add': {
            const when = new Date(exec.when);
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            await addScheduledEvent({ fromPhone: target, title: exec.title, when, lead_min: exec.lead_min });
            const whenHe = when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
            // Mirror to Google Calendar if connected. Best-effort — never fails the local save.
            let gSuffix = '';
            if (await isGoogleConnected(target)) {
                const g = await createCalendarEvent(target, { title: exec.title, whenIso: exec.when });
                gSuffix = g.ok ? '  ✓ סונכרן ל-Google Calendar' : `  ⚠️ Google: ${g.error}`;
            }
            return `✅ נוסף ללוח: "${exec.title}" — ${whenHe}.${gSuffix}`;
        }
        case 'event_add_batch': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            const items = exec.items || [];
            const googleConnected = await isGoogleConnected(target);
            const lines = [`✅ *${items.length} פגישות נוספו ללוח*`, ''];
            let gOk = 0, gFail = 0;
            for (const it of items) {
                const when = new Date(it.whenIso);
                await addScheduledEvent({ fromPhone: target, title: it.title, when, lead_min: it.lead_min });
                if (googleConnected) {
                    const g = await createCalendarEvent(target, { title: it.title, whenIso: it.whenIso });
                    if (g.ok)
                        gOk++;
                    else
                        gFail++;
                }
                lines.push(`• ${it.whenHe} · ${it.title}`);
            }
            if (googleConnected) {
                lines.push('', gFail === 0 ? `✓ ${gOk} סונכרנו ל-Google Calendar` : `✓ ${gOk} סונכרנו · ⚠️ ${gFail} נכשלו ב-Google`);
            }
            return lines.join('\n');
        }
        case 'task_add': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            await addTask(target, exec.title);
            // Mirror to Google Tasks
            let gSuffix = '';
            if (await isGoogleConnected(target)) {
                const g = await createTasksItem(target, { title: exec.title });
                gSuffix = g.ok ? '  ✓ סונכרן ל-Google Tasks' : `  ⚠️ Google: ${g.error}`;
            }
            return `✅ נרשם: "${exec.title}".${gSuffix}`;
        }
        case 'task_add_batch': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            const titles = exec.titles || [];
            const googleConnected = await isGoogleConnected(target);
            let gOk = 0, gFail = 0;
            for (const t of titles) {
                await addTask(target, t);
                if (googleConnected) {
                    const g = await createTasksItem(target, { title: t });
                    if (g.ok)
                        gOk++;
                    else
                        gFail++;
                }
            }
            const lines = [`✅ *${titles.length} משימות נוספו לרשימה*`, '', ...titles.map(t => `• ${t}`)];
            if (googleConnected)
                lines.push('', gFail === 0 ? `✓ ${gOk} סונכרנו ל-Google Tasks` : `✓ ${gOk} · ⚠️ ${gFail} נכשלו`);
            return lines.join('\n');
        }
        case 'task_done': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            const r = await completeTaskByMatch(target, exec.search);
            if (r.matched === 0)
                return `❓ לא מצאתי משימה פתוחה שמתאימה ל-"${exec.search}". שלח "מה היום" לראות.`;
            if (r.matched > 1)
                return `❓ נמצאו ${r.matched} משימות שמתאימות. הוסף את ה-id (6 תווים אחרונים).`;
            return `✔️ סומן כבוצע: "${r.title}".`;
        }
        case 'wake_alarm_set': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            await setWakeAlarm(target, exec.hhmm);
            return `☀️ שעון מעורר נקבע ל-${exec.hhmm} כל יום.`;
        }
        case 'wake_alarm_cancel': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            const n = await cancelWakeAlarm(target);
            return n > 0 ? '☀️ השעון מעורר בוטל.' : 'ℹ️ לא היה שעון מעורר פעיל.';
        }
        case 'leave_request_decide': {
            await prisma.leaveRequest.update({
                where: { id: exec.id },
                data: { status: exec.decision, updated_date: new Date().toISOString() },
            });
            const word = exec.decision === 'approved' ? 'אושרה' : 'נדחתה';
            return `✅ בקשת החופשה של *${exec.employee_name}* ${word}.`;
        }
        case 'shift_swap_decide': {
            await prisma.shiftSwapRequest.update({
                where: { id: exec.id },
                data: { status: exec.decision, updated_date: new Date().toISOString() },
            });
            const word = exec.decision === 'approved' ? 'אושרה' : 'נדחתה';
            return `✅ בקשת ההחלפה של *${exec.requester_name}* ${word}.`;
        }
        // ═══ Owner-agent action pack (10 capabilities) ═══
        case 'create_reservation': {
            // Mirror createPublicReservation (load.ts:7864): date = midnight-UTC of the
            // day, time raw "HH:mm", confirmed status.
            const bookingDate = new Date(`${exec.date}T00:00:00.000Z`);
            await prisma.reservation.create({
                data: {
                    customer_name: exec.customer_name,
                    customer_phone: exec.customer_phone || null,
                    date: bookingDate,
                    time: exec.time,
                    party_size: exec.party_size,
                    status: 'confirmed',
                    is_standby: false,
                    reservation_end_time: exec.reservation_end_time || null,
                    special_requests: exec.special_requests || null,
                    source: exec.source || 'whatsapp',
                },
            });
            return `✅ נשמרה הזמנה ל-*${exec.customer_name}* · ${exec.party_size} סועדים · ${exec.date} ${exec.time}${exec.customer_phone ? ` · ${exec.customer_phone}` : ''}.`;
        }
        case 'cancel_reservation': {
            // Mirror cancelReservationByToken (load.ts:17315).
            await prisma.reservation.update({
                where: { id: exec.reservation_id },
                data: {
                    status: 'cancelled',
                    cancelled_at: new Date(),
                    cancellation_reason: exec.reason || 'בוטל ע״י המנהל ב-WhatsApp',
                },
            });
            return `✅ ההזמנה של *${exec.customer_name || ''}* (${exec.date || ''} ${exec.time || ''}) בוטלה.`;
        }
        case 'lock_tips': {
            // Mirror the Tips.jsx lock write (status/locked_by/locked_at), scoped to the
            // UTC day (+ optional shift_type); skips reports already locked.
            const day0 = new Date(`${exec.date}T00:00:00.000Z`);
            const day1 = new Date(`${exec.date}T23:59:59.999Z`);
            const res = await prisma.tipReport.updateMany({
                where: {
                    date: { gte: day0, lte: day1 },
                    ...(exec.shift_type ? { shift_type: exec.shift_type } : {}),
                    NOT: { status: 'locked' },
                },
                data: { status: 'locked', locked_by: exec.locked_by || 'whatsapp', locked_at: new Date() },
            });
            const shiftHe = exec.shift_type ? ` (${exec.shift_type === 'lunch' ? 'צהריים' : 'ערב'})` : '';
            return `✅ הטיפים של ${exec.date}${shiftHe} ננעלו (${res?.count ?? 0} דו"ח).`;
        }
        case 'mark_supplier_ordered': {
            // Mirror markSupplierOrdered (load.ts:6592).
            await prisma.$executeRawUnsafe(`UPDATE "SupplierOrderList" SET "last_ordered_at"=NOW(), "updatedAt"=NOW() WHERE id=$1`, exec.supplier_id);
            return `✅ סימנתי שהזמנת מ-*${exec.supplier_name}*. לא אשלח תזכורת ליומיים הקרובים.`;
        }
        case 'open_incident': {
            const inc = await prisma.incident.create({
                data: {
                    incident_number: `WA-${Date.now()}`,
                    title: exec.title,
                    description: exec.description,
                    category: exec.category || 'maintenance', // REQUIRED col — must be set on raw create
                    severity: exec.severity || 'medium',
                    status: 'open',
                    visibility_level: 'managers_and_employees',
                    reported_by: exec.reported_by || 'מנהל (WhatsApp)',
                    incident_date: new Date(),
                },
            });
            return `🔧 נפתחה תקלה *${exec.title}* (חומרה ${exec.severity}). מס' ${inc.incident_number}.`;
        }
        case 'resolve_incident':
            // Mirror clearAllIncidents (load.ts:6329).
            await prisma.incident.update({
                where: { id: exec.incident_id },
                data: { status: 'resolved', resolution_date: new Date() },
            });
            return `✅ התקלה *${exec.incident_title || ''}* סומנה כטופלה.`;
        case 'mark_expense_paid':
            // Mirror markCashFlowEntryPaid (load.ts:11266).
            await prisma.$executeRawUnsafe(`UPDATE "CashFlowEntry" SET status = 'paid', paid_at = NOW(), "updatedAt" = NOW() WHERE id = $1`, exec.entry_id);
            return `💸 ההוצאה *${exec.expense_label || ''}*${exec.amount ? ` (₪${exec.amount})` : ''} סומנה כשולמה.`;
        case 'set_dish_price': {
            // Mirror updateRecipeSalePrice (load.ts:11112).
            await prisma.$executeRawUnsafe(`UPDATE "Recipe" SET sale_price = $1, "updatedAt" = NOW() WHERE id = $2`, exec.sale_price, exec.recipe_id);
            // Best-effort food-cost% ripple — helper isn't exported from load.ts, so skip silently.
            try {
                const mod = await import('../functions/load.js');
                if (typeof mod.recomputeAllRecipeCosts === 'function')
                    await mod.recomputeAllRecipeCosts();
            }
            catch { /* recompute helper unavailable — sale_price still saved */ }
            return `🍽️ מחיר המנה *${exec.recipe_name}* עודכן ל-₪${exec.sale_price}.`;
        }
        case 'team_broadcast': {
            // Personal 1:1 WhatsApp (+push backup) to every resolved recipient — the
            // official API has no group support, and personal beats group anyway.
            const { sendTeamBroadcast } = await import('./teamNudges.js');
            const r = await sendTeamBroadcast(String(exec.message || ''), String(exec.audience || 'all'), exec.department ? String(exec.department) : undefined);
            const names = r.names.slice(0, 10).join(', ');
            return `📢 ההודעה נשלחה אישית ל-${r.sent}/${r.total} עובדים.\n${names}${r.total > 10 ? ` ועוד ${r.total - 10}` : ''}${r.sent < r.total ? `\n⚠️ ${r.total - r.sent} לא נשלחו בוואטסאפ (כנראה בלי שיחה פתוחה מול הסוכן) — קיבלו התראת אפליקציה.` : ''}`;
        }
        case 'invite_employee': {
            // Mirror inviteEmployeeViaWhatsApp (load.ts:23268): token + PendingInvitation
            // row + WhatsApp link to /EmployeeComplete.
            const { randomUUID } = await import('node:crypto');
            const brand = (await (await import('./brandName.js')).getBrandName());
            const fullName = exec.full_name;
            const empPhone = exec.phone;
            const token = randomUUID().replace(/-/g, '').slice(0, 24);
            try {
                await prisma.pendingInvitation.create({ data: { token, full_name: fullName, phone: empPhone, status: 'sent' } });
            }
            catch {
                await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "PendingInvitation" (
            "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "token" TEXT NOT NULL UNIQUE,
            "full_name" TEXT NOT NULL,
            "phone" TEXT NOT NULL,
            "email" TEXT,
            "role" TEXT,
            "status" TEXT NOT NULL DEFAULT 'sent',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "completed_at" TIMESTAMP(3)
          );
        `);
                await prisma.pendingInvitation.create({ data: { token, full_name: fullName, phone: empPhone, status: 'sent' } });
            }
            const origin = process.env.PUBLIC_BASE_URL || `https://${process.env.TENANT_SLUG || 'topalena'}.topalena.com`;
            const link = `${origin}/EmployeeComplete?t=${token}`;
            const msg = `שלום ${fullName} 🌿\nהוזמנת להצטרף לצוות ${brand}.\nכדי להשלים את הפרטים (תפקיד, מייל) — לחץ כאן:\n${link}\n\nזה ייקח דקה 🚀`;
            // A brand-new employee — first contact, so free-form could never reach
            // them. Dedicated invite template with SMS fallback.
            await sendTemplated({
                kind: 'employee_invite', to: empPhone,
                vars: [fullName, brand, link],
                freeformText: msg, smsText: msg, smsFallback: true,
            });
            return `✅ הזמנה נשלחה ל-*${fullName}* (${empPhone}). כשישלים פרטים הוא יופיע ב"ניהול עובדים".`;
        }
        case 'remove_from_shift': {
            // Reverse of shift_assign — mirror the repo's own unassign filter.
            const all = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
            const shift = all.find((s) => {
                const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
                return d === exec.date && s.shift_type === exec.shift_type;
            });
            const he = exec.shift_type === 'lunch' ? 'צהריים' : 'ערב';
            if (!shift)
                return `ℹ️ לא נמצאה משמרת ${he} בתאריך ${exec.date}.`;
            const current = shift.assigned_staff || [];
            if (!current.some((a) => a.employee_id === exec.employee_id)) {
                return `ℹ️ ${exec.employee_name} כבר לא משובץ למשמרת הזו.`;
            }
            const newStaff = current.filter((a) => a.employee_id !== exec.employee_id);
            await prisma.workShift.update({ where: { id: shift.id }, data: { assigned_staff: newStaff } });
            return `✅ ${exec.employee_name} הוסר מ${he} ${exec.date}.`;
        }
        case 'publish_schedule': {
            // No "publish finalized schedule" concept exists — message each next-week
            // assigned employee their shifts. getNextWeekDates() isn't exported.
            const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            const ilDay = dayMap[new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(new Date())] ?? 0;
            const daysUntilNextSunday = ilDay === 0 ? 7 : 7 - ilDay;
            const weekSet = new Set();
            for (let i = 0; i < 7; i++) {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() + daysUntilNextSunday + i);
                weekSet.add(d.toISOString().slice(0, 10));
            }
            const all = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
            const byEmp = new Map();
            for (const s of all) {
                const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
                if (!weekSet.has(d))
                    continue;
                for (const a of (s.assigned_staff || [])) {
                    if (!a?.employee_id)
                        continue;
                    if (!byEmp.has(a.employee_id))
                        byEmp.set(a.employee_id, { name: a.employee_name, lines: [] });
                    byEmp.get(a.employee_id).lines.push({ date: d, shift_type: s.shift_type, start: a.start_time, end: a.end_time, position: a.position });
                }
            }
            if (!byEmp.size)
                return 'ℹ️ אין משמרות משובצות לשבוע הבא. בנה את הסידור קודם.';
            const emps = await prisma.employee.findMany({ where: { status: 'active' }, take: 500 });
            const phoneById = new Map(emps.filter((e) => e.phone).map((e) => [e.id, e.phone]));
            const dh = (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
            let sent = 0, noPhone = 0;
            for (const [empId, info] of byEmp) {
                const p = phoneById.get(empId);
                if (!p) {
                    noPhone++;
                    continue;
                }
                info.lines.sort((a, b) => a.date.localeCompare(b.date));
                const body = info.lines.map((l) => `• ${dh(l.date)} · ${l.shift_type === 'lunch' ? 'צהריים' : 'ערב'} · ${l.start}-${l.end}${l.position ? ` · ${l.position}` : ''}`).join('\n');
                const msg = `היי ${info.name}, הסידור לשבוע הבא פורסם. המשמרות שלך:\n\n${body}\n\nבהצלחה!`;
                try {
                    const first = String(info.name || '').trim().split(' ')[0];
                    const r = await notifyStaff(p, first, msg, { link: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/WorkScheduling` });
                    if (r.sent)
                        sent++;
                }
                catch (e) {
                    console.warn('[publish_schedule] failed', p, e?.message);
                }
            }
            return `📢 הסידור פורסם — נשלח ל-*${sent}* עובדים${noPhone ? ` (${noPhone} ללא טלפון על הכרטיס)` : ''}.`;
        }
        case 'approve_event': {
            // Core status change from approveEventBooking (load.ts:11881). Omits the
            // Reservation-create + payment_status side-effects + customer notice trigger.
            const booking = await prisma.eventBooking.findUnique({ where: { id: exec.booking_id } });
            if (!booking)
                return '❌ ההזמנה לא נמצאה (אולי נמחקה).';
            if (booking.approval_status === 'approved')
                return `ℹ️ האירוע של ${booking.customer_name || 'הלקוח'} כבר אושר.`;
            await prisma.eventBooking.update({
                where: { id: exec.booking_id },
                data: { approval_status: 'approved', status: 'confirmed', updated_date: new Date().toISOString() },
            });
            return `✅ אירוע של *${exec.customer_name || booking.customer_name || 'לקוח'}* (${booking.event_date}${booking.guest_count ? ` · ${booking.guest_count} סועדים` : ''}) אושר.`;
        }
        case 'employee_shifts_batch': {
            const target = exec.target_phone || exec.from_phone || '';
            if (!target)
                throw new Error('missing target phone');
            const fresh = exec.fresh || [];
            const conflicts = exec.conflicts || [];
            const empId = exec.employee_id;
            const empName = exec.employee_name;
            const itemsToWrite = [...fresh, ...(exec.replace_conflicts ? conflicts : [])];
            const skipped = exec.skip_conflicts ? conflicts.length : 0;
            // Fetch shifts wide so we can find/update existing WorkShift rows.
            const allShifts = await prisma.workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
            let added = 0, replaced = 0;
            // Position fallback: use the employee's first position or 'מלצר'.
            const empRow = await prisma.employee.findUnique({ where: { id: empId } }).catch(() => null);
            const positions = (empRow?.positions || []).map((p) => p?.position_name || p).filter(Boolean);
            const fallbackPos = (exec.explicit_position && String(exec.explicit_position).trim()) || positions[0] || 'מלצר';
            for (const e of itemsToWrite) {
                let shift = allShifts.find((s) => {
                    const sd = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
                    return sd === e.date && s.shift_type === e.shift_type;
                });
                if (!shift) {
                    shift = await prisma.workShift.create({
                        data: {
                            date: new Date(`${e.date}T00:00:00.000Z`),
                            shift_type: e.shift_type,
                            start_time: e.start,
                            end_time: e.end,
                            assigned_staff: [],
                        },
                    });
                }
                const wasAssigned = (shift.assigned_staff || []).some((a) => a.employee_id === empId);
                const prevEntry = (shift.assigned_staff || []).find((a) => a.employee_id === empId) || {};
                const existingStaff = (shift.assigned_staff || []).filter((a) => a.employee_id !== empId);
                const newStaff = [...existingStaff, {
                        ...prevEntry,
                        employee_id: empId,
                        employee_name: empName,
                        position: fallbackPos,
                        start_time: e.start,
                        end_time: e.end,
                        status: prevEntry.status || 'scheduled',
                        // manual_entry=true keeps past shifts visible in the report even
                        // without a matching time-clock entry (no-show filter bypass).
                        manual_entry: true,
                    }];
                await prisma.workShift.update({ where: { id: shift.id }, data: { assigned_staff: newStaff } });
                if (wasAssigned)
                    replaced++;
                else
                    added++;
            }
            const TIP_POSITIONS = ['מלצר', 'ברמן', 'ראנר'];
            const isTipRole = TIP_POSITIONS.includes(fallbackPos);
            const tab = isTipRole ? 'טאב *טיפים*' : 'טאב *שעות עבודה (סידור)*';
            const lines = [`✅ *${empName}*: ${added} משמרות נוספו`];
            if (replaced)
                lines.push(`🔁 ${replaced} משמרות הוחלפו`);
            if (skipped)
                lines.push(`⏭ ${skipped} משמרות נדלגו (קיימות לא שונו)`);
            lines.push('', `📊 לראיה: דוח עובדים → ${empName} → ${tab} (תפקיד: ${fallbackPos}).`);
            return lines.join('\n');
        }
        case 'broadcast_message': {
            let recipients = [];
            if (exec.audience === 'admins') {
                const list = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
                recipients = list.map((p) => ({ phone: p }));
            }
            else if (exec.audience === 'employees') {
                const emps = await prisma.employee.findMany({ where: { status: 'active' }, take: 500 });
                recipients = emps.filter((e) => e.phone).map((e) => ({ phone: e.phone, name: e.full_name }));
            }
            else if (exec.audience === 'club') {
                const customers = await prisma.customer.findMany({
                    where: { marketing_consent: true },
                    take: 5000,
                });
                recipients = customers.filter((c) => c.phone).map((c) => ({ phone: c.phone, name: c.name }));
            }
            if (!recipients.length)
                return '⚠️ לא נמצאו נמענים.';
            // Fire-and-forget bulk send. Don't await all serially; do in a batch of 10.
            let sent = 0, failed = 0;
            const batch = 10;
            for (let i = 0; i < recipients.length; i += batch) {
                const chunk = recipients.slice(i, i + batch);
                const results = await Promise.allSettled(chunk.map(async (r) => {
                    const personal = r.name ? exec.text.replace(/\{name\}/g, r.name) : exec.text;
                    // A deliberate broadcast to a chosen audience — reaches people who did
                    // not just message us, so template with SMS fallback rather than
                    // free-form that would drop out of window.
                    const first = String(r.name || '').trim().split(' ')[0];
                    await sendClubMessage(r.phone, first, personal);
                }));
                for (const res of results)
                    res.status === 'fulfilled' ? sent++ : failed++;
            }
            return `📢 שידור הסתיים — נשלח ל-*${sent}* נמענים${failed ? ` (${failed} כשלון)` : ''}.`;
        }
        case 'remind_me': {
            // Reminder lives as a WhatsAppMessage row (no schema migration).
            // status='scheduled_reminder', raw.deliver_at + raw.remind_text + raw.target_phone.
            // The /api/cron/dispatch-reminders endpoint scans and sends these.
            await prisma.whatsAppMessage.create({
                data: {
                    twilio_sid: null,
                    direction: 'outbound',
                    from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
                    to_phone: exec.target_phone || 'self',
                    contact_phone: exec.target_phone || 'self',
                    body: `⏰ תזכורת: ${exec.remind_text}`,
                    num_media: 0,
                    status: 'scheduled_reminder',
                    raw: {
                        deliver_at: exec.deliver_at,
                        remind_text: exec.remind_text,
                        target_phone: exec.target_phone,
                    },
                    is_read: false,
                },
            });
            const dt = new Date(exec.deliver_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
            return `✅ תזכורת נקבעה ל-${dt}: "${exec.remind_text}".`;
        }
        default:
            throw new Error(`unknown_exec_type: ${exec.type}`);
    }
}
// ─── Public surface — used by webhook ──────────────────────────────────────
// Merge any pending half-finished intent (stored as status='pending_clarification')
// with the current message. Lets multi-turn flows like:
//   user: "שבץ עדן ערב"     → bot: "באיזה תאריך?"
//   user: "מחר"             → bot: now has employee+shift+date
// We stash the partial intent on a WhatsAppMessage outbound row (same trick
// we use for invoice drafts), and on the next message the prior intent is
// merged with whatever new fields the LLM extracts.
async function loadPendingClarification(fromPhone) {
    const since = new Date(Date.now() - 3 * 60 * 1000); // 3-minute window — short, intent
    const row = await prisma.whatsAppMessage.findFirst({
        where: {
            direction: 'outbound', contact_phone: fromPhone,
            status: 'pending_clarification', is_read: false,
            created_at: { gte: since },
        },
        orderBy: { id: 'desc' },
    }).catch(() => null);
    if (!row)
        return null;
    const partial = row.raw?.partial_intent;
    if (!partial)
        return null;
    return { id: row.id, partial };
}
async function stashPendingClarification(fromPhone, partial, askText) {
    await prisma.whatsAppMessage.create({
        data: {
            twilio_sid: null, direction: 'outbound',
            from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
            to_phone: fromPhone, contact_phone: fromPhone,
            body: askText, num_media: 0,
            status: 'pending_clarification',
            raw: { partial_intent: partial },
            is_read: false,
        },
    }).catch(() => { });
}
async function consumePendingClarification(id) {
    await prisma.whatsAppMessage.update({
        where: { id }, data: { is_read: true, status: 'clarification_resolved' },
    }).catch(() => { });
}
// Try to classify the inbound text as a write-action intent. Returns:
//   • string — reply text to send back (proposal awaiting confirmation, OR
//     a question, OR an info/error message)
//   • null — message wasn't a write action, fall through to the read router
//
// On success path we ALSO store the exec payload on the same outbound row
// so tryConfirmPendingAction can find it on the next admin message.
export async function tryProposeAction(fromPhone, body) {
    // Check for a pending clarification first — if the user is answering a
    // follow-up question, merge the new field(s) into the saved partial intent.
    const pending = await loadPendingClarification(fromPhone);
    let intent;
    if (pending) {
        // Treat the answer as either a single field value (e.g. "מחר" answering
        // "באיזה תאריך?") or a fully-formed restatement. Try LLM first; if it
        // returns noop or low-confidence, use the message as a raw field value
        // based on what the previous turn was missing.
        const reclassified = await classifyIntent(body);
        if (reclassified && reclassified.intent === pending.partial.intent) {
            // Merge: new non-empty fields win over the partial.
            intent = { ...pending.partial };
            for (const k of Object.keys(reclassified)) {
                const v = reclassified[k];
                if (v !== undefined && v !== null && v !== '')
                    intent[k] = v;
            }
        }
        else {
            // The LLM didn't recognize it as the same intent — assume it's a single
            // field fill-in. Heuristically slot into the first missing required field.
            intent = { ...pending.partial };
            const trimmed = body.trim();
            if (intent.intent === 'shift_assign') {
                if (!intent.shift_date)
                    intent.shift_date = trimmed;
                else if (!intent.shift_type) {
                    if (/צהר/i.test(trimmed))
                        intent.shift_type = 'lunch';
                    else if (/ערב|לילה/i.test(trimmed))
                        intent.shift_type = 'dinner';
                }
                else if (!intent.employee_search)
                    intent.employee_search = trimmed;
                else if (!intent.position)
                    intent.position = trimmed;
            }
            else if (intent.intent === 'lead_set_stage') {
                if (!intent.lead_stage) {
                    const STAGE_MAP = {
                        'pending': 'pending', 'מחכה': 'pending', 'לטלפון': 'pending',
                        'contacted': 'contacted', 'דיברתי': 'contacted', 'התקשרתי': 'contacted',
                        'quoted': 'quoted', 'הצעה': 'quoted', 'הצעת מחיר': 'quoted',
                        'won': 'won', 'נסגר': 'won', 'אישור': 'won',
                        'lost': 'lost', 'בוטל': 'lost', 'לא רלוונטי': 'lost',
                    };
                    for (const [k, v] of Object.entries(STAGE_MAP)) {
                        if (trimmed.includes(k)) {
                            intent.lead_stage = v;
                            break;
                        }
                    }
                }
                else if (!intent.lead_search)
                    intent.lead_search = trimmed;
            }
            else if (intent.intent === 'invoice_mark_paid' || intent.intent === 'invoice_mark_unpaid') {
                if (!intent.invoice_number && /\d/.test(trimmed))
                    intent.invoice_number = trimmed.match(/\d+/)?.[0];
            }
            else if (intent.intent === 'remind_me') {
                if (!intent.remind_at)
                    intent.remind_at = trimmed;
                else if (!intent.remind_text)
                    intent.remind_text = trimmed;
            }
            else if (intent.intent === 'event_add') {
                if (!intent.event_at)
                    intent.event_at = trimmed;
                else if (!intent.event_title)
                    intent.event_title = trimmed;
            }
        }
        await consumePendingClarification(pending.id);
    }
    else {
        intent = await classifyIntent(body);
        if (!intent)
            return null;
    }
    let proposal;
    switch (intent.intent) {
        case 'invoice_mark_paid':
            proposal = await proposeInvoiceMarkPaid(intent);
            break;
        case 'invoice_mark_unpaid':
            proposal = await proposeInvoiceMarkUnpaid(intent);
            break;
        case 'lead_set_stage':
            proposal = await proposeLeadSetStage(intent);
            break;
        case 'shift_assign':
            proposal = await proposeShiftAssign(intent);
            break;
        case 'remind_me':
            proposal = await proposeRemindMe(intent);
            break;
        case 'send_contract':
            proposal = await proposeSendContract(intent);
            break;
        case 'event_add':
            proposal = await proposeEventAdd(intent);
            break;
        case 'event_add_batch': {
            const r = await proposeEventAddBatch(intent);
            if (r === null)
                return null; // fall through to conversation agent for richer parsing
            proposal = r;
            break;
        }
        case 'task_add':
            proposal = await proposeTaskAdd(intent);
            break;
        case 'task_done':
            proposal = await proposeTaskDone(intent);
            break;
        case 'wake_alarm_set':
            proposal = await proposeWakeSet(intent);
            break;
        case 'wake_alarm_cancel':
            proposal = await proposeWakeCancel(intent);
            break;
        case 'leave_request_decide':
            proposal = await proposeLeaveRequestDecide(intent);
            break;
        case 'shift_swap_decide':
            proposal = await proposeShiftSwapDecide(intent);
            break;
        case 'broadcast_message':
            proposal = await proposeBroadcastMessage(intent);
            break;
        default: return null;
    }
    if (typeof proposal === 'string') {
        // If the proposal is a clarifying question (starts with ❓), stash the
        // partial intent so the next message can complete it.
        if (proposal.startsWith('❓') && intent) {
            await stashPendingClarification(fromPhone, intent, proposal);
        }
        return proposal;
    }
    // Pin the requesting admin's phone on any exec that delivers a message back
    // to them (reminders, events, tasks, wake alarms) so it doesn't drop into 'self'.
    const NEEDS_TARGET = new Set(['remind_me', 'event_add', 'task_add', 'task_done', 'wake_alarm_set', 'wake_alarm_cancel']);
    if (proposal.exec?.type && NEEDS_TARGET.has(proposal.exec.type) && !proposal.exec.target_phone) {
        proposal.exec.target_phone = fromPhone;
    }
    // Stash the exec payload so confirmation handler can run it.
    await prisma.whatsAppMessage.create({
        data: {
            twilio_sid: null,
            direction: 'outbound',
            from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
            to_phone: fromPhone,
            contact_phone: fromPhone,
            body: proposal.summary,
            num_media: 0,
            status: 'pending_action_confirmation',
            raw: { pending_action: proposal.exec },
            is_read: false,
        },
    }).catch(() => { });
    return proposal.summary;
}
// Mirror of the invoice-confirm handler but for arbitrary actions. Returns
// reply text if it handled the message, null otherwise.
export async function tryConfirmPendingAction(fromPhone, body) {
    const trimmed = (body || '').trim();
    // STRICT match — anything else (incl. "לא 15:00") falls through to the
    // conversation agent, which has the pending exec in its context and can
    // decide if it's a correction or unrelated.
    const isApprove = /^(כן|אישור|אשר|מאשר|מאשרת|ok|yes)\s*[.!]?$/i.test(trimmed);
    const isCancel = /^(לא|ביטול|בטל|בטלי|no|cancel)\s*[.!]?$/i.test(trimmed);
    // Two special verbs only meaningful for employee_shifts_batch.
    const isReplace = /^(החלף|להחליף|replace)\s*[.!]?$/i.test(trimmed);
    const isSkip = /^(דלג|לדלג|skip)\s*[.!]?$/i.test(trimmed);
    if (!isApprove && !isCancel && !isReplace && !isSkip)
        return null;
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const pending = await prisma.whatsAppMessage.findFirst({
        where: {
            direction: 'outbound',
            contact_phone: fromPhone,
            status: 'pending_action_confirmation',
            is_read: false,
            created_at: { gte: since },
        },
        orderBy: { id: 'desc' },
    }).catch(() => null);
    if (!pending)
        return null;
    const exec = pending.raw?.pending_action;
    if (!exec)
        return null;
    await prisma.whatsAppMessage.update({ where: { id: pending.id }, data: { is_read: true } }).catch(() => { });
    if (isCancel)
        return '✋ ביטלתי. לא ביצעתי שום פעולה.';
    // For shift batches the verb determines conflict handling.
    if (exec.type === 'employee_shifts_batch') {
        if (isApprove && (exec.conflicts || []).length > 0) {
            return '⚠️ יש קונפליקטים — ענה *"החלף"* (לדרוס את הקיימות) או *"דלג"* (להוסיף רק חדשות).';
        }
        exec.replace_conflicts = isReplace;
        exec.skip_conflicts = isSkip || (isApprove && (exec.conflicts || []).length === 0);
    }
    else {
        // Replace/skip make sense ONLY for shift batches — for other actions, treat as cancel-then-resend.
        if (isReplace || isSkip) {
            return '🤔 "החלף" / "דלג" שמורות רק לשעות עובד. ענה *כן* או *לא*.';
        }
    }
    try {
        return await executeAction(exec);
    }
    catch (e) {
        return `❌ ביצוע נכשל: ${e?.message || 'unknown'}`;
    }
}
//# sourceMappingURL=whatsappActions.js.map