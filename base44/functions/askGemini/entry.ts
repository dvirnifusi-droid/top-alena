import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// URIs של קבצי המסעדה שהועלו ל-Gemini File API
const RESTAURANT_FILE_URIS = [
    "https://generativelanguage.googleapis.com/v1beta/files/b3pre91aah6v",  // תפריט ערב
    "https://generativelanguage.googleapis.com/v1beta/files/7jqf86mhqp5u",  // תפריט שתייה
    "https://generativelanguage.googleapis.com/v1beta/files/m7nuf3o9rlc7",  // צ'ק ליסט סגירת בוקר/העברת משמרת
    "https://generativelanguage.googleapis.com/v1beta/files/3smea2fbvl3k",  // צ'ק ליסט פתיחת בר ערב
    "https://generativelanguage.googleapis.com/v1beta/files/wohplw8y0ctj",  // צ'ק ליסט סגירת בר ערב
    "https://generativelanguage.googleapis.com/v1beta/files/t4shf8drkm8y",  // צ'ק ליסט בוקר-צהריים
    "https://generativelanguage.googleapis.com/v1beta/files/kmypayugnswj",  // עלינא ביג
    "https://generativelanguage.googleapis.com/v1beta/files/w0e8d8nbnjpk",  // עיצוב ללא שם
];

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

    // הוספת הקבצים + השאלה בהודעת המשתמש האחרונה
    const userParts = [
        ...RESTAURANT_FILE_URIS.map(uri => ({
            file_data: {
                mime_type: "application/pdf",
                file_uri: uri
            }
        })),
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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