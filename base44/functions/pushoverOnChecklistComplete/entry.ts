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
        const { data, old_data, event } = await req.json();

        // Only trigger when status changes to 'completed'
        if (data.status !== 'completed') return Response.json({ ok: true });
        if (old_data && old_data.status === 'completed') return Response.json({ ok: true });

        const completedBy = data.executed_by_name || data.employee_name || 'לא ידוע';
        const checklistTitle = data.checklist_title || data.title || 'צ\'קליסט';
        const score = data.score !== undefined ? ` | ציון: ${data.score}%` : '';

        const title = `✅ צ'קליסט הושלם`;
        const message = `"${checklistTitle}"\nהושלם ע"י: ${completedBy}${score}`;

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

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});