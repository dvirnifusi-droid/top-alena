import { prisma } from '../db.js';

export async function pushover(userKey: string, title: string, message: string, priority = 0) {
  const token = process.env.PUSHOVER_APP_TOKEN ?? process.env.PUSHOVER_API_TOKEN;
  if (!token) {
    console.warn('[pushover] no token, skipping');
    return { skipped: true };
  }
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, user: userKey, title, message, priority }),
  });
  if (!res.ok) throw new Error(`pushover_${res.status}`);
  return res.json();
}

/**
 * Send a Pushover to every Employee record that has pushover_user_key set,
 * regardless of role. Used for events-owner alerts that need to reach the
 * owner couple even when their User.role hasn't been set to admin yet.
 */
export async function pushoverEventsOwners(title: string, message: string) {
  try {
    const emps = await (prisma as any).employee.findMany({ where: { pushover_user_key: { not: null } } });
    let sent = 0;
    for (const emp of emps) {
      if (!emp.pushover_user_key) continue;
      try {
        await pushover(emp.pushover_user_key, title, message, 1);
        sent++;
      } catch (err: any) {
        console.error('[events-pushover] send failed for', emp.email, err?.message);
      }
    }
    return { sent, total: emps.length };
  } catch (e: any) {
    return { sent: 0, total: 0, error: e?.message };
  }
}

/**
 * Send a Pushover to every admin user that has a linked employee record
 * with a pushover_user_key set. Mirrors the pattern used by Base44 functions.
 */
export async function pushoverToAdmins(title: string, message: string) {
  const admins = await (prisma as any).user.findMany({ where: { role: 'admin' } });
  const employees = await (prisma as any).employee.findMany();
  const sent: string[] = [];
  for (const admin of admins) {
    const emp = employees.find(
      (e: any) =>
        e.email?.toLowerCase?.() === admin.email?.toLowerCase?.() && e.pushover_user_key,
    );
    if (emp?.pushover_user_key) {
      await pushover(emp.pushover_user_key, title, message).catch((err) =>
        console.error('[pushover] send failed', err),
      );
      sent.push(emp.pushover_user_key);
    }
  }
  return { sent: sent.length };
}
