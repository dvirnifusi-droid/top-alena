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
  });
}

// Validates credentials on the settings screen (plaintext password, pre-save).
export async function testConnection(email: string, appPasswordPlain: string): Promise<void> {
  const c = client(email, appPasswordPlain);
  await c.connect();
  await c.logout();
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

// Fetch messages since `since`, skipping Message-IDs in `known`.
// Two passes: ENVELOPE-only scan to find new Message-IDs cheaply, then full
// source download + parse only for the new ones.
export async function fetchNewMessages(
  account: { email: string; app_password: string },
  since: Date,
  known: Set<string>,
): Promise<FetchedEmail[]> {
  const c = client(account.email, decryptToken(account.app_password));
  await c.connect();
  const out: FetchedEmail[] = [];
  try {
    const lock = await c.getMailboxLock('INBOX', { readOnly: true });
    try {
      // search() returns number[] of UIDs, or false when the server reports
      // no matches / the search fails — treat both as "nothing to do".
      const found = await c.search({ since }, { uid: true });
      const uids: number[] = Array.isArray(found) ? found : [];
      if (uids.length === 0) return out;

      const fresh: number[] = [];
      for await (const msg of c.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
        const mid = msg.envelope?.messageId || `<uid-${msg.uid}@${account.email}>`;
        if (!known.has(mid)) fresh.push(msg.uid);
        if (fresh.length >= 100) break; // safety cap per run; the next run picks up the rest
      }
      for (const uid of fresh) {
        const fetched = await c.fetchOne(uid, { source: true, uid: true }, { uid: true });
        if (!fetched || !fetched.source) continue;
        const parsed = await simpleParser(fetched.source);
        out.push({
          messageId: parsed.messageId || `<uid-${uid}@${account.email}>`,
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
  }
  return out;
}
