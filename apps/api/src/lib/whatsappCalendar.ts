// Personal scheduler + task manager + wake-up alarm via WhatsApp.
// All state lives on WhatsAppMessage rows (no schema migration):
//   status = 'scheduled_event'  → calendar event, raw.event_at / raw.title / raw.lead_min
//   status = 'open_task'        → todo item, raw.title / raw.created_by_phone
//   status = 'task_done'        → completed task (kept for history)
//   status = 'wake_alarm'       → daily wake-up, raw.hhmm = "07:30"
import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';
import { notifyOwner } from './waTemplates.js';

const TZ = 'Asia/Jerusalem';
function israelYMD(d: Date = new Date()): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }
function israelHHMM(d: Date = new Date()): string {
  return d.toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── EVENT ──────────────────────────────────────────────────────────────────

export async function addScheduledEvent(params: {
  fromPhone: string; title: string; when: Date; lead_min?: number;
}): Promise<{ id: string; when: Date }> {
  const lead = typeof params.lead_min === 'number' ? params.lead_min : 15;
  const row = await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null, direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: params.fromPhone, contact_phone: params.fromPhone,
      body: `🗓 ${params.title} · ${params.when.toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })}`,
      num_media: 0,
      status: 'scheduled_event',
      raw: {
        event_at: params.when.toISOString(),
        title: params.title,
        lead_min: lead,
        target_phone: params.fromPhone,
        notified_lead: false,
        notified_start: false,
      } as any,
      is_read: false,
    },
  });
  return { id: row.id, when: params.when };
}

export async function listTodayEvents(fromPhone: string): Promise<Array<{ id: string; title: string; when: Date }>> {
  const today = israelYMD();
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_event', contact_phone: fromPhone, is_read: false },
    take: 100,
  });
  const result: Array<{ id: string; title: string; when: Date }> = [];
  for (const r of rows) {
    const raw = (r.raw as any) || {};
    const at = raw.event_at ? new Date(raw.event_at) : null;
    if (!at || isNaN(at.getTime())) continue;
    const eventYMD = at.toLocaleDateString('en-CA', { timeZone: TZ });
    if (eventYMD === today) result.push({ id: r.id, title: raw.title || r.body, when: at });
  }
  return result.sort((a, b) => a.when.getTime() - b.when.getTime());
}

// ── TASKS ──────────────────────────────────────────────────────────────────

export async function addTask(fromPhone: string, title: string): Promise<{ id: string }> {
  const row = await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null, direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: fromPhone, contact_phone: fromPhone,
      body: `📌 ${title}`,
      num_media: 0,
      status: 'open_task',
      raw: { title, created_by_phone: fromPhone } as any,
      is_read: false,
    },
  });
  return { id: row.id };
}

export async function listOpenTasks(fromPhone: string): Promise<Array<{ id: string; title: string; created_at: Date }>> {
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'open_task', contact_phone: fromPhone, is_read: false },
    orderBy: { id: 'desc' },
    take: 50,
  });
  return rows.map((r: any) => ({
    id: r.id,
    title: (r.raw as any)?.title || r.body,
    created_at: r.created_at,
  }));
}

export async function completeTaskByMatch(fromPhone: string, query: string): Promise<{ matched: number; title?: string }> {
  const open = await listOpenTasks(fromPhone);
  // Match by id-suffix (last 6 chars) or title-substring
  const q = query.trim().toLowerCase();
  const matches = open.filter((t) => t.id.slice(-6) === q || t.title.toLowerCase().includes(q));
  if (matches.length !== 1) return { matched: matches.length };
  await (prisma as any).whatsAppMessage.update({
    where: { id: matches[0].id },
    data: { status: 'task_done', is_read: true },
  });
  return { matched: 1, title: matches[0].title };
}

// ── WAKE ALARM ────────────────────────────────────────────────────────────

export async function setWakeAlarm(fromPhone: string, hhmm: string): Promise<{ id: string }> {
  // Replace any existing wake alarm for this phone with the new one (cancel-then-add).
  await (prisma as any).whatsAppMessage.updateMany({
    where: { status: 'wake_alarm', contact_phone: fromPhone, is_read: false },
    data: { is_read: true, status: 'wake_alarm_cancelled' },
  }).catch(() => {});
  const row = await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null, direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: fromPhone, contact_phone: fromPhone,
      body: `☀️ שעון מעורר יומי ל-${hhmm}`,
      num_media: 0,
      status: 'wake_alarm',
      raw: { hhmm, target_phone: fromPhone, last_fired_date: null } as any,
      is_read: false,
    },
  });
  return { id: row.id };
}

export async function cancelWakeAlarm(fromPhone: string): Promise<number> {
  const r = await (prisma as any).whatsAppMessage.updateMany({
    where: { status: 'wake_alarm', contact_phone: fromPhone, is_read: false },
    data: { is_read: true, status: 'wake_alarm_cancelled' },
  });
  return r.count;
}

// ── DISPATCHER (called by cron every minute) ───────────────────────────────

