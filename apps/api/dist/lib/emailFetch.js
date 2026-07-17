// Gmail-over-IMAP fetcher. Auth = app passwords (2FA required on the Google
// account). We only ever READ (no flags changed, no deletes).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptToken } from './emailCrypto.js';
export const ALLOWED_ATTACHMENT_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const EXT_TO_MIME = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};
// Many Israeli billing systems ship PDFs as application/octet-stream (or no
// content-type at all) — an exact MIME check silently drops them, which made
// real invoices log as "no_attachment". Accept by declared MIME first, then
// fall back to the filename extension for generic/unknown MIME types.
// Returns the normalized MIME, or null when the attachment is not usable.
export function resolveAttachmentMime(contentType, filename) {
    const ct = String(contentType || '').toLowerCase();
    if (ALLOWED_ATTACHMENT_MIME.has(ct))
        return ct;
    const ext = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    if (ext && EXT_TO_MIME[ext])
        return EXT_TO_MIME[ext];
    return null;
}
function client(email, passPlain) {
    return new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: email, pass: passPlain },
        logger: false,
        connectionTimeout: 30_000,
        socketTimeout: 60_000,
    });
}
// Validates credentials on the settings screen (plaintext password, pre-save).
export async function testConnection(email, appPasswordPlain) {
    const c = client(email, appPasswordPlain);
    // imapflow emits 'error' on socket timeouts; without a listener Node would
    // crash the process with an uncaught exception.
    c.on('error', () => { });
    try {
        await c.connect();
        await c.logout();
    }
    catch (e) {
        c.close();
        throw e;
    }
}
export function isAuthError(e) {
    if (e?.authenticationFailed)
        return true; // imapflow AuthenticationFailure
    return /auth|login|credentials|Invalid credentials|AUTHENTICATIONFAILED/i.test(String(e?.responseText || e?.response || e?.message || ''));
}
function pickAttachments(parsed) {
    const out = [];
    for (const a of parsed.attachments || []) {
        const mime = resolveAttachmentMime(a.contentType, a.filename);
        if (!mime)
            continue;
        if (!a.content || a.content.length === 0 || a.content.length > MAX_ATTACHMENT_BYTES)
            continue;
        out.push({
            filename: a.filename || 'attachment',
            contentType: mime, // normalized — downstream ext/upload logic relies on it
            content: a.content,
        });
    }
    return out;
}
// Normalize a raw Message-ID to bracketed form; fall back to a UID-derived
// stable key when the header is missing/empty. NOTE: UID-derived keys assume
// the mailbox UIDVALIDITY never changes (true for a given Gmail account in
// practice); a UIDVALIDITY reset would cause one-time reprocessing, which the
// downstream supplier+invoice_number duplicate guard absorbs.
function normalizeMessageId(raw, uid, email) {
    const v = String(raw || '').trim();
    if (!v)
        return `<uid-${uid}@${email}>`;
    return v.startsWith('<') ? v : `<${v}>`;
}
// Fetch messages since `since`, skipping Message-IDs in `known`.
// Two passes: ENVELOPE-only scan to find new Message-IDs cheaply, then full
// source download + parse only for the new ones.
export async function fetchNewMessages(account, since, known) {
    const c = client(account.email, decryptToken(account.app_password));
    // imapflow emits 'error' on socket timeouts; without a listener Node would
    // crash the process with an uncaught exception.
    c.on('error', () => { });
    const out = [];
    let capped = false;
    try {
        await c.connect();
        // Scan "All Mail" (special-use \All), not just INBOX — invoices that were
        // archived or auto-filed by Gmail filters must be picked up too. Falls
        // back to INBOX for servers without a \All mailbox.
        let mailboxPath = 'INBOX';
        try {
            const boxes = await c.list();
            const all = boxes.find(b => b.specialUse === '\\All');
            if (all?.path)
                mailboxPath = all.path;
        }
        catch { /* keep INBOX */ }
        const lock = await c.getMailboxLock(mailboxPath, { readOnly: true });
        try {
            // search() returns number[] of UIDs, or false when the server reports
            // no matches / the search fails — treat both as "nothing to do".
            const found = await c.search({ since }, { uid: true });
            const uids = Array.isArray(found) ? found : [];
            if (uids.length === 0)
                return { messages: out, capped };
            const fresh = [];
            for await (const msg of c.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
                const mid = normalizeMessageId(msg.envelope?.messageId, msg.uid, account.email);
                if (!known.has(mid))
                    fresh.push({ uid: msg.uid, mid });
                if (fresh.length >= 100) {
                    capped = true;
                    break;
                } // safety cap per run; the next run picks up the rest
            }
            for (const { uid, mid } of fresh) {
                const fetched = await c.fetchOne(uid, { source: true, uid: true }, { uid: true });
                if (!fetched || !fetched.source)
                    continue;
                const parsed = await simpleParser(fetched.source);
                out.push({
                    messageId: mid,
                    sender: (parsed.from?.value?.[0]?.address || '').toLowerCase(),
                    subject: parsed.subject || '',
                    snippet: (parsed.text || '').slice(0, 500),
                    html: typeof parsed.html === 'string' ? parsed.html : '',
                    text: parsed.text || '',
                    attachments: pickAttachments(parsed),
                });
            }
        }
        finally {
            lock.release();
        }
    }
    finally {
        await c.logout().catch(() => { });
        c.close(); // idempotent; guarantees the socket is torn down even if logout failed
    }
    return { messages: out, capped };
}
//# sourceMappingURL=emailFetch.js.map