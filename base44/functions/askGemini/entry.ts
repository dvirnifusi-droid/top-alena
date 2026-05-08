import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, history, systemPrompt } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
    }

    // Build conversation history for Gemini
    const contents = [];

    if (history && history.length > 0) {
        for (const msg of history) {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }
    }

    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const body = {
        system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents,
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
        }
    };

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );

    const data = await res.json();

    if (!res.ok) {
        return Response.json({ error: data.error?.message || 'Gemini API error' }, { status: 500 });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return Response.json({ reply: text });
});