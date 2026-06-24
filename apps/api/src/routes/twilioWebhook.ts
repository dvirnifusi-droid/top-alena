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
import { sendWhatsApp } from '../lib/twilio.js';

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
    const body = params.Body || '';
    const numMedia = Number(params.NumMedia || 0);
    const messageStatus = params.MessageStatus || ''; // delivery callbacks
    const errorCode = params.ErrorCode || '';

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
        // ── Admin agent: route owner/manager messages to read-only commands.
        // Runs BEFORE the unsubscribe + inbox-archival flow so admin commands
        // bypass the noisy admin-push and don't tip the unsubscribe regex.
        if (isWhatsAppAdmin(from)) {
          // (A) Media — invoice OCR flow. Twilio populates MediaUrl0..N for each
          // attachment. We only process the first one for now; multi-page PDFs are
          // a single media item already, and most invoice photos are one image.
          //
          // ⏱  OCR takes 10-20 seconds (download + upload + Gemini Vision), which
          // exceeds Twilio's 15-second webhook timeout. So we ACK immediately and
          // process + reply asynchronously via sendWhatsApp (free, inside the 24h
          // service window the inbound message itself just opened).
          if (numMedia >= 1 && params.MediaUrl0) {
            const mediaUrl = params.MediaUrl0;
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body: body || '(media)', num_media: numMedia, status: 'received',
                raw: { ...params, admin_invoice: true } as any, is_read: true,
              },
            }).catch(() => {});
            // Quick ack so Twilio doesn't time us out.
            reply.type('text/xml').send(
              '<?xml version="1.0" encoding="UTF-8"?><Response><Message>📥 קיבלתי את החשבונית, מעבד... תוך כ-20 שניות תקבל סיכום.</Message></Response>',
            );
            // Process + reply in the background. Errors are logged but never crash the request.
            void (async () => {
              try {
                const invoiceReply = await handleAdminInvoiceMedia(mediaUrl, from);
                req.log.info({ from, media_url: mediaUrl }, '[whatsapp-agent] admin invoice processed');
                await sendWhatsApp(from, invoiceReply);
              } catch (e: any) {
                req.log.error({ err: e?.message }, '[whatsapp-agent] invoice flow crashed');
                try {
                  await sendWhatsApp(from, `❌ נכשלתי בעיבוד החשבונית: ${e?.message || 'unknown'}\nנסה לשלוח שוב או הזן ידנית.`);
                } catch { /* best effort */ }
              }
            })();
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
          // (C) Text command
          const agentReply = await tryHandleAdminCommand(from, body);
          if (agentReply) {
            // Mirror to WhatsAppMessage so the inbox UI still has a record.
            await (prisma as any).whatsAppMessage.create({
              data: {
                twilio_sid: sid || null, direction: 'inbound', from_phone: from, to_phone: to,
                contact_phone: from, body, num_media: numMedia, status: 'received',
                raw: { ...params, admin_command: true } as any, is_read: true,
              },
            }).catch(() => {});
            req.log.info({ from, body: body.slice(0, 80) }, '[whatsapp-agent] admin command served');
            // TwiML body is XML — escape characters that would break the wrapper.
            const escaped = agentReply
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            reply.type('text/xml').send(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
            );
            return;
          }
        }
        // ── Self-service unsubscribe ──────────────────────────────────────
        // Customer replied "הסר" (or similar) → opt them out of marketing
        // immediately and confirm with an auto-reply. Required by spam law:
        // the removal channel must be the same channel the message came on.
        const isUnsubscribe = /^(הסר|הסירו|להסיר|הסרה|תסירו|stop|unsubscribe)\b/i.test(body.trim());
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
