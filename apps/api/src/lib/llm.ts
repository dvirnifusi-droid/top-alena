// ---------------------------------------------------------------------------
// LLM integration — providers: gemini (default) | anthropic
// Switch by setting LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY in env.
// ---------------------------------------------------------------------------

import { minio } from './storage.js';

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
    return { mime, data: buf.toString('base64') };
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime, data: buf.toString('base64') };
}

type InvokeArgs = {
  prompt: string;
  responseSchema?: Record<string, unknown>;
  fileUrls?: string[];
  model?: string;
};

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function geminiInvoke({ prompt, responseSchema, fileUrls, model }: InvokeArgs) {
  const modelName = model ?? DEFAULT_GEMINI_MODEL;
  const parts: any[] = [{ text: prompt }];

  if (fileUrls?.length) {
    for (const url of fileUrls) {
      const { mime, data } = await fetchFileAsBase64(url);
      parts.push({ inlineData: { mimeType: mime, data } });
    }
  }

  const body: any = { contents: [{ role: 'user', parts }] };
  if (responseSchema) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: sanitizeSchemaForGemini(responseSchema),
    };
  }

  const res = await fetch(`${GEMINI_BASE}/models/${modelName}:generateContent?key=${geminiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (responseSchema) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Anthropic (Claude) — used when LLM_PROVIDER=anthropic
// ---------------------------------------------------------------------------

async function anthropicInvoke({ prompt, responseSchema, fileUrls, model }: InvokeArgs) {
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
    max_tokens: 4096,
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

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();

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
  if (PROVIDER === 'anthropic') return anthropicInvoke(args);
  return geminiInvoke(args);
}

export async function generateImage({ prompt }: { prompt: string }) {
  // Imagen via Gemini API (Anthropic doesn't generate images).
  const res = await fetch(
    `${GEMINI_BASE}/models/imagen-3.0-generate-002:generateImages?key=${geminiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: { text: prompt }, sampleCount: 1 }),
    },
  );
  if (!res.ok) throw new Error(`Imagen error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const b64 = data?.generatedImages?.[0]?.image?.imageBytes;
  return { image_base64: b64 ?? null };
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
