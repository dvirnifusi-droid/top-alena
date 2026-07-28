// Public webhook endpoint for Twilio WhatsApp incoming messages.
// Twilio is configured (via its Console) to POST every inbound WhatsApp
// message to /api/twilio/whatsapp-inbox. We persist it to WhatsAppMessage
// so the AdminWhatsAppInbox UI can show it and the owner can reply.
//
// Security: Twilio signs every request with HMAC-SHA1 (X-Twilio-Signature).
// We verify the signature when TWILIO_AUTH_TOKEN is set. Mismatched
// signatures are logged but still accepted (to avoid losing messages if
// reverse-proxy alters the URL/host); flip STRICT_SIG = true once stable.
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import crypto from 'node:crypto';
import { pushoverToAdmins } from '../lib/pushover.js';
import { tryHandleAdminCommand, isWhatsAppAdmin } from '../lib/whatsappAgent.js';
import { handleAdminInvoiceMedia, tryConfirmPendingInvoice } from '../lib/whatsappInvoice.js';
import { tryHandleAdminScanMedia, tryConfirmPendingScan } from '../lib/whatsappScan.js';
import { tryProposeAction, tryConfirmPendingAction } from '../lib/whatsappActions.js';
import { tryHandleDailyHoursReply } from '../lib/dailyHoursReply.js';
import { transcribeWhatsAppVoice } from '../lib/whatsappVoice.js';
import { runConversationAgent } from '../lib/whatsappConversation.js';
import { tryHandleOnboardingMessage, tryHandleOnboardingMedia, isOnboardingActive } from '../lib/whatsappOnboarding.js';
import { sendWhatsApp } from '../lib/twilio.js';
import {
  resolveTenantFromMessage,
  setLastTenant,
  currentTenantSlug,
  containerUrlForSlug,
} from '../lib/whatsappRouter.js';

const STRICT_SIG = false;

