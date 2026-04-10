import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function pushover(userKey, title, message) {
    const token = Deno.env.get('PUSHOVER_API_TOKEN');
    await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: userKey, title, message, priority: 0 })
    });
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { data } = await req.json();

        // Skip auto-generated feedback incidents
        if (data.incident_number?.startsWith('FEEDBACK-')) return Response.json({ ok: true });

        const severityEmoji = { low: '🟡', medium: '🟠', high: '🔴', critical: '🚨' };
        const title = `${severityEmoji[data.severity] || '⚠️'} תקרית חדשה`;
        const message = `${data.title}\nדווח ע"י: ${data.reported_by || 'לא ידוע'}${data.description ? `\n${data.description.substring(0, 100)}` : ''}`;

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

        // שלח לאייפד המטבח בתקרית מטבח
        if (data.category === 'kitchen') {
            const kitchenIpadKey = 'uh5zhote4vdcrrgt8ccjjeiqannfmv';
            await pushover(kitchenIpadKey, `📣 תקרית מטבח`, message);
        }

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});