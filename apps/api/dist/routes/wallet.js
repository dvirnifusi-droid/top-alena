import { prisma } from '../db.js';
import { verifyCustomerSignature } from '../lib/marketingBlast.js';
import { listBenefits, tierLabel } from '../lib/clubCore.js';
import { buildApplePass, buildGoogleWalletLink, walletAvailability } from '../lib/walletPass.js';
import { getBrandName } from '../lib/brandName.js';
const dbx = () => prisma;
async function passDataFor(cid) {
    const cust = await dbx().customer.findUnique({ where: { id: cid } }).catch(() => null);
    if (!cust)
        return null;
    const { active } = await listBenefits(cid);
    // The pass shows the benefit expiring soonest — the one that matters now.
    const soonest = [...active].sort((a, b) => String(a.expiry_date || '9999').localeCompare(String(b.expiry_date || '9999')))[0];
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
export const walletRoutes = async (app) => {
    /** Availability, so the member card only offers a wallet that is set up. */
    app.get('/availability', async () => await walletAvailability());
    app.get('/apple', async (req, reply) => {
        const { c, s } = (req.query || {});
        const cid = String(c || '');
        if (!cid || !verifyCustomerSignature(cid, String(s || ''))) {
            return reply.code(403).send({ error: 'invalid_link' });
        }
        const data = await passDataFor(cid);
        if (!data)
            return reply.code(404).send({ error: 'not_found' });
        let pass = null;
        try {
            pass = await buildApplePass(data);
        }
        catch (e) {
            req.log?.error({ err: e?.message }, 'apple pass build failed');
            return reply.code(500).send({ error: 'pass_build_failed', message: e?.message });
        }
        // Not configured is a different thing from broken, and the member card asks
        // this route only when availability said yes — so this is a real 503.
        if (!pass)
            return reply.code(503).send({ error: 'apple_wallet_not_configured' });
        return reply
            .header('Content-Type', 'application/vnd.apple.pkpass')
            .header('Content-Disposition', 'attachment; filename="club.pkpass"')
            .send(pass);
    });
    app.get('/google', async (req, reply) => {
        const { c, s } = (req.query || {});
        const cid = String(c || '');
        if (!cid || !verifyCustomerSignature(cid, String(s || ''))) {
            return reply.code(403).send({ error: 'invalid_link' });
        }
        const data = await passDataFor(cid);
        if (!data)
            return reply.code(404).send({ error: 'not_found' });
        let link = null;
        try {
            link = await buildGoogleWalletLink(data);
        }
        catch (e) {
            req.log?.error({ err: e?.message }, 'google wallet link failed');
            return reply.code(500).send({ error: 'link_build_failed', message: e?.message });
        }
        if (!link)
            return reply.code(503).send({ error: 'google_wallet_not_configured' });
        return reply.redirect(link);
    });
};
//# sourceMappingURL=wallet.js.map