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
        const { event, data } = await req.json();

        if (event?.type !== 'create') return Response.json({ ok: true });

        const availabilityTypes = {
            available: 'פנוי',
            unavailable: 'לא פנוי',
            partial: 'פנוי חלקית',
            preferred_off: 'מעדיף לא לעבוד'
        };
        const shiftTypes = { lunch: 'צהריים', dinner: 'ערב', both: 'שתיהן' };

        const title = '📅 הגשת זמינות';
        const message = `${data.employee_name} הגיש זמינות\nתאריך: ${data.date}\nסטטוס: ${availabilityTypes[data.availability_type] || data.availability_type}${data.shift_preference ? `\nמשמרת: ${shiftTypes[data.shift_preference] || data.shift_preference}` : ''}${data.reason ? `\nסיבה: ${data.reason}` : ''}`;

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