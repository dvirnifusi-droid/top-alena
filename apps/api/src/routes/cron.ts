import type { FastifyPluginAsync } from 'fastify';
import { sendRestroomReminder, sendAbandonedReminder } from '../functions/load.js';

// Internal cron endpoints, guarded by a shared secret (x-cron-secret header or
// ?secret=). Called by the server crontab — never by end users.
export const cronRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const secret = process.env.CRON_SECRET;
    const provided =
      (req.headers['x-cron-secret'] as string) ||
      ((req.query as any)?.secret as string) ||
      '';
    if (!secret || provided !== secret) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.post('/restroom-reminder', async () => {
    return sendRestroomReminder();
  });

  app.post('/abandoned-reminder', async () => {
    return sendAbandonedReminder();
  });
};
