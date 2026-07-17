// Free Web Push to staff — replaces paid Twilio SMS for in-app notifications.
// Requires the employee to have run "🔔 הפעל התראות" once (stores the
// browser's PushSubscription on Employee.push_subscription).
import webpush from 'web-push';
import { prisma } from '../db.js';
const db = prisma;
export async function notifyEmployee(employee_id, title, body, url = '/EmployeeHome') {
    if (!employee_id)
        return { delivered: false, reason: 'no_employee_id' };
    const emp = await db.employee.findUnique({ where: { id: employee_id } }).catch(() => null);
    if (!emp)
        return { delivered: false, reason: 'employee_not_found' };
    if (!emp.push_subscription)
        return { delivered: false, reason: 'no_subscription' };
    const payload = JSON.stringify({ title, body, url });
    try {
        await webpush.sendNotification(emp.push_subscription, payload);
        return { delivered: true };
    }
    catch (err) {
        // Stale subscription -> clear it so we stop trying
        if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.employee
                .update({ where: { id: employee_id }, data: { push_subscription: null } })
                .catch(() => { });
        }
        return { delivered: false, reason: 'send_failed', error: err?.message };
    }
}
//# sourceMappingURL=notifications.js.map