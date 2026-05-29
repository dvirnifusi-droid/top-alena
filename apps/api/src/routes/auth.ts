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

  app.post('/register', async (req, reply) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: 'email_taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'user' },
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

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // No user yet — only allow if this email belongs to a known employee.
      const employee = await prisma.employee.findFirst({ where: { email } });
      if (!employee) {
        return reply.code(403).send({ error: 'not_registered' });
      }
      user = await prisma.user.create({
        data: {
          email,
          fullName: employee.full_name ?? payload?.name ?? null,
          role: 'user',
        },
      });
    } else if (!user.fullName && payload?.name) {
      user = await prisma.user.update({ where: { id: user.id }, data: { fullName: payload.name } });
    }

    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, full_name: user.fullName } };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const u = req.user!;
    const full = await prisma.user.findUnique({
      where: { id: u.id },
      select: { id: true, email: true, role: true, fullName: true, created_date: true },
    });
    if (!full) return null;
    // The Base44 frontend reads `full_name` (snake_case); the column is fullName.
    // Fall back to email so downstream required fields (e.g. ShiftTracking
    // .employee_name) are never null.
    return { ...full, full_name: full.fullName || full.email };
  });

  app.post('/logout', async () => ({ ok: true }));
};
