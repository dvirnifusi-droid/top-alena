const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY not set');
  return k;
}

type InvokeArgs = {
  prompt: string;
  responseSchema?: Record<string, unknown>;
  fileUrls?: string[];
  model?: string;
};

export async function invokeLLM({ prompt, responseSchema, fileUrls, model }: InvokeArgs) {
  const modelName = model ?? 'gemini-2.5-flash';
  const parts: any[] = [{ text: prompt }];

  if (fileUrls?.length) {
    for (const url of fileUrls) {
      const res = await fetch(url);
      const mime = res.headers.get('content-type') ?? 'application/octet-stream';
      const buf = Buffer.from(await res.arrayBuffer());
      parts.push({ inlineData: { mimeType: mime, data: buf.toString('base64') } });
    }
  }

  const body: any = { contents: [{ role: 'user', parts }] };
  if (responseSchema) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema,
    };
  }

  const res = await fetch(`${GEMINI_BASE}/models/${modelName}:generateContent?key=${key()}`, {
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

export async function generateImage({ prompt }: { prompt: string }) {
  const res = await fetch(
    `${GEMINI_BASE}/models/imagen-3.0-generate-002:generateImages?key=${key()}`,
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

export async function extractDataFromFile({
  fileUrl,
  schema,
}: {
  fileUrl: string;
  schema: Record<string, unknown>;
}) {
  return invokeLLM({
    prompt: 'Extract structured data from the attached file according to the JSON schema.',
    fileUrls: [fileUrl],
    responseSchema: schema,
  });
}
