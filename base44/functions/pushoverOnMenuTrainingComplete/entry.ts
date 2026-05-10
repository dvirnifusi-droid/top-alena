import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { employee_name, score_overall, knowledge_level } = await req.json();

    const apiToken = Deno.env.get('PUSHOVER_API_TOKEN');
    if (!apiToken) {
        return Response.json({ error: 'PUSHOVER_API_TOKEN not set' }, { status: 500 });
    }

    // מצא את מנהל המשמרת (admin) עם pushover_user_key
    const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
    const managers = employees.filter(e => e.pushover_user_key);

    const levelEmoji = {
        beginner: '🟡',
        intermediate: '🟠',
        advanced: '🟢',
        expert: '⭐'
    };

    const message = `${levelEmoji[knowledge_level] || '✅'} ${employee_name} סיים את לימוד התפריט!\nציון כולל: ${score_overall}/100\nרמת ידע: ${knowledge_level}\nהעובד מוכן לעבודה בשטח 🍽️`;

    const results = [];
    for (const manager of managers) {
        const res = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: apiToken,
                user: manager.pushover_user_key,
                title: '🎓 סיום לימוד תפריט',
                message,
                priority: 0
            })
        });
        const data = await res.json();
        results.push({ manager: manager.full_name, status: data.status });
    }

    return Response.json({ sent: results.length, results });
});