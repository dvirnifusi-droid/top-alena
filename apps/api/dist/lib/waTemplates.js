// WhatsApp templates — the way out of both problems at once.
//
// Two facts drove this, both measured from the account rather than assumed:
//
//   SMS costs $1.35 a message on average here. Hebrew encodes at 70 characters
//   per segment, so a 587-character message billed as nine segments — $2.32 for
//   one text.
//
//   WhatsApp has cost $0.00, and 410 of the last 996 messages were never
//   delivered. Free-form WhatsApp only reaches someone who wrote to the business
//   in the previous 24 hours, and a brand-new member never has.
//
// An approved template is delivered outside that window. So the same change that
// removes the cost also removes the silent 41% loss — but only for messages that
// go through a template, which is why this exists.
//
// Everything here degrades: with no template configured, the caller's original
// free-form text is sent exactly as before. Nothing breaks while approvals are
// pending.
import { prisma } from '../db.js';
const dbx = () => prisma;
/**
 * What each template says, and what its variables mean.
 *
 * The text here is the text that must be submitted to Meta for approval, word
 * for word — a template that does not match its approved body is rejected at
 * send time. Keeping it beside the code is the only way the two stay in step.
 *
 * RULE, learned from this account's own rejection history: a template may not
 * BEGIN or END with a variable. An earlier template here was refused with
 * "Variables can't be at the start or end of the template", and the first draft
 * of all three below would have been refused the same way — two days of waiting
 * to find out. Every body therefore opens and closes on fixed words.
 */
