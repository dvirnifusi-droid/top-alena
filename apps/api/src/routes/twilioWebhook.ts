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
      } else if (from && body) {
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
