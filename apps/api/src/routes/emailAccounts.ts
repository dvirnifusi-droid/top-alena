// Mailbox management for the email→invoice importer. App-password based
// (Gmail IMAP); passwords stored AES-encrypted, never returned to the client.
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { encryptToken } from '../lib/emailCrypto.js';
import { testConnection } from '../lib/emailFetch.js';
import { scanEmailInvoices } from '../lib/emailInvoiceScan.js';

export const emailAccountsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/', async () => {
    return (prisma as any).emailAccount.findMany({
      select: { id: true, email: true, status: true, last_checked_at: true, last_error: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  // Connect (or reconnect) a mailbox. Validates the app password live
  // against Gmail IMAP before saving.
  app.post('/', async (req, reply) => {
    const { email, app_password } = (req.body as any) || {};
    const addr = String(email || '').trim().toLowerCase();
    const pass = String(app_password || '').replace(/\s+/g, ''); // Google displays app passwords with spaces
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) || pass.length < 8) {
      return reply.code(400).send({ error: 'bad_input', message: 'כתובת מייל או סיסמת אפליקציה לא תקינים' });
    }
    try {
      await testConnection(addr, pass);
    } catch {
      return reply.code(400).send({ error: 'imap_login_failed', message: 'ההתחברות לתיבה נכשלה — ודא שסיסמת האפליקציה נכונה ושאימות דו-שלבי פעיל' });
    }
    const row = await (prisma as any).emailAccount.upsert({
      where: { email: addr },
      update: { app_password: encryptToken(pass), status: 'active', last_error: null },
      create: { email: addr, app_password: encryptToken(pass) },
    });
    return { id: row.id, email: row.email, status: row.status };
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await (prisma as any).emailAccount.delete({ where: { id } }).catch(() => {});
    return reply.code(204).send();
  });

  // Manual "scan now" from the settings screen.
  app.post('/scan-now', async () => {
    return scanEmailInvoices();
  });
};
