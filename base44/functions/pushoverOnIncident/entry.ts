import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const KITCHEN_IPAD_KEY = 'uh5zhote4vdcrrgt8ccjjeiqannfmv';

async function pushover(userKey, title, message) {
    const token = Deno.env.get('PUSHOVER_API_TOKEN');
    const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: userKey, title, message, priority: 1 })
    });
    const resJson = await res.json();
    console.log(`Pushover to ${userKey.substring(0, 8)}...: status=${resJson.status} errors=${JSON.stringify(resJson.errors)}`);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        let data = body.data;

        // אם הנתונים גדולים מדי, טען מהדאטהבייס
        if (body.payload_too_large || !data) {
            const entityId = body.event?.entity_id;
            if (!entityId) return Response.json({ ok: true });
            data = await base44.asServiceRole.entities.Incident.get(entityId);
        }

        if (!data) return Response.json({ ok: true });

        // דלג על תקריות משוב אוטומטיות
        if (data.incident_number?.startsWith('FEEDBACK-')) return Response.json({ ok: true });

        console.log(`category="${data.category}" | title="${data.title}"`);

        const severityEmoji = { low: '🟡', medium: '🟠', high: '🔴', critical: '🚨' };
        const title = `${severityEmoji[data.severity] || '⚠️'} תקרית חדשה`;
        const message = `${data.title}\nדווח ע"י: ${data.reported_by || 'לא ידוע'}${data.description ? `\n${data.description.substring(0, 100)}` : ''}`;

        // שלח לכל האדמינים עם pushover_user_key
        const [adminUsers, employees] = await Promise.all([
            base44.asServiceRole.entities.User.filter({ role: 'admin' }),
            base44.asServiceRole.entities.Employee.list()
        ]);

        for (const admin of adminUsers) {
            const emp = employees.find(e => e.email?.toLowerCase() === admin.email?.toLowerCase());
            if (emp?.pushover_user_key) {
                await pushover(emp.pushover_user_key, title, message);
            }
        }

        // שלח לאייפד מטבח בתקריות מטבח
        if (data.category === 'kitchen') {
            console.log('שולח לאייפד מטבח...');
            await pushover(KITCHEN_IPAD_KEY, `🍳 תקרית מטבח`, message);
        }

        return Response.json({ ok: true });
    } catch (error) {
        console.error('שגיאה:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});