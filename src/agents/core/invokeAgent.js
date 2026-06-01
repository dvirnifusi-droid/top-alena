import { InvokeLLM } from '@/integrations/Core';

/**
 * invokeAgent — single entry point for running any agent.
 *
 * Wraps InvokeLLM with:
 *   - system + user prompt structure
 *   - structured JSON output via response_json_schema
 *   - hallucination guard: "אין נתון" / null when data missing
 *   - confidence floor — caller can reject low-confidence results
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt   - agent's full system prompt
 * @param {string} opts.userPrompt     - the specific task/data for this call
 * @param {object} [opts.responseSchema] - JSON schema for structured output
 * @param {string} [opts.model]        - override model (default: backend default)
 * @param {number} [opts.minConfidence=0] - reject if confidence below this
 * @returns {Promise<{ok:boolean, data:any, raw:any, error?:string}>}
 */
export async function invokeAgent({ systemPrompt, userPrompt, responseSchema, model, minConfidence = 0 }) {
  const prompt = [
    systemPrompt,
    '',
    '--- TASK ---',
    userPrompt,
    '',
    'If you do not have a verified data point, write "אין נתון" or set the field to null. NEVER fabricate.',
    'Return ONLY valid JSON matching the requested schema.',
  ].join('\n');

  try {
    const raw = await InvokeLLM({
      prompt,
      response_json_schema: responseSchema,
      ...(model ? { model } : {}),
    });

    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch { /* keep as string */ }
    }

    if (minConfidence > 0 && typeof data?.confidence === 'number' && data.confidence < minConfidence) {
      return { ok: false, data, raw, error: `confidence ${data.confidence} below floor ${minConfidence}` };
    }
    return { ok: true, data, raw };
  } catch (err) {
    return { ok: false, data: null, raw: null, error: err?.message || String(err) };
  }
}