export const TEMPLATES = {
    club_welcome: {
        secretKey: 'WA_TEMPLATE_CLUB_WELCOME',
        // Marketing, not Utility. Meta rejected both categories with
        // INCORRECT_CATEGORY, and this account's own history shows why: a message
        // that offers a benefit is classed as marketing no matter what we call it,
        // and the fight is not worth having. Marketing over WhatsApp still costs a
        // fraction of an SMS.
        label: 'הצטרפות למועדון',
        category: 'marketing',
        // This exact text was submitted to Meta from the API (template
        // club_join_20260720a) and cleared the category gate that rejected three
        // earlier versions — the API submission forced allow_category_change true,
        // which the Console did not. It matches the body Twilio holds for the stored
        // SID; keep them identical or the send is rejected.
        body: 'תודה שהצטרפתם למועדון של {{1}}, {{2}} 🙏\n\n' +
            'ההטבה שלכם מוכנה: {{3}}. הציגו את הקוד {{4}} בעת הביקור.\n\n' +
            'לצפייה בכל ההטבות והפרטים: {{5}}\n' +
            'להתראות אצלנו.',
        vars: ['שם העסק', 'שם פרטי', 'ההטבה', 'קוד המימוש', 'קישור לכרטיס'],
    },
    club_birthday: {
        secretKey: 'WA_TEMPLATE_CLUB_BIRTHDAY',
        label: 'יום הולדת',
        category: 'marketing',
        body: 'יום הולדת שמח, {{1}}! 🎂\n\n' +
            'כל הצוות של {{2}} מאחל לך שנה נהדרת, ומחכה לך אצלנו: {{3}}\n\n' +
            'הכרטיס שלך: {{4}}\n' +
            'נשמח לחגוג איתך.',
        vars: ['שם פרטי', 'שם העסק', 'ההטבה', 'קישור לכרטיס'],
    },
    staff_report: {
        secretKey: 'WA_TEMPLATE_STAFF_REPORT',
        label: 'דוח לצוות',
        category: 'utility',
        // Meta rejected the four-variable version: too many variables for the
        // message length. Three variables, and more fixed wording around them, keeps
        // the density within what Meta accepts.
        body: 'שלום, מצורף הדוח היומי מהמערכת של עלינא לתאריך {{1}}.\n\n' +
            'להלן הנתונים העיקריים:\n{{2}}\n\n' +
            'ניתן לצפות בפירוט המלא ובשאר הדוחות במערכת, בקישור הבא: {{3}}\n' +
            'תודה ויום טוב.',
        vars: ['תאריך', 'תוכן הדוח', 'קישור'],
    },
    // ── generic templates, one per message SHAPE ───────────────────────────────
    // The app has ~40 business-initiated send sites, but they collapse into a
    // handful of shapes. One reusable template per shape covers them all: an
    // arbitrary long report becomes a short summary in a variable plus a link to
    // the full thing in the app — the same pattern the club welcome uses, and the
    // only pattern that fits WhatsApp's per-variable length and density limits.
    // Every scheduled/triggered message to the owner and managers: daily hours,
    // morning/evening brief, weekly insights, supplier orders, cash-flow and
    // crisis alerts, no-show pings, reminders. Title + summary + link.
    owner_notification: {
        secretKey: 'WA_TEMPLATE_OWNER_NOTIFICATION',
        label: 'התראה לבעלים',
        category: 'utility',
        body: 'עדכון מהמערכת של {{1}} — {{2}}:\n\n' +
            '{{3}}\n\n' +
            'לצפייה בפרטים המלאים במערכת: {{4}}\n' +
            'תודה.',
        vars: ['שם העסק', 'כותרת', 'תקציר', 'קישור'],
    },
    // Every scheduled/triggered message to an EMPLOYEE: availability reminders,
    // schedule opened/published, shift/clock-in nudges, team broadcasts. Employees
    // almost never have an open session with the bot, so these are the sends most
    // likely to vanish without a template.
    staff_notice: {
        secretKey: 'WA_TEMPLATE_STAFF_NOTICE',
        label: 'הודעה לעובד',
        category: 'utility',
        body: 'היי {{1}}, יש לך הודעה חדשה מ{{2}}:\n\n' +
            '{{3}}\n\n' +
            'לצפייה ולפעולה במערכת: {{4}}\n' +
            'תודה.',
        vars: ['שם פרטי', 'שם העסק', 'תוכן ההודעה', 'קישור'],
    },
    // Inviting a brand-new employee — by definition first contact, so free-form
    // could never reach them.
    employee_invite: {
        secretKey: 'WA_TEMPLATE_EMPLOYEE_INVITE',
        label: 'הזמנת עובד',
        category: 'utility',
        body: 'היי {{1}}, הוזמנת להצטרף לצוות של {{2}} 🎉\n\n' +
            'להשלמת הפרטים והכניסה למערכת, הקישו כאן: {{3}}\n' +
            'נשמח לעבוד יחד.',
        vars: ['שם פרטי', 'שם העסק', 'קישור הצטרפות'],
    },
    // Reservation confirmed / day-of reminder to a guest.
    guest_reservation: {
        secretKey: 'WA_TEMPLATE_GUEST_RESERVATION',
        label: 'אישור הזמנה',
        category: 'utility',
        body: 'שלום {{1}}, ההזמנה שלך ב{{2}} מעודכנת 🎉\n\n' +
            '{{3}}\n\n' +
            'לצפייה או לעדכון ההזמנה: {{4}}\n' +
            'נתראה בקרוב.',
        vars: ['שם פרטי', 'שם העסק', 'פרטי ההזמנה', 'קישור'],
    },
    // The gap the audit found: "a table opened up / you're on the waitlist" — the
    // queue notifications that today have no template at all and silently fail.
    guest_table_ready: {
        secretKey: 'WA_TEMPLATE_GUEST_TABLE_READY',
        label: 'התפנה שולחן',
        category: 'utility',
        body: 'שלום {{1}}, יש לנו עדכון מ{{2}} 🎉\n\n' +
            '{{3}}\n\n' +
            'לפרטים ולתיאום: {{4}}\n' +
            'מחכים לך.',
        vars: ['שם פרטי', 'שם העסק', 'העדכון', 'קישור'],
    },
    // Club messages that are neither the welcome nor the birthday: anniversary,
    // pre-birthday, NPS, and general club broadcasts. Name + business + message +
    // card link.
    club_message: {
        secretKey: 'WA_TEMPLATE_CLUB_MESSAGE',
        label: 'הודעת מועדון',
        category: 'marketing',
        body: 'היי {{1}}, הודעה ממועדון {{2}} 💌\n\n' +
            '{{3}}\n\n' +
            'לצפייה בכל ההטבות שלך: {{4}}\n' +
            'להתראות אצלנו.',
        vars: ['שם פרטי', 'שם העסק', 'תוכן ההודעה', 'קישור לכרטיס'],
    },
};
/**
 * Would Meta refuse this body on sight?
 *
 * Checked in code rather than trusted to memory, because the cost of getting it
 * wrong is two days of waiting followed by a rejection notice. Shown next to
 * each template on the setup screen so nobody submits one that cannot pass.
 */
