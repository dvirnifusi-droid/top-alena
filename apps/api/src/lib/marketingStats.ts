// What the marketing campaigns actually did.
//
// The marketing dashboard read CampaignLog, which only InstagramStudio writes —
// so it showed social posts and nothing else, while every real send (birthday,
// welcome, anniversary, NPS, manual blasts, A/B tests) landed in CampaignSend
// and was never displayed. The page was not empty because nothing had been sent;
// it was empty because it was reading the wrong table.
import { prisma } from '../db.js';

const dbx = () => prisma as any;

export type CampaignRow = {
  id: string;
  label: string;
  channel: string;
  sent_at: string;
  recipients: number;
  accepted: number;
  failed: number;
  /**
   * Whether delivery was measured at all.
   *
   * Only the manual sender and the A/B sender register a Twilio status callback,
   * so only those ever learn what happened after handoff. The automatic drips
   * do not, and their delivered_count sits at zero forever — which is absence of
   * measurement, not evidence of failure. Reporting those as "0% delivered"
   * would invent a crisis; they are reported as unmeasured instead.
   */
  tracked: boolean;
  delivered: number;
  read: number;
};

export type MarketingStats = {
  days: number;
  campaigns: CampaignRow[];
  totals: {
    campaigns: number;
    recipients: number;
    accepted: number;
    failed: number;
  };
  /** Computed over tracked campaigns ONLY. Null when nothing was measured. */
  delivery: {
    tracked_campaigns: number;
    tracked_recipients: number;
    delivered: number;
    read: number;
    delivered_pct: number;
  } | null;
  by_day: Array<{ date: string; whatsapp: number; sms: number; email: number }>;
};

export async function marketingStats(days = 30): Promise<MarketingStats> {
  const window = Math.max(1, Math.min(365, Math.round(days)));
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT s.id, s.campaign_label, s.campaign_key, s.channel, s.sent_at,
            s.recipient_count, s.success_count, s.failure_count,
            s.delivered_count, s.read_count,
            COUNT(r.id)::int AS tracked_recipients
       FROM "CampaignSend" s
       LEFT JOIN "CampaignRecipient" r ON r.campaign_send_id = s.id
      WHERE s.sent_at >= NOW() - ($1 || ' days')::interval
      GROUP BY s.id
      ORDER BY s.sent_at DESC
      LIMIT 300`,
    String(window),
  ).catch(() => []);

  const campaigns: CampaignRow[] = (rows || []).map((r) => ({
    id: r.id,
    label: r.campaign_label || r.campaign_key || 'קמפיין',
    channel: r.channel || 'whatsapp',
    sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : '',
    recipients: Number(r.recipient_count) || 0,
    accepted: Number(r.success_count) || 0,
    failed: Number(r.failure_count) || 0,
    tracked: Number(r.tracked_recipients) > 0,
    delivered: Number(r.delivered_count) || 0,
    read: Number(r.read_count) || 0,
  }));

  const totals = campaigns.reduce(
    (a, c) => ({
      campaigns: a.campaigns + 1,
      recipients: a.recipients + c.recipients,
      accepted: a.accepted + c.accepted,
      failed: a.failed + c.failed,
    }),
    { campaigns: 0, recipients: 0, accepted: 0, failed: 0 },
  );

  const tracked = campaigns.filter((c) => c.tracked);
  const trackedRecipients = tracked.reduce((s, c) => s + c.accepted, 0);
  const delivered = tracked.reduce((s, c) => s + c.delivered, 0);
  const read = tracked.reduce((s, c) => s + c.read, 0);

  // Build the day series from the campaigns themselves rather than a fixed
  // calendar loop, so a quiet day is simply absent instead of a fake zero.
  const dayMap = new Map<string, { date: string; whatsapp: number; sms: number; email: number }>();
  for (let i = window - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dayMap.set(d, { date: d, whatsapp: 0, sms: 0, email: 0 });
  }
  for (const c of campaigns) {
    const d = c.sent_at.slice(0, 10);
    const bucket = dayMap.get(d);
    if (!bucket) continue;
    const ch = c.channel === 'sms' ? 'sms' : c.channel === 'email' ? 'email' : 'whatsapp';
    bucket[ch] += c.accepted;
  }

  return {
    days: window,
    campaigns,
    totals,
    delivery: tracked.length
      ? {
          tracked_campaigns: tracked.length,
          tracked_recipients: trackedRecipients,
          delivered,
          read,
          delivered_pct: trackedRecipients ? Math.round((delivered / trackedRecipients) * 100) : 0,
        }
      : null,
    by_day: [...dayMap.values()],
  };
}
