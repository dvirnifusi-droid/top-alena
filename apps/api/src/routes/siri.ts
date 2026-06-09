// Siri Shortcut endpoint — one-shot voice→text→action→voice.
// Authenticated via x-api-key matching env SIRI_API_KEY.
// Supports query intents (q_*) executed directly via Prisma; for mutations
// it returns a "open the app to do this" message so accidental destructive
// actions can't slip through from a stolen phone.
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { functionHandlers } from '../functions/index.js';

const VERSION = '1.0';

// Intents that the Siri endpoint will EXECUTE server-side. Everything else
// is summarized but not executed — for safety + because executing requires
// the frontend's broadcastDataChange / live state assumptions.
const SUPPORTED_QUERY_INTENTS = new Set([
  'q_today_summary',
  'q_status_summary',
  'q_next_in_queue',
  'q_next_reservation',
  'q_queue_count',
  'q_free_tables',
  'q_today_reservations',
  'q_tomorrow_reservations',
  'q_today_guests',
  'q_today_revenue',
  'q_on_shift_now',
  'q_on_shift_evening',
  'q_on_shift_lunch',
  'q_clocked_in_now',
  'q_low_stock',
  'q_tips_today',
  'q_tips_per_hour',
  'q_open_invoices',
  'q_events_week',
  'q_open_incidents',
  'q_weekly_revenue',
  'q_compare_revenue',
  'q_late_today',
  'q_on_leave',
  'q_birthdays_today',
  'q_today_sold',
  'q_top_seller',
  'q_pending_deliveries',
  'q_inventory_value',
]);

