// WhatsApp universal-scan branch — the owner sends a photo/PDF of a menu,
// checklist, employee list, supplier list or order list, and the AI parses it
// and offers to import (כן/לא). Mirrors the invoice-media pattern exactly:
// download with Twilio auth → store in MinIO → classify+parse → stash a pending
// confirmation on an outbound WhatsAppMessage row → import on "כן".
//
// Invoices/recipes/unknown are intentionally NOT handled here — tryHandleAdminScanMedia
// returns null for them so the caller falls through to the existing invoice OCR.
import { Readable } from 'node:stream';
import { uploadStreamToS3 } from './storage.js';
import { prisma } from '../db.js';
import { scanContent, importScanned } from './aiScanner.js';
const IMPORTABLE = new Set(['menu', 'checklist', 'employees', 'suppliers', 'order_list']);
// Same manual-redirect Twilio media fetch as whatsappInvoice.ts (module-private
// there). Twilio 302-redirects to a signed S3 URL; node fetch strips auth
// across hosts, so we follow the redirect by hand.
async function downloadTwilioMedia(mediaUrl) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token)
        throw new Error('twilio_creds_missing');
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    let currentUrl = mediaUrl;
    let currentHeaders = { Authorization: `Basic ${creds}` };
    for (let hops = 0; hops < 5; hops++) {
        const res = await fetch(currentUrl, { headers: currentHeaders, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
            const next = res.headers.get('location');
            if (!next)
                throw new Error(`media_redirect_${res.status}_no_location`);
            currentUrl = new URL(next, currentUrl).toString();
            currentHeaders = {};
            continue;
        }
        if (!res.ok)
            throw new Error(`media_fetch_${res.status}`);
        const mimeType = res.headers.get('content-type') || 'application/octet-stream';
        const buf = Buffer.from(await res.arrayBuffer());
        return { mimeType, buf };
    }
    throw new Error('media_redirect_too_many_hops');
}
async function storePendingScan(fromPhone, scan, preview) {
    await prisma.whatsAppMessage.create({
        data: {
            twilio_sid: null,
            direction: 'outbound',
            from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
            to_phone: fromPhone,
            contact_phone: fromPhone,
            body: preview,
            num_media: 0,
            status: 'pending_scan_confirmation',
            raw: { pending_scan: { classification: scan.classification, parsed: scan.parsed } },
            is_read: false,
        },
    }).catch(() => { });
}
function buildScanPreview(scan) {
    const cfg = {
        menu: { rowsKey: 'items', render: (r) => `• ${r.name}${r.price ? ` — ${r.price}₪` : ''}` },
        checklist: { rowsKey: 'items', render: (r) => `• ${r.text || r.task}` },
        employees: { rowsKey: 'employees', render: (r) => `• ${r.full_name}${r.role ? ` (${r.role})` : ''}` },
        suppliers: { rowsKey: 'suppliers', render: (r) => `• ${r.company_name}` },
        order_list: { rowsKey: 'items', render: (r) => `• ${r.name}${r.qty ? ` ×${r.qty}` : ''}` },
    };
    const c = cfg[scan.classification];
    const rows = Array.isArray(scan.parsed?.[c.rowsKey]) ? scan.parsed[c.rowsKey] : [];
    const head = `🔍 זיהיתי *${scan.label}* — ${rows.length} פריטים:`;
    const sample = rows.slice(0, 8).map(c.render).join('\n');
    const more = rows.length > 8 ? `\n…ועוד ${rows.length - 8}` : '';
    return `${head}\n${sample}${more}\n\n✅ ענה *כן* לייבוא · *לא* לביטול`;
}
// Returns a reply string if the media was an importable document (and a pending
// confirmation was stashed); null if it should fall through to invoice OCR.
export async function tryHandleAdminScanMedia(mediaUrl, fromPhone) {
    let storedUrl;
    try {
        const { mimeType, buf } = await downloadTwilioMedia(mediaUrl);
        const ext = mimeType.startsWith('image/') ? '.' + (mimeType.split('/')[1] || 'jpg') : mimeType === 'application/pdf' ? '.pdf' : '.bin';
        const { key } = await uploadStreamToS3(`whatsapp-scan${ext}`, mimeType, Readable.from(buf));
        storedUrl = `/api/files/${key}`;
    }
    catch {
        return null; // download/upload failed — let the invoice flow try
    }
    let scan;
    try {
        scan = await scanContent({ fileUrls: [storedUrl] });
    }
    catch {
        return null;
    }
    if (!scan?.parsed || !IMPORTABLE.has(scan.classification) || !scan.count)
        return null;
    // Confidence gate: a genuine invoice can occasionally be misread as menu/order.
    // Below the bar, defer to the existing invoice OCR (the safe default here).
    if (Number(scan.confidence) < 0.55)
        return null;
    const preview = buildScanPreview(scan);
    await storePendingScan(fromPhone, scan, preview);
    return preview;
}
// Confirmation-side. Returns reply text if the message is a כן/לא for the most
// recent pending scan (within 15 min); null otherwise so other routers run.
export async function tryConfirmPendingScan(fromPhone, body) {
    const trimmed = (body || '').trim();
    if (!trimmed)
        return null;
    const isApprove = /^(כן|אישור|אשר|מאשר|מאשרת|יבא|ייבא|ok|yes)\s*[.!]?$/i.test(trimmed);
    const isCancel = /^(לא|ביטול|בטל|בטלי|no|cancel)\s*[.!]?$/i.test(trimmed);
    if (!isApprove && !isCancel)
        return null;
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const pending = await prisma.whatsAppMessage.findFirst({
        where: {
            direction: 'outbound',
            contact_phone: fromPhone,
            status: 'pending_scan_confirmation',
            is_read: false,
            created_at: { gte: since },
        },
        orderBy: { created_at: 'desc' },
    }).catch(() => null);
    if (!pending)
        return null;
    // Most-recent-pending wins: if a NEWER invoice/action confirmation is waiting,
    // this כן/אישור was meant for that one — defer so we don't steal it.
    const newerOther = await prisma.whatsAppMessage.findFirst({
        where: {
            direction: 'outbound',
            contact_phone: fromPhone,
            status: { in: ['pending_confirmation', 'pending_action_confirmation'] },
            is_read: false,
            created_at: { gt: new Date(pending.created_at) },
        },
        orderBy: { created_at: 'desc' },
    }).catch(() => null);
    if (newerOther)
        return null;
    // Consume it either way so a stale pending doesn't linger.
    await prisma.whatsAppMessage.update({ where: { id: pending.id }, data: { is_read: true } }).catch(() => { });
    if (isCancel)
        return '❌ בוטל. הפריטים לא יובאו.';
    const ps = pending.raw?.pending_scan;
    if (!ps?.classification || !ps?.parsed)
        return '🤔 לא מצאתי מה לייבא. שלח את המסמך שוב.';
    try {
        const summary = await importScanned(ps.classification, ps.parsed);
        return `✅ ${summary.message}`;
    }
    catch (e) {
        return `❌ הייבוא נכשל: ${e?.message || 'unknown'}\nהפריטים לא נשמרו — שלח את המסמך שוב.`;
    }
}
//# sourceMappingURL=whatsappScan.js.map