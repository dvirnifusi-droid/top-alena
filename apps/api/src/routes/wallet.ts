// Serving the club card into a phone's wallet.
//
// These are real routes rather than registered functions because a .pkpass is a
// binary file with a content type Apple insists on — the JSON function layer
// cannot carry it.
//
// Both are public and both are signed with the same HMAC as the member card and
// the opt-out link. A wallet pass names its holder and carries their benefit, so
// a bare customer id would let a guessed URL mint someone else's card.
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { verifyCustomerSignature } from '../lib/marketingBlast.js';
import { listBenefits, tierLabel, getClubConfig } from '../lib/clubCore.js';
import { buildApplePass, buildGoogleWalletLink, walletAvailability, type PassData } from '../lib/walletPass.js';
import { getBrandName } from '../lib/brandName.js';

const dbx = () => prisma as any;

async function passDataFor(cid: string): Promise<PassData | null> {
  const cust = await dbx().customer.findUnique({ where: { id: cid } }).catch(() => null);
  if (!cust) return null;
  const { active } = await listBenefits(cid);
  // The pass shows the benefit expiring soonest — the one that matters now.
  const soonest = [...active].sort((a, b) =>
    String(a.expiry_date || '9999').localeCompare(String(b.expiry_date || '9999')))[0];
  return {
    customerId: cid,
    name: cust.name || '',
    tier: tierLabel(cust.loyalty_tier),
    coins: cust.coin_balance || 0,
    benefit: soonest?.code ? { description: soonest.description, code: soonest.code } : null,
    brand: await getBrandName().catch(() => 'המסעדה'),
    redeemBaseUrl: process.env.PUBLIC_BASE_URL || 'https://topalena.com',
  };
}

export const walletRoutes = async (app: FastifyInstance) => {
  /** Availability, so the member card only offers a wallet that is set up. */
  app.get('/availability', async () => await walletAvailability());

  app.get('/apple', async (req, reply) => {
    const { c, s } = (req.query || {}) as any;
    const cid = String(c || '');
    if (!cid || !verifyCustomerSignature(cid, String(s || ''))) {
      return reply.code(403).send({ error: 'invalid_link' });
    }
    const data = await passDataFor(cid);
    if (!data) return reply.code(404).send({ error: 'not_found' });

    let pass: Buffer | null = null;
    try {
      pass = await buildApplePass(data);
    } catch (e: any) {
      req.log?.error({ err: e?.message }, 'apple pass build failed');
      return reply.code(500).send({ error: 'pass_build_failed', message: e?.message });
    }
    // Not configured is a different thing from broken, and the member card asks
    // this route only when availability said yes — so this is a real 503.
    if (!pass) return reply.code(503).send({ error: 'apple_wallet_not_configured' });

    return reply
      .header('Content-Type', 'application/vnd.apple.pkpass')
      .header('Content-Disposition', 'attachment; filename="club.pkpass"')
      .send(pass);
  });

  app.get('/google', async (req, reply) => {
    const { c, s } = (req.query || {}) as any;
    const cid = String(c || '');
    if (!cid || !verifyCustomerSignature(cid, String(s || ''))) {
      return reply.code(403).send({ error: 'invalid_link' });
    }
    const data = await passDataFor(cid);
    if (!data) return reply.code(404).send({ error: 'not_found' });

    let link: string | null = null;
    try {
      link = await buildGoogleWalletLink(data);
    } catch (e: any) {
      req.log?.error({ err: e?.message }, 'google wallet link failed');
      return reply.code(500).send({ error: 'link_build_failed', message: e?.message });
    }
    if (!link) return reply.code(503).send({ error: 'google_wallet_not_configured' });
    return reply.redirect(link);
  });
};
