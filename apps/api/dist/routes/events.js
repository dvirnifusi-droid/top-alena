import { requireAuth } from '../middleware/auth.js';
import { realtimeBus } from '../db.js';
// Server-Sent Events stream. Authenticated (the hostess is logged in); one
// long-lived connection per open seating page. We push a small "change" signal
// whenever a Reservation / TableSession / QueueEntry is written (see the Prisma
// middleware in db.ts) and the client refetches. Kept deliberately tiny — no row
// payloads — so there's nothing to auth-scope or serialize, and it reuses the
// existing (fast) fetch paths on the client.
export const eventsRoutes = async (app) => {
    app.get('/stream', { preHandler: requireAuth }, async (req, reply) => {
        // Take over the raw socket — Fastify must not try to send its own response.
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Disable proxy/CDN response buffering so events flush immediately.
            'X-Accel-Buffering': 'no',
        });
        // Advise the browser EventSource-style reconnect delay + prove the stream
        // flows end-to-end (client flips to "connected" on this first frame).
        raw.write('retry: 3000\n\n');
        raw.write('event: hello\ndata: {"ok":true}\n\n');
        const onChange = (e) => {
            try {
                raw.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
            }
            catch {
                /* socket already closed — cleanup runs on 'close' */
            }
        };
        realtimeBus.on('change', onChange);
        // Heartbeat keeps intermediaries (Cloudflare ~100s idle, Caddy) from closing
        // an otherwise-quiet connection. A comment line is ignored by the client.
        const heartbeat = setInterval(() => {
            try {
                raw.write(`: ping ${Date.now()}\n\n`);
            }
            catch {
                /* closed */
            }
        }, 25000);
        let closed = false;
        const cleanup = () => {
            if (closed)
                return;
            closed = true;
            clearInterval(heartbeat);
            realtimeBus.off('change', onChange);
            try {
                raw.end();
            }
            catch {
                /* noop */
            }
        };
        req.raw.on('close', cleanup);
        req.raw.on('error', cleanup);
    });
};
//# sourceMappingURL=events.js.map