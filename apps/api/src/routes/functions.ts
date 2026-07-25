import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { functionHandlers } from '../functions/index.js';

export const functionsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.post('/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const handler = functionHandlers[name];
    if (!handler) return reply.code(404).send({ error: 'unknown_function', name });
    try {
      const result = await handler({ body: req.body, user: req.user!, req });
      return result;
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Authorization failures a handler throws deliberately are CLIENT conditions,
      // not server crashes — return the right status so they don't read as 500s in
      // the UI/logs (and can't be retried as if transient). Only exact, known auth
      // strings are remapped; anything else (incl. real DB errors) stays a 500.
      let code = 500;
      if (/^(unauthorized|unauthenticated|not[_ ]?authenticated)$/i.test(msg)) code = 401;
      else if (/^(forbidden|admin only|owner only|manager only|access denied)$/i.test(msg)) code = 403;
      if (code === 500) req.log.error({ err, fn: name }, 'function failed');
      else req.log.warn({ fn: name, code, msg }, 'function rejected');
      const error = code === 403 ? 'forbidden' : code === 401 ? 'unauthorized' : 'function_error';
      return reply.code(code).send({ error, message: msg });
    }
  });
};
