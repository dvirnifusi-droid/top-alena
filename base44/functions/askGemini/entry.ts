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

    // טען URIs מה-DB (מתעדכנים אוטומטית כל יום)
    const cachedFiles = await base44.asServiceRole.entities.GeminiFileCache.list();
    const fileUris = cachedFiles.map(f => f.gemini_file_uri).filter(Boolean);

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

    // MIME types that Gemini File API supports
    const supportedMimeTypes = [
        'application/pdf',
        'text/plain',
        'text/html',
        'text/csv',
        'text/markdown',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'audio/mpeg',
        'audio/wav',
    ];

    // הוספת הקבצים + השאלה בהודעת המשתמש האחרונה
    const fileParts = cachedFiles
        .filter(f => f.gemini_file_uri && supportedMimeTypes.includes(f.mime_type))
        .map(f => ({
            file_data: {
                mime_type: f.mime_type,
                file_uri: f.gemini_file_uri
            }
        }));

    const userParts = [
        ...fileParts,
        { text: message }
    ];

    contents.push({
        role: 'user',
        parts: userParts
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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