export async function dispatchCalendarNotifications(): Promise<{ events_sent: number; alarms_sent: number; tasks: number }> {
  const now = Date.now();
  let eventsSent = 0;
  let alarmsSent = 0;

  // ── Scheduled events: fire lead-time reminder + start-time reminder.
  const events: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_event', is_read: false },
    take: 200,
  });
  for (const ev of events) {
    const raw = (ev.raw as any) || {};
    const at = raw.event_at ? new Date(raw.event_at).getTime() : 0;
    if (!at) continue;
    const lead = (Number(raw.lead_min) || 15) * 60_000;
    const target = raw.target_phone || ev.to_phone;
    if (!target || target === 'self') continue;
    let notifiedLead = !!raw.notified_lead;
    let notifiedStart = !!raw.notified_start;
    let changed = false;
    // Lead reminder
    if (!notifiedLead && now >= (at - lead) && now < at) {
      try {
        await notifyOwner(target, 'תזכורת יומן', `⏰ בעוד ${Math.round(lead / 60_000)} דקות: ${raw.title}`);
        notifiedLead = true; changed = true;
      } catch (e: any) { console.warn('[calendar] lead notify failed', { id: ev.id, err: e?.message }); }
    }
    // Start-time reminder
    if (!notifiedStart && now >= at) {
      try {
        await notifyOwner(target, 'תזכורת יומן', `🔔 עכשיו: ${raw.title}`);
        notifiedStart = true; changed = true;
      } catch (e: any) { console.warn('[calendar] start notify failed', { id: ev.id, err: e?.message }); }
    }
    if (changed) {
      await (prisma as any).whatsAppMessage.update({
        where: { id: ev.id },
        data: {
          raw: { ...raw, notified_lead: notifiedLead, notified_start: notifiedStart } as any,
          is_read: notifiedStart, // mark consumed once start fired
          status: notifiedStart ? 'event_done' : 'scheduled_event',
        },
      });
      if (notifiedStart) eventsSent++;
      if (notifiedLead && !notifiedStart) eventsSent++;
    }
  }

  // ── Wake alarms: check if today's HH:MM has arrived and not yet fired today.
  const alarms: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'wake_alarm', is_read: false },
    take: 50,
  });
  const todayY = israelYMD();
  const nowHHMM = israelHHMM();
  for (const a of alarms) {
    const raw = (a.raw as any) || {};
    if (!raw.hhmm) continue;
    if (raw.last_fired_date === todayY) continue;
    // Trigger when current time >= alarm HH:MM (we sweep every minute)
    if (nowHHMM < raw.hhmm) continue;
    const target = raw.target_phone || a.to_phone;
    if (!target || target === 'self') continue;
    try {
      // Build a mini brief: today's events + open tasks count
      const events = await listTodayEvents(target);
      const tasks = await listOpenTasks(target);
      const lines = [
        `☀️ *בוקר טוב!*`,
        `${todayY} · ${nowHHMM}`,
        '',
      ];
      if (events.length) {
        lines.push('🗓 *היום:*');
        for (const e of events) {
          lines.push(`  ${e.when.toLocaleString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })} · ${e.title}`);
        }
        lines.push('');
      } else lines.push('🗓 אין אירועים מתוזמנים להיום.', '');
      if (tasks.length) {
        lines.push(`✅ *משימות פתוחות* (${tasks.length}):`);
        for (const t of tasks.slice(0, 8)) lines.push(`  • ${t.title}`);
        if (tasks.length > 8) lines.push(`  ...ועוד ${tasks.length - 8}`);
      } else lines.push('✅ אין משימות פתוחות.');
      await notifyOwner(target, 'בוקר טוב', lines.join('\n'));
      await (prisma as any).whatsAppMessage.update({
        where: { id: a.id },
        data: { raw: { ...raw, last_fired_date: todayY } as any },
      });
      alarmsSent++;
    } catch (e: any) {
      console.warn('[calendar] alarm fire failed', { id: a.id, err: e?.message });
    }
  }

  return { events_sent: eventsSent, alarms_sent: alarmsSent, tasks: 0 };
}

// ── TODAY-OVERVIEW (for /סידור-style read command) ────────────────────────

export async function buildTodayOverview(fromPhone: string): Promise<string> {
  const events = await listTodayEvents(fromPhone);
  const tasks = await listOpenTasks(fromPhone);
  const lines = [`📋 *התכנון להיום — ${israelYMD()}*`, ''];
  if (events.length) {
    lines.push('🗓 *אירועים:*');
    for (const e of events) {
      lines.push(`  ${e.when.toLocaleString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })} · ${e.title}`);
    }
    lines.push('');
  } else lines.push('🗓 אין אירועים להיום.', '');
  if (tasks.length) {
    lines.push(`✅ *משימות פתוחות* (${tasks.length}):`);
    for (const t of tasks.slice(0, 15)) lines.push(`  • ${t.title}  _(id: ${t.id.slice(-6)})_`);
    if (tasks.length > 15) lines.push(`  ...ועוד ${tasks.length - 15}`);
    lines.push('', '_לסימון כבוצע: "סיים <שם או id>"_');
  } else lines.push('✅ אין משימות פתוחות.');
  return lines.join('\n');
}
