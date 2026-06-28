// Conversational WhatsApp agent — agent-loop with tools instead of single-shot
// classify. Maintains rolling conversation history per phone so follow-ups
// work naturally ("עוד פעם?" / "שנה ל-15:00" / "מי משובץ אז?").
//
// Architecture:
//   1. Inbound message + previous N turns + system prompt → Gemini
//   2. Gemini returns either:
//        a) plain text reply (no tool needed)
//        b) tool_calls[] — we execute, append results, loop back to Gemini
//   3. Final text reply goes back to user
//   4. The whole exchange is appended to ConversationContext for next time
//
// Tools available:
//   READ:  list_today_schedule, list_today_events, list_open_tasks,
//          list_open_leads, get_recent_tips, get_unpaid_invoices,
//          search_employee, search_lead, search_invoice
//   WRITE (always pending-confirmation — never auto-execute):
//          propose_event_add, propose_task_add, propose_task_done,
//          propose_lead_set_stage, propose_invoice_mark_paid,
//          propose_shift_assign, propose_send_contract, propose_remind_me
//
// Confirmation flow stays the same — propose_* tools just create a
// pending-action row and return its summary; the user replies 'כן' and
// the existing tryConfirmPendingAction picks it up.

import { prisma } from '../db.js';
import {
  addScheduledEvent,
  addTask,
  completeTaskByMatch,
  listTodayEvents,
  listOpenTasks,
} from './whatsappCalendar.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-2.5-flash';

const TZ = 'Asia/Jerusalem';
function ymd(d: Date = new Date()): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }
function israelDayName(ymdStr: string): string {
  const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  try { return NAMES[new Date(`${ymdStr}T12:00:00.000Z`).getDay()]; } catch { return ''; }
}

// ─── Conversation memory ───────────────────────────────────────────────────

const HISTORY_WINDOW = 10; // keep last N user+assistant turns
const HISTORY_MAX_AGE_MIN = 30; // forget older

type Turn = { role: 'user' | 'model'; text: string; ts: number };

async function loadHistory(phone: string): Promise<Turn[]> {
  const cutoff = new Date(Date.now() - HISTORY_MAX_AGE_MIN * 60 * 1000);
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { contact_phone: phone, created_at: { gte: cutoff } },
    orderBy: { id: 'desc' },
    take: HISTORY_WINDOW * 2,
  }).catch(() => []);
  const turns: Turn[] = [];
  for (const r of rows) {
    if (!r.body || String(r.body).startsWith('🎙️')) continue; // skip transcription echoes
    turns.push({
      role: r.direction === 'inbound' ? 'user' : 'model',
      text: String(r.body).slice(0, 800),
      ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    });
  }
  return turns.reverse().slice(-HISTORY_WINDOW);
}

// ─── Tool definitions for Gemini function-calling ──────────────────────────

const TOOL_DECLARATIONS = [
  {
    name: 'list_today_schedule',
    description: 'Returns who is assigned to today\'s shifts at the restaurant (lunch + dinner, grouped by position).',
    parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'Optional YYYY-MM-DD; defaults to today' } } },
  },
  {
    name: 'list_today_events',
    description: 'Returns the user\'s personal calendar events for today (or a given date).',
    parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'Optional YYYY-MM-DD; defaults to today' } } },
  },
  {
    name: 'list_open_tasks',
    description: 'Returns the user\'s open personal tasks (todo list).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_open_leads',
    description: 'Returns event leads awaiting manager action (pending / contacted / quoted).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_recent_tips',
    description: 'Returns the most recent tip report summary (last 7 days).',
    parameters: { type: 'OBJECT', properties: { days: { type: 'INTEGER' } } },
  },
  {
    name: 'get_unpaid_invoices',
    description: 'Returns unpaid invoices (count + total + 5 most recent).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'search_employee',
    description: 'Fuzzy search for an active employee by name. Returns matches with positions.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] },
  },
  {
    name: 'search_lead',
    description: 'Fuzzy search for an event lead by customer name or phone.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] },
  },
  {
    name: 'search_invoice',
    description: 'Look up an invoice by number or supplier name fragment.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] },
  },
  {
    name: 'propose_event_add',
    description: 'Propose adding a personal calendar event. The user must reply "כן" to confirm. Time format: "מחר 14:00" / "ראשון 09:30" / ISO.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        when: { type: 'STRING' },
        lead_min: { type: 'INTEGER', description: 'Minutes before to remind. Default 15.' },
      },
      required: ['title', 'when'],
    },
  },
  {
    name: 'propose_task_add',
    description: 'Propose adding a task to the user\'s todo list. Confirms before saving.',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] },
  },
  {
    name: 'propose_task_done',
    description: 'Propose marking a task as complete. Match by title substring.',
    parameters: { type: 'OBJECT', properties: { match: { type: 'STRING' } }, required: ['match'] },
  },
  {
    name: 'propose_lead_set_stage',
    description: 'Propose changing the stage of an event lead. Stages: pending/contacted/quoted/won/lost.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lead_query: { type: 'STRING', description: 'Customer name or phone' },
        stage: { type: 'STRING', enum: ['pending', 'contacted', 'quoted', 'won', 'lost'] },
      },
      required: ['lead_query', 'stage'],
    },
  },
  {
    name: 'propose_invoice_mark_paid',
    description: 'Propose marking a specific invoice as paid (by invoice_number).',
    parameters: { type: 'OBJECT', properties: { invoice_number: { type: 'STRING' } }, required: ['invoice_number'] },
  },
  {
    name: 'propose_shift_assign',
    description: 'Propose assigning a worker to a shift. Times default to 12-17 (lunch) or 17-23 (dinner).',
    parameters: {
      type: 'OBJECT',
      properties: {
        employee_name: { type: 'STRING' },
        date: { type: 'STRING', description: 'YYYY-MM-DD or "מחר" or day name like "רביעי"' },
        shift_type: { type: 'STRING', enum: ['lunch', 'dinner'] },
        position: { type: 'STRING', description: 'Optional, will pick a default from the worker\'s positions' },
      },
      required: ['employee_name', 'date', 'shift_type'],
    },
  },
  {
    name: 'propose_remind_me',
    description: 'Schedule a reminder to be sent back to the user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        when: { type: 'STRING', description: '"בעוד שעה" / "מחר 14:00" / ISO' },
        text: { type: 'STRING' },
      },
      required: ['when', 'text'],
    },
  },
  {
    name: 'modify_pending_proposal',
    description: 'Use ONLY when the user is *correcting* the most recent pending proposal that has NOT been confirmed yet. Pass only the field(s) the user changed; others stay as-is. After calling this, restate the updated proposal to the user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        when: { type: 'STRING', description: 'New time/date if user corrected it ("15:00", "רביעי 14:00", etc.)' },
        title: { type: 'STRING', description: 'New title if user corrected it' },
        lead_min: { type: 'INTEGER', description: 'New lead-time reminder in minutes' },
        stage: { type: 'STRING', enum: ['pending','contacted','quoted','won','lost'] },
        invoice_number: { type: 'STRING' },
      },
    },
  },
  {
    name: 'cancel_pending_proposal',
    description: 'Cancel the most recent pending proposal without saving.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'update_scheduled_event',
    description: 'Update an ALREADY-SAVED personal calendar event (not a pending proposal). Find by title substring and change time/title/lead-time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title_match: { type: 'STRING', description: 'Substring of the event title to find (e.g. "דביר", "קובי")' },
        new_when: { type: 'STRING', description: 'New time — "מחר 14:00" / "ראשון 09:30" / ISO' },
        new_title: { type: 'STRING', description: 'New title (optional)' },
        new_lead_min: { type: 'INTEGER', description: 'New lead-time reminder in minutes' },
      },
      required: ['title_match'],
    },
  },
  {
    name: 'cancel_scheduled_event',
    description: 'Delete an already-saved scheduled event by fuzzy title match.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title_match: { type: 'STRING' },
      },
      required: ['title_match'],
    },
  },
  {
    name: 'list_pending_proposals',
    description: 'List the user\'s active pending proposals (awaiting yes/no), so the agent knows what context the user is referring to.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'propose_event_add_batch',
    description: 'Propose adding MULTIPLE personal calendar events at once. Use this when the user sends a list of meetings/events in one message. Parse each line into an event with title + when. Vague times → use defaults: בבוקר=09:00, בצהריים=13:00, בערב=19:00, בלילה=22:00. Items without ANY time can be skipped or set to lead_min=0.',
    parameters: {
      type: 'OBJECT',
      properties: {
        events: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              when: { type: 'STRING', description: '"ראשון 16:00" / "מחר 14:00" / "שני 13:00" / ISO' },
              lead_min: { type: 'INTEGER' },
            },
            required: ['title', 'when'],
          },
        },
        lead_min_default: { type: 'INTEGER', description: 'Default reminder minutes for all events (e.g. 120 if user said "שעתיים לפני")' },
      },
      required: ['events'],
    },
  },
  {
    name: 'propose_employee_shifts_batch',
    description: 'Add multiple WORK SHIFTS (not personal events) to an employee\'s monthly report. Use when the user pastes a list of shift entries like "28.5 19:30-01:25 / 30.5 20:30-00:45 / 4.6 20:00-01:20" optionally prefixed with an employee name. Each entry: date (DD.MM or DD/MM, current year), start_time and end_time. Detects collisions with existing shifts and lets the manager decide replace vs skip.',
    parameters: {
      type: 'OBJECT',
      properties: {
        employee_search: { type: 'STRING', description: 'Employee name (or part of it) the shifts belong to.' },
        position: { type: 'STRING', description: 'Optional position for these shifts (e.g. "מארחת", "מלצר", "ברמן", "טבח"). If the user wrote it next to the name (e.g. "לידר רוחם מארחת:") pass it here. Otherwise omit — the employee\'s registered first position will be used.' },
        entries: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING', description: 'DD.MM or DD/MM. Current year auto-fills.' },
              start_time: { type: 'STRING', description: 'HH:MM' },
              end_time: { type: 'STRING', description: 'HH:MM (can be next-day, e.g. 01:25)' },
            },
            required: ['date', 'start_time', 'end_time'],
          },
        },
      },
      required: ['employee_search', 'entries'],
    },
  },
  {
    name: 'propose_task_add_batch',
    description: 'Propose adding MULTIPLE tasks (todo items) at once. Use this when the user lists tasks like "המשימות שלי: להזמין יין, לקרוא לרואה חשבון, לקנות סכינים".',
    parameters: {
      type: 'OBJECT',
      properties: {
        tasks: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] },
        },
      },
      required: ['tasks'],
    },
  },
];

