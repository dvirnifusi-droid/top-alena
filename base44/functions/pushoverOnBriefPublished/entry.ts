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

        // Only when status changes to 'published'
        if (data.status !== 'published' || old_data?.status === 'published') return Response.json({ ok: true });

        const shiftTypes = { lunch: 'צהריים', dinner: 'ערב' };
        const title = `📢 תדריך ${shiftTypes[data.shift_type] || data.shift_type} - ${data.date}`;
        const message = `התדריך למשמרת ${shiftTypes[data.shift_type] || data.shift_type} פורסם!${data.sales_focus ? `\n🎯 מוקד מכירות: ${data.sales_focus.substring(0, 80)}` : ''}`;

        const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
        
        await Promise.all(
            employees
                .filter(e => e.pushover_user_key)
                .map(e => pushover(e.pushover_user_key, title, message))
        );

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});