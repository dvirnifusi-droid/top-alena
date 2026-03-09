import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function pushover(userKey, title, message) {
    const token = Deno.env.get('PUSHOVER_API_TOKEN');
    await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: userKey, title, message, priority: 1 })
    });
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { event, data, old_data } = await req.json();

        // Only on update where status changes to 'completed'
        if (event?.type !== 'update') return Response.json({ ok: true });
        if (data.status !== 'completed') return Response.json({ ok: true });
        if (old_data?.status === 'completed') return Response.json({ ok: true });

        const totalHours = data.total_hours || 0;

        // Only alert if over 8 hours
        if (totalHours <= 8) return Response.json({ ok: true });

        const endTime = data.shift_end
            ? new Date(data.shift_end).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
            : '';
        const title = '⚠️ חריגה בשעות משמרת';
        const message = `${data.employee_name} יצא ממשמרת עם חריגה!\nסך שעות: ${totalHours.toFixed(1)} שעות (מעל 8)\nשעת סיום: ${endTime}\nתאריך: ${data.date}`;

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