// ─── Tool implementations ──────────────────────────────────────────────────

async function tool_list_today_schedule(args: any, _phone: string): Promise<any> {
  const targetYMD = args?.date || ymd();
  const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
  const shifts = all.filter((s) => {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return d === targetYMD;
  });
  const out: any = { date: targetYMD, day_name: israelDayName(targetYMD), lunch: [], dinner: [] };
  for (const t of ['lunch', 'dinner']) {
    const matching = shifts.filter((s: any) => s.shift_type === t);
    const staff = matching.flatMap((s: any) => s.assigned_staff || []);
    out[t] = staff.map((a: any) => ({ name: a.employee_name, position: a.position, time: `${a.start_time}-${a.end_time}` }));
  }
  return out;
}

async function tool_list_today_events(args: any, phone: string): Promise<any> {
  const targetYMD = args?.date || ymd();
  // Re-using listTodayEvents which is today-only; reach DB directly for other dates.
  if (targetYMD === ymd()) {
    const events = await listTodayEvents(phone);
    return { date: targetYMD, events: events.map(e => ({ time: e.when.toLocaleString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), title: e.title })) };
  }
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_event', contact_phone: phone, is_read: false },
    take: 200,
  }).catch(() => []);
  const events = rows
    .map((r: any) => ({ at: new Date((r.raw as any)?.event_at || 0), title: (r.raw as any)?.title || r.body }))
    .filter((e: any) => e.at.toLocaleDateString('en-CA', { timeZone: TZ }) === targetYMD)
    .sort((a: any, b: any) => a.at.getTime() - b.at.getTime());
  return { date: targetYMD, events: events.map((e: any) => ({ time: e.at.toLocaleString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), title: e.title })) };
}

async function tool_list_open_tasks(_args: any, phone: string): Promise<any> {
  const tasks = await listOpenTasks(phone);
  return { count: tasks.length, tasks: tasks.slice(0, 20).map(t => ({ id: t.id.slice(-6), title: t.title })) };
}

async function tool_list_open_leads(_args: any, _phone: string): Promise<any> {
  const leads: any[] = await (prisma as any).eventLead.findMany({
    where: { status: { in: ['pending', 'contacted', 'quoted'] } },
    orderBy: { id: 'desc' }, take: 20,
  });
  return { count: leads.length, leads: leads.map(l => ({
    name: l.contact_name, phone: l.contact_phone, status: l.status,
    event_date: l.event_date, guest_count: l.guest_count, event_type: l.event_type,
  })) };
}

async function tool_get_recent_tips(args: any, _phone: string): Promise<any> {
  const days = Math.max(1, Math.min(30, Number(args?.days) || 7));
  const since = new Date(Date.now() - days * 86_400_000);
  const reports: any[] = await (prisma as any).tipReport.findMany({ orderBy: { date: 'desc' }, take: 50 });
  const inRange = reports.filter((r: any) => new Date(r.date).getTime() >= since.getTime());
  const total = inRange.reduce((s: number, r: any) => s + Number(r.total_tips_collected || 0), 0);
  const avg = inRange.length ? total / inRange.length : 0;
  const latest = inRange[0] || null;
  return { days, shift_count: inRange.length, total: Math.round(total), avg_per_shift: Math.round(avg),
    latest: latest ? { date: String(latest.date).slice(0, 10), shift: latest.shift_type, total: latest.total_tips_collected, per_hour: latest.tip_per_hour, status: latest.status } : null };
}

