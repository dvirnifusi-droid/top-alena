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
        const { event, data, old_data } = await req.json();

        if (event?.type !== 'update') return Response.json({ ok: true });
        if (data.status !== 'locked') return Response.json({ ok: true });
        if (old_data?.status === 'locked') return Response.json({ ok: true });

        const shiftTypes = { lunch: 'צהריים', dinner: 'ערב' };
        const title = '🔒 טיפים ננעלו';
        const lines = [
            `דוח טיפים ננעל - ${shiftTypes[data.shift_type] || data.shift_type}`,
            `תאריך: ${data.date}`,
        ];
        if (data.tip_per_hour != null) lines.push(`ממוצע לשעה: ₪${Number(data.tip_per_hour).toFixed(2)}`);
        if (data.net_tips_for_distribution != null) lines.push(`סך לחלוקה: ₪${Number(data.net_tips_for_distribution).toFixed(2)}`);
        if (data.locked_by) lines.push(`ננעל ע"י: ${data.locked_by}`);

        const message = lines.join('\n');

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