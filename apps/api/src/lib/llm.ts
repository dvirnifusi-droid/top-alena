// ---------------------------------------------------------------------------
// LLM integration — providers: gemini (default) | anthropic
// Switch by setting LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY in env.
// ---------------------------------------------------------------------------

import { minio } from './storage.js';
import { writeAiUsage } from './aiUsage.js';

const PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
const S3_BUCKET = process.env.S3_BUCKET ?? 'top-alena';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

function geminiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY not set');
  return k;
}

function anthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  return k;
}

// Strip JSON-Schema keywords Gemini's responseSchema doesn't accept (e.g.
// `format: "date"`, `$schema`, `additionalProperties`). Keeps the shape but
// removes the constraints that cause 400 errors from Gemini.
function sanitizeSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  const allowedFormats = new Set(['enum', 'date-time']);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema' || k === 'additionalProperties' || k === 'patternProperties') continue;
    if (k === 'format') {
      if (typeof v === 'string' && allowedFormats.has(v)) out[k] = v;
      continue;
    }
    out[k] = v && typeof v === 'object' ? sanitizeSchemaForGemini(v) : v;
  }
  return out;
}

// Stream a MinIO object to a Buffer.
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// --- Office / text extraction ------------------------------------------------
// Gemini's inlineData reads images + PDF natively but CANNOT read Office formats
// (docx/xlsx/pptx/odt) or raw rtf. Those are the files restaurant owners most
// often send (menus, rosters, prep lists). Since every Office format is really a
// ZIP of XML, we unzip + pull the text server-side and hand Gemini plain text
// instead — so "read every file, even the weird ones" actually holds. Language
// agnostic: we only turn bytes → text; Gemini handles he/en/es content as-is.

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&amp;/g, '&');
}

// Turn an OOXML/ODF body into text: break at paragraph closes, drop all tags.
function xmlBodyToText(xml: string, paraCloseTags: string[]): string {
  let s = xml;
  for (const tag of paraCloseTags) s = s.split(`</${tag}>`).join('\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Reconstruct a spreadsheet as pipe-delimited rows so the LLM keeps table
// structure (name | price | ...). Resolves shared strings + inline/number cells.
async function xlsxToText(zip: any): Promise<string> {
  const readIf = async (p: string) => (zip.file(p) ? await zip.file(p).async('string') : '');
  const ssXml = await readIf('xl/sharedStrings.xml');
  const shared: string[] = [];
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
    shared.push(decodeXmlEntities(t.replace(/<[^>]+>/g, '')));
  }
  const sheetPaths = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort();
  const out: string[] = [];
  for (const sp of sheetPaths) {
    const sx = await zip.file(sp).async('string');
    for (const rowM of sx.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cM of rowM[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const type = (cM[1].match(/\bt="([^"]*)"/) || [])[1] || '';
        const inner = cM[2] || '';
        let val = '';
        if (type === 's') { const vi = inner.match(/<v>([\s\S]*?)<\/v>/); if (vi) val = shared[parseInt(vi[1], 10)] || ''; }
        else if (type === 'inlineStr' || type === 'str') { const ti = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); if (ti) val = decodeXmlEntities(ti[1]); }
        else { const vi = inner.match(/<v>([\s\S]*?)<\/v>/); if (vi) val = decodeXmlEntities(vi[1]); }
        cells.push(val.trim());
      }
      const line = cells.join(' | ').trim();
      if (line.replace(/[|\s]/g, '')) out.push(line);
    }
    out.push('');
  }
  return out.join('\n');
}

