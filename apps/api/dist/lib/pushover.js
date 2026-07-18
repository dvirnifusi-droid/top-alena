import { prisma } from '../db.js';
// D-iso: Mirror every Pushover alert to WhatsApp so tenants don't need
// the Pushover app installed. Finds owner/admin phones from the Employee
// table and sends via the shared platform Twilio number. Failures are
// swallowed — the Pushover fire-and-forget contract must be preserved.
async function mirrorToWhatsApp(title, message) {
    try {
        // Use the SAME per-tenant recipient list as the scheduled reports (the
        // tenant's own owner, env admins only on alena). The old logic matched
        // role=admin Users to Employees-with-phones, which resolved to nobody when
        // the owner wasn't set up that exact way — so the mirror silently sent to
        // no one. Unifying it means every Pushover alert reaches the owner.
        const { reportRecipientPhones } = await import('./whatsappPermissions.js');
        const phones = await reportRecipientPhones();
        if (!phones.length)
            return;
        const { sendWhatsApp } = await import('./twilio.js');
        const body = `🔔 ${title}\n\n${message}`;
        for (const phone of phones) {
            try {
                await sendWhatsApp(phone, body);
            }
            catch (e) {
                console.warn('[pushover-mirror] whatsapp failed', phone, e?.message);
            }
        }
    }
    catch (e) {
        console.warn('[pushover-mirror] lookup failed', e?.message);
    }
}
export async function pushover(userKey, title, message, priority = 0) {
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
    if (!res.ok)
        throw new Error(`pushover_${res.status}`);
    return res.json();
}
/**
 * Send a Pushover to every Employee record that has pushover_user_key set,
 * regardless of role. Used for events-owner alerts that need to reach the
 * owner couple even when their User.role hasn't been set to admin yet.
 */
export async function pushoverEventsOwners(title, message) {
    // Mirror to WhatsApp (fire-and-forget, does not block Pushover path)
    void mirrorToWhatsApp(title, message);
    try {
        const emps = await prisma.employee.findMany({ where: { pushover_user_key: { not: null } } });
        let sent = 0;
        for (const emp of emps) {
            if (!emp.pushover_user_key)
                continue;
            try {
                await pushover(emp.pushover_user_key, title, message, 1);
                sent++;
            }
            catch (err) {
                console.error('[events-pushover] send failed for', emp.email, err?.message);
            }
        }
        return { sent, total: emps.length };
    }
    catch (e) {
        return { sent: 0, total: 0, error: e?.message };
    }
}
/**
 * Send a Pushover to every admin user that has a linked employee record
 * with a pushover_user_key set. Mirrors the pattern used by Base44 functions.
 */
export async function pushoverToAdmins(title, message) {
    // Mirror to WhatsApp — every alert the tenant used to only get in
    // Pushover now also arrives in WhatsApp so the owner never needs a
    // separate app. Fire-and-forget so this never blocks the return path.
    void mirrorToWhatsApp(title, message);
    // Owners are recipients too. Promoting a user from 'admin' to 'owner' silently
    // dropped them from every Pushover alert — the tenant owner is exactly who
    // these alerts are FOR.
    const admins = await prisma.user.findMany({ where: { role: { in: ['admin', 'owner'] } } });
    const employees = await prisma.employee.findMany();
    const sent = [];
    for (const admin of admins) {
        const emp = employees.find((e) => e.email?.toLowerCase?.() === admin.email?.toLowerCase?.() && e.pushover_user_key);
        if (emp?.pushover_user_key) {
            await pushover(emp.pushover_user_key, title, message).catch((err) => console.error('[pushover] send failed', err));
            sent.push(emp.pushover_user_key);
        }
    }
    return { sent: sent.length };
}
//# sourceMappingURL=pushover.js.map