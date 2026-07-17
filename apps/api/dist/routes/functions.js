import { requireAuth } from '../middleware/auth.js';
import { functionHandlers } from '../functions/index.js';
export const functionsRoutes = async (app) => {
    app.addHook('preHandler', requireAuth);
    app.post('/:name', async (req, reply) => {
        const { name } = req.params;
        const handler = functionHandlers[name];
        if (!handler)
            return reply.code(404).send({ error: 'unknown_function', name });
        try {
            const result = await handler({ body: req.body, user: req.user, req });
            return result;
        }
        catch (err) {
            req.log.error({ err, fn: name }, 'function failed');
            return reply.code(500).send({ error: 'function_error', message: err?.message });
        }
    });
};
//# sourceMappingURL=functions.js.map