async function executeQuery(cmd: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  switch (cmd.intent) {
    case 'q_today_summary': {
      const [resv, sessions, queue, tips, shifts] = await Promise.all([
        prisma.reservation.findMany({ where: { date: today } }).catch(() => []),
        prisma.tableSession.findMany({ where: { status: 'active' } }).catch(() => []),
        prisma.queueEntry.findMany({ orderBy: { timestamp_register: 'desc' }, take: 50 }).catch(() => []),
        prisma.tipReport.findMany({ orderBy: { date: 'desc' }, take: 5 }).catch(() => []),
        prisma.workShift.findMany({ where: { date: new Date(today) } }).catch(() => []),
      ]);
      const valid = (resv as any[]).filter(r => !['cancelled', 'no_show'].includes(r.status || ''));
      const guests = valid.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
      const inQ = (queue as any[]).filter(q => q.status === 'pending' || q.status === 'active').length;
      const staff = (shifts as any[]).flatMap(s => (s.assigned_staff as any[]) || []).length;
      const todayTip = (tips as any[]).find(t => String(t.date).slice(0, 10) === today);
      const tipTxt = todayTip ? `, ${Math.round(Number(todayTip.total_tips_collected) || 0)} שקל טיפים` : '';
      return `${valid.length} הזמנות, ${guests} אורחים, ${sessions.length} שולחנות פעילים, ${inQ} בתור, ${staff} עובדים${tipTxt}`;
    }
    case 'q_status_summary': {
      const [resv, sessions, queue] = await Promise.all([
        prisma.reservation.findMany({ where: { date: today } }).catch(() => []),
        prisma.tableSession.findMany({ where: { status: 'active' } }).catch(() => []),
        prisma.queueEntry.findMany().catch(() => []),
      ]);
      const valid = (resv as any[]).filter(r => !['cancelled', 'no_show'].includes(r.status || ''));
      const seated = (resv as any[]).filter(r => r.status === 'seated').length;
      const inQ = (queue as any[]).filter(q => q.status === 'pending' || q.status === 'active').length;
      return `${seated} שולחנות פעילים, ${valid.length} הזמנות היום, ${inQ} בתור`;
    }
    case 'q_next_in_queue': {
      const queue = await prisma.queueEntry.findMany({
        where: { status: { in: ['pending', 'active'] } },
        orderBy: { timestamp_register: 'asc' },
      }).catch(() => []);
      if (queue.length === 0) return 'אין אף אחד בתור';
      const next: any = queue[0];
      return `${next.customer_name || 'לקוח'}, ${next.party_size} איש`;
    }
    case 'q_next_reservation': {
      const resv = await prisma.reservation.findMany({
        where: { date: today },
        orderBy: { time: 'asc' },
      }).catch(() => []);
      const upcoming = (resv as any[]).filter(r =>
        !['cancelled', 'no_show', 'seated', 'completed'].includes(r.status || 'pending') && r.time
      );
      if (upcoming.length === 0) return 'אין יותר הזמנות היום';
      const r = upcoming[0];
      return `${r.customer_name}, ${String(r.time).slice(0, 5)}, ${r.party_size} איש`;
    }
    case 'q_queue_count': {
      const queue = await prisma.queueEntry.findMany({
        where: { status: { in: ['pending', 'active'] } },
      }).catch(() => []);
      const guests = (queue as any[]).reduce((s, q) => s + (Number(q.party_size) || 0), 0);
      return `${queue.length} חבורות, ${guests} אנשים בתור`;
    }
    case 'q_free_tables': {
      const [sessions, layout] = await Promise.all([
        prisma.tableSession.findMany({ where: { status: 'active' } }).catch(() => []),
        prisma.seatingLayout.findMany({ take: 1 }).catch(() => []),
      ]);
      const tables = (layout?.[0] as any)?.tables || [];
      const occupied = new Set((sessions as any[]).flatMap(s =>
        String(s.table_number || '').split(/[,+]/).map(p => p.trim())
      ));
      const free = (tables as any[]).filter(t => !occupied.has(String(t.table_number))).length;
      return `${free} שולחנות פנויים`;
    }
    case 'q_today_reservations': {
      const resv = await prisma.reservation.findMany({ where: { date: today } }).catch(() => []);
      const valid = (resv as any[]).filter(r => !['cancelled', 'no_show'].includes(r.status || ''));
      return `${valid.length} הזמנות היום`;
    }
    case 'q_tomorrow_reservations': {
      const tom = new Date(); tom.setDate(tom.getDate() + 1);
      const tomStr = tom.toISOString().slice(0, 10);
      const resv = await prisma.reservation.findMany({ where: { date: tomStr } }).catch(() => []);
      const valid = (resv as any[]).filter(r => !['cancelled', 'no_show'].includes(r.status || ''));
      return `${valid.length} הזמנות מחר`;
    }
    case 'q_today_guests': {
      const resv = await prisma.reservation.findMany({ where: { date: today } }).catch(() => []);
      const valid = (resv as any[]).filter(r => !['cancelled', 'no_show'].includes(r.status || ''));
      const guests = valid.reduce((s, r) => s + (Number((r as any).party_size) || 0), 0);
      return `${guests} אורחים היום`;
    }
    case 'q_today_revenue': {
      const resv = await prisma.reservation.findMany({ where: { date: today } }).catch(() => []);
      const seated = (resv as any[]).filter(r => ['seated', 'completed'].includes(r.status));
      const guests = seated.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
      return `הכנסה משוערת מ-${guests} סועדים, ${guests * 220} שקלים`;
    }
    case 'q_tips_today':
    case 'q_tips_per_hour': {
      const reports = await prisma.tipReport.findMany({ orderBy: { date: 'desc' }, take: 5 }).catch(() => []);
      const rep: any = (reports as any[]).find(r => String(r.date).slice(0, 10) === today);
      if (!rep) return 'אין דוח טיפים היום';
      const total = Math.round(Number(rep.total_tips_collected) || 0);
      const totalHours = ((rep.staff_details as any[]) || []).reduce((s, x) => s + (Number(x.hours) || 0), 0);
      const tph = totalHours > 0 ? Math.round(total / totalHours) : (Number(rep.tip_per_hour) || 0);
      return `${total} שקל טיפים, ${tph} לשעה`;
    }
    case 'q_low_stock': {
      const items = await prisma.inventory.findMany().catch(() => []);
      const low = (items as any[]).filter(i =>
        i.min_threshold && Number(i.current_stock) <= Number(i.min_threshold)
      );
      if (low.length === 0) return 'מלאי תקין';
      return `${low.length} פריטים חסרים: ${low.slice(0, 5).map(i => i.item_name).join(', ')}`;
    }
    case 'q_inventory_value': {
      const items = await prisma.inventory.findMany().catch(() => []);
      const total = (items as any[]).reduce((s, i) =>
        s + (Number(i.current_stock || 0) * Number(i.cost_per_unit || 0)), 0);
      return `שווי מלאי ${Math.round(total)} שקל`;
    }
    case 'q_pending_deliveries': {
      const ds = await prisma.delivery.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []);
      const pending = (ds as any[]).filter(d => d.delivery_status === 'pending' || !d.courier_name);
      if (pending.length === 0) return 'אין משלוחים ממתינים';
      return `${pending.length} משלוחים ממתינים`;
    }
    case 'q_clocked_in_now': {
      const tracks = await prisma.shiftTracking.findMany({
        where: { status: 'active' }, take: 30,
      }).catch(() => []);
      if (tracks.length === 0) return 'אין עובדים פעילים';
      const names = (tracks as any[]).map(t => t.employee_name).join(', ');
      return `${tracks.length} עובדים פעילים: ${names}`;
    }
    case 'q_compare_revenue': {
      const today = new Date();
      const get = async (offsetDays: number) => {
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(today); d.setDate(d.getDate() - i - offsetDays);
          dates.push(d.toISOString().slice(0, 10));
        }
        const all = await Promise.all(dates.map(d =>
          prisma.reservation.findMany({ where: { date: d } }).catch(() => [])
        ));
        return (all.flat() as any[]).filter(r => ['seated', 'completed'].includes(r.status))
          .reduce((s, r) => s + (Number(r.party_size) || 0), 0) * 220;
      };
      const [thisRev, lastRev] = await Promise.all([get(0), get(7)]);
      const diff = thisRev - lastRev;
      const pct = lastRev > 0 ? Math.round((diff / lastRev) * 100) : 0;
      const word = diff >= 0 ? 'עלייה' : 'ירידה';
      return `השבוע ${thisRev} שקל, שעבר ${lastRev}. ${word} של ${Math.abs(pct)} אחוז`;
    }
    case 'q_on_shift_now':
    case 'q_on_shift_evening':
    case 'q_on_shift_lunch': {
      const shifts = await prisma.workShift.findMany({ where: { date: new Date(today) } }).catch(() => []);
      let filtered: any[] = shifts as any[];
      if (cmd.intent === 'q_on_shift_evening') filtered = filtered.filter(s => s.shift_type === 'dinner');
      if (cmd.intent === 'q_on_shift_lunch') filtered = filtered.filter(s => s.shift_type === 'lunch');
      if (cmd.intent === 'q_on_shift_now') {
        const ilHour = (new Date().getUTCHours() + 3) % 24;
        const t = ilHour < 16 ? 'lunch' : 'dinner';
        filtered = filtered.filter(s => s.shift_type === t);
      }
      const allStaff = filtered.flatMap(s => (s.assigned_staff as any[]) || []);
      if (allStaff.length === 0) return 'אין משובצים';
      const names = [...new Set(allStaff.map(a => a.employee_name).filter(Boolean))];
      return `${names.length} עובדים: ${names.slice(0, 8).join(', ')}`;
    }
    case 'q_open_invoices': {
      const inv = await prisma.invoice.findMany({ where: { payment_status: 'unpaid' } }).catch(() => []);
      const total = (inv as any[]).reduce((s, i) => s + Number(i.total_amount || 0), 0);
      return `${inv.length} חשבוניות פתוחות, סך ${Math.round(total)} שקל`;
    }
    case 'q_events_week': {
      const bookings = await prisma.eventBooking.findMany({
        orderBy: { event_date: 'asc' }, take: 30,
      }).catch(() => []);
      const today = new Date().toISOString().slice(0, 10);
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      const upcoming = (bookings as any[]).filter(b =>
        b.event_date >= today && b.event_date <= weekEndStr && b.status !== 'cancelled'
      );
      if (upcoming.length === 0) return 'אין אירועים השבוע';
      return `${upcoming.length} אירועים השבוע`;
    }
    case 'q_birthdays_today': {
      const resv = await prisma.reservation.findMany({ where: { date: today } }).catch(() => []);
      const todays = (resv as any[]).filter(r =>
        String(r.special_occasion || '').match(/יום הולדת|birthday/i) &&
        !['cancelled', 'no_show'].includes(r.status || 'pending')
      );
      if (todays.length === 0) return 'אין חוגגי יום הולדת היום';
      return `${todays.length} חוגגי יום הולדת: ${todays.map(r => r.customer_name).join(', ')}`;
    }
    case 'q_late_today': {
      const shifts = await prisma.workShift.findMany({ where: { date: new Date(today) } }).catch(() => []);
      const tracks = await prisma.shiftTracking.findMany({
        orderBy: { shift_start: 'desc' }, take: 80,
      }).catch(() => []);
      const todayMs = new Date(today).getTime();
      const late: string[] = [];
      for (const ws of (shifts as any[])) {
        for (const a of ((ws.assigned_staff as any[]) || [])) {
          const t: any = (tracks as any[]).find(tr =>
            tr.employee_id === a.employee_id &&
            new Date(tr.shift_start || 0).getTime() > todayMs
          );
          if (a.start_time && t?.shift_start) {
            const [h, m] = String(a.start_time).split(':').map(Number);
            const expected = todayMs + (h * 60 + (m || 0)) * 60000;
            const actual = new Date(t.shift_start).getTime();
            if (actual > expected + 10 * 60000) {
              late.push(`${a.employee_name} ${Math.round((actual - expected) / 60000)} דקות`);
            }
          }
        }
      }
      if (late.length === 0) return 'כולם בזמן היום';
      return `${late.length} מאחרים: ${late.slice(0, 5).join(', ')}`;
    }
    case 'q_on_leave': {
      const today = new Date().toISOString().slice(0, 10);
      const leaves = await prisma.leaveRequest.findMany({ where: { status: 'approved' } }).catch(() => []);
      const active = (leaves as any[]).filter(l => {
        const start = String(l.start_date || '').slice(0, 10);
        const end = String(l.end_date || '').slice(0, 10);
        return start <= today && today <= end;
      });
      if (active.length === 0) return 'אין עובדים בחופש היום';
      return `${active.length} בחופש: ${active.map(l => l.employee_name).join(', ')}`;
    }
    case 'q_open_incidents': {
      const inc = await prisma.incident.findMany({ where: { status: 'open' } }).catch(() => []);
      return inc.length === 0 ? 'אין תקריות פתוחות' : `${inc.length} תקריות פתוחות`;
    }
    case 'q_weekly_revenue': {
      const dates: string[] = [];
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      const all = await Promise.all(dates.map(d =>
        prisma.reservation.findMany({ where: { date: d } }).catch(() => [])
      ));
      const guests = (all.flat() as any[]).filter(r => ['seated', 'completed'].includes(r.status))
        .reduce((s, r) => s + Number(r.party_size || 0), 0);
      return `שבוע אחרון ${guests} סועדים, כ-${guests * 220} שקל`;
    }
    case 'q_top_seller': {
      const items = await prisma.menuItem.findMany({
        orderBy: { popularity_score: 'desc' }, take: 5,
      }).catch(() => []);
      const top = (items as any[]).filter(i => (i.popularity_score || 0) > 0);
      if (top.length === 0) return 'אין נתוני מכירות';
      return `מובילים: ${top.map(i => i.name).join(', ')}`;
    }
    case 'q_today_sold': {
      const orders = await prisma.beecommOrder.findMany({
        orderBy: { createdAt: 'desc' }, take: 100,
      }).catch(() => []);
      const today = new Date().toISOString().slice(0, 10);
      const todays = (orders as any[]).filter(o => String(o.createdAt).slice(0, 10) === today);
      if (todays.length === 0) return 'אין נתוני מכירה היום';
      const total = todays.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      return `${todays.length} הזמנות, ${Math.round(total)} שקל`;
    }
    default:
      return 'הפקודה הזו לא נתמכת מרחוק. פתח את האפליקציה.';
  }
}

