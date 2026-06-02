// File URLs stored before /api/files existed point at the unreachable internal
// MinIO/localhost host. Rewrite them at response time to the working public
// path so every existing image starts loading.

const BUCKET = process.env.S3_BUCKET ?? 'top-alena';
const INTERNAL_FILE_RE = new RegExp(`^https?://([^/]+)/${BUCKET}/(.+)$`, 'i');
const INTERNAL_HOST_RE = /(localhost|127\.0\.0\.1|minio|:9000)/i;
// Earlier uploads also stored URLs as /storage/<key> (a path Caddy never
// proxied), so the browser got a 404. Rewrite those to /api/files/<key> too.
const STORAGE_PATH_RE = /^(?:https?:\/\/[^/]+)?\/storage\/(.+)$/i;

export function rewriteFileUrl(v: any): any {
  if (typeof v !== 'string' || v.length < 8) return v;
  const m1 = v.match(INTERNAL_FILE_RE);
  if (m1 && INTERNAL_HOST_RE.test(m1[1])) return `/api/files/${m1[2]}`;
  const m2 = v.match(STORAGE_PATH_RE);
  if (m2) return `/api/files/${m2[1]}`;
  return v;
}

// Walks an arbitrary JSON value and rewrites any matching strings in place.
// Used as a Fastify preSerialization hook so it covers every JSON response.
//
// CRITICAL: only recurse into PLAIN objects. Non-plain objects (Date, Buffer,
// Prisma.Decimal etc.) have no enumerable own keys, so the previous version
// silently replaced them with `{}` — which broke every entity response that
// included a DateTime column once those columns were converted from TEXT to
// TIMESTAMP (Prisma then returns Date instances instead of strings).
export function rewriteFileUrlsDeep(v: any): any {
  if (typeof v === 'string') return rewriteFileUrl(v);
  if (Array.isArray(v)) return v.map(rewriteFileUrlsDeep);
  if (v && typeof v === 'object') {
    // Preserve Date, Buffer, and any custom-class instance unchanged. Only
    // plain object literals (prototype Object.prototype / null) get walked.
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = rewriteFileUrlsDeep(v[k]);
    return out;
  }
  return v;
}
