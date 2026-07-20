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
        // Reworded from the version Meta rejected. Meta appears to cache a verdict
        // against an identical body — the duplicate, byte-for-byte the same, was
        // refused instantly — so this is genuinely new text, mirroring how this
        // account's own booking_confirmation had to become a v2 to pass.
        body: 'ברוכים הבאים למועדון של {{1}}, {{2}}! 🎉\n\n' +
            'כבר מחכה לכם אצלנו {{3}}, עם קוד אישי: {{4}}\n\n' +
            'כל הפרטים וההטבות בכרטיס החבר שלכם: {{5}}\n' +
            'נתראה בקרוב 🙌',
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
        body: 'דוח {{1}} לתאריך {{2}}:\n\n' +
            '{{3}}\n\n' +
            'לפרטים המלאים: {{4}}\n' +
            'תודה.',
        vars: ['סוג הדוח', 'תאריך', 'תוכן הדוח', 'קישור'],
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
/** Which templates are wired up — drives the setup screen. */
export async function templateStatus() {
    const out = [];
    for (const kind of Object.keys(TEMPLATES)) {
        out.push({
            kind,
            label: TEMPLATES[kind].label,
            category: TEMPLATES[kind].category,
            configured: !!(await contentSid(kind)),
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
    if (sid) {
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
//# sourceMappingURL=waTemplates.js.map