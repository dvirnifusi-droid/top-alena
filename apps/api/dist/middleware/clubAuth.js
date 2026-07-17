export async function requireClubKey(req, reply) {
    const expected = process.env.CLUB_API_KEY;
    if (!expected) {
        req.log.error('CLUB_API_KEY env var missing — club endpoints disabled');
        return reply.code(503).send({ error: 'club_api_disabled' });
    }
    const got = req.headers['x-alena-club-key'];
    if (typeof got !== 'string' || got !== expected) {
        return reply.code(401).send({ error: 'invalid_club_key' });
    }
}
//# sourceMappingURL=clubAuth.js.map