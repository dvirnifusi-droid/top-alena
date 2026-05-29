import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { prisma } from './db.js';
import { entitiesRoutes } from './routes/entities.js';
import { authRoutes } from './routes/auth.js';
import { integrationsRoutes } from './routes/integrations.js';
import { functionsRoutes } from './routes/functions.js';
import { publicFunctionsRoutes } from './routes/publicFunctions.js';
import { importRoutes } from './routes/import.js';
import { cronRoutes } from './routes/cron.js';
import { filesRoutes } from './routes/files.js';

const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true,
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-only-secret',
});

await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(entitiesRoutes, { prefix: '/api/entities' });
await app.register(integrationsRoutes, { prefix: '/api/integrations' });
await app.register(functionsRoutes, { prefix: '/api/fn' });
await app.register(publicFunctionsRoutes, { prefix: '/api/public' });
await app.register(importRoutes, { prefix: '/api/import' });
await app.register(cronRoutes, { prefix: '/api/cron' });
await app.register(filesRoutes, { prefix: '/api/files' });

// Auto-load all ported function handlers
await import('./functions/load.js');

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
