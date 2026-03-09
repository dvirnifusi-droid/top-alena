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

        const shiftTypes = { lunch: 'צהריים', dinner: 'ערב' };
        const title = '🔄 בקשת החלפת משמרת';
        const message = `${data.requester_name} מבקש להחליף משמרת\nתאריך: ${data.shift_date} (${shiftTypes[data.shift_type] || data.shift_type})${data.target_name ? `\nעם: ${data.target_name}` : ''}${data.message ? `\nהודעה: ${data.message}` : ''}`;

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