export function templateRejectionRisk(body) {
    const t = body.trim();
    if (/^\{\{\d+\}\}/.test(t))
        return 'התבנית מתחילה במשתנה — Meta תדחה';
    if (/\{\{\d+\}\}$/.test(t))
        return 'התבנית מסתיימת במשתנה — Meta תדחה';
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(t))
        return 'שני משתנים צמודים — Meta תדחה';
    return null;
}
async function contentSid(kind) {
    const row = await dbx().integrationSecret
        .findFirst({ where: { key: TEMPLATES[kind].secretKey }, select: { value: true } })
        .catch(() => null);
    const v = String(row?.value || '').trim();
    // Twilio content SIDs start with HX. Anything else is a paste mistake, and
    // sending with it fails in a way that looks like the template was rejected.
    return /^HX[0-9a-fA-F]{32}$/.test(v) ? v : null;
}
/**
 * Is this template actually approved by WhatsApp right now?
 *
 * A stored SID is not the same as an approved template. A SID can be pending
 * review, or rejected — and sending through an unapproved template fails, which
 * would make every signup pay for a doomed WhatsApp attempt before the SMS
 * fallback carries it. So the send path asks Twilio, and only uses the template
 * when the answer is "approved".
 *
 * The answer is cached, because it changes at most a couple of times in a
 * template's life — on submission and on Meta's verdict — and a signup should
 * not wait on a status call. This also means the owner never has to come back:
 * leave the SID stored, and within the cache window of Meta approving, sends
 * switch to the template on their own. If it stays rejected, SMS just continues.
 */
const approvalCache = new Map();
const APPROVAL_TTL_MS = 60 * 60 * 1000;
async function isApproved(sid) {
    const hit = approvalCache.get(sid);
    if (hit && Date.now() - hit.at < APPROVAL_TTL_MS)
        return hit.approved;
    let approved = false;
    try {
        const acct = (await dbx().integrationSecret.findFirst({ where: { key: 'TWILIO_ACCOUNT_SID' } }))?.value
            || process.env.TWILIO_ACCOUNT_SID;
        const tok = (await dbx().integrationSecret.findFirst({ where: { key: 'TWILIO_AUTH_TOKEN' } }))?.value
            || process.env.TWILIO_AUTH_TOKEN;
        if (acct && tok) {
            const auth = Buffer.from(`${acct}:${tok}`).toString('base64');
            const res = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
                headers: { Authorization: `Basic ${auth}` },
            });
            const d = await res.json();
            approved = d?.whatsapp?.status === 'approved';
        }
    }
    catch {
        // On any doubt, treat as not approved and let the fallback carry it. A
        // missed template is a cost; a failed send is a lost message.
        approved = false;
    }
    approvalCache.set(sid, { approved, at: Date.now() });
    return approved;
}
/** Which templates are wired up AND live — drives the setup screen. */
export async function templateStatus() {
    const out = [];
    for (const kind of Object.keys(TEMPLATES)) {
        const sid = await contentSid(kind);
        out.push({
            kind,
            label: TEMPLATES[kind].label,
            category: TEMPLATES[kind].category,
            configured: !!sid,
            // Configured is not the same as usable. A SID can sit here rejected or
            // pending; only an approved one actually sends over WhatsApp.
            approved: sid ? await isApproved(sid) : false,
        });
    }
    return out;
}
/**
 * Send through the template when one is approved, and fall back to the plain
 * text otherwise.
 *
 * The fallback is deliberately free-form WhatsApp rather than SMS: it costs
 * nothing and reaches anyone inside the window, whereas SMS reaches everyone at
 * $1.35 a message. Where a message MUST arrive no matter what — the club
 * welcome, which goes to someone who has by definition never written to us —
 * the caller passes smsFallback and pays for certainty.
 */
