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
import { sendSms, sendWhatsApp } from './twilio.js';
import { sendEmail } from './email.js';

const dbx = () => prisma as any;

export type BlastChannel = 'sms' | 'email' | 'whatsapp';

export type BlastResult = {
  sent: number;
  failed: number;
  skipped: {
    no_consent: number;
    unsubscribed: number;
    no_address: number;
  };
  skipped_names: string[];
  total_selected: number;
};

/** Only these two facts decide it, and both live on the customer record. */
function mayReceiveMarketing(c: any): { ok: boolean; reason?: keyof BlastResult['skipped'] } {
  if (c.marketing_unsubscribed_at) return { ok: false, reason: 'unsubscribed' };
  if (c.marketing_consent !== true) return { ok: false, reason: 'no_consent' };
  return { ok: true };
}

export async function sendMarketingBlast(opts: {
  customerIds: string[];
  channel: BlastChannel;
  message: string;
  subject?: string;
  imageUrl?: string;
}): Promise<BlastResult> {
  const ids = [...new Set((opts.customerIds || []).map(String))].filter(Boolean);
  const res: BlastResult = {
    sent: 0, failed: 0,
    skipped: { no_consent: 0, unsubscribed: 0, no_address: 0 },
    skipped_names: [], total_selected: ids.length,
  };
  if (!ids.length || !opts.message) return res;

  const customers: any[] = await dbx().customer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, phone: true, email: true,
      marketing_consent: true, marketing_unsubscribed_at: true,
    },
  }).catch(() => []);

  const allowed: any[] = [];
  for (const c of customers) {
    const verdict = mayReceiveMarketing(c);
    if (!verdict.ok) {
      res.skipped[verdict.reason!]++;
      if (res.skipped_names.length < 20) res.skipped_names.push(c.name || c.phone || '—');
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
      const text = String(opts.message).replace(/\{שם\}|\{name\}/g, c.name || '');
      if (opts.channel === 'email') {
        const html = opts.imageUrl
          ? `${text}\n\n<img src="${opts.imageUrl}" style="max-width:100%;border-radius:8px;" />`
          : undefined;
        return sendEmail({ to: c.email, subject: opts.subject || '', text, html });
      }
      if (opts.channel === 'whatsapp') return sendWhatsApp(c.phone, text);
      return sendSms(c.phone, text);
    }));
    for (const r of results) r.status === 'fulfilled' ? res.sent++ : res.failed++;
  }

  // Stamp who was contacted, so the throttle the drip campaigns rely on also
  // accounts for messages sent by hand.
  if (allowed.length) {
    await dbx().customer.updateMany({
      where: { id: { in: allowed.map((c) => c.id) } },
      data: { last_marketing_sent_at: new Date() },
    }).catch(() => {});
  }

  return res;
}