// Returns extracted text for Office/text formats, or null to pass the raw bytes
// through to the model (images, PDF, unknown binary). Never throws.
async function extractDocText(mime: string, url: string, buf: Buffer): Promise<string | null> {
  try {
    const hint = `${mime} ${url}`.toLowerCase();
    const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
    if (!isZip) {
      if (/\brtf\b|\.rtf/.test(hint) || buf.slice(0, 5).toString('latin1') === '{\\rtf') return stripRtf(buf.toString('latin1')).slice(0, 100_000) || null;
      if (/text\/csv|\.csv/.test(hint)) return buf.toString('utf8').slice(0, 100_000) || null;
      if (/text\/(plain|markdown)|\.txt|\.md\b/.test(hint)) return buf.toString('utf8').slice(0, 100_000) || null;
      return null; // image / pdf / .doc(old) / unknown → let the model try natively
    }
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    let text: string | null = null;
    if (zip.file('word/document.xml')) {
      text = xmlBodyToText(await zip.file('word/document.xml')!.async('string'), ['w:p']);
    } else if (names.some((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
      text = await xlsxToText(zip);
    } else if (names.some((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
      const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
      const parts: string[] = [];
      for (const s of slides) parts.push(xmlBodyToText(await zip.file(s)!.async('string'), ['a:p']));
      text = parts.join('\n\n');
    } else if (zip.file('content.xml')) { // ODF: odt / ods / odp
      text = xmlBodyToText(await zip.file('content.xml')!.async('string'), ['text:p', 'text:h', 'table:table-row']);
    }
    if (text && text.trim()) return text.slice(0, 100_000);
    return null;
  } catch {
    return null; // any failure → passthrough, never break the read
  }
}

// Return { mime, data } ready for inlineData. Office/text files are transparently
// converted to text/plain so the model can read them.
function finalizeFile(mime: string, url: string, buf: Buffer): Promise<{ mime: string; data: string }> {
  return extractDocText(mime, url, buf).then((text) => {
    if (text && text.trim()) return { mime: 'text/plain', data: Buffer.from(text, 'utf8').toString('base64') };
    return { mime, data: buf.toString('base64') };
  });
}

async function fetchFileAsBase64(url: string) {
  // Uploaded files are stored with a relative URL of the form `/api/files/<key>`
  // (see lib/storage.ts). Node's fetch() can't parse relative URLs, and the
  // file route is served by this same API server — so read directly from MinIO
  // instead of looping back through HTTP.
  const relMatch = url.match(/^\/api\/files\/(.+)$/);
  if (relMatch) {
    const key = relMatch[1];
    const stat = await minio.statObject(S3_BUCKET, key);
    const stream = await minio.getObject(S3_BUCKET, key);
    const buf = await streamToBuffer(stream);
    const mime = (stat.metaData?.['content-type'] as string) || 'application/octet-stream';
    return finalizeFile(mime, url, buf);
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return finalizeFile(mime, url, buf);
}

type InvokeArgs = {
  prompt: string;
  responseSchema?: Record<string, unknown>;
  fileUrls?: string[];
  model?: string;
  provider?: 'gemini' | 'anthropic';
  maxOutputTokens?: number;
  // Gemini thinking budget. 0 disables reasoning (fast + all tokens go to output) —
  // use for large structured JSON where a thinking model otherwise truncates. Only
  // valid on models that allow it (e.g. gemini-2.5-flash).
  thinkingBudget?: number;
  timeoutMs?: number;
  // D5 — usage metering context. Optional so old callers keep working;
  // passed through to writeAiUsage after each successful LLM response.
  _ctx?: { tenant_slug?: string; fn_name?: string };
};

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function geminiInvoke(args: InvokeArgs) {
  const { prompt, responseSchema, fileUrls, model } = args;
  const modelName = model ?? DEFAULT_GEMINI_MODEL;
  const parts: any[] = [{ text: prompt }];

  if (fileUrls?.length) {
    for (const url of fileUrls) {
      const { mime, data } = await fetchFileAsBase64(url);
      parts.push({ inlineData: { mimeType: mime, data } });
    }
  }

  const body: any = { contents: [{ role: 'user', parts }] };
  const thinkingCfg = args.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: args.thinkingBudget } } : {};
  if (responseSchema) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: sanitizeSchemaForGemini(responseSchema),
      maxOutputTokens: args.maxOutputTokens || 8192,
      ...thinkingCfg,
    };
  } else if (args.maxOutputTokens || args.thinkingBudget !== undefined) {
    body.generationConfig = { ...(args.maxOutputTokens ? { maxOutputTokens: args.maxOutputTokens } : {}), ...thinkingCfg };
  }

  // Hard timeout — Cloudflare drops requests at 100s. We give up at 60s and surface a clean
  // error so the frontend can show a retry button instead of a generic HTTP 524.
  const timeoutMs = args.timeoutMs || 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${modelName}:generateContent?key=${geminiKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new Error('llm_timeout');
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  // D5 — meter usage on every call, defaulting fn_name to 'invokeLLM' if the
  // caller didn't pass _ctx. Callers can override later to get a per-function
  // breakdown. Fire-and-forget; never blocks response.
  const um = data?.usageMetadata;
  if (um) {
    void writeAiUsage({
      tenant_slug: args._ctx?.tenant_slug,
      fn_name: args._ctx?.fn_name || 'invokeLLM',
      model: modelName,
      tokens_in: Number(um.promptTokenCount || 0),
      tokens_out: Number(um.candidatesTokenCount || 0),
    });
  }
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.[0]?.text ?? '';
  if (responseSchema) {
    try {
      return JSON.parse(text);
    } catch {
      // Carry WHY it failed so callers can tell an empty answer (thinking model
      // ate the whole token budget → finishReason MAX_TOKENS) from a blocked one
      // (SAFETY / a promptFeedback.blockReason) and message the user usefully.
      return { raw: text, finishReason: cand?.finishReason, blockReason: data?.promptFeedback?.blockReason };
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Anthropic (Claude) — used when LLM_PROVIDER=anthropic
// ---------------------------------------------------------------------------

async function anthropicInvoke(args: InvokeArgs) {
  const { prompt, responseSchema, fileUrls, model } = args;
  const modelName = model ?? DEFAULT_ANTHROPIC_MODEL;
  const content: any[] = [];

  if (fileUrls?.length) {
    for (const url of fileUrls) {
      const { mime, data } = await fetchFileAsBase64(url);
      if (mime === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } });
      }
    }
  }
  content.push({ type: 'text', text: prompt });

  const body: any = {
    model: modelName,
    max_tokens: args.maxOutputTokens || 4096,
    messages: [{ role: 'user', content }],
  };

  // Force structured JSON output via tool_use when a schema is supplied.
  if (responseSchema) {
    body.tools = [
      {
        name: 'return_data',
        description: 'Return the extracted structured data.',
        input_schema: responseSchema,
      },
    ];
    body.tool_choice = { type: 'tool', name: 'return_data' };
  }

  const timeoutMs = args.timeoutMs || 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new Error('llm_timeout');
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();

  // D5 — meter usage. Anthropic returns { usage: { input_tokens, output_tokens } }.
  if (data?.usage) {
    void writeAiUsage({
      tenant_slug: args._ctx?.tenant_slug,
      fn_name: args._ctx?.fn_name || 'invokeLLM',
      model: modelName,
      tokens_in: Number(data.usage.input_tokens || 0),
      tokens_out: Number(data.usage.output_tokens || 0),
    });
  }

  if (responseSchema) {
    const toolUse = data?.content?.find((b: any) => b.type === 'tool_use');
    if (toolUse?.input) return toolUse.input;
    const text = data?.content?.find((b: any) => b.type === 'text')?.text ?? '';
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return data?.content?.find((b: any) => b.type === 'text')?.text ?? '';
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export async function invokeLLM(args: InvokeArgs) {
  const provider = (args as any).provider || PROVIDER;
  const maxAttempts = Number((args as any).maxAttempts || 3);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (provider === 'anthropic') return await anthropicInvoke(args);
      return await geminiInvoke(args);
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || '');
      // Retry only on transient errors (network, 5xx, timeout, quota cooldowns)
      const transient = /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|network|503|502|504|429|overloaded|rate.?limit/i.test(msg);
      if (!transient || attempt === maxAttempts) break;
      // Exponential backoff: 600ms, 1.5s
      await new Promise((r) => setTimeout(r, 600 * attempt + Math.random() * 400));
    }
  }
  throw lastErr;
}

export async function generateImage({ prompt }: { prompt: string }) {
  // Imagen via Gemini API. Google rotates model IDs — try the env override
  // first, then a list of currently-known model IDs in order.
  const candidates = [
    process.env.GEMINI_IMAGE_MODEL,
    'imagen-4.0-generate-preview-06-06',
    'imagen-4.0-generate-001',
    'imagen-3.0-generate-002',
    'imagen-3.0-generate-001',
  ].filter(Boolean) as string[];

  // Google AI Studio (generativelanguage.googleapis.com) serves Imagen via
  // the :predict endpoint with instances/parameters shape — NOT the older
  // :generateImages variant. Try a list of (model, endpoint, body) recipes
  // until one succeeds.
  const recipes = candidates.flatMap((model) => [
    {
      url: `${GEMINI_BASE}/models/${model}:predict?key=${geminiKey()}`,
      body: { instances: [{ prompt }], parameters: { sampleCount: 1 } },
      extract: (d: any) =>
        d?.predictions?.[0]?.bytesBase64Encoded ||
        d?.predictions?.[0]?.image?.bytesBase64Encoded ||
        null,
      tag: `${model}:predict`,
    },
    {
      url: `${GEMINI_BASE}/models/${model}:generateImages?key=${geminiKey()}`,
      body: { prompt: { text: prompt }, sampleCount: 1 },
      extract: (d: any) => d?.generatedImages?.[0]?.image?.imageBytes || null,
      tag: `${model}:generateImages`,
    },
  ]);

  let lastErr: string = '';
  for (const r of recipes) {
    const res = await fetch(r.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.body),
    });
    if (res.ok) {
      const data: any = await res.json();
      const b64 = r.extract(data);
      if (b64) return { image_base64: b64, model: r.tag };
      lastErr = `${r.tag}: 200 but no image bytes in response`;
      continue;
    }
    lastErr = `${r.tag} ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
    // Auth/quota/permission errors are real — stop walking the list.
    if ([401, 403, 429].includes(res.status)) {
      throw new Error(`Imagen ${lastErr}`);
    }
  }
  throw new Error(`Imagen: no recipe worked. Last: ${lastErr}. Set GEMINI_IMAGE_MODEL env or switch to Vertex AI.`);
}

// Image-to-image editing ("nano banana"). Unlike generateImage (text→image,
// invents a scene), this conditions on the OWNER's actual photo and returns an
// enhanced version — so a real dish stays the real dish. gemini-2.5-flash-image
// is the cheap image tier and is what's enabled on the key (verified live).
export async function editImage(
  { imageUrl, instruction }: { imageUrl: string; instruction: string },
): Promise<{ image_base64: string; mime: string; model: string }> {
  const { mime: inMime, data: inData } = await fetchFileAsBase64(imageUrl);
  const models = [
    process.env.GEMINI_IMAGE_EDIT_MODEL,
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-preview-image-generation',
  ].filter(Boolean) as string[];
  let lastErr = '';
  for (const model of models) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType: inMime, data: inData } }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${geminiKey()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = `${model}: ${e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 120)}`;
      continue;
    }
    clearTimeout(timer);
    if (res.ok) {
      const d: any = await res.json();
      const parts = d?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p: any) => p?.inlineData?.data);
      if (img) return { image_base64: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png', model };
      lastErr = `${model}: 200 but no image (finish=${d?.candidates?.[0]?.finishReason || '?'})`;
      continue;
    }
    lastErr = `${model} ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`;
    if ([401, 403].includes(res.status)) break; // key not entitled — stop walking
  }
  throw new Error(`image edit failed: ${lastErr}`);
}

// Returns the Base44-compatible envelope { status, output, details } so the
// frontend's existing checks keep working unchanged.
export async function extractDataFromFile({
  fileUrl,
  schema,
}: {
  fileUrl: string;
  schema: Record<string, unknown>;
}): Promise<{ status: 'success' | 'error'; output: any; details?: string }> {
  const prompt = [
    'You are an OCR + data-extraction assistant for restaurant supplier invoices.',
    'The attached file is an invoice (image or PDF). It may be in Hebrew, English, or mixed.',
    'Extract the fields described by the JSON schema. For dates, normalize to YYYY-MM-DD.',
    'For items, list every line-item from the invoice. Use numeric values for quantity/unit_price (no currency symbols).',
    'If a field is genuinely missing from the invoice, omit it rather than inventing a value.',
  ].join('\n');

  try {
    const output: any = await invokeLLM({
      prompt,
      fileUrls: [fileUrl],
      responseSchema: schema,
    });

    if (!output || typeof output !== 'object' || output.raw) {
      return {
        status: 'error',
        output: null,
        details: 'המודל החזיר תשובה שלא תאמה את הסכמה. נסה תמונה ברורה יותר.',
      };
    }
    return { status: 'success', output };
  } catch (err: any) {
    return {
      status: 'error',
      output: null,
      details: err?.message || 'extraction_failed',
    };
  }
}
