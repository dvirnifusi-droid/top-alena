import { prisma } from '../db.js';
export function normalizeIsraeliPhone(input) {
    let n = input.replace(/\D/g, '');
    if (n.startsWith('0'))
        return '+972' + n.slice(1);
    if (n.startsWith('972'))
        return '+' + n;
    return '+972' + n;
}
// Twilio SID/token — DB override (RestaurantProfile.twilio_credentials) with env
// fallback, cached 30s. Lets the owner rotate a changed Auth Token from the app
// when the server .env is unreachable; falls back to TWILIO_* env when unset.
let _twCache = { at: 0 };
export function invalidateTwilioCredsCache() { _twCache = { at: 0 }; }
export async function twilioAuth() {
    const envSid = process.env.TWILIO_ACCOUNT_SID;
    const envToken = process.env.TWILIO_AUTH_TOKEN;
    if (Date.now() - _twCache.at > 30000) {
        try {
            const p = await prisma.restaurantProfile.findFirst({ select: { twilio_credentials: true } });
            const c = p?.twilio_credentials || {};
            _twCache = { at: Date.now(), sid: c.account_sid || undefined, token: c.auth_token || undefined };
        }
        catch {
            _twCache = { at: Date.now() };
        }
    }
    return { sid: _twCache.sid || envSid, token: _twCache.token || envToken };
}
export async function sendSms(to, body) {
    const { sid, token } = await twilioAuth();
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) {
        console.warn('[twilio] missing credentials, skipping', { to, body: body.slice(0, 60) });
        return { skipped: true };
    }
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: normalizeIsraeliPhone(to), Body: body }),
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(data?.message || `twilio_${res.status}`);
    return { success: true, sid: data.sid };
}
// Send a WhatsApp message using a pre-approved Content Template. Pass the variables
// as a {key: value} map matching the {{1}}, {{2}}, ... placeholders.
// Falls back to free-form sendWhatsApp if templateSid is missing.
export async function sendWhatsAppTemplate(to, templateSid, variables) {
    const { sid, token } = await twilioAuth();
    const from = process.env.TWILIO_WHATSAPP_FROM ??
        (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : undefined);
    if (!sid || !token || !from || !templateSid) {
        console.warn('[twilio-wa] missing template-send config', { sid_set: !!sid, from_set: !!from, sid_template: templateSid });
        return { skipped: true };
    }
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    const toN = normalizeIsraeliPhone(to);
    const params = {
        From: from,
        To: `whatsapp:${toN}`,
        ContentSid: templateSid,
        ContentVariables: JSON.stringify(variables),
    };
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
    });
    const data = await res.json();
    if (!res.ok) {
        console.error('[twilio-wa-template] failed', { status: res.status, code: data?.code, message: data?.message, to: toN });
        throw new Error(`twilio_wa_template_${data?.code || res.status}: ${data?.message || 'unknown'}`);
    }
    return { success: true, sid: data.sid };
}
// Send a FREE-FORM WhatsApp message — works only within a 24-hour session
// (i.e. the customer messaged us in the last 24h). Outside that window Meta
// requires a pre-approved template, which is what sendWhatsAppTemplate is for.
// IMPORTANT: never auto-attach a ContentSid here — Twilio will silently use
// the template and IGNORE the Body, sending the wrong message to the customer.
export async function sendWhatsApp(to, body, opts = {}) {
    const { sid, token } = await twilioAuth();
    const from = process.env.TWILIO_WHATSAPP_FROM ??
        (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : undefined);
    if (!sid || !token || !from) {
        console.warn('[twilio] missing WhatsApp credentials, skipping', { to, from_set: !!from, sid_set: !!sid });
        return { skipped: true, reason: 'missing_credentials' };
    }
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    const toN = normalizeIsraeliPhone(to);
    const params = { From: from, To: `whatsapp:${toN}`, Body: body };
    // Optional media attachment (image/PDF). Twilio supports JPG/PNG/MP4 etc.
    if (opts.mediaUrl)
        params.MediaUrl = opts.mediaUrl;
    // Status callback URL — Twilio will POST delivery + read receipt events here.
    // We include the recipient id in the URL so the webhook can update the right row.
    if (opts.statusCallback) {
        const url = opts.recipientId
            ? `${opts.statusCallback}?rid=${encodeURIComponent(opts.recipientId)}`
            : opts.statusCallback;
        params.StatusCallback = url;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
    });
    const data = await res.json();
    if (!res.ok) {
        console.error('[twilio-wa] failed', { status: res.status, code: data?.code, message: data?.message, to: toN });
        throw new Error(`twilio_wa_${data?.code || res.status}: ${data?.message || 'unknown'}`);
    }
    return { success: true, sid: data.sid };
}
//# sourceMappingURL=twilio.js.map