async function tool_get_unpaid_invoices(_args: any, _phone: string): Promise<any> {
  const inv: any[] = await (prisma as any).invoice.findMany({ where: { payment_status: 'unpaid' }, orderBy: { invoice_date: 'desc' }, take: 200 });
  const total = inv.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const recent = inv.slice(0, 5);
  // Hydrate supplier names for the 5 most recent
  const sups: Record<string, string> = {};
  if (recent.length) {
    const supIds = [...new Set(recent.map((i: any) => i.supplier_id).filter(Boolean))];
    const ss: any[] = await (prisma as any).supplier.findMany({ where: { id: { in: supIds } } }).catch(() => []);
    for (const s of ss) sups[s.id] = s.company_name;
  }
  return { count: inv.length, total: Math.round(total), recent: recent.map((i: any) => ({
    invoice_number: i.invoice_number, supplier: sups[i.supplier_id] || '?', amount: i.total_amount, date: String(i.invoice_date).slice(0, 10),
  })) };
}

async function tool_search_employee(args: any, _phone: string): Promise<any> {
  const name = String(args?.name || '').toLowerCase().trim();
  if (!name) return { matches: [] };
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const matches = emps.filter((e: any) => String(e.full_name || '').toLowerCase().includes(name));
  return { matches: matches.slice(0, 8).map((e: any) => ({
    id: e.id, name: e.full_name, phone: e.phone,
    positions: (e.positions || []).map((p: any) => p?.position_name || p).filter(Boolean),
  })) };
}

async function tool_search_lead(args: any, _phone: string): Promise<any> {
  const q = String(args?.query || '').toLowerCase().trim();
  if (!q) return { matches: [] };
  const leads: any[] = await (prisma as any).eventLead.findMany({ orderBy: { id: 'desc' }, take: 200 });
  const matches = leads.filter((l: any) =>
    String(l.contact_name || '').toLowerCase().includes(q) ||
    String(l.contact_phone || '').includes(q.replace(/\D/g, '')),
  );
  return { matches: matches.slice(0, 8).map((l: any) => ({
    id: l.id, name: l.contact_name, phone: l.contact_phone, status: l.status,
    event_date: l.event_date, guests: l.guest_count, type: l.event_type,
  })) };
}

async function tool_search_invoice(args: any, _phone: string): Promise<any> {
  const q = String(args?.query || '').toLowerCase().trim();
  if (!q) return { matches: [] };
  const inv: any[] = await (prisma as any).invoice.findMany({ orderBy: { invoice_date: 'desc' }, take: 500 });
  // Match by invoice_number prefix OR by supplier company_name fragment
  const sups: any[] = await (prisma as any).supplier.findMany({ take: 500 });
  const matchingSupIds = new Set(sups.filter((s: any) => String(s.company_name || '').toLowerCase().includes(q)).map((s: any) => s.id));
  const matches = inv.filter((i: any) =>
    String(i.invoice_number || '').toLowerCase().includes(q) ||
    matchingSupIds.has(i.supplier_id),
  );
  return { matches: matches.slice(0, 10).map((i: any) => ({
    invoice_number: i.invoice_number, supplier: sups.find((s: any) => s.id === i.supplier_id)?.company_name || '?',
    amount: i.total_amount, date: String(i.invoice_date).slice(0, 10), payment_status: i.payment_status,
  })) };
}

// Write-tools all delegate to the EXISTING proposal infrastructure (stash a
// pending_action row, the user confirms with 'כן'/'לא'). We import lazily
// to avoid a circular dep with whatsappActions.ts.
async function tool_propose_event_add(args: any, phone: string): Promise<any> {
  const when = new Date();
  const { addScheduledEvent: _add } = await import('./whatsappCalendar.js');
  // Just stash via the same row pattern as whatsappActions
  const exec = { type: 'event_add', title: args.title, when: tryParseTimestamp(args.when), lead_min: args.lead_min || 15, target_phone: phone };
  if (!exec.when) return { error: `couldn't parse time '${args.when}'` };
  await stashPendingAction(phone, exec);
  const whenHe = new Date(exec.when).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  return { proposal: `🗓 ${args.title} · ${whenHe} · תזכורת ${exec.lead_min} דק' לפני`, awaiting_confirmation: true };
}

async function tool_propose_task_add(args: any, phone: string): Promise<any> {
  await stashPendingAction(phone, { type: 'task_add', title: args.title, target_phone: phone });
  return { proposal: `📌 ${args.title}`, awaiting_confirmation: true };
}

async function tool_propose_task_done(args: any, phone: string): Promise<any> {
  await stashPendingAction(phone, { type: 'task_done', search: args.match, target_phone: phone });
  return { proposal: `✔️ סימון משימה "${args.match}" כבוצעה`, awaiting_confirmation: true };
}

async function tool_propose_lead_set_stage(args: any, phone: string): Promise<any> {
  const leads: any[] = await (prisma as any).eventLead.findMany({ where: { status: { in: ['pending', 'contacted', 'quoted'] } }, take: 100 });
  const q = String(args.lead_query).toLowerCase();
  const matches = leads.filter((l: any) =>
    String(l.contact_name || '').toLowerCase().includes(q) ||
    String(l.contact_phone || '').includes(q.replace(/\D/g, '')),
  );
  if (!matches.length) return { error: `no matching lead for "${args.lead_query}"` };
  if (matches.length > 1) return { ambiguous: true, candidates: matches.map((l: any) => ({ name: l.contact_name, phone: l.contact_phone })) };
  const lead = matches[0];
  await stashPendingAction(phone, { type: 'lead_set_stage', lead_id: lead.id, stage: args.stage, lead_name: lead.contact_name, target_phone: phone });
  return { proposal: `🎯 ${lead.contact_name} → ${args.stage}`, awaiting_confirmation: true };
}

async function tool_propose_invoice_mark_paid(args: any, phone: string): Promise<any> {
  const inv: any = await (prisma as any).invoice.findFirst({ where: { invoice_number: args.invoice_number } });
  if (!inv) return { error: `no invoice with number ${args.invoice_number}` };
  if (inv.payment_status === 'paid') return { error: `invoice ${args.invoice_number} already paid` };
  await stashPendingAction(phone, { type: 'invoice_mark_paid', invoice_id: inv.id, invoice_number: args.invoice_number, target_phone: phone });
  return { proposal: `💳 חשבונית ${args.invoice_number} (${inv.total_amount}₪) → שולמה`, awaiting_confirmation: true };
}