export const siriRoutes: FastifyPluginAsync = async (app) => {
  // Health check (no auth) — Siri uses this to verify connectivity.
  app.get('/ping', async () => ({ ok: true, version: VERSION }));

  // Plain-text variant — same logic, returns ONLY the spoken response as
  // text/plain. Lets iOS Shortcuts just `Speak Contents of URL` directly,
  // skipping the Get-Dictionary-Value step entirely.
  app.post('/command-text', async (req, reply) => {
    const sentKey = (req.headers['x-api-key'] || req.headers['x-siri-key'] || '') as string;
    const expectedKey = process.env.SIRI_API_KEY || '';
    if (!expectedKey || sentKey !== expectedKey) {
      reply.type('text/plain; charset=utf-8');
      return reply.code(401).send('אין הרשאה');
    }
    const body = (req.body || {}) as any;
    const text = String(body.text || '').trim();
    if (!text) {
      reply.type('text/plain; charset=utf-8');
      return reply.code(400).send('לא קיבלתי טקסט');
    }
    try {
      const handler = functionHandlers['parseVoiceCommand'];
      if (!handler) {
        reply.type('text/plain; charset=utf-8');
        return reply.code(500).send('מערכת הפענוח לא זמינה');
      }
      const fakeUser = { id: 'siri-owner', email: 'siri@topalena.com', role: 'admin' };
      const parsed: any = await handler({ body: { text }, user: fakeUser as any, query: {} } as any);
      reply.type('text/plain; charset=utf-8');
      if (!parsed?.intent || parsed.intent === 'unknown') {
        return `לא הבנתי: ${text}`;
      }
      if (SUPPORTED_QUERY_INTENTS.has(parsed.intent)) {
        const spoken = await executeQuery(parsed);
        return spoken;
      }
      const intentTxt = String(parsed.intent).replace(/_/g, ' ');
      return `הבנתי ${intentTxt}. פתח את האפליקציה לבצע פעולות`;
    } catch (e: any) {
      reply.type('text/plain; charset=utf-8');
      return reply.code(500).send('שגיאה בעיבוד');
    }
  });

  app.post('/command', async (req, reply) => {
    // Auth via x-api-key header (matches env SIRI_API_KEY).
    const sentKey = (req.headers['x-api-key'] || req.headers['x-siri-key'] || '') as string;
    const expectedKey = process.env.SIRI_API_KEY || '';
    if (!expectedKey || sentKey !== expectedKey) {
      return reply.code(401).send({ ok: false, spoken: 'אין הרשאה לגשת למערכת' });
    }
    const body = (req.body || {}) as any;
    const text = String(body.text || '').trim();
    if (!text) return reply.code(400).send({ ok: false, spoken: 'לא קיבלתי טקסט' });

    // Parse via the same LLM the in-app voice uses. Reuse parseVoiceCommand
    // by calling its registered handler directly (no HTTP round-trip).
    try {
      const handler = functionHandlers['parseVoiceCommand'];
      if (!handler) return reply.code(500).send({ ok: false, spoken: 'מערכת הפענוח לא זמינה' });
      // parseVoiceCommand requires `user` — pass a synthetic owner user.
      const fakeUser = { id: 'siri-owner', email: 'siri@topalena.com', role: 'admin' };
      const parsed: any = await handler({ body: { text }, user: fakeUser as any, query: {} } as any);

      if (!parsed?.intent || parsed.intent === 'unknown') {
        return { ok: false, spoken: `לא הבנתי: ${text}. נסה לנסח אחרת.` };
      }

      // For QUERY intents we execute server-side via Prisma.
      if (SUPPORTED_QUERY_INTENTS.has(parsed.intent)) {
        const spoken = await executeQuery(parsed);
        return { ok: true, spoken, intent: parsed.intent };
      }

      // For mutations / non-supported — explain (don't execute via Siri to keep safe).
      const intentTxt = String(parsed.intent).replace(/_/g, ' ');
      return {
        ok: true,
        spoken: `הבנתי שאתה רוצה ${intentTxt}. פתח את האפליקציה כדי לבצע פעולות.`,
        intent: parsed.intent,
      };
    } catch (e: any) {
      app.log.warn({ err: e?.message }, 'siri command failed');
      return reply.code(500).send({ ok: false, spoken: 'שגיאה בעיבוד הפקודה' });
    }
  });
};