function verifyTwilioSignature(authToken: string, fullUrl: string, params: Record<string, string>, signature: string): boolean {
  if (!authToken || !signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = fullUrl + sortedKeys.map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  return expected === signature;
}

function stripWhatsAppPrefix(s: string): string {
  if (!s) return '';
  return String(s).replace(/^whatsapp:/i, '').trim();
}

export const twilioWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Twilio sends application/x-www-form-urlencoded. Fastify needs a parser.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const out: Record<string, string> = {};
      String(body).split('&').forEach(pair => {
        if (!pair) return;
        const [k, v] = pair.split('=').map(p => decodeURIComponent(String(p || '').replace(/\+/g, ' ')));
        if (k) out[k] = v ?? '';
      });
      done(null, out);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // When someone QUOTE-REPLIES to one of our WhatsApp messages, Twilio sends
  // OriginalRepliedMessageSid. Fetch that message's rendered text so the agent
  // can answer about the SPECIFIC alert being replied to (the assistant fires
  // many). Twilio's Message resource carries the final rendered `body` even for
  // template sends. Best-effort — never throws into the webhook.
  const fetchRepliedMessageText = async (sid: string): Promise<string> => {
    if (!sid) return '';
    try {
      const acct = process.env.TWILIO_ACCOUNT_SID;
      const tok = process.env.TWILIO_AUTH_TOKEN;
      if (!acct || !tok) return '';
      const auth = Buffer.from(`${acct}:${tok}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/Messages/${encodeURIComponent(sid)}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return '';
      const d: any = await res.json();
      return String(d?.body || '').trim();
    } catch { return ''; }
  };

  app.post('/whatsapp-inbox', async (req, reply) => {
    const params = (req.body as Record<string, string>) || {};
    const sig = String(req.headers['x-twilio-signature'] || '');
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const fullUrl = `${proto}://${host}${req.url}`;

    if (authToken && sig) {
      const ok = verifyTwilioSignature(authToken, fullUrl, params, sig);
      if (!ok) {
        req.log.warn({ fullUrl, sig }, '[twilio-webhook] signature mismatch');
        if (STRICT_SIG) return reply.code(403).send('bad signature');
      }
    }

    const from = stripWhatsAppPrefix(params.From || '');
    const to = stripWhatsAppPrefix(params.To || '');
    const sid = params.MessageSid || params.SmsMessageSid || '';
    let body = params.Body || '';
    const numMedia = Number(params.NumMedia || 0);
    const messageStatus = params.MessageStatus || ''; // delivery callbacks
    const errorCode = params.ErrorCode || '';

    // Quote-reply context: when the sender REPLIES to a specific earlier message
    // from us (the assistant fires many alerts), Twilio sends
    // OriginalRepliedMessageSid. Prepend that message's text so the conversation
    // agent answers about THAT alert, not the latest turn. Declared at handler
    // scope so both agent-routing branches can use it; raw `body` stays clean for
    // intent-matching, history, and logging.
    let agentInput = body;
    if (body && params.OriginalRepliedMessageSid) {
      const quoted = await fetchRepliedMessageText(params.OriginalRepliedMessageSid);
      if (quoted) {
        agentInput = `הגבתי (reply) על ההודעה הבאה מהמערכת:\n"""\n${quoted.slice(0, 700)}\n"""\n\nהתגובה/שאלה שלי: ${body}`;
      }
    }

    // ── D3 router (only runs on the platform-entrypoint container = 'alena').
    // Status callbacks and internal-forwarded requests skip the router.
    const isInternalForward = req.headers['x-tenant-routed'] === '1';
    const isStatusCB = !body && messageStatus;
    const me = currentTenantSlug();
    if (!isInternalForward && !isStatusCB && from && me === 'alena') {
      try {
        const resolution = await resolveTenantFromMessage(from, body);
        req.log.info({ from, slug: resolution.slug, source: resolution.source, body_head: body.slice(0, 30) }, '[d3-router] resolved');
        if (resolution.slug !== me) {
          // Forward the ENTIRE Twilio payload to the target tenant's container.
          // We strip the "+slug" prefix from Body so the downstream logic sees
          // a clean message; everything else (media, sid, from/to) is preserved.
          const forwardParams: Record<string, string> = { ...params };
          if (resolution.source === 'prefix' && resolution.bodyAfterPrefix !== undefined) {
            forwardParams.Body = resolution.bodyAfterPrefix;
          }
          const targetUrl = containerUrlForSlug(resolution.slug) + '/api/twilio/whatsapp-inbox';
          try {
            // Update phone→tenant memory BEFORE forwarding to eliminate any
            // race where a fast-fired second message arrives before the write.
            await setLastTenant(from, resolution.slug);
            req.log.info({ from, slug: resolution.slug }, '[d3-router] setLastTenant complete, forwarding');
            const fwdRes = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Tenant-Routed': '1',
              },
              body: new URLSearchParams(forwardParams).toString(),
            });
            const fwdBody = await fwdRes.text();
            reply.code(fwdRes.status).type(fwdRes.headers.get('content-type') || 'text/xml').send(fwdBody);
            return;
          } catch (e: any) {
            req.log.error({ err: e?.message, slug: resolution.slug }, '[d3-router] forward failed — falling through to local handler');
            // Fall through — better to process on alena than to drop the message.
          }
        } else {
          // Slug resolved to us. If it was via prefix, strip the prefix from the
          // body so downstream logic doesn't see the routing token.
          if (resolution.source === 'prefix' && resolution.bodyAfterPrefix !== undefined) {
            body = resolution.bodyAfterPrefix;
          }
          // Remember this phone belongs to us going forward. AWAITED so a fast
          // next message from the same phone doesn't race and read stale state.
          await setLastTenant(from, me);
          req.log.info({ from, slug: me }, '[d3-router] setLastTenant to self');
        }
      } catch (e: any) {
        req.log.error({ err: e?.message }, '[d3-router] resolution failed — falling through');
        // Never let router errors block message handling.
      }
    } else if (!isStatusCB && from && me !== 'alena' && isInternalForward) {
      // We're a tenant container that got forwarded a message. Remember
      // this phone talked to us so their next direct message would also
      // route here if the platform default ever changes.
      await setLastTenant(from, me);
      req.log.info({ from, slug: me }, '[d3-router] forwarded-in, setLastTenant');
    }

    // If this is a status callback (no Body, has MessageStatus), update
    // an existing outbound message row.
    const isStatusCallback = !body && messageStatus;
    try {
      if (isStatusCallback) {
        await (prisma as any).whatsAppMessage.updateMany({
          where: { twilio_sid: sid },
          data: {
            status: messageStatus,
            error_code: errorCode || null,
          },
        });
        req.log.info({ sid, messageStatus }, '[twilio-webhook] status update');
      } else if (from && (body || numMedia > 0)) {
        // Media-only messages have an empty body — without the numMedia guard
        // they'd silently fall out of the entire handler. That's why sending
        // an invoice photo with no caption produced no reply.
        // ── Onboarding agent (HIGHEST priority): if the sender is a tenant
        // owner mid-onboarding, that flow trumps the admin agent. Otherwise
        // an admin who owns multiple tenants would get generic admin replies
        // instead of the onboarding wizard.
        //
        // numMedia === 0 GUARD: WhatsApp sends documents (docx/xlsx/pdf) with the
        // FILENAME as Body. Without this guard the text brain consumed the file
        // message ("just paste the content") and the file handler below never
        // ran — so office files were never read. When there's an attachment, let
        // the audio/file branches handle it; text-only messages come here.
        if (body && numMedia === 0) {
          // A recognized owner / co-owner / manager / employee of an EXISTING
          // tenant is NOT a new-tenant signup — a stale onboarding session must
          // never shadow the owner agent for them (this is why a co-owner kept
          // getting "let's finish setting up the restaurant" instead of a reply).
          let isKnownBusinessMember = false;
          try {
            const { resolveAccessScope } = await import('../lib/whatsappPermissions.js');
            isKnownBusinessMember = (await resolveAccessScope(from)).role !== 'guest';
          } catch { /* treat as unknown → allow onboarding */ }
          if (!isKnownBusinessMember) {
            try {
              const handled = await tryHandleOnboardingMessage(from, body);
              if (handled) {
                reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
                return;
              }
            } catch (e: any) {
              req.log.warn({ err: e?.message }, '[whatsapp-agent] onboarding handler failed');
              // A phone mid-onboarding is OWNED by the wizard. A transient
              // failure (e.g. DB connection hiccup) must NOT fall through to the
              // admin agent below — that forwards the client's message to the
              // platform owner and leaves the client with no reply (exactly the
              // "it disconnected him and messaged me" symptom). Soft-ack the
              // client and stop here. If we truly can't tell (isOnboardingActive
              // also failed), assume onboarding and absorb — safer than leaking.
              const stillOnboarding = await isOnboardingActive(from).catch(() => true);
              if (stillOnboarding) {
                try {
                  const { sendWhatsApp } = await import('../lib/twilio.js');
                  await sendWhatsApp(from, 'רגע אחד ואני חוזר אליך 🙏 יש עומס קטן על המערכת — נסה לשלוח את ההודעה האחרונה שוב עוד רגע.');
                } catch { /* best-effort */ }
                reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
                return;
              }
            }
          }
        }
        // ── Onboarding VOICE note: an owner mid-onboarding sent an audio
        // message. Transcribe → feed the transcript to the text brain. Must
        // run BEFORE the file-classifier branch (which can't read audio) and
        // before the admin voice agent. ACK fast, transcribe in background.
        if (numMedia >= 1 && params.MediaUrl0 && String(params.MediaContentType0 || '').toLowerCase().startsWith('audio/')) {
          try {
            // Same guard as the text path: a recognized owner/co-owner/employee
            // of an existing tenant is never a new-tenant signup, so a stale
            // onboarding session must not hijack their voice note either.
            let isKnownBusinessMember = false;
            try {
              const { resolveAccessScope } = await import('../lib/whatsappPermissions.js');
              isKnownBusinessMember = (await resolveAccessScope(from)).role !== 'guest';
            } catch { /* treat as unknown → allow onboarding */ }
            if (!isKnownBusinessMember && await isOnboardingActive(from)) {
              reply.type('text/xml').send(
                '<?xml version="1.0" encoding="UTF-8"?><Response><Message>🎙️ קיבלתי את ההקלטה, רגע מתמלל...</Message></Response>',
              );
              void (async () => {
                try {
                  const transcript = await transcribeWhatsAppVoice(params.MediaUrl0);
                  if (transcript) await tryHandleOnboardingMessage(from, transcript);
                  else await sendWhatsApp(from, 'לא הצלחתי לתמלל את ההקלטה 🤔 אפשר לכתוב לי במקום?');
                } catch (e: any) {
                  req.log.warn({ err: e?.message }, '[onboarding] voice transcribe failed');
                }
              })();
              return;
            }
          } catch (e: any) {
            req.log.warn({ err: e?.message }, '[onboarding] voice branch failed');
          }
        }
        // ── Onboarding FILE (menu / schedule / employee list / checklist...).
        // Must run BEFORE the admin branch: an owner who is also a WhatsApp
        // admin (like Dvir testing) would otherwise get the invoice-scanner
        // reply. Classification + extraction take 20-60s so we ACK and finish
        // in the background.
        if (numMedia >= 1 && params.MediaUrl0) {
          try {
            const claimed = await tryHandleOnboardingMedia(
              from, params.MediaUrl0, String(params.MediaContentType0 || ''),
            );
            if (claimed) {
              reply.type('text/xml').send(
                '<?xml version="1.0" encoding="UTF-8"?><Response><Message>📥 קיבלתי את הקובץ! קורא ומטמיע במערכת... תוך כדקה אשלח סיכום 🚀</Message></Response>',
              );
              return;
            }
          } catch (e: any) {
            req.log.warn({ err: e?.message }, '[whatsapp-agent] onboarding media handler failed');
          }
        }
        // ── Admin agent: route owner/manager messages to read-only commands.
        // Runs BEFORE the unsubscribe + inbox-archival flow so admin commands
        // bypass the noisy admin-push and don't tip the unsubscribe regex.
        if (isWhatsAppAdmin(from)) {
          // (A) Media — branched by MIME type. Twilio populates MediaUrl0..N
          // and MediaContentType0..N for each attachment. We only process the
          // first one for now. Both branches ACK immediately (Twilio has a 15s
          // timeout, OCR and transcription both take 10-20s) and reply async.
          if (numMedia >= 1 && params.MediaUrl0) {
            const mediaUrl = params.MediaUrl0;
            const mediaType = String(params.MediaContentType0 || '').toLowerCase();
            const isAudio = mediaType.startsWith('audio/');
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body: body || (isAudio ? '(voice)' : '(media)'),
                num_media: numMedia, status: 'received',
                raw: { ...params, admin_invoice: !isAudio, admin_voice: isAudio } as any,
                is_read: true,
              },
            }).catch(() => {});
            reply.type('text/xml').send(
              isAudio
                ? '<?xml version="1.0" encoding="UTF-8"?><Response><Message>🎙️ קיבלתי את ההקלטה, מתמלל... תוך כ-15 שניות תקבל תשובה.</Message></Response>'
                : '<?xml version="1.0" encoding="UTF-8"?><Response><Message>📥 קיבלתי, קורא את המסמך... תוך כ-20 שניות תקבל סיכום.</Message></Response>',
            );
            // Process + reply in the background. Errors logged but never crash.
            void (async () => {
              try {
                if (isAudio) {
                  // Transcribe → treat as a text command (recurse through the
                  // same proposal / confirm / read routers we use for typed text).
                  const transcript = await transcribeWhatsAppVoice(mediaUrl);
                  req.log.info({ from, transcript: transcript.slice(0, 100) }, '[whatsapp-agent] voice transcribed');
                  if (!transcript) {
                    await sendWhatsApp(from, '🤔 לא הצלחתי לתמלל את ההקלטה. נסה שוב או כתוב.');
                    return;
                  }
                  // Echo the transcript first so the user sees what we heard.
                  await sendWhatsApp(from, `🎙️ *שמעתי*: "${transcript}"`);
                  // Then route through the same handlers as a text message.
                  const actionConfirm = await tryConfirmPendingAction(from, transcript);
                  if (actionConfirm) { await sendWhatsApp(from, actionConfirm); return; }
                  const invConfirm = await tryConfirmPendingInvoice(from, transcript);
                  if (invConfirm) { await sendWhatsApp(from, invConfirm); return; }
                  const cmdReply = await tryHandleAdminCommand(from, transcript);
                  if (cmdReply && cmdReply !== '🤔 לא הבנתי את הפקודה. שלח/י *עזרה* לרשימת פקודות.') {
                    await sendWhatsApp(from, cmdReply); return;
                  }
                  const proposal = await tryProposeAction(from, transcript);
                  if (proposal) { await sendWhatsApp(from, proposal); return; }
                  await sendWhatsApp(from, '🤔 לא הבנתי. נסה שוב או שלח *עזרה*.');
                } else {
                  // First try the universal scanner (menu/checklist/employees/
                  // suppliers/order list). It returns a preview+confirm string
                  // for those, or null → fall through to invoice OCR unchanged.
                  const scanReply = await tryHandleAdminScanMedia(mediaUrl, from);
                  if (scanReply) {
                    req.log.info({ from, media_url: mediaUrl }, '[whatsapp-agent] admin scan preview sent');
                    await sendWhatsApp(from, scanReply);
                    return;
                  }
                  const invoiceReply = await handleAdminInvoiceMedia(mediaUrl, from);
                  req.log.info({ from, media_url: mediaUrl }, '[whatsapp-agent] admin invoice processed');
                  await sendWhatsApp(from, invoiceReply);
                }
              } catch (e: any) {
                req.log.error({ err: e?.message }, '[whatsapp-agent] media flow crashed');
                try {
                  await sendWhatsApp(from, `❌ נכשלתי בעיבוד: ${e?.message || 'unknown'}`);
                } catch { /* best effort */ }
              }
            })();
            return;
          }
          // (B-scan) Confirmation of a pending universal-scan import (כן/לא after
          // a menu/checklist/employees/suppliers/order preview). Checked first so
          // its כן/לא isn't swallowed by the generic action/invoice routers.
          const scanConfirmReply = await tryConfirmPendingScan(from, body);
          if (scanConfirmReply) {
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_scan_confirm: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 40) }, '[whatsapp-agent] scan confirm handled');
            const escapedScan = scanConfirmReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedScan}</Message></Response>`,
            );
            return;
          }
          // (B0) Generic action confirmation (כן/לא following a 2-step proposal).
          // Checked before the invoice-specific confirm so any pending action
          // gets first dibs on the כן/לא reply within its 10-min window.
          const actionConfirmReply = await tryConfirmPendingAction(from, body);
          if (actionConfirmReply) {
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_action_confirm: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 40) }, '[whatsapp-agent] action confirm handled');
            const escapedAct = actionConfirmReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedAct}</Message></Response>`,
            );
            return;
          }
          // (B) Confirmation of a pending invoice draft (אישור/ביטול). Checked
          // first so the words don't fall into the generic command router.
          const confirmReply = await tryConfirmPendingInvoice(from, body);
          if (confirmReply) {
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_invoice_confirm: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 40) }, '[whatsapp-agent] invoice confirm handled');
            const escapedConfirm = confirmReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedConfirm}</Message></Response>`,
            );
            return;
          }
          // (B1) Daily-hours report reply — "מאושר" to approve, or "דני 6 שעות"
          // to correct. Only engages when a recent report snapshot exists; else
          // returns null and we fall through to the normal admin flow.
          const hoursReply = await tryHandleDailyHoursReply(from, body);
          if (hoursReply) {
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_hours_reply: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 60) }, '[whatsapp-agent] daily-hours reply handled');
            const escapedHours = hoursReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedHours}</Message></Response>`,
            );
            return;
          }
          // (C-pre) Schedule-build commands run the LLM (~20-30s) which blows
          // past Twilio's ~15s webhook timeout. ACK immediately, do the LLM
          // work in background, deliver the reply via outbound sendWhatsApp.
          const isBuildCmd = /^(בנה|תבנה|תיבנה|צור|תצור|יצור|בונה|תיבנ|במה)\s+(סידור|לוז|לו\s*ז)/i.test(body);
          const isReplaceCmd = /^(החלף|תחליף|כן\s*החלף|החלף\s+סידור|OK\s+החלף)$/i.test(body.trim());
          if (isBuildCmd || isReplaceCmd) {
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_schedule_cmd: true } as any, is_read: true,
              },
            }).catch(() => {});
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${
                isReplaceCmd ? '🔄 מחליף... כ-5 שניות' : '⏳ בונה סידור... כ-30 שניות'
              }</Message></Response>`,
            );
            void (async () => {
              try {
                const r = await tryHandleAdminCommand(from, body);
                if (r) await sendWhatsApp(from, r);
              } catch (e: any) {
                req.log.error({ err: e?.message }, '[whatsapp-agent] schedule cmd crashed');
                try { await sendWhatsApp(from, `⚠️ שגיאה בבניית סידור: ${e?.message || 'unknown'}`); } catch { /* noop */ }
              }
            })();
            return;
          }
          // (C) Text command — fast deterministic read-only commands.
          const agentReply = await tryHandleAdminCommand(from, body);
          if (agentReply && agentReply !== '🤔 לא הבנתי את הפקודה. שלח/י *עזרה* לרשימת פקודות.') {
            // Mirror to WhatsAppMessage so the inbox UI still has a record.
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_command: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 80) }, '[whatsapp-agent] admin command served');
            const escaped = agentReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
            );
            return;
          }
          // (D) Write-action intent (LLM-based parser). Slow (~3-5s for the
          // Gemini classify call) → ACK first, propose in background.
          await (prisma as any).whatsAppMessage.create({
            data: {
              twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
              contact_phone: from, body, num_media: numMedia, status: 'received',
              raw: { ...params, admin_action_attempt: true } as any, is_read: true,
            },
          }).catch(() => {});
          reply.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          );
          void (async () => {
            try {
              const proposal = await tryProposeAction(from, body);
              if (proposal) {
                await sendWhatsApp(from, proposal);
                req.log.info({ from }, '[whatsapp-agent] action proposal sent');
              } else {
                // No deterministic intent matched → conversational agent with tools.
                // Maintains chat history, calls read/write tools as needed, never
                // returns 'didn't understand'.
                req.log.info({ from }, '[whatsapp-agent] falling through to conversation agent');
                const reply = await runConversationAgent(from, agentInput);
                await sendWhatsApp(from, reply || '🤔 לא בטוח איך לעזור — תוכל להרחיב?');
              }
            } catch (e: any) {
              req.log.error({ err: e?.message }, '[whatsapp-agent] action flow crashed');
              try { await sendWhatsApp(from, `⚠️ שגיאה: ${e?.message || 'unknown'}`); } catch { /* noop */ }
            }
          })();
          return;
        }
        // ── Owner / co-owner / manager / employee agent: route any RECOGNIZED
        // sender to the conversation agent. resolveAccessScope returns 'guest'
        // only for a truly unknown number — an env admin, the per-tenant
        // registered owner, a co-owner in the recipients list, a manager, or any
        // employee all get the role-scoped agent (buildSystemPrompt serves the
        // right prompt). This is why adding someone as a co-owner in the
        // recipients list lets them talk to the bot even though they're not in
        // WHATSAPP_ADMIN_NUMBERS and not an Employee. Runs BEFORE the unsubscribe
        // + customer logging so recognized messages never trigger marketing replies.
        try {
          const { resolveAccessScope } = await import('../lib/whatsappPermissions.js');
          const scope = await resolveAccessScope(from);
          if (scope.role !== 'guest') {
            req.log.info({ from, role: scope.role, name: scope.employee_name }, '[whatsapp-agent] recognized sender — routing to conversation agent');
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, agent_role: scope.role, employee_id: scope.employee_id } as any, is_read: true,
              },
            }).catch(() => {});
            reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
            void (async () => {
              try {
                const replyText = await runConversationAgent(from, agentInput);
                if (replyText) await sendWhatsApp(from, replyText);
              } catch (e: any) {
                req.log.error({ err: e?.message }, '[whatsapp-agent] agent flow crashed');
                try { await sendWhatsApp(from, '⚠️ סליחה, היה לי באג. נסה שוב בעוד דקה.'); } catch { /* noop */ }
              }
            })();
            return;
          }
        } catch (e: any) {
          req.log.warn({ err: e?.message }, '[whatsapp-agent] scope lookup failed — continuing as customer');
        }

        // ── Self-service unsubscribe ──────────────────────────────────────
        // Customer replied "הסר" (or similar) → opt them out of marketing
        // immediately and confirm with an auto-reply. Required by spam law:
        // the removal channel must be the same channel the message came on.
        const isUnsubscribe = /^(הסר|הסירו|להסיר|הסרה|תסירו|stop|unsubscribe)(?:\s|$|[.,!?])/i.test(body.trim());
        if (isUnsubscribe) {
          const cleanPhone = from.replace(/[^\d]/g, '');
          const variants = [cleanPhone, cleanPhone.replace(/^972/, '0'), cleanPhone.replace(/^0/, '972')];
          try {
            const updated = await (prisma as any).customer.updateMany({
              where: { phone: { in: variants } },
              data: { marketing_consent: false, marketing_unsubscribed_at: new Date() },
            });
            req.log.info({ from, count: updated.count }, '[twilio-webhook] unsubscribe processed');
          } catch (e: any) {
            req.log.error({ err: e?.message }, '[twilio-webhook] unsubscribe failed');
          }
          // TwiML auto-reply confirming the removal (free — service window)
          reply.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Message>הוסרת מרשימת הדיוור של עלינא ✅ לא תקבל/י מאיתנו עוד הודעות שיווק. אם תרצה/י לחזור — אפשר להירשם שוב בכל ביקור 🌿</Message></Response>'
          );
          return;
        }
        // Inbound message — save and notify owner
        await (prisma as any).whatsAppMessage.create({
          data: {
            twilio_sid: sid || null,
            direction: 'inbound',
            from_phone: from,
            to_phone: to,
            contact_phone: from,
            body,
            num_media: numMedia,
            status: 'received',
            raw: params as any,
            is_read: false,
          },
        }).catch((e: any) => { req.log.error({ err: e?.message }, '[twilio-webhook] insert failed'); });

        // Push notification to admin so they see new message even if not in app
        try {
          await pushoverToAdmins(
            `💬 ${from}`,
            body.slice(0, 200),
          );
        } catch { /* best effort */ }
      }
    } catch (e: any) {
      req.log.error({ err: e?.message }, '[twilio-webhook] handler failed');
    }

    // Twilio expects a TwiML response (empty is fine — no auto-reply)
    reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  // Twilio delivery/read status callback for marketing campaigns.
  // Twilio POSTs here with MessageStatus values: queued, sent, delivered, read, failed.
  // We use the ?rid=<CampaignRecipient.id> query param (set when we created the message)
  // to update the right row, and also update the parent CampaignSend aggregate counts.
  // Forced rebuild 2026-06-09 — Prisma client needs CampaignRecipient regen.
  app.post('/campaign-status', async (req, reply) => {
    const b = (req.body || {}) as Record<string, string>;
    const status = String(b.MessageStatus || b.SmsStatus || '').toLowerCase();
    const sid = b.MessageSid || b.SmsSid;
    const recipientId = (req.query as any)?.rid;
    const errorCode = b.ErrorCode;
    const errorMessage = b.ErrorMessage;
    if (!status) { reply.code(200).send('ok'); return; }
    try {
      // Find the recipient: prefer ?rid= (faster), fallback to twilio_sid match.
      let recipient: any = null;
      if (recipientId) {
        recipient = await prisma.campaignRecipient.findUnique({ where: { id: String(recipientId) } });
      }
      if (!recipient && sid) {
        recipient = await prisma.campaignRecipient.findUnique({ where: { twilio_sid: String(sid) } });
      }
      if (!recipient) { reply.code(200).send('ok'); return; }

      const updates: any = { status };
      if (status === 'delivered' && !recipient.delivered_at) updates.delivered_at = new Date();
      if (status === 'read' && !recipient.read_at) updates.read_at = new Date();
      if (status === 'failed' || status === 'undelivered') {
        updates.failed_at = new Date();
        updates.failure_reason = errorMessage || errorCode || 'failed';
      }
      if (sid && !recipient.twilio_sid) updates.twilio_sid = sid;
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: updates });

      // Update parent aggregate counts (only on first time each status hits)
      if ((status === 'delivered' && !recipient.delivered_at) ||
          (status === 'read' && !recipient.read_at)) {
        const field = status === 'delivered' ? 'delivered_count' : 'read_count';
        await prisma.campaignSend.update({
          where: { id: recipient.campaign_send_id },
          data: { [field]: { increment: 1 } },
        }).catch(() => {});
      }
    } catch (e: any) {
      app.log.warn({ err: e?.message, status }, 'campaign-status update failed');
    }
    reply.code(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
};
