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

/**
 * The tenant's logo, served from the tenant's own domain.
 *
 * Google requires a program logo — a loyalty class cannot be created without one
 * — and Google's servers fetch the URL themselves. The logo on file here points
 * at the old base44 host and answers with a redirect to Supabase; the image is
 * fine, but relying on a third party's redirect chain at Google's fetch time is
 * how a card quietly loses its logo one day.
 *
 * Fetched once and held in memory, because this is asked for by Google's
 * crawler, not by a customer's phone, and the underlying image changes about
 * never.
 */
let logoCache: { body: Buffer; type: string; at: number } | null = null;
const LOGO_TTL_MS = 6 * 60 * 60 * 1000;

async function tenantLogo(): Promise<{ body: Buffer; type: string } | null> {
  if (logoCache && Date.now() - logoCache.at < LOGO_TTL_MS) return logoCache;
  const profile: any = await dbx().restaurantProfile
    .findFirst({ select: { logo_url: true } }).catch(() => null);
  let url: string | undefined = profile?.logo_url || undefined;
  if (!url) return null;
  if (url.startsWith('/')) url = `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}${url}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    // The old host serves PNGs as application/octet-stream; Google wants a real
    // image type, so trust the PNG magic bytes over the header.
    const isPng = body.length > 8 && body[0] === 0x89 && body[1] === 0x50;
    const type = isPng ? 'image/png'
      : (res.headers.get('content-type') || '').startsWith('image/')
        ? String(res.headers.get('content-type')) : 'image/png';
    logoCache = { body, type, at: Date.now() };
    return logoCache;
  } catch {
    return null;
  }
}

export const walletRoutes = async (app: FastifyInstance) => {
  /** Availability, so the member card only offers a wallet that is set up. */
  app.get('/availability', async () => await walletAvailability());

  app.get('/logo.png', async (_req, reply) => {
    const logo = await tenantLogo();
    if (!logo) return reply.code(404).send({ error: 'no_logo_configured' });
    return reply
      .header('Content-Type', logo.type)
      .header('Cache-Control', 'public, max-age=21600')
      .send(logo.body);
  });

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
