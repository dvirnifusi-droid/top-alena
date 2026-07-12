import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const authRoutes: FastifyPluginAsync = async (app) => {
  const credsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  // Find/create THIS tenant's user for a Google-verified email and mint a
  // session token. Returns { token, user } or null when the email isn't a known
  // user/employee of this tenant. Shared by /google and /google-consume.
  async function issueSessionForEmail(reply: any, email: string, name?: string | null) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const employee = await prisma.employee.findFirst({ where: { email } });
      if (!employee) return null; // not_registered on this tenant
      user = await prisma.user.create({
        data: { email, fullName: employee.full_name ?? name ?? null, role: 'user' },
      });
    } else if (!user.fullName && name) {
      user = await prisma.user.update({ where: { id: user.id }, data: { fullName: name } });
    }
    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, full_name: user.fullName } };
  }

  app.post('/register', async (req, reply) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: 'email_taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    // First user in a fresh tenant DB (or Alena's main DB) auto-becomes
    // 'owner' — otherwise 'user'. Lets a freshly-provisioned tenant login
    // with the register form and see the full admin UI on turn 1.
    const existingUsersCount = await prisma.user.count();
    const role = existingUsersCount === 0 ? 'owner' : 'user';
    const user = await prisma.user.create({
      data: { email, passwordHash, role },
    });
    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role, full_name: user.fullName } };
  });

  app.post('/login', async (req, reply) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return reply.code(401).send({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role, full_name: user.fullName } };
  });

  // Sign in with Google. Frontend sends the Google ID token ("credential").
  // We verify it, then match the email to an existing User or Employee:
  //   - User exists           -> log in (keep their role)
  //   - Employee exists        -> auto-create a linked User (role 'user')
  //   - neither                -> 403 (must be invited / already an employee)
  app.post('/google', async (req, reply) => {
    const { credential } = (req.body ?? {}) as { credential?: string };
    if (!credential) return reply.code(400).send({ error: 'missing_credential' });
    if (!GOOGLE_CLIENT_ID) return reply.code(500).send({ error: 'google_not_configured' });

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return reply.code(401).send({ error: 'invalid_google_token' });
    }
    const email = payload?.email?.toLowerCase();
    if (!email || payload?.email_verified === false) {
      return reply.code(401).send({ error: 'unverified_google_email' });
    }

    const result = await issueSessionForEmail(reply, email, payload?.name);
    if (!result) return reply.code(403).send({ error: 'not_registered' });
    return result;
  });

  // ── Central Google sign-in (multi-tenant) ────────────────────────────────
  // Google won't authorize a wildcard origin, so the GIS button only renders on
  // topalena.com. Tenant subdomains bounce the user to a hosted handoff page
  // there; it verifies the Google credential HERE and mints a short-lived,
  // single-purpose token the tenant exchanges for its own session below. The
  // Google credential itself never crosses origins.
  app.post('/google-handoff', async (req, reply) => {
    const { credential } = (req.body ?? {}) as { credential?: string };
    if (!credential) return reply.code(400).send({ error: 'missing_credential' });
    if (!GOOGLE_CLIENT_ID) return reply.code(500).send({ error: 'google_not_configured' });
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return reply.code(401).send({ error: 'invalid_google_token' });
    }
    const email = payload?.email?.toLowerCase();
    if (!email || payload?.email_verified === false) {
      return reply.code(401).send({ error: 'unverified_google_email' });
    }
    // Short-lived (2 min), single-purpose. Signed with the fleet-shared
    // JWT_SECRET so any tenant api can verify it in /google-consume.
    const handoff = await reply.jwtSign(
      { email, name: payload?.name ?? null, purpose: 'google_handoff' } as any,
      { expiresIn: '2m' },
    );
    return { handoff };
  });

  // The tenant exchanges the handoff token for its own session. Verifies the
  // signature + expiry + purpose, then looks the email up in THIS tenant's DB.
  app.post('/google-consume', async (req, reply) => {
    const { handoff } = (req.body ?? {}) as { handoff?: string };
    if (!handoff) return reply.code(400).send({ error: 'missing_handoff' });
    let decoded: any;
    try {
      decoded = app.jwt.verify(handoff);
    } catch {
      return reply.code(401).send({ error: 'invalid_or_expired_handoff' });
    }
    if (decoded?.purpose !== 'google_handoff' || !decoded?.email) {
      return reply.code(401).send({ error: 'invalid_handoff' });
    }
    const result = await issueSessionForEmail(reply, String(decoded.email).toLowerCase(), decoded.name);
    if (!result) return reply.code(403).send({ error: 'not_registered' });
    return result;
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const u = req.user!;
    // managed_department is a recent addition — tolerate the column being
    // absent for the brief window before `prisma db push` runs in the container
    // (see CLAUDE.md §4.7).
    let full: any;
    try {
      full = await prisma.user.findUnique({
        where: { id: u.id },
        select: { id: true, email: true, role: true, fullName: true, managed_department: true, created_date: true },
      });
    } catch (e: any) {
      if (/unknown (arg|column)|managed_department/i.test(String(e?.message))) {
        full = await prisma.user.findUnique({
          where: { id: u.id },
          select: { id: true, email: true, role: true, fullName: true, created_date: true },
        });
      } else { throw e; }
    }
    if (!full) return null;
    // The Base44 frontend reads `full_name` (snake_case); the column is fullName.
    // Fall back to email so downstream required fields (e.g. ShiftTracking
    // .employee_name) are never null.
    return { ...full, full_name: full.fullName || full.email };
  });

  app.post('/logout', async () => ({ ok: true }));
};