export async function sendTemplated(opts) {
    if (!opts.to)
        return { sent: false, via: 'none', reason: 'no_recipient' };
    const sid = await contentSid(opts.kind);
    if (sid && await isApproved(sid)) {
        try {
            const { sendWhatsAppTemplate } = await import('./twilio.js');
            const variables = {};
            opts.vars.forEach((v, i) => { variables[String(i + 1)] = String(v ?? ''); });
            const out = await sendWhatsAppTemplate(opts.to, sid, variables);
            if (!out?.skipped)
                return { sent: true, via: 'template' };
        }
        catch (e) {
            // A rejected or mismatched template must not swallow the message.
            console.warn(`[wa-template] ${opts.kind} failed, falling back:`, e?.message);
        }
    }
    if (!opts.skipFreeform) {
        try {
            const { sendWhatsApp } = await import('./twilio.js');
            const out = await sendWhatsApp(opts.to, opts.freeformText);
            if (!out?.skipped) {
                // Twilio accepts and only later marks it undelivered if the window is
                // closed, so this is "handed over", not "arrived". Without a template
                // there is no way to know from here.
                return { sent: true, via: 'freeform' };
            }
        }
        catch (e) {
            console.warn(`[wa-template] ${opts.kind} freeform failed:`, e?.message);
        }
    }
    if (opts.smsFallback) {
        try {
            const { sendSms } = await import('./twilio.js');
            const out = await sendSms(opts.to, opts.smsText || opts.freeformText);
            if (!out?.skipped)
                return { sent: true, via: 'sms' };
        }
        catch (e) {
            console.warn(`[wa-template] ${opts.kind} sms failed:`, e?.message);
        }
    }
    return { sent: false, via: 'none', reason: 'all_channels_failed' };
}
// ── ergonomic wrappers ───────────────────────────────────────────────────────
// One call each, so a business-initiated send site changes from
//   sendWhatsApp(phone, text)
// to a wrapper that routes through the right template with an SMS fallback and
// keeps the original text as both the free-form and SMS body. The app link tells
// the recipient where to see the full thing — the summary variable only needs to
// carry a headline, since a template variable cannot hold a long report.
const APP = () => process.env.PUBLIC_BASE_URL || 'https://topalena.com';
/** Trim a value to keep well under WhatsApp's per-variable limit. */
function clip(s, n = 600) {
    const t = String(s ?? '').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
/**
 * A scheduled/triggered message to the owner or a manager — reports, briefs,
 * alerts, reminders. `title` is the headline; `text` is the existing message,
 * reused verbatim for the SMS/free-form fallback and clipped into the template
 * summary variable.
 */
export async function notifyOwner(phone, title, text, opts = {}) {
    const r = await sendTemplated({
        kind: 'owner_notification',
        to: phone,
        vars: [clip(opts.brand || 'המערכת', 60), clip(title, 60), clip(text), opts.link || APP()],
        freeformText: text,
        smsText: text,
        smsFallback: true,
    });
    return { ...r, skipped: !r.sent };
}
/** A scheduled/triggered message to an EMPLOYEE — nudges, schedule, broadcasts. */
export async function notifyStaff(phone, firstName, text, opts = {}) {
    const r = await sendTemplated({
        kind: 'staff_notice',
        to: phone,
        vars: [clip(firstName || 'עובד/ת', 40), clip(opts.brand || 'המסעדה', 60), clip(text), opts.link || APP()],
        freeformText: text,
        smsText: text,
        smsFallback: true,
    });
    return { ...r, skipped: !r.sent };
}
/** A club message that is neither welcome nor birthday — anniversary, NPS, etc. */
export async function sendClubMessage(phone, firstName, text, opts = {}) {
    const r = await sendTemplated({
        kind: 'club_message',
        to: phone,
        vars: [clip(firstName || 'אורח/ת', 40), clip(opts.brand || 'המסעדה', 60), clip(text), opts.link || `${APP()}/MemberCard`],
        freeformText: text,
        smsText: text,
        smsFallback: true,
    });
    return { ...r, skipped: !r.sent };
}
//# sourceMappingURL=waTemplates.js.map