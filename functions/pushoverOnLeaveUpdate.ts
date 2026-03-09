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
        const { data, old_data } = await req.json();

        // Only notify when status changes
        if (!old_data || data.status === old_data.status) return Response.json({ ok: true });

        const statusLabels = {
            approved: '✅ אושרה',
            rejected: '❌ נדחתה',
            pending: 'ממתין לאישור'
        };

        const title = `📋 בקשת החופשה שלך ${statusLabels[data.status] || data.status}`;
        const message = `בקשת החופשה מ-${data.start_date} עד ${data.end_date} ${statusLabels[data.status] || data.status}${data.manager_notes ? `\nהערת מנהל: ${data.manager_notes}` : ''}`;

        // Find employee's pushover key by name or email
        const employees = await base44.asServiceRole.entities.Employee.list();
        const emp = employees.find(e => e.full_name === data.employee_name);
        if (emp?.pushover_user_key) {
            await pushover(emp.pushover_user_key, title, message);
        }

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});