// Free Web Push to staff — replaces paid Twilio SMS for in-app notifications.
// Requires the employee to have run "🔔 הפעל התראות" once (stores the
// browser's PushSubscription on Employee.push_subscription).

import webpush from 'web-push';
import { prisma } from '../db.js';

const db = prisma as any;

export type NotifyResult =
  | { delivered: true }
  | { delivered: false; reason: 'no_employee_id' | 'employee_not_found' | 'no_subscription' | 'send_failed'; error?: string };

export async function notifyEmployee(
  employee_id: string | null | undefined,
  title: string,
  body: string,
  url: string = '/EmployeeHome',
): Promise<NotifyResult> {
  if (!employee_id) return { delivered: false, reason: 'no_employee_id' };
  const emp = await db.employee.findUnique({ where: { id: employee_id } }).catch(() => null);
  if (!emp) return { delivered: false, reason: 'employee_not_found' };
  if (!emp.push_subscription) return { delivered: false, reason: 'no_subscription' };

  const payload = JSON.stringify({ title, body, url });
  try {
    await webpush.sendNotification(emp.push_subscription as any, payload);
    return { delivered: true };
  } catch (err: any) {
    // Stale subscription -> clear it so we stop trying
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await db.employee
        .update({ where: { id: employee_id }, data: { push_subscription: null } })
        .catch(() => {});
    }
    return { delivered: false, reason: 'send_failed', error: err?.message };
  }
}
