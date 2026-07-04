// Gmail-over-IMAP fetcher. Auth = app passwords (2FA required on the Google
// account). We only ever READ (no flags changed, no deletes).
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { decryptToken } from './emailCrypto.js';

export const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type FetchedAttachment = { filename: string; contentType: string; content: Buffer };
export type FetchedEmail = {
  messageId: string;
  sender: string; // lowercased address
  subject: string;
  snippet: string; // first 500 chars of text body — used by the AI classifier
  attachments: FetchedAttachment[];
};

function client(email: string, passPlain: string): ImapFlow {
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
export async function testConnection(email: string, appPasswordPlain: string): Promise<void> {
  const c = client(email, appPasswordPlain);
  // imapflow emits 'error' on socket timeouts; without a listener Node would
  // crash the process with an uncaught exception.
  c.on('error', () => {});
  try {
    await c.connect();
    await c.logout();
  } catch (e) {
    c.close();
    throw e;
  }
}

export function isAuthError(e: any): boolean {
  if (e?.authenticationFailed) return true; // imapflow AuthenticationFailure
  return /auth|login|credentials|Invalid credentials|AUTHENTICATIONFAILED/i.test(
    String(e?.responseText || e?.response || e?.message || ''),
  );
}

function pickAttachments(parsed: ParsedMail): FetchedAttachment[] {
  return (parsed.attachments || [])
    .filter(a =>
      ALLOWED_ATTACHMENT_MIME.has(String(a.contentType || '').toLowerCase()) &&
      a.content && a.content.length > 0 && a.content.length <= MAX_ATTACHMENT_BYTES)
    .map(a => ({
      filename: a.filename || 'attachment',
      contentType: String(a.contentType).toLowerCase(),
      content: a.content as Buffer,
    }));
}

// Normalize a raw Message-ID to bracketed form; fall back to a UID-derived
// stable key when the header is missing/empty. NOTE: UID-derived keys assume
// the mailbox UIDVALIDITY never changes (true for a given Gmail account in
// practice); a UIDVALIDITY reset would cause one-time reprocessing, which the
// downstream supplier+invoice_number duplicate guard absorbs.
function normalizeMessageId(raw: string | undefined, uid: number, email: string): string {
  const v = String(raw || '').trim();
  if (!v) return `<uid-${uid}@${email}>`;
  return v.startsWith('<') ? v : `<${v}>`;
}

// Fetch messages since `since`, skipping Message-IDs in `known`.
// Two passes: ENVELOPE-only scan to find new Message-IDs cheaply, then full
// source download + parse only for the new ones.
export async function fetchNewMessages(
  account: { email: string; app_password: string },
  since: Date,
  known: Set<string>,
): Promise<FetchedEmail[]> {
  const c = client(account.email, decryptToken(account.app_password));
  // imapflow emits 'error' on socket timeouts; without a listener Node would
  // crash the process with an uncaught exception.
  c.on('error', () => {});
  const out: FetchedEmail[] = [];
  try {
    await c.connect();
    const lock = await c.getMailboxLock('INBOX', { readOnly: true });
    try {
      // search() returns number[] of UIDs, or false when the server reports
      // no matches / the search fails — treat both as "nothing to do".
      const found = await c.search({ since }, { uid: true });
      const uids: number[] = Array.isArray(found) ? found : [];
      if (uids.length === 0) return out;

      const fresh: { uid: number; mid: string }[] = [];
      for await (const msg of c.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
        const mid = normalizeMessageId(msg.envelope?.messageId, msg.uid, account.email);
        if (!known.has(mid)) fresh.push({ uid: msg.uid, mid });
        if (fresh.length >= 100) break; // safety cap per run; the next run picks up the rest
      }
      for (const { uid, mid } of fresh) {
        const fetched = await c.fetchOne(uid, { source: true, uid: true }, { uid: true });
        if (!fetched || !fetched.source) continue;
        const parsed = await simpleParser(fetched.source);
        out.push({
          messageId: mid,
          sender: (parsed.from?.value?.[0]?.address || '').toLowerCase(),
          subject: parsed.subject || '',
          snippet: (parsed.text || '').slice(0, 500),
          attachments: pickAttachments(parsed),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
    c.close(); // idempotent; guarantees the socket is torn down even if logout failed
  }
  return out;
}
