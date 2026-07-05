// Some Israeli billing systems (icount, ezcount, invoice-maven, tamal/easy,
// sumit/morning, greeninvoice…) email a LINK/button to the invoice instead of
// attaching a PDF. This module finds the most likely invoice-download links in
// an email body — safely (no internal/SSRF targets) and ranked by relevance.

// Reject anything that could reach the server's own network (docker services,
// cloud metadata, DB host, other tenant containers). Public hosts always have a
// dot and a routable IP; internal service names ("minio", "top-alena-api-1")
// and private ranges are blocked.
//
// NOTE: this is a static URL check — it does NOT defend against DNS rebinding
// (a public hostname that resolves to a private IP). Acceptable for this
// feature: links come from the owner's own mailbox, from known billing vendors.
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // IPv6 loopback / link-local / unique-local
  if (host === '::1' || host === '::' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;   // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;                 // multicast / reserved
    return true;
  }
  // A single-label hostname (no dot) is an internal service name, never public.
  if (!host.includes('.')) return false;
  return true;
}

const POSITIVE = [
  'invoice', 'receipt', 'download', 'pdf', 'view', 'document', 'billing', 'bill',
  'חשבונית', 'קבלה', 'מסמך', 'להורדה', 'להצגת', 'צפייה', 'חשבון', 'הורדה',
];
// Known Israeli / SaaS billing-provider domain fragments — a strong signal.
const PROVIDER_HINTS = [
  'icount', 'ezcount', 'invoice-maven', 'invoice-one', 'tamal', 'sumit', 'morning',
  'greeninvoice', 'cardcom', 'cohenb', 'check-net', 'tabit', 'rivhit', 'ivri', ' hashavshevet',
];
const NEGATIVE = [
  'unsubscribe', 'unsub', 'mailto:', 'tel:', 'facebook', 'instagram', 'twitter',
  'x.com', 'linkedin', 'whatsapp', 'youtube', 'tiktok', '/privacy', '/terms',
  'google.com/maps', 'maps.google', 'apple.com', 'play.google', 'preferences',
];

const MAX_LINKS = 3;

function scoreLink(url: string, anchorText: string): number {
  const hay = (url + ' ' + anchorText).toLowerCase();
  if (NEGATIVE.some(n => url.toLowerCase().includes(n))) return -1;
  let score = 0;
  for (const p of POSITIVE) if (hay.includes(p)) score += 1;
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  if (PROVIDER_HINTS.some(h => host.includes(h.trim()))) score += 3;
  if (url.toLowerCase().includes('.pdf')) score += 2;
  return score;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns up to MAX_LINKS candidate invoice URLs, safety-filtered, ranked by
// relevance (highest first). Only links with a positive score are returned.
export function extractInvoiceLinks(html: string, text: string): string[] {
  const candidates = new Map<string, number>(); // url -> best score

  const consider = (rawUrl: string, anchorText: string) => {
    const url = String(rawUrl || '').trim().replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(url)) return;
    if (!isSafePublicUrl(url)) return;
    const s = scoreLink(url, anchorText);
    if (s <= 0) return;
    const prev = candidates.get(url);
    if (prev === undefined || s > prev) candidates.set(url, s);
  };

  // Anchors from the HTML body (href + inner text).
  const anchorRe = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html || '')) !== null) {
    consider(m[1], stripTags(m[2] || ''));
  }
  // Bare URLs in the plain-text body.
  const bareRe = /https?:\/\/[^\s"'<>()]+/gi;
  for (const u of (text || '').match(bareRe) || []) consider(u, '');

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LINKS)
    .map(([url]) => url);
}
