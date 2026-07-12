import type { FastifyReply, FastifyRequest } from 'fastify';

export type AuthUser = {
  id: string;
  email: string;
  role?: string | null;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  // A short-lived Google handoff token is NOT a session — it may only be
  // exchanged at /auth/google-consume, never used as a bearer credential.
  if ((req.user as any)?.purpose === 'google_handoff') {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

export async function optionalAuth(req: FastifyRequest) {
  try {
    await req.jwtVerify();
  } catch {
    // ignore - public route
  }
}
