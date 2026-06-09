import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireClubKey } from '../middleware/clubAuth.js';
import { computeTier, coinsForOrder } from '../lib/clubTier.js';

// Israeli phone normalization — keeps only digits, strips leading 972
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return '0' + digits.slice(3);
  return digits;
}

export async function clubRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireClubKey);

  // Health check for the WP plugin to verify connectivity (still key-gated)
  app.get('/ping', async () => ({ ok: true, ts: Date.now() }));
}
