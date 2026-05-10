import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
        employee_name,
        score_food,
        score_drinks,
        score_overall,
        knowledge_level,
        total_duration_minutes,
        weak_areas,
        strong_areas,
        manager_summary
    } = await req.json();

    const apiToken = Deno.env.get('PUSHOVER_API_TOKEN');
    if (!apiToken) {
        return Response.json({ error: 'PUSHOVER_API_TOKEN not set' }, { status: 500 });
    }

    const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
    const managers = employees.filter(e => e.pushover_user_key);

    const levelEmoji = {
        beginner: '🟡',
        intermediate: '🟠',
        advanced: '🟢',
        expert: '⭐'
    };

    const durationText = total_duration_minutes
        ? `⏱️ זמן לימוד: ${Math.round(total_duration_minutes)} דקות\n`
        : '';

    const weakText = weak_areas && weak_areas.length > 0
        ? `\n⚠️ צריך לחזור על:\n${weak_areas.map(w => `• ${w}`).join('\n')}`
        : '';

    const strongText = strong_areas && strong_areas.length > 0
        ? `\n✅ שולט היטב ב:\n${strong_areas.map(s => `• ${s}`).join('\n')}`
        : '';

    const summaryText = manager_summary
        ? `\n\n📋 סיכום מנהל:\n${manager_summary}`
        : '';

    const message = `${levelEmoji[knowledge_level] || '✅'} ${employee_name} סיים את לימוד התפריט!\n\n🍽️ ציון אוכל: ${score_food}/100\n🍷 ציון שתייה: ${score_drinks}/100\n🏆 ציון כולל: ${score_overall}/100\nרמה: ${knowledge_level}\n${durationText}${strongText}${weakText}${summaryText}`;

    const results = [];
    for (const manager of managers) {
        const res = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: apiToken,
                user: manager.pushover_user_key,
                title: `🎓 סיום לימוד תפריט - ${employee_name}`,
                message: message.slice(0, 1024),
                priority: 0
            })
        });
        const data = await res.json();
        results.push({ manager: manager.full_name, status: data.status });
    }

    return Response.json({ sent: results.length, results });
});