async function tool_propose_shift_assign(args: any, phone: string): Promise<any> {
  // Resolve employee fuzzy
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const q = String(args.employee_name).toLowerCase();
  const matches = emps.filter((e: any) => String(e.full_name || '').toLowerCase().includes(q));
  if (!matches.length) return { error: `no employee matching "${args.employee_name}"` };
  if (matches.length > 1) return { ambiguous: true, candidates: matches.map((e: any) => e.full_name) };
  const emp = matches[0];
  // Resolve date
  const dateStr = resolveDate(args.date);
  if (!dateStr) return { error: `couldn't parse date "${args.date}"` };
  const times = args.shift_type === 'lunch' ? { start: '12:00', end: '17:00' } : { start: '17:00', end: '23:00' };
  await stashPendingAction(phone, {
    type: 'shift_assign',
    employee_id: emp.id, employee_name: emp.full_name,
    date: dateStr, shift_type: args.shift_type,
    position: args.position || ((emp.positions || [])[0]?.position_name) || 'מלצר',
    start_time: times.start, end_time: times.end,
    target_phone: phone,
  });
  return { proposal: `📅 ${emp.full_name} · ${dateStr} · ${args.shift_type === 'lunch' ? 'צהריים' : 'ערב'}`, awaiting_confirmation: true };
}

async function tool_propose_remind_me(args: any, phone: string): Promise<any> {
  const at = tryParseTimestamp(args.when);
  if (!at) return { error: `couldn't parse time "${args.when}"` };
  await stashPendingAction(phone, { type: 'remind_me', deliver_at: at, remind_text: args.text, target_phone: phone });
  const whenHe = new Date(at).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  return { proposal: `⏰ ${whenHe} · ${args.text}`, awaiting_confirmation: true };
}

async function tool_propose_event_add_batch(args: any, phone: string): Promise<any> {
  const items: any[] = Array.isArray(args.events) ? args.events : [];
  if (!items.length) return { error: 'no events provided' };
  const leadDefault = typeof args.lead_min_default === 'number' ? args.lead_min_default : 15;
  const parsed: Array<{ title: string; whenIso: string; whenHe: string; lead_min: number }> = [];
  const skipped: string[] = [];
  for (const it of items) {
    if (!it?.title || !it?.when) { skipped.push(`${it?.title || '?'} (חסר זמן)`); continue; }
    const iso = tryParseTimestamp(it.when);
    if (!iso) { skipped.push(`${it.title} (${it.when} לא ניתן לפענוח)`); continue; }
    parsed.push({
      title: it.title, whenIso: iso,
      whenHe: new Date(iso).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }),
      lead_min: typeof it.lead_min === 'number' ? it.lead_min : leadDefault,
    });
  }
  if (!parsed.length) return { error: 'could not parse any event times', skipped };
  await stashPendingAction(phone, { type: 'event_add_batch', items: parsed, target_phone: phone });
  const summary = [
    `🗓 ${parsed.length} פגישות מוצעות:`,
    ...parsed.map((e, i) => `${i+1}. ${e.whenHe} · ${e.title}  (תזכ׳ ${e.lead_min} דק׳)`),
  ];
  if (skipped.length) summary.push(``, `⚠️ דילגתי: ${skipped.join(' · ')}`);
  return { proposal: summary.join('\n'), awaiting_confirmation: true };
}

async function tool_propose_employee_shifts_batch(args: any, phone: string): Promise<any> {
  const search = String(args.employee_search || '').trim();
  if (!search) return { error: 'employee_search required' };
  const explicitPosition = String(args.position || '').trim();
  const rawEntries: any[] = Array.isArray(args.entries) ? args.entries : [];
  if (!rawEntries.length) return { error: 'no entries provided' };

  // Resolve employee fuzzy
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const lower = search.toLowerCase();
  const matches = emps.filter((e: any) => String(e.full_name || '').toLowerCase().includes(lower));
  if (!matches.length) return { error: `no active employee matching "${search}"` };
  if (matches.length > 1) return {
    ambiguous: true,
    candidates: matches.slice(0, 6).map((e: any) => e.full_name),
  };
  const emp = matches[0];

  // Parse + classify each entry
  const now = new Date();
  const currentYear = now.getFullYear();
  const parsed: Array<{ date: string; start: string; end: string; shift_type: 'lunch' | 'dinner' }> = [];
  const errors: string[] = [];
  for (const e of rawEntries) {
    const dm = String(e.date).match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);
    if (!dm) { errors.push(`bad date ${e.date}`); continue; }
    const d = parseInt(dm[1]); const m = parseInt(dm[2]);
    let y = dm[3] ? parseInt(dm[3]) : currentYear;
    if (y < 100) y += 2000;
    const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const start = String(e.start_time).trim();
    const end = String(e.end_time).trim();
    // Accept "11", "11:00", "11:5", "9:00" — normalize to HH:MM.
    const normTime = (t: string): string | null => {
      const m = String(t).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
      if (!m) return null;
      const h = parseInt(m[1]); const mm = m[2] ? parseInt(m[2]) : 0;
      if (h > 23 || mm > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const ns = normTime(start); const ne = normTime(end);
    if (!ns || !ne) { errors.push(`bad time ${start}-${end}`); continue; }
    const startH = parseInt(ns.split(':')[0]);
    const shift_type: 'lunch' | 'dinner' = startH < 16 ? 'lunch' : 'dinner';
    parsed.push({
      date: ymd,
      start: ns,
      end: ne,
      shift_type,
    });
  }
  if (!parsed.length) return { error: 'no parseable entries', errors };

  // Check conflicts: existing assignment for this employee on the same date+shift_type
  const allShifts: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
  const conflicts: any[] = [];
  const fresh: any[] = [];
  for (const e of parsed) {
    const dayShifts = allShifts.filter((s: any) => {
      const sd = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
      return sd === e.date && s.shift_type === e.shift_type;
    });
    const existing = dayShifts.find((s: any) =>
      (s.assigned_staff || []).some((a: any) => a.employee_id === emp.id),
    );
    if (existing) {
      const cur = (existing.assigned_staff || []).find((a: any) => a.employee_id === emp.id);
      conflicts.push({
        ...e,
        existing_start: cur?.start_time,
        existing_end: cur?.end_time,
        existing_position: cur?.position,
        existing_manual: !!cur?.manual_entry,
        shift_id: existing.id,
      });
    } else {
      fresh.push(e);
    }
  }

  await stashPendingAction(phone, {
    type: 'employee_shifts_batch',
    employee_id: emp.id,
    employee_name: emp.full_name,
    fresh, conflicts,
    explicit_position: explicitPosition || undefined,
    target_phone: phone,
  });

  const lines = [`📋 *${emp.full_name} — ${parsed.length} משמרות מבוקשות*`, ''];
  if (fresh.length) {
    lines.push(`✨ *${fresh.length} חדשות שייווצרו:*`);
    for (const f of fresh) lines.push(`  • ${f.date.slice(8) + '.' + f.date.slice(5, 7)} · ${f.start}-${f.end} (${f.shift_type === 'lunch' ? 'צהריים' : 'ערב'})`);
  }
  if (conflicts.length) {
    const targetPos = explicitPosition || '';
    const identicalConflicts = conflicts.filter((c: any) =>
      c.existing_start === c.start && c.existing_end === c.end && (!targetPos || c.existing_position === targetPos)
    );
    const realChanges = conflicts.filter((c: any) => !identicalConflicts.includes(c));
    if (realChanges.length) {
      lines.push('', `⚠️ *${realChanges.length} כבר קיימות עם נתונים שונים (יתעדכנו ב"החלף"):*`);
      for (const c of realChanges) {
        const posChange = (targetPos && c.existing_position && c.existing_position !== targetPos)
          ? ` · תפקיד: ${c.existing_position} → ${targetPos}` : '';
        const timeChange = (c.existing_start !== c.start || c.existing_end !== c.end)
          ? ` · שעות: ${c.existing_start}-${c.existing_end} → ${c.start}-${c.end}` : '';
        lines.push(`  • ${c.date.slice(8) + '.' + c.date.slice(5, 7)}${timeChange}${posChange}`);
      }
    }
    if (identicalConflicts.length) {
      lines.push('', `✓ *${identicalConflicts.length} כבר זהות (אין מה לעדכן):* ${identicalConflicts.map((c: any) => c.date.slice(8) + '.' + c.date.slice(5, 7)).join(', ')}`);
    }
  }
  if (errors.length) lines.push('', `❌ שגיאות parsing: ${errors.join(' · ')}`);
  lines.push('', conflicts.length
    ? 'ענה *"החלף"* להחליף את הקיימות, *"דלג"* לדלג עליהן ולהוסיף רק את החדשות, או *"לא"* לביטול.'
    : 'ענה *כן* להוספה או *לא* לביטול.');

  return { proposal: lines.join('\n'), awaiting_confirmation: true };
}

async function tool_propose_task_add_batch(args: any, phone: string): Promise<any> {
  const items: any[] = Array.isArray(args.tasks) ? args.tasks : [];
  if (!items.length) return { error: 'no tasks provided' };
  const titles = items.map(t => String(t?.title || '').trim()).filter(Boolean);
  if (!titles.length) return { error: 'no valid task titles' };
  await stashPendingAction(phone, { type: 'task_add_batch', titles, target_phone: phone });
  const summary = [`📌 ${titles.length} משימות מוצעות:`, ...titles.map((t, i) => `${i+1}. ${t}`)];
  return { proposal: summary.join('\n'), awaiting_confirmation: true };
}

async function tool_list_pending_proposals(_args: any, phone: string): Promise<any> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { contact_phone: phone, status: { in: ['pending_action_confirmation', 'pending_confirmation', 'pending_clarification'] }, is_read: false, created_at: { gte: since } },
    orderBy: { id: 'desc' }, take: 5,
  }).catch(() => []);
  return { count: rows.length, proposals: rows.map((r: any) => ({
    id: r.id.slice(-6), status: r.status, summary: String(r.body || '').slice(0, 200),
    exec: (r.raw as any)?.pending_action || (r.raw as any)?.pending_invoice || null,
  })) };
}

