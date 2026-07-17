import { prisma } from '../db.js';
import { functionHandlers, publicFunctions } from '../functions/index.js';
/**
 * Whitelist of entities that public/unauthenticated pages may READ.
 * Add carefully — anything here is world-readable.
 */
const PUBLIC_READ_ENTITIES = new Set([
    'QueueEntry',
    'RestaurantProfile',
    'RestaurantInfo',
    'ReservationSettings',
    'AvailabilityFormSettings',
    'GameQuestion',
    'TriviaQuestion',
    'QueueGameSession',
    'Apparel',
    'MenuItem',
]);
function modelDelegate(name) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name))
        return null;
    const key = name[0].toLowerCase() + name.slice(1);
    return prisma[key] ?? null;
}
function parseSort(sort) {
    if (!sort)
        return undefined;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    return { [field]: desc ? 'desc' : 'asc' };
}
export const publicFunctionsRoutes = async (app) => {
    // ---- public functions ----
    app.post('/fn/:name', async (req, reply) => {
        const { name } = req.params;
        if (!publicFunctions.has(name)) {
            return reply.code(404).send({ error: 'unknown_or_protected_function', name });
        }
        const handler = functionHandlers[name];
        if (!handler)
            return reply.code(404).send({ error: 'unknown_function', name });
        try {
            return await handler({ body: req.body, user: null, req });
        }
        catch (err) {
            req.log.error({ err, fn: name }, 'public function failed');
            return reply.code(500).send({ error: 'function_error', message: err?.message });
        }
    });
    // ---- public read-only entities (used by /QueueJoin etc. via asServiceRole) ----
    app.get('/entities/:name', async (req, reply) => {
        const { name } = req.params;
        if (!PUBLIC_READ_ENTITIES.has(name)) {
            return reply.code(403).send({ error: 'entity_not_public', name });
        }
        const delegate = modelDelegate(name);
        if (!delegate)
            return reply.code(404).send({ error: 'unknown_entity' });
        const q = req.query;
        const { limit, sort, where: whereStr } = q;
        let where = {};
        if (whereStr) {
            try {
                where = JSON.parse(whereStr);
            }
            catch {
                return reply.code(400).send({ error: 'invalid_where_json' });
            }
        }
        const rows = await delegate.findMany({
            where,
            orderBy: parseSort(sort),
            take: limit ? Number(limit) : 500,
        });
        // QueueEntry is world-readable for the public /QueueJoin board, but the raw
        // rows carry PII (phone, GPS, web-push subscription). Strip those from the
        // enumerable LIST response so the queue can't be harvested. (The by-id path
        // below still returns the full row — you must already know the entry id.)
        if (name === 'QueueEntry' && Array.isArray(rows)) {
            return rows.map((r) => {
                const o = { ...r };
                delete o.phone;
                delete o.last_lat;
                delete o.last_lng;
                delete o.push_subscription;
                return o;
            });
        }
        return rows;
    });
    app.get('/entities/:name/:id', async (req, reply) => {
        const { name, id } = req.params;
        if (!PUBLIC_READ_ENTITIES.has(name)) {
            return reply.code(403).send({ error: 'entity_not_public', name });
        }
        const delegate = modelDelegate(name);
        if (!delegate)
            return reply.code(404).send({ error: 'unknown_entity' });
        const item = await delegate.findUnique({ where: { id } });
        if (!item)
            return reply.code(404).send({ error: 'not_found' });
        return item;
    });
};
//# sourceMappingURL=publicFunctions.js.map