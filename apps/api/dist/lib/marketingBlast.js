// Manual marketing blasts, with consent enforced on the server.
//
// The admin console used to loop over the selected rows in the browser and call
// the raw sendSms / sendCustomerEmail handlers one per customer. Those take a
// bare phone number and know nothing about who it belongs to, so a customer who
// had unsubscribed — or who never consented in the first place — received the
// message anyway. The automated drip campaigns check consent properly; only the
// manual path did not, which is the path a person uses when they are in a hurry.
//
// Consent cannot be a filter in the client. Anything the browser decides can be
// skipped by the next screen that forgets to decide it. So the selection arrives
// here as customer IDs, and this is the only place that turns an ID into an
// address — after checking whether we are allowed to.
import { prisma } from '../db.js';
import { sendSms } from './twilio.js';
import { sendClubMessage } from './waTemplates.js';
import { sendEmail } from './email.js';
const dbx = () => prisma;
/** Only these two facts decide it, and both live on the customer record. */
function mayReceiveMarketing(c) {
    if (c.marketing_unsubscribed_at)
        return { ok: false, reason: 'unsubscribed' };
    if (c.marketing_consent !== true)
        return { ok: false, reason: 'no_consent' };
    return { ok: true };
}
export async function sendMarketingBlast(opts) {
    const ids = [...new Set((opts.customerIds || []).map(String))].filter(Boolean);
    const res = {
        sent: 0, failed: 0,
        skipped: { no_consent: 0, unsubscribed: 0, no_address: 0 },
        skipped_names: [], total_selected: ids.length,
    };
    if (!ids.length || !opts.message)
        return res;
    const customers = await dbx().customer.findMany({
        where: { id: { in: ids } },
        select: {
            id: true, name: true, phone: true, email: true,
            marketing_consent: true, marketing_unsubscribed_at: true,
        },
    }).catch(() => []);
    const allowed = [];
    for (const c of customers) {
        const verdict = mayReceiveMarketing(c);
        if (!verdict.ok) {
            res.skipped[verdict.reason]++;
            if (res.skipped_names.length < 20)
                res.skipped_names.push(c.name || c.phone || '—');
            continue;
        }
        const addr = opts.channel === 'email' ? c.email : c.phone;
        if (!addr) {
            res.skipped.no_address++;
            continue;
        }
        allowed.push(c);
    }
    // Small batches: a few hundred recipients through one provider at once is how
    // a send gets rate-limited halfway and leaves nobody knowing who received it.
    const BATCH = 5;
    for (let i = 0; i < allowed.length; i += BATCH) {
        const batch = allowed.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map(async (c) => {
            const raw = String(opts.message).replace(/\{שם\}|\{name\}/g, c.name || '');
            const text = withOptOut(raw, c.id);
            if (opts.channel === 'email') {
                const html = opts.imageUrl
                    ? `${text}\n\n<img src="${opts.imageUrl}" style="max-width:100%;border-radius:8px;" />`
                    : undefined;
                return sendEmail({ to: c.email, subject: opts.subject || '', text, html });
            }
            // A consent-gated blast reaches mostly out-of-window members — template
            // with SMS fallback, so it arrives rather than silently dropping.
            if (opts.channel === 'whatsapp') {
                return sendClubMessage(c.phone, String(c.name || '').split(' ')[0], text);
            }
            return sendSms(c.phone, text);
        }));
        for (const r of results)
            r.status === 'fulfilled' ? res.sent++ : res.failed++;
    }
    // Stamp who was contacted, so the throttle the drip campaigns rely on also
    // accounts for messages sent by hand.
    if (allowed.length) {
        await dbx().customer.updateMany({
            where: { id: { in: allowed.map((c) => c.id) } },
            data: { last_marketing_sent_at: new Date() },
        }).catch(() => { });
    }
    return res;
}
// ── opting out ─────────────────────────────────────────────────────────────
// Israeli spam law requires every marketing message to carry a simple way to
// refuse further messages. Two working unsubscribe handlers already existed —
// and not one outgoing message mentioned them, which is why the database holds
// zero unsubscribes against nineteen thousand customers. That figure was never
// about satisfaction; there was simply no door.
//
// The link is signed rather than a bare customer id. The existing public club
// endpoints take a raw cid, so anyone who guesses one can read and edit that
// customer — a mistake worth not repeating on a new public route.
import { createHmac } from 'node:crypto';
function secret() {
    return process.env.JWT_SECRET || process.env.CRON_SECRET || 'unsub-fallback';
}
export function signCustomer(cid) {
    return createHmac('sha256', secret()).update(`unsub:${cid}`).digest('base64url').slice(0, 20);
}
export function verifyCustomerSignature(cid, sig) {
    if (!cid || !sig)
        return false;
    const expected = signCustomer(cid);
    // Constant-time-ish: compare full strings of equal length.
    if (expected.length !== sig.length)
        return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++)
        diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
}
export function optOutUrl(cid) {
    const base = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
    return `${base}/Unsubscribe?c=${encodeURIComponent(cid)}&s=${signCustomer(cid)}`;
}
/**
 * The member's own card — benefits, codes, coins, tournament place.
 *
 * Lives beside the opt-out URL because they are the same kind of thing: a link
 * that proves who the holder is without a login. Both doors, one signature.
 */
export function memberCardUrl(cid) {
    const base = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
    return `${base}/MemberCard?c=${encodeURIComponent(cid)}&s=${signCustomer(cid)}`;
}
/**
 * Append the opt-out line to a marketing message.
 *
 * Applied here rather than written into each template, because a template is
 * something a person edits and a footer is something a person forgets. Every
 * marketing send path calls this; operational messages (shift alerts, queue
 * notifications) deliberately do not — they are not advertising and a
 * "unsubscribe" line on a table-is-ready text is nonsense.
 */
export function withOptOut(text, customerId) {
    if (!customerId)
        return text;
    if (/להסרה|לביטול דיוור|unsubscribe/i.test(text))
        return text; // already carries one
    return `${text}\n\nלהסרה מרשימת הדיוור: ${optOutUrl(customerId)}`;
}
//# sourceMappingURL=marketingBlast.js.map