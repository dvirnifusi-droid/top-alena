export async function requireAuth(req, reply) {
    try {
        await req.jwtVerify();
    }
    catch {
        return reply.code(401).send({ error: 'unauthorized' });
    }
    // A short-lived Google handoff token is NOT a session — it may only be
    // exchanged at /auth/google-consume, never used as a bearer credential.
    if (req.user?.purpose === 'google_handoff') {
        return reply.code(401).send({ error: 'unauthorized' });
    }
}
export async function optionalAuth(req) {
    try {
        await req.jwtVerify();
    }
    catch {
        // ignore - public route
    }
}
//# sourceMappingURL=auth.js.map