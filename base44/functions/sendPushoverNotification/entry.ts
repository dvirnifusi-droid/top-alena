import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function pushover(userKey, title, message, priority = 0) {
    const token = Deno.env.get('PUSHOVER_API_TOKEN');
    const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: userKey, title, message, priority })
    });
    return res.json();
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { user_key, user_keys, title, message, priority } = await req.json();

        const keys = user_keys || (user_key ? [user_key] : []);
        if (keys.length === 0) return Response.json({ error: 'user_key or user_keys required' }, { status: 400 });

        const results = await Promise.all(
            keys.map(k => pushover(k, title || 'TOP ALENA', message, priority || 0))
        );

        return Response.json({ ok: true, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});