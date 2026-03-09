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

        // Only on create (shift start)
        if (event?.type !== 'create') return Response.json({ ok: true });

        const title = '🟢 כניסה למשמרת';
        const startTime = data.shift_start
            ? new Date(data.shift_start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
            : '';
        const message = `${data.employee_name} נכנס למשמרת\nשעה: ${startTime}\nתאריך: ${data.date}`;

        const [adminUsers, employees] = await Promise.all([
            base44.asServiceRole.entities.User.filter({ role: 'admin' }),
            base44.asServiceRole.entities.Employee.list()
        ]);

        console.log('admins found:', adminUsers.length, adminUsers.map(u => u.email));
        console.log('employees found:', employees.length, employees.map(e => ({ email: e.email, key: e.pushover_user_key ? '✅' : '❌' })));

        for (const admin of adminUsers) {
            const adminEmps = employees.filter(e => e.email?.toLowerCase() === admin.email?.toLowerCase());
            const emp = adminEmps.find(e => e.pushover_user_key) || adminEmps[0];
            if (emp?.pushover_user_key) {
                await pushover(emp.pushover_user_key, title, message);
            }
        }

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});