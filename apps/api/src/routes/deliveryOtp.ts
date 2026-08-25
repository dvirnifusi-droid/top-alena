// OTP relay for the alenabepita.co.il delivery site.
//
// The WordPress site no longer needs its own SMS/WhatsApp provider — it POSTs
// the login code here and TOP ALENA's existing Twilio pipeline (the same one
// that sends staff shift/checklist/invoice notifications) delivers it.
//
// Auth: the same shared secret the app<->WP bridge already uses. WP sends its
// `alena_control_key` in X-Alena-Control-Key; we compare to the value we stored
// when the owner connected the site (IntegrationSecret ALENA_WP_CONTROL_KEY).
//
// Channel logic (OTP-safe):
//   - whatsapp (default): send via an approved WhatsApp *authentication* template
//     when its Content SID is configured (IntegrationSecret WA_TEMPLATE_ALENA_OTP);
//     otherwise fall straight to SMS. We deliberately DO NOT try a free-form
//     WhatsApp for OTP — outside the 24h window it fails silently (Twilio 63016),
//     which for a login code means the customer waits for a code that never comes.
//   - sms: send by SMS directly (the "didn't get it? send by SMS" escape hatch).
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { sendSms, sendWhatsAppTemplate, normalizeIsraeliPhone } from '../lib/twilio.js';

async function secret(key: string): Promise<string> {
  try {
    const r = await prisma.integrationSecret.findFirst({ where: { key } });
    if (r?.value) return r.value;
  } catch {}
  return process.env[key] || '';
}

export const deliveryOtpRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const key = await secret('ALENA_WP_CONTROL_KEY');
    const provided = (req.headers['x-alena-control-key'] as string) || '';
    if (!key || provided !== key) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }
  });

  app.post('/send-otp', async (req) => {
    const b: any = req.body || {};
    const phone = normalizeIsraeliPhone(String(b.phone || ''));
    const code = String(b.code || '').replace(/\D/g, '');
    const channel = b.channel === 'sms' ? 'sms' : 'whatsapp';
    if (!phone || phone.length < 8 || !code) return { ok: false, error: 'missing phone/code' };

    const smsBody = `קוד ההתחברות שלך לאתר עלינא: ${code}`;

    const trySms = async () => {
      const r: any = await sendSms(phone, smsBody);
      if (r?.success) return { ok: true, via: 'sms', sid: r.sid };
      if (r?.skipped) return { ok: false, via: 'sms', error: r.reason || 'sms_skipped' };
      return { ok: false, via: 'sms', error: 'sms_failed' };
    };

    if (channel === 'sms') {
      try { return await trySms(); }
      catch (e: any) { return { ok: false, via: 'sms', error: e?.message || 'sms_failed' }; }
    }

    // WhatsApp path: approved template if we have one, else SMS.
    const sid = await secret('WA_TEMPLATE_ALENA_OTP');
    if (sid) {
      try {
        const r: any = await sendWhatsAppTemplate(phone, sid, { 1: code });
        if (r?.success) return { ok: true, via: 'whatsapp', sid: r.sid };
        // skipped (missing creds / outbound disabled) — fall through to SMS
      } catch { /* template failed — fall through to SMS */ }
    }
    try { return await trySms(); }
    catch (e: any) { return { ok: false, error: e?.message || 'send_failed' }; }
  });
};
