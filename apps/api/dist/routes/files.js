import { minio } from '../lib/storage.js';
const bucket = process.env.S3_BUCKET ?? 'top-alena';
// Public file streaming: serves uploaded objects from MinIO through the API,
// so the browser fetches them over the normal HTTPS domain (Caddy routes
// /api/* here) instead of an internal `minio:9000` / `localhost` URL.
export const filesRoutes = async (app) => {
    app.get('/*', async (req, reply) => {
        const key = req.params['*'];
        if (!key)
            return reply.code(400).send({ error: 'no_key' });
        try {
            const stat = await minio.statObject(bucket, key);
            const total = stat.size;
            reply.header('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
            reply.header('Cache-Control', 'public, max-age=31536000, immutable');
            // HTML5 <video> (esp. iOS/Safari) needs byte-range support to play & seek.
            reply.header('Accept-Ranges', 'bytes');
            const range = req.headers['range'];
            if (typeof range === 'string') {
                const m = /bytes=(\d*)-(\d*)/.exec(range);
                if (m) {
                    let start = m[1] ? parseInt(m[1], 10) : 0;
                    let end = m[2] ? parseInt(m[2], 10) : total - 1;
                    if (!Number.isFinite(start))
                        start = 0;
                    if (!Number.isFinite(end) || end >= total)
                        end = total - 1;
                    if (start > end || start >= total) {
                        reply.header('Content-Range', `bytes */${total}`);
                        return reply.code(416).send();
                    }
                    const length = end - start + 1;
                    const partial = await minio.getPartialObject(bucket, key, start, length);
                    reply.code(206);
                    reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
                    reply.header('Content-Length', String(length));
                    return reply.send(partial);
                }
            }
            reply.header('Content-Length', String(total));
            const stream = await minio.getObject(bucket, key);
            return reply.send(stream);
        }
        catch {
            return reply.code(404).send({ error: 'not_found' });
        }
    });
};
//# sourceMappingURL=files.js.map