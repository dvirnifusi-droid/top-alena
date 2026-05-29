// File URLs stored before /api/files existed point at the unreachable internal
// MinIO/localhost host. Rewrite them at response time to the working public
// path so every existing image starts loading.

const BUCKET = process.env.S3_BUCKET ?? 'top-alena';
const INTERNAL_FILE_RE = new RegExp(`^https?://([^/]+)/${BUCKET}/(.+)$`, 'i');
const INTERNAL_HOST_RE = /(localhost|127\.0\.0\.1|minio|:9000)/i;

export function rewriteFileUrl(v: any): any {
  if (typeof v !== 'string' || v.length < 8) return v;
  const m = v.match(INTERNAL_FILE_RE);
  if (m && INTERNAL_HOST_RE.test(m[1])) return `/api/files/${m[2]}`;
  return v;
}

// Walks an arbitrary JSON value and rewrites any matching strings in place.
// Used as a Fastify preSerialization hook so it covers every JSON response.
export function rewriteFileUrlsDeep(v: any): any {
  if (typeof v === 'string') return rewriteFileUrl(v);
  if (Array.isArray(v)) return v.map(rewriteFileUrlsDeep);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = rewriteFileUrlsDeep(v[k]);
    return out;
  }
  return v;
}
