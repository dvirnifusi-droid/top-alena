// Free Web Push to staff — replaces paid Twilio SMS for in-app notifications.
// Requires the employee to have run "🔔 הפעל התראות" once (stores the
// browser's PushSubscription on Employee.push_subscription).

import webpush from 'web-push';
import { prisma } from '../db.js';

const db = prisma as any;

export type NotifyResult =
  | { delivered: true }
  | { delivered: false; reason: 'no_employee_id' | 'employee_not_found' | 'no_subscription' | 'send_failed'; error?: string };

// Web-push every owner/admin who enabled notifications. Best-effort: returns how
// many devices got it. Used for owner alerts (e.g. a new delivery order) so they
// arrive even when nothing is open — without a WhatsApp per order.
export async function notifyAdmins(
  title: string,
  body: string,
  url: string = '/DeliveryOrders',
): Promise<{ delivered: number; total: number }> {
  const users = await db.user.findMany({ where: { role: { in: ['admin', 'owner'] } } }).catch(() => []);
  const adminEmails = new Set(users.map((u: any) => String(u.email || '').toLowerCase()).filter(Boolean));
  const MGMT = ['admin', 'owner', 'manager', 'בעלים', 'מנהל'];
  const emps = await db.employee.findMany({ where: { push_subscription: { not: null } } }).catch(() => []);
  const targets = emps.filter((e: any) =>
    adminEmails.has(String(e.email || '').toLowerCase()) || MGMT.includes(String(e.role || '').toLowerCase()));
  const payload = JSON.stringify({ title, body, url });
  let delivered = 0;
  for (const e of targets) {
    try { await webpush.sendNotification(e.push_subscription as any, payload); delivered++; }
    catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.employee.update({ where: { id: e.id }, data: { push_subscription: null } }).catch(() => {});
      }
    }
  }
  return { delivered, total: targets.length };
}

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
