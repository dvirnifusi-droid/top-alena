import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { encryptToken } from '../lib/emailCrypto.js';
import { testConnection } from '../lib/emailFetch.js';
import { scanEmailInvoices } from '../lib/emailInvoiceScan.js';
export const emailAccountsRoutes = async (app) => {
    app.addHook('preHandler', requireAuth);
    app.get('/', async () => {
        return prisma.emailAccount.findMany({
            select: { id: true, email: true, status: true, last_checked_at: true, last_error: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
    });
    // Connect (or reconnect) a mailbox. Validates the app password live
    // against Gmail IMAP before saving.
    app.post('/', async (req, reply) => {
        const { email, app_password } = req.body || {};
        const addr = String(email || '').trim().toLowerCase();
        const pass = String(app_password || '').replace(/\s+/g, ''); // Google displays app passwords with spaces
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) || pass.length < 8) {
            return reply.code(400).send({ error: 'bad_input', message: 'כתובת מייל או סיסמת אפליקציה לא תקינים' });
        }
        try {
            await testConnection(addr, pass);
        }
        catch {
            return reply.code(400).send({ error: 'imap_login_failed', message: 'ההתחברות לתיבה נכשלה — ודא שסיסמת האפליקציה נכונה ושאימות דו-שלבי פעיל' });
        }
        try {
            const row = await prisma.emailAccount.upsert({
                where: { email: addr },
                update: { app_password: encryptToken(pass), status: 'active', last_error: null },
                create: { email: addr, app_password: encryptToken(pass) },
            });
            return { id: row.id, email: row.email, status: row.status };
        }
        catch (e) {
            req.log?.error?.({ err: e?.message }, 'email-account save failed');
            return reply.code(500).send({ error: 'internal', message: 'שמירת התיבה נכשלה — נסה שוב' });
        }
    });
    app.delete('/:id', async (req, reply) => {
        const { id } = req.params;
        await prisma.emailAccount.delete({ where: { id } }).catch((e) => {
            if (e?.code !== 'P2025')
                throw e; // P2025 = not found — idempotent delete
        });
        return reply.code(204).send();
    });
    // Manual "scan now" from the settings screen. Optional { since: 'YYYY-MM-DD' }
    // forces a sweep from that date (overriding the saved cursor); empty = normal
    // incremental scan.
    app.post('/scan-now', async (req) => {
        const since = String(req.body?.since || '').trim();
        const opts = /^\d{4}-\d{2}-\d{2}/.test(since) ? { sinceDate: since } : {};
        // Don't await — a first-run backfill can outlast the 100s Cloudflare hard
        // limit. The mutex inside scanEmailInvoices() prevents parallel runs.
        void scanEmailInvoices(opts).catch((e) => console.error('[scan-now] background scan failed', e?.message));
        return { started: true, since: opts.sinceDate || null };
    });
};
//# sourceMappingURL=emailAccounts.js.map