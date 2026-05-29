import type { FastifyPluginAsync } from 'fastify';
import { minio } from '../lib/storage.js';

const bucket = process.env.S3_BUCKET ?? 'top-alena';

// Public file streaming: serves uploaded objects from MinIO through the API,
// so the browser fetches them over the normal HTTPS domain (Caddy routes
// /api/* here) instead of an internal `minio:9000` / `localhost` URL.
export const filesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/*', async (req, reply) => {
    const key = (req.params as any)['*'] as string;
    if (!key) return reply.code(400).send({ error: 'no_key' });
    try {
      const stat = await minio.statObject(bucket, key);
      const stream = await minio.getObject(bucket, key);
      reply.header('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(stream);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
};