async function tool_modify_pending_proposal(args: any, phone: string): Promise<any> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const pending: any = await (prisma as any).whatsAppMessage.findFirst({
    where: { contact_phone: phone, status: 'pending_action_confirmation', is_read: false, created_at: { gte: since } },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!pending) return { error: 'no_pending_proposal' };
  const exec = { ...(pending.raw as any).pending_action };
  // Apply provided patches per exec type
  if (args.when !== undefined) {
    // Time-only correction (e.g. 'לא, 15:00') should preserve the
    // original date — don't reset to today.
    const newWhenStr = String(args.when).trim().toLowerCase();
    const hasDateHint = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}|מחר|היום|מחרתיים|tomorrow|today|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday|בעוד|in\s+\d)/i.test(newWhenStr);
    const timeOnly = newWhenStr.match(/^(\d{1,2}):(\d{2})\b/);
    let iso: string | null = null;
    if (!hasDateHint && timeOnly && (exec.type === 'event_add' ? exec.when : exec.type === 'remind_me' ? exec.deliver_at : null)) {
      const orig = new Date(exec.type === 'event_add' ? exec.when : exec.deliver_at);
      const origYmd = orig.toLocaleDateString('en-CA', { timeZone: TZ });
      const h = parseInt(timeOnly[1]); const m = parseInt(timeOnly[2]);
      iso = dateAtIsraelLocal(origYmd, h, m).toISOString();
    } else {
      iso = tryParseTimestamp(args.when);
    }
    if (!iso) return { error: `couldn't parse new time '${args.when}'` };
    if (exec.type === 'event_add') exec.when = iso;
    else if (exec.type === 'remind_me') exec.deliver_at = iso;
  }
  if (args.title !== undefined) {
    if (exec.type === 'event_add' || exec.type === 'task_add') exec.title = args.title;
    if (exec.type === 'remind_me') exec.remind_text = args.title;
  }
  if (args.lead_min !== undefined && exec.type === 'event_add') exec.lead_min = args.lead_min;
  if (args.stage !== undefined && exec.type === 'lead_set_stage') exec.stage = args.stage;
  if (args.invoice_number !== undefined && (exec.type === 'invoice_mark_paid' || exec.type === 'invoice_mark_unpaid')) {
    // resolve invoice by new number
    const inv: any = await (prisma as any).invoice.findFirst({ where: { invoice_number: args.invoice_number } });
    if (!inv) return { error: `no invoice with number ${args.invoice_number}` };
    exec.invoice_id = inv.id; exec.invoice_number = args.invoice_number;
  }
  await (prisma as any).whatsAppMessage.update({
    where: { id: pending.id },
    data: { raw: { pending_action: exec } as any, created_at: new Date() }, // reset clock — fresh 10 min window
  });
  // Re-render proposal summary for the user
  let summary = '✏️ עודכן: ';
  if (exec.type === 'event_add') {
    const whenHe = new Date(exec.when).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
    summary += `🗓 ${exec.title} · ${whenHe} · תזכורת ${exec.lead_min || 15} דק' לפני`;
  } else if (exec.type === 'remind_me') {
    const whenHe = new Date(exec.deliver_at).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
    summary += `⏰ ${whenHe} · ${exec.remind_text}`;
  } else if (exec.type === 'task_add') {
    summary += `📌 ${exec.title}`;
  } else if (exec.type === 'lead_set_stage') {
    summary += `🎯 ${exec.lead_name} → ${exec.stage}`;
  } else if (exec.type === 'invoice_mark_paid') {
    summary += `💳 חשבונית ${exec.invoice_number} → שולמה`;
  } else if (exec.type === 'shift_assign') {
    summary += `📅 ${exec.employee_name} · ${exec.date} · ${exec.shift_type === 'lunch' ? 'צהריים' : 'ערב'}`;
  } else {
    summary += JSON.stringify(exec).slice(0, 200);
  }
  return { proposal: summary, awaiting_confirmation: true };
}

async function tool_cancel_pending_proposal(_args: any, phone: string): Promise<any> {
  const r = await (prisma as any).whatsAppMessage.updateMany({
    where: { contact_phone: phone, status: { in: ['pending_action_confirmation', 'pending_confirmation'] }, is_read: false },
    data: { is_read: true, status: 'cancelled_by_user' },
  });
  return { cancelled: r.count };
}

