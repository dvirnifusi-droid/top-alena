import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { minio } from '../lib/storage.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const S3_BUCKET = process.env.S3_BUCKET ?? 'top-alena';

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Mirrors apps/api/src/lib/llm.ts's fetchFileAsBase64. Duplicated rather than
// exported so this route stays self-contained and llm.ts remains untouched.
async function fetchFileAsBase64(url: string): Promise<{ mime: string; data: string }> {
  const relMatch = url.match(/^\/api\/files\/(.+)$/);
  if (relMatch) {
    const key = relMatch[1];
    const stat = await minio.statObject(S3_BUCKET, key);
    const stream = await minio.getObject(S3_BUCKET, key);
    const buf = await streamToBuffer(stream);
    const mime = (stat.metaData?.['content-type'] as string) || 'application/octet-stream';
    return { mime, data: buf.toString('base64') };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime, data: buf.toString('base64') };
}

// SSE proxy for Gemini streamGenerateContent. The frontend gets one event per
// text delta as `data: {"chunk":"..."}\n\n`, then a final `data: {"done":true}`.
// Errors arrive as `data: {"error":"..."}`. We use the FAST model (flash) on
// purpose — the waiter assistant wants short, practical advice in <2 seconds.
export const llmStreamRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.post('/waiter-advice', async (req, reply) => {
    const body = (req.body || {}) as { prompt?: string; file_url?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const file_url = typeof body.file_url === 'string' && body.file_url ? body.file_url : null;
    if (!prompt) return reply.code(400).send({ error: 'prompt_required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reply.code(500).send({ error: 'gemini_not_configured' });

    const parts: any[] = [{ text: prompt }];
    if (file_url) {
      try {
        const { mime, data } = await fetchFileAsBase64(file_url);
        parts.push({ inlineData: { mimeType: mime, data } });
      } catch (e: any) {
        return reply.code(400).send({ error: 'file_fetch_failed', message: e?.message });
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(
        `${GEMINI_BASE}/models/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
          }),
        },
      );
    } catch (e: any) {
      return reply.code(502).send({ error: 'gemini_unreachable', message: e?.message });
    }

    if (!upstream.ok || !upstream.body) {
      const msg = await upstream.text().catch(() => '');
      return reply.code(502).send({ error: 'gemini_error', message: msg.slice(0, 500) });
    }

    // Switch to raw response — Fastify won't JSON-serialize past this point.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = (upstream.body as any).getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const writeEvent = (obj: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!frame.startsWith('data:')) continue;
          const json = frame.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          try {
            const obj = JSON.parse(json);
            const text = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof text === 'string' && text.length > 0) {
              writeEvent({ chunk: text });
            }
          } catch {
            // ignore malformed SSE frames — Gemini occasionally emits keepalives
          }
        }
      }
      writeEvent({ done: true });
    } catch (e: any) {
      writeEvent({ error: e?.message || 'stream_error' });
    } finally {
      res.end();
    }
  });
};