async function tool_update_scheduled_event(args: any, phone: string): Promise<any> {
  const match = String(args.title_match || '').toLowerCase();
  if (!match) return { error: 'title_match required' };
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_event', contact_phone: phone, is_read: false },
    orderBy: { id: 'desc' }, take: 50,
  });
  const matches = rows.filter((r: any) => String((r.raw as any)?.title || '').toLowerCase().includes(match));
  if (!matches.length) return { error: `no scheduled event matching "${args.title_match}"` };
  if (matches.length > 1) return {
    ambiguous: true,
    candidates: matches.slice(0, 5).map((r: any) => ({
      title: (r.raw as any)?.title,
      when: new Date((r.raw as any)?.event_at).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }),
    })),
  };
  const ev = matches[0];
  const raw = { ...(ev.raw as any) };
  if (args.new_when) {
    // If the user gave only time (no date keyword), preserve the original
    // event's date and only change the time. Avoids 'תשנה ל-18:00' jumping
    // the date back to today instead of keeping the original date.
    const newWhenStr = String(args.new_when).trim().toLowerCase();
    const hasDateHint = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}|מחר|היום|מחרתיים|tomorrow|today|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday|בעוד|in\s+\d)/i.test(newWhenStr);
    const timeOnly = newWhenStr.match(/^(\d{1,2}):(\d{2})\b/);
    if (!hasDateHint && timeOnly) {
      // Time-only update — keep original YMD, swap HH:MM
      const h = parseInt(timeOnly[1]); const m = parseInt(timeOnly[2]);
      const orig = new Date(raw.event_at);
      const origYmd = orig.toLocaleDateString('en-CA', { timeZone: TZ });
      raw.event_at = dateAtIsraelLocal(origYmd, h, m).toISOString();
    } else {
      const iso = tryParseTimestamp(args.new_when);
      if (!iso) return { error: `couldn't parse new time '${args.new_when}'` };
      raw.event_at = iso;
    }
    raw.notified_lead = false;
    raw.notified_start = false;
  }
  if (args.new_title) raw.title = args.new_title;
  if (args.new_lead_min != null) raw.lead_min = args.new_lead_min;
  await (prisma as any).whatsAppMessage.update({ where: { id: ev.id }, data: { raw } });
  const whenHe = new Date(raw.event_at).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  return { updated: true, title: raw.title, new_when: whenHe, lead_min: raw.lead_min };
}

async function tool_cancel_scheduled_event(args: any, phone: string): Promise<any> {
  const match = String(args.title_match || '').toLowerCase();
  if (!match) return { error: 'title_match required' };
  const rows: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_event', contact_phone: phone, is_read: false },
    orderBy: { id: 'desc' }, take: 50,
  });
  const matches = rows.filter((r: any) => String((r.raw as any)?.title || '').toLowerCase().includes(match));
  if (!matches.length) return { error: `no scheduled event matching "${args.title_match}"` };
  if (matches.length > 1) return {
    ambiguous: true,
    candidates: matches.slice(0, 5).map((r: any) => ({ title: (r.raw as any)?.title })),
  };
  const ev = matches[0];
  await (prisma as any).whatsAppMessage.update({
    where: { id: ev.id },
    data: { is_read: true, status: 'event_cancelled' },
  });
  return { cancelled: true, title: (ev.raw as any)?.title };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// Same fix as parseRemindAt in whatsappActions.ts — build ISO with the proper
// Israel offset suffix so server-TZ never corrupts wall-clock interpretation.
function israelOffsetSuffix(forDate: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset',
    }).formatToParts(forDate);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+3';
    const m = tz.match(/GMT([+\-]?\d{1,2})(?::?(\d{2}))?/);
    if (!m) return '+03:00';
    const raw = m[1];
    const sign = raw.startsWith('-') ? '-' : '+';
    const hh = String(Math.abs(parseInt(raw, 10))).padStart(2, '0');
    const mm = (m[2] || '00').padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  } catch { return '+03:00'; }
}
function israelDow(d: Date = new Date()): number {
  return new Date(`${ymd(d)}T12:00:00Z`).getUTCDay();
}
function dateAtIsraelLocal(targetYmd: string, h: number, m: number): Date {
  const probe = new Date(`${targetYmd}T12:00:00Z`);
  const offset = israelOffsetSuffix(probe);
  return new Date(`${targetYmd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${offset}`);
}

// Vague time-of-day → default HH:MM. Used when user says "ראשון בצהריים"
// or "בערב" without specifying an exact hour.
function vagueTimeToHHMM(s: string): { h: number; m: number } | null {
  if (/בבוקר|morning/i.test(s)) return { h: 9, m: 0 };
  if (/בצהריים|בצהרים|noon|afternoon/i.test(s)) return { h: 13, m: 0 };
  if (/אחה"?צ|אחר[\s-]?הצהריים/i.test(s)) return { h: 16, m: 0 };
  if (/בערב|evening/i.test(s)) return { h: 19, m: 0 };
  if (/בלילה|night/i.test(s)) return { h: 22, m: 0 };
  return null;
}

function tryParseTimestamp(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  // ISO — but if no timezone, treat as ISRAEL-LOCAL (not UTC).
  // The LLM agent often converts "ראשון 11:30" into a naive ISO without Z,
  // and Node parses naked ISO as UTC on a UTC server, baking in +3h drift.
  const iso = s.match(/^\d{4}-\d{2}-\d{2}[t\s]\d{1,2}:\d{2}(?::\d{2})?/i);
  if (iso) {
    const matched = iso[0].replace(' ', 'T');
    const hasTz = /(Z|[+\-]\d{2}:?\d{2})$/i.test(s);
    if (hasTz) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    // No TZ → treat the wall-clock as Israel local time.
    const [datePart, timePart] = matched.split('T');
    const [hh, mm] = timePart.split(':');
    const d = dateAtIsraelLocal(datePart, parseInt(hh), parseInt(mm));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // "בעוד N דקות/שעות" or "in N min/hr"
  const relHe = s.match(/בעוד\s*(\d+)?\s*(שניות|דקות|דק|דקה|שעות|שעה|ימים|יום)/);
  const relEn = s.match(/in\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)/);
  if (relHe || relEn) {
    const wordToNum: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const m = (relHe || relEn)!;
    const nRaw = m[1] || '1';
    const n = /^\d+$/.test(nRaw) ? parseInt(nRaw) : (wordToNum[nRaw] || 1);
    const u = m[2];
    let ms = 60_000;
    if (/שעה|שעות|hour/i.test(u)) ms = 3600_000;
    else if (/יום|ימים|day/i.test(u)) ms = 86_400_000;
    else if (/שני|sec/i.test(u)) ms = 1000;
    return new Date(Date.now() + n * ms).toISOString();
  }
  // HH:MM with optional date keyword — build via Israel offset to avoid the
  // double-timezone bug that turned 15:30 into 18:30.
  const hhmm = s.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const h = parseInt(hhmm[1]); const m = parseInt(hhmm[2]);
    let targetYmd = ymd();
    if (/מחר|tomorrow/.test(s)) {
      const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
      targetYmd = ymd(t);
    } else if (/מחרתיים/.test(s)) {
      const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 2);
      targetYmd = ymd(t);
    } else {
      const HE: Record<string, number> = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
      for (const [name, dow] of Object.entries(HE)) {
        if (s.includes(name)) {
          const delta = ((dow - israelDow() + 7) % 7) || 7;
          const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + delta);
          targetYmd = ymd(t);
          break;
        }
      }
    }
    let candidate = dateAtIsraelLocal(targetYmd, h, m);
    if (candidate.getTime() < Date.now() + 60_000 && !/מחר|tomorrow|מחרתיים|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/.test(s)) {
      const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
      candidate = dateAtIsraelLocal(ymd(t), h, m);
    }
    return candidate.toISOString();
  }
  // No HH:MM — try vague time-of-day combined with a date hint.
  const vague = vagueTimeToHHMM(s);
  if (vague) {
    let targetYmd = ymd();
    if (/מחר|tomorrow/.test(s)) {
      const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
      targetYmd = ymd(t);
    } else if (/מחרתיים/.test(s)) {
      const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 2);
      targetYmd = ymd(t);
    } else {
      const HE: Record<string, number> = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
      for (const [name, dow] of Object.entries(HE)) {
        if (s.includes(name)) {
          const delta = ((dow - israelDow() + 7) % 7) || 7;
          const t = new Date(`${targetYmd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + delta);
          targetYmd = ymd(t);
          break;
        }
      }
    }
    return dateAtIsraelLocal(targetYmd, vague.h, vague.m).toISOString();
  }
  return null;
}

function resolveDate(raw: string): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/^(יום\s+|ב[-־]?)/, '');
  const tzNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  if (/^(היום|today)$/.test(s)) return tzNow.toLocaleDateString('en-CA', { timeZone: TZ });
  if (/^(מחר|tomorrow)$/.test(s)) { const t = new Date(tzNow); t.setDate(t.getDate() + 1); return t.toLocaleDateString('en-CA', { timeZone: TZ }); }
  if (/^(מחרתיים)$/.test(s)) { const t = new Date(tzNow); t.setDate(t.getDate() + 2); return t.toLocaleDateString('en-CA', { timeZone: TZ }); }
  const HE: Record<string, number> = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
  if (HE[s] !== undefined) {
    const delta = ((HE[s] - tzNow.getDay() + 7) % 7) || 7;
    const t = new Date(tzNow); t.setDate(t.getDate() + delta);
    return t.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);
  if (dm) {
    const d = parseInt(dm[1]), m = parseInt(dm[2]);
    let y = dm[3] ? parseInt(dm[3]) : tzNow.getFullYear();
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

async function stashPendingAction(phone: string, exec: any): Promise<void> {
  await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null, direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: phone, contact_phone: phone,
      body: `[pending] ${exec.type}`,
      num_media: 0,
      status: 'pending_action_confirmation',
      raw: { pending_action: exec } as any,
      is_read: false,
    },
  }).catch(() => {});
}

const TOOL_HANDLERS: Record<string, (args: any, phone: string) => Promise<any>> = {
  list_today_schedule: tool_list_today_schedule,
  list_today_events: tool_list_today_events,
  list_open_tasks: tool_list_open_tasks,
  list_open_leads: tool_list_open_leads,
  get_recent_tips: tool_get_recent_tips,
  get_unpaid_invoices: tool_get_unpaid_invoices,
  search_employee: tool_search_employee,
  search_lead: tool_search_lead,
  search_invoice: tool_search_invoice,
  propose_event_add: tool_propose_event_add,
  propose_task_add: tool_propose_task_add,
  propose_task_done: tool_propose_task_done,
  propose_lead_set_stage: tool_propose_lead_set_stage,
  propose_invoice_mark_paid: tool_propose_invoice_mark_paid,
  propose_shift_assign: tool_propose_shift_assign,
  propose_remind_me: tool_propose_remind_me,
  modify_pending_proposal: tool_modify_pending_proposal,
  cancel_pending_proposal: tool_cancel_pending_proposal,
  update_scheduled_event: tool_update_scheduled_event,
  cancel_scheduled_event: tool_cancel_scheduled_event,
  list_pending_proposals: tool_list_pending_proposals,
  propose_event_add_batch: tool_propose_event_add_batch,
  propose_task_add_batch: tool_propose_task_add_batch,
  propose_employee_shifts_batch: tool_propose_employee_shifts_batch,
};

// ─── Agent loop ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `אתה העוזר האישי של בעל מסעדת "עלינא" (דביר) ב-WhatsApp.
ענה בעברית טבעית, קצרה, ידידותית. אתה מנהל את המסעדה והלוז האישי שלו.

עקרונות:
1. *אל תאמר "לא הבנתי"*. אם הבקשה לא ברורה — שאל שאלת המשך ספציפית או הצע אופציות מבוססות-נתונים שכבר משכת מה-DB.
2. השתמש בכלים שלך אקטיבית: לפני שאתה שואל "מי?" — חפש קודם (search_employee/lead/invoice).
3. כאשר מבקשים פעולת כתיבה (להוסיף, לסמן, לשבץ, לאשר) — קרא ל-propose_* המתאים. המערכת תבקש אישור מהמשתמש; אתה לא צריך לבקש בעצמך.
4. אם המשתמש שאל שאלת קריאה ("מי משובץ הערב?", "כמה טיפים אתמול?") — השתמש בכלי הקריאה ותענה ישירות.
5. שמור על המשכיות שיחה: אם בהודעה הקודמת שאלת "מתי?" וכעת המשתמש כותב "מחר 14:00" — זה תשובה לשאלה שלך.
6. אל תמציא מספרים. אם אינך יודע ערך — חפש אותו או שאל.
7. שעות מדויקות: "16:00" זה 16:00. לא 19:00. לא 61:00.
8. תאריכים יחסיים בעברית: "מחר", "ראשון", "רביעי הבא" — תעביר אותם ככל ש-tools יודעים לפענח.
9. אם הבקשה חורגת מהכלים — תאמר את זה בכנות במקום להמציא תשובה.

*חוקי זמן — קריטי*:
- שעות שמשתמש כותב הן *תמיד* שעון ישראל (Asia/Jerusalem).
- בעת קריאה לכלי כמו propose_event_add / propose_event_add_batch — העבר את ה-when *כפי שהמשתמש כתב* ("ראשון 11:30", "מחר 14:00", "בערב").
- *אל תמיר ל-ISO* (כמו "2026-06-28T11:30") בעצמך — הכלי יודע לפענח עברית. אם בכל זאת תיתן ISO — חובה לכלול ".\n00+03:00" או "Z" עם UTC מחושב נכון.

*חוקי batch — קריטי*:
- אם המשתמש שולח 2+ פגישות בהודעה (גם אם בלי "בבקשה" / "תכניס") → קרא ל-*propose_event_add_batch* (לא propose_event_add פעם אחת!).
- אם המשתמש שולח 2+ משימות / פריטי todo (לדוגמה "תוסיף משימות: X, Y, Z" או "צריך לעשות: A, B, C") → קרא ל-*propose_task_add_batch*.
- אם המשתמש שולח רשימת *משמרות עבור עובד* — שורות בפורמט "DD.MM HH:MM-HH:MM" (לדוגמה "מישל: 28.5 19:30-01:25 / 30.5 20:30-00:45") או רק רשימת תאריכים-וזמנים אחרי שאתה יודע על איזה עובד מדובר → קרא ל-*propose_employee_shifts_batch* עם employee_search ו-entries[].
- אם המשתמש כתב תפקיד ליד השם ("לידר רוחם מארחת:", "מישל ברמן 28.5 ..."): העבר את התפקיד ב-*position*. תפקידים נפוצים: מארחת / מלצר / ברמן / ראנר / טבח / שטיפה / מנהל.
- *⚠️ חשוב מאוד — איך להבדיל בין משמרות לפגישות:*
  - שורות בפורמט "DD.M טווח-שעות" או "DD/M טווח-שעות" (תאריך + טווח שעות עם מקף, *בלי כותרת*) = *משמרות עבודה* → תמיד propose_employee_shifts_batch.
  - טווח שעות יכול להיות בכל אחד מהפורמטים: "11-17" / "11:00-17:00" / "20:30-00:45" / "15:30-17" — כולם תקפים, ה-tool מנרמל לבד.
  - position יכול להיות רב-מילתי ("קופה ואריזות", "אחראי משמרת", "מארחת").
  - פגישות יש להן כותרת ("פגישה עם X", "זום", "ארוחה"). אם רואים רק זמן ללא תיאור — זו משמרת, לא פגישה.
  - דוגמאות מובהקות של משמרות:
    \`\`\`
    לידר רוחם מארחת:
    28.5 19:30-01:25
    30.5 20:30-00:45
    \`\`\`
    \`\`\`
    הילה מאסיל קופה ואריזות 2/6 11-17
    8/6- 11-17
    16/6- 15:30-17
    \`\`\`
    → בשני המקרים: propose_employee_shifts_batch עם employee_search, position, ו-entries[]. גם השורה הראשונה ("הילה מאסיל קופה ואריזות 2/6 11-17") היא משמרת — לא פגישה.
  - אל תקרא ל-propose_event_add_batch בשורות שכאלה — אין כותרת לפגישה.
- בכל מקרה של הודעה עם רשימה — חשוב אם זה אירועים-עם-זמן (פגישה, פגישת זום, ארוחה) או משימות (לעשות, לקנות, לבדוק, להתקשר). בעת ספק — שאל.
- שעות מעורפלות בעת batch אירועים: "בצהריים"=13:00, "בערב"=19:00, "בבוקר"=09:00, "אחה\"צ"=16:00. עבור אותם ל-when עם השעה הברורה.

*טיפול בתיקונים — חוקים קריטיים*:
- אם יש *הצעה ממתינה לאישור* (יצוין למטה בהקשר), והמשתמש כותב משהו שאינו "כן"/"לא" — זה כנראה *תיקון להצעה*.
  דוגמאות: "לא, 15:00" / "לא, ב-3 בעצם" / "תשנה ל-15:00" / "טעות, רביעי" → קרא ל-modify_pending_proposal עם השדה שתוקן בלבד.
- אם המשתמש מבקש לבטל ("בטל את ההצעה" / "אל תשמור") — קרא ל-cancel_pending_proposal.
- אם המשתמש מתייחס לאירוע *שכבר נשמר* (לא הצעה ממתינה) ורוצה לשנות — קרא ל-update_scheduled_event עם title_match.
  דוגמה: "תשנה את הפגישה עם דביר ל-16:00" / "בעצם הפגישה היא ביום שלישי ולא רביעי".
- אם המשתמש מבקש לבטל אירוע שמור — cancel_scheduled_event.

היום: ${ymd()} (${israelDayName(ymd())}).`;

async function buildSystemPrompt(phone: string): Promise<string> {
  // Inject context about any active pending proposal so the agent can decide
  // if an incoming message is a correction vs unrelated.
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const pending: any = await (prisma as any).whatsAppMessage.findFirst({
    where: { contact_phone: phone, status: 'pending_action_confirmation', is_read: false, created_at: { gte: since } },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!pending) return SYSTEM_PROMPT_BASE;
  const exec = (pending.raw as any)?.pending_action || {};
  const summary = String(pending.body || '').slice(0, 300);
  return `${SYSTEM_PROMPT_BASE}

*הקשר פעיל — יש הצעה ממתינה לאישור:*
${summary}
type=${exec.type || '?'} · נשלח לפני ${Math.round((Date.now() - new Date(pending.created_at).getTime()) / 60_000)} דקות.
אם ההודעה הבאה היא תיקון לפרטים שלמעלה — השתמש ב-modify_pending_proposal.`;
}

export async function runConversationAgent(phone: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return '⚠️ עוזר ה-AI לא מוגדר (GEMINI_API_KEY חסר).';
  const history = await loadHistory(phone);

  // Build contents array
  const contents: any[] = [];
  for (const t of history) {
    contents.push({ role: t.role, parts: [{ text: t.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const systemPrompt = await buildSystemPrompt(phone);
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
  };

  // Up to 5 tool-loop iterations
  for (let iter = 0; iter < 5; iter++) {
    const res = await fetch(`${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[conversation] gemini error', res.status, errText.slice(0, 200));
      return `⚠️ שגיאה ב-LLM (${res.status}). נסה שוב.`;
    }
    const data: any = await res.json();
    const cand = data?.candidates?.[0];
    const parts: any[] = cand?.content?.parts || [];

    // Look for function calls
    const fnCalls = parts.filter(p => p.functionCall);
    if (fnCalls.length) {
      // Execute all in parallel, then append responses
      const fnResponses = await Promise.all(fnCalls.map(async (p: any) => {
        const name = p.functionCall.name;
        const args = p.functionCall.args || {};
        const handler = TOOL_HANDLERS[name];
        let response: any;
        try {
          response = handler ? await handler(args, phone) : { error: `unknown tool ${name}` };
        } catch (e: any) {
          response = { error: e?.message || String(e) };
        }
        console.log('[conversation] tool', name, '→', JSON.stringify(response).slice(0, 200));
        return { functionResponse: { name, response: { result: response } } };
      }));
      // Append model's call turn + our tool responses, then loop
      contents.push({ role: 'model', parts: fnCalls });
      contents.push({ role: 'user', parts: fnResponses });
      // re-call with updated contents
      body.contents = contents;
      continue;
    }

    // Plain text reply
    const text = parts.map(p => p.text || '').join('').trim();
    if (text) return text;
    return '🤔 לא בטוח איך לעזור עם זה. תוכל להרחיב?';
  }
  return '🤔 התקבלו יותר מדי קריאות לכלים. נסה שוב עם בקשה פשוטה יותר.';
}
