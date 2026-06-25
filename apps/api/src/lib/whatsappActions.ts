// WhatsApp write-actions — LLM-based intent parser + confirmation flow.
//
// Architecture: admin texts a free-form Hebrew command, Gemini (small/fast model)
// classifies it into one of a fixed catalog of intents with extracted parameters.
// Each intent produces a HUMAN-CONFIRMABLE proposal (no DB write yet). Admin
// replies "כן" / "אישור" within 10 minutes → action runs. "לא" / "ביטול" → drop.
//
// Why LLM and not regex: Hebrew has too many word orders / synonyms.
// "סמן 503081 שולמה" / "החשבונית 503081 שולמה" / "תסמן ש-503081 שילמתי" all
// mean the same thing. The LLM normalizes — we verify the parsed params with
// hard checks before showing the confirmation, so a misparse can't sneak through.
import { prisma } from '../db.js';
import { invokeLLM } from './llm.js';

// ─── Intent catalog ────────────────────────────────────────────────────────
// To add a new write action: register it here AND add a handler in
// PROPOSAL_BUILDERS + EXECUTORS below. The intent name is the same key in
// all three maps.

type Intent =
  | 'invoice_mark_paid'
  | 'invoice_mark_unpaid'
  | 'lead_set_stage'
  | 'shift_assign'        // stub for next commit
  | 'remind_me'           // stub for next commit
  | 'noop';

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['invoice_mark_paid', 'invoice_mark_unpaid', 'lead_set_stage', 'shift_assign', 'remind_me', 'noop'],
      description: 'הפעולה הנדרשת. noop = לא פעולת כתיבה (השאר לראוטר אחר).',
    },
    invoice_number: { type: 'string', description: 'מספר חשבונית (לפעולות חשבונית)' },
    lead_search: { type: 'string', description: 'שם / מזהה ליד למציאה (לפעולות ליד)' },
    lead_stage: { type: 'string', enum: ['pending', 'contacted', 'quoted', 'won', 'lost'], description: 'שלב חדש לליד' },
    employee_search: { type: 'string', description: 'שם עובד (לפעולות סידור)' },
    shift_date: { type: 'string', description: 'תאריך משמרת YYYY-MM-DD או יחסי (היום/מחר)' },
    shift_type: { type: 'string', enum: ['lunch', 'dinner'], description: 'סוג משמרת' },
    position: { type: 'string', description: 'תפקיד (מלצר/ברמן/וכו)' },
    remind_at: { type: 'string', description: 'תאריך + שעה לתזכורת (ISO או יחסי)' },
    remind_text: { type: 'string', description: 'תוכן התזכורת' },
    confidence: { type: 'number', description: '0-1 — בטחון בפירוש' },
    rationale: { type: 'string', description: 'הסבר קצר על הזיהוי, לדיבוג' },
  },
  required: ['intent', 'confidence'],
};

type ParsedIntent = {
  intent: Intent;
  invoice_number?: string;
  lead_search?: string;
  lead_stage?: 'pending' | 'contacted' | 'quoted' | 'won' | 'lost';
  employee_search?: string;
  shift_date?: string;
  shift_type?: 'lunch' | 'dinner';
  position?: string;
  remind_at?: string;
  remind_text?: string;
  confidence: number;
  rationale?: string;
};

async function classifyIntent(body: string): Promise<ParsedIntent | null> {
  try {
    const out: any = await invokeLLM({
      prompt: [
        'אתה מסווג בקשות אדמין במסעדה בעברית.',
        'הבקשה תהיה הודעת WhatsApp קצרה. סווג אותה לאחת הפעולות הבאות וחלץ את הפרמטרים.',
        '',
        '*invoice_mark_paid* — סימון חשבונית כשולמה. דוגמאות: "סמן 503081 שולמה", "חשבונית 12345 שילמתי", "תסמן שש-503081 שולם".',
        '*invoice_mark_unpaid* — להחזיר חשבונית ללא-שולמה. "החשבונית 503081 לא שולמה", "תבטל ש-12345 שולם".',
        '*lead_set_stage* — שינוי שלב של ליד אירוע. שלבים: pending (לטלפון), contacted (דיברנו), quoted (הצעת מחיר), won (נסגר), lost (לא רלוונטי). דוגמאות: "ליד דביר התקשרתי", "אישור הליד של משה", "דביר נסגר", "הליד של רוזנפלד לא רלוונטי".',
        '*shift_assign* — שיבוץ עובד למשמרת. דוגמאות: "שבץ עדן למחר ערב כמלצר", "תוסיף את משה לסידור צהריים היום", "שבץ את עדן למשמרת ערב מחר כמנהלת משמרת". חלץ employee_search (שם), shift_date (תאריך/יחסי), shift_type (lunch או dinner; "צהריים"→lunch, "ערב"→dinner), position (תפקיד).',
        '*remind_me* — תזכורת אישית. "תזכיר לי ב-14:00 לבדוק את האירוע", "תזכורת מחר בבוקר — לחזור לדביר".',
        '*noop* — כל דבר אחר (שאלת קריאה, ברכה, "עזרה", הודעת רעש).',
        '',
        'אם זה פעולת קריאה כמו "סידור היום" / "לידים" / "טיפים" — חזור noop.',
        'אם זה אישור/ביטול ("כן", "אישור", "לא", "ביטול") — חזור noop (יש לזה ראוטר נפרד).',
        'אם זה פקודה מעורפלת — confidence נמוך (<0.7), הראוטר ישאל ברירור.',
        '',
        '--- הבקשה ---',
        body,
        '--- סוף ---',
      ].join('\n'),
      responseSchema: INTENT_SCHEMA,
      // 400 was getting truncated to '{\\n  ' — Gemini 2.5 thinking model
      // burns the budget on internal reasoning. 2000 gives clear headroom
      // for both the thinking and the actual JSON payload (~150 tokens).
      maxOutputTokens: 2000,
      timeoutMs: 15000,
    });
    console.log('[whatsapp-actions] classify raw:', JSON.stringify({
      body: body.slice(0, 80),
      out_type: typeof out,
      out_keys: out && typeof out === 'object' ? Object.keys(out) : null,
      out_value: out,
    }));
    if (!out || out.intent === 'noop') return null;
    if (typeof out.confidence !== 'number' || out.confidence < 0.6) return null;
    return out as ParsedIntent;
  } catch (e: any) {
    console.warn('[whatsapp-actions] classify failed:', e?.message);
    return null;
  }
}

// ─── Proposal builders (parse intent → human confirmation text + execution payload) ──

async function proposeInvoiceMarkPaid(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  const num = (p.invoice_number || '').trim();
  if (!num) return '❓ לא הבנתי איזו חשבונית. ציין את המספר (לדוגמה: "סמן 503081 שולמה").';
  const inv: any = await (prisma as any).invoice.findFirst({ where: { invoice_number: num } });
  if (!inv) return `❓ לא מצאתי חשבונית עם מספר *${num}* במערכת.`;
  if (inv.payment_status === 'paid') return `ℹ️ חשבונית ${num} כבר מסומנת כשולמה.`;
  const sup: any = await (prisma as any).supplier.findUnique({ where: { id: inv.supplier_id } }).catch(() => null);
  return {
    summary: [
      '💳 *לסמן חשבונית כשולמה?*',
      `🆔 חשבונית: ${num}`,
      `🏢 ${sup?.company_name || 'ספק לא ידוע'}`,
      `💰 ₪${Number(inv.total_amount || 0).toLocaleString('he-IL')}`,
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: { type: 'invoice_mark_paid', invoice_id: inv.id, invoice_number: num },
  };
}

async function proposeInvoiceMarkUnpaid(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  const num = (p.invoice_number || '').trim();
  if (!num) return '❓ ציין מספר חשבונית.';
  const inv: any = await (prisma as any).invoice.findFirst({ where: { invoice_number: num } });
  if (!inv) return `❓ לא מצאתי חשבונית עם מספר *${num}*.`;
  if (inv.payment_status !== 'paid') return `ℹ️ חשבונית ${num} כבר לא מסומנת כשולמה.`;
  const sup: any = await (prisma as any).supplier.findUnique({ where: { id: inv.supplier_id } }).catch(() => null);
  return {
    summary: [
      '↩️ *להחזיר חשבונית ללא-שולמה?*',
      `🆔 ${num} · 🏢 ${sup?.company_name || '—'} · 💰 ₪${Number(inv.total_amount || 0).toLocaleString('he-IL')}`,
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: { type: 'invoice_mark_unpaid', invoice_id: inv.id, invoice_number: num },
  };
}

async function proposeLeadSetStage(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  const search = (p.lead_search || '').trim();
  const stage = p.lead_stage;
  if (!search) return '❓ ציין את שם הליד.';
  if (!stage) return '❓ ציין שלב: pending / contacted / quoted / won / lost.';
  // Fuzzy search by name or phone
  const leads: any[] = await (prisma as any).eventLead.findMany({
    where: { status: { in: ['pending', 'contacted', 'quoted'] } },
    take: 100,
  });
  const lower = search.toLowerCase();
  const matches = leads.filter((l: any) =>
    String(l.contact_name || '').toLowerCase().includes(lower) ||
    String(l.contact_phone || '').includes(search.replace(/\D/g, '')),
  );
  if (!matches.length) return `❓ לא מצאתי ליד פתוח שמתאים ל-"${search}".`;
  if (matches.length > 1) {
    return `❓ נמצאו ${matches.length} לידים שמתאימים — תוסיף מספר טלפון כדי לזהות:\n${matches.slice(0, 5).map((l: any) => `• ${l.contact_name} · ${l.contact_phone}`).join('\n')}`;
  }
  const lead = matches[0];
  const stageHe = { pending: 'מחכה לטלפון', contacted: 'דיברנו', quoted: 'הצעת מחיר', won: 'נסגר ✅', lost: 'לא רלוונטי ❌' }[stage];
  return {
    summary: [
      `🎯 *לעדכן שלב של ליד?*`,
      `👤 ${lead.contact_name || '—'} · 📞 ${lead.contact_phone || '—'}`,
      `📅 ${lead.event_date || '?'} · 👥 ${lead.guest_count || '?'}`,
      `מצב נוכחי: ${lead.status}  →  *${stageHe}*`,
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: { type: 'lead_set_stage', lead_id: lead.id, stage, lead_name: lead.contact_name },
  };
}

async function proposeShiftAssign(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  const search = (p.employee_search || '').trim();
  if (!search) return '❓ ציין שם עובד.';
  if (!p.shift_type) return '❓ צהריים או ערב?';
  if (!p.shift_date) return '❓ באיזה תאריך? (לדוגמה: "מחר", "ראשון", "22.6")';
  // Resolve date: pass-through ISO/YMD, or interpret היום/מחר/מחרתיים
  const TZ = 'Asia/Jerusalem';
  const today = new Date();
  const todayY = today.toLocaleDateString('en-CA', { timeZone: TZ });
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowY = tomorrow.toLocaleDateString('en-CA', { timeZone: TZ });
  const dayAfter = new Date(today); dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const dayAfterY = dayAfter.toLocaleDateString('en-CA', { timeZone: TZ });
  // Accept Hebrew + English relative words (Gemini sometimes returns
  // 'tomorrow' even when prompt was in Hebrew). Trim + lowercase first.
  let dateStr = String(p.shift_date || '').trim().toLowerCase();
  if (/^(היום|today)$/i.test(dateStr)) dateStr = todayY;
  else if (/^(מחר|tomorrow)$/i.test(dateStr)) dateStr = tomorrowY;
  else if (/^(מחרתיים|day[\s-]?after[\s-]?tomorrow)$/i.test(dateStr)) dateStr = dayAfterY;
  else if (/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/.test(dateStr)) {
    const m = dateStr.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/)!;
    const dd = m[1]; const mm = m[2];
    let yy = m[3] ? parseInt(m[3]) : today.getFullYear();
    if (yy < 100) yy += 2000;
    dateStr = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `❓ לא הצלחתי לפענח את התאריך "${p.shift_date}". נסה YYYY-MM-DD או "מחר".`;

  // Find employee — fuzzy by full_name
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const lower = search.toLowerCase();
  const matches = emps.filter((e: any) => String(e.full_name || '').toLowerCase().includes(lower));
  if (!matches.length) return `❓ לא מצאתי עובד פעיל בשם "${search}".`;
  if (matches.length > 1) return `❓ נמצאו ${matches.length} עובדים: ${matches.slice(0, 5).map((e: any) => e.full_name).join(', ')}. תוסיף שם משפחה.`;
  const emp = matches[0];

  // Resolve position: explicit if given, else first scheduleable from emp.positions
  // (same logic as AvailabilityRequests handleSingleAssign — keeps the schedule
  // grid able to render the new assignment).
  const SCHEDULE_POSITIONS_LUNCH = ['קופה + אריזות', 'מלצר', 'חומוס', 'טבח', 'מתלמד פלור', 'בלתם'];
  const SCHEDULE_POSITIONS_DINNER = ['מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור', 'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם'];
  const NORMALIZE: Record<string, string> = {
    'מלצרית': 'מלצר', 'ברמנית': 'ברמן', 'ראנרית': 'ראנר', 'מארחת': 'מארח/ת', 'מארח': 'מארח/ת',
    'מנהלת משמרת': 'מנהל משמרת', 'טבחית': 'טבח', 'שוטפת כלים': 'שוטף כלים',
    'מתלמדת פלור': 'מתלמד פלור', 'מתלמדת מטבח': 'מתלמד מטבח',
    'קופה ואריזות': 'קופה + אריזות', 'קופה +אריזות': 'קופה + אריזות',
  };
  const canon = (s: string) => NORMALIZE[String(s || '').trim()] || String(s || '').trim();
  const order = p.shift_type === 'lunch' ? SCHEDULE_POSITIONS_LUNCH : SCHEDULE_POSITIONS_DINNER;
  let position = '';
  if (p.position) {
    const c = canon(p.position);
    if (order.includes(c)) position = c;
  }
  if (!position) {
    const empPositions = (emp.positions || []).map((x: any) => x?.position_name || x).filter(Boolean);
    for (const pp of empPositions) {
      const c = canon(pp);
      if (order.includes(c)) { position = c; break; }
    }
  }
  if (!position) position = 'מלצר';

  // Default times by shift type — same as the UI default
  const times = p.shift_type === 'lunch' ? { start: '12:00', end: '17:00' } : { start: '17:00', end: '23:00' };

  const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const dayName = dayNames[new Date(`${dateStr}T12:00:00Z`).getDay()];
  return {
    summary: [
      '📅 *לשבץ עובד למשמרת?*',
      `👤 ${emp.full_name}`,
      `🗓 ${dayName} ${dateStr}`,
      `🍽 ${p.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב'} (${times.start}-${times.end})`,
      `🏷 ${position}`,
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: {
      type: 'shift_assign',
      employee_id: emp.id,
      employee_name: emp.full_name,
      date: dateStr,
      shift_type: p.shift_type,
      position,
      start_time: times.start,
      end_time: times.end,
    },
  };
}

// Parse Hebrew/English relative time expression to an absolute ISO date.
// Accepts: ISO ('2026-06-25T14:00'), HH:MM (today/tomorrow if past),
// "מחר 14:00", "בעוד שעה", "בעוד 30 דקות", "ראשון 09:00".
function parseRemindAt(raw: string): Date | null {
  if (!raw) return null;
  const TZ = 'Asia/Jerusalem';
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const tomorrow = new Date(tzNow); tomorrow.setDate(tomorrow.getDate() + 1);
  const s = raw.trim();
  // ISO datetime
  const iso = s.match(/^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/);
  if (iso) { const d = new Date(iso[0].replace(' ', 'T') + ':00'); if (!isNaN(d.getTime())) return d; }
  // "בעוד N דקות/שעות"
  const inX = s.match(/בעוד\s*(\d+)\s*(דקות|דק'?|שעות|שעה)/);
  if (inX) {
    const n = parseInt(inX[1]);
    const ms = /שעה|שעות/.test(inX[2]) ? n * 3600_000 : n * 60_000;
    return new Date(Date.now() + ms);
  }
  // "מחר 14:00" / "היום 22:00" / day-name 09:30
  const hhmm = s.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const h = parseInt(hhmm[1]); const m = parseInt(hhmm[2]);
    let base = new Date(tzNow);
    if (/מחר|tomorrow/.test(s)) base = tomorrow;
    else if (/מחרתיים/.test(s)) { base = new Date(tomorrow); base.setDate(base.getDate() + 1); }
    // If just HH:MM and the time is in the past today, push to tomorrow.
    base.setHours(h, m, 0, 0);
    if (base.getTime() < Date.now() + 60_000 && !/מחר|tomorrow|מחרתיים/.test(s)) base.setDate(base.getDate() + 1);
    return base;
  }
  return null;
}

async function proposeRemindMe(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  if (!p.remind_at) return '❓ מתי? לדוגמה: "תזכיר לי מחר ב-14:00 לבדוק את האירוע".';
  if (!p.remind_text) return '❓ על מה? לדוגמה: "תזכיר לי ב-14:00 לבדוק את האירוע".';
  const when = parseRemindAt(p.remind_at);
  if (!when) return `❓ לא הצלחתי לפענח את הזמן "${p.remind_at}". נסה "מחר 14:00" או "בעוד שעה".`;
  if (when.getTime() <= Date.now()) return '❓ הזמן שנתת כבר עבר.';
  const whenIso = when.toISOString();
  const whenHe = when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
  return {
    summary: [
      `⏰ *לקבוע תזכורת?*`,
      `🕒 ${whenHe}`,
      `📝 ${p.remind_text}`,
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: { type: 'remind_me', deliver_at: whenIso, remind_text: p.remind_text },
  };
}

// ─── Executors (run after admin confirms) ───────────────────────────────────

async function executeAction(exec: any): Promise<string> {
  switch (exec.type) {
    case 'invoice_mark_paid':
      await (prisma as any).invoice.update({
        where: { id: exec.invoice_id },
        data: { payment_status: 'paid' },
      });
      return `✅ חשבונית *${exec.invoice_number}* סומנה כשולמה.`;
    case 'invoice_mark_unpaid':
      await (prisma as any).invoice.update({
        where: { id: exec.invoice_id },
        data: { payment_status: 'unpaid' },
      });
      return `✅ חשבונית *${exec.invoice_number}* הוחזרה ללא-שולמה.`;
    case 'lead_set_stage':
      await (prisma as any).eventLead.update({
        where: { id: exec.lead_id },
        data: { status: exec.stage, updated_date: new Date().toISOString() },
      });
      return `✅ הליד של *${exec.lead_name}* עודכן ל-${exec.stage}.`;
    case 'shift_assign': {
      // Mirror the AvailabilityRequests.handleSingleAssign flow: list recent
      // shifts client-side and filter by sliced YMD; create if missing.
      const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
      let shift = all.find((s: any) => {
        const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
        return d === exec.date && s.shift_type === exec.shift_type;
      });
      if (!shift) {
        shift = await (prisma as any).workShift.create({
          data: {
            date: new Date(`${exec.date}T00:00:00.000Z`),
            shift_type: exec.shift_type,
            start_time: exec.start_time,
            end_time: exec.end_time,
            assigned_staff: [],
          },
        });
      }
      const currentStaff = shift.assigned_staff || [];
      if (currentStaff.some((s: any) => s.employee_id === exec.employee_id)) {
        return `ℹ️ ${exec.employee_name} כבר משובץ למשמרת הזו.`;
      }
      const newStaff = [...currentStaff, {
        employee_id: exec.employee_id,
        employee_name: exec.employee_name,
        position: exec.position,
        start_time: exec.start_time,
        end_time: exec.end_time,
      }];
      await (prisma as any).workShift.update({ where: { id: shift.id }, data: { assigned_staff: newStaff } });
      return `✅ ${exec.employee_name} שובץ כ-${exec.position} ל-${exec.shift_type === 'lunch' ? 'צהריים' : 'ערב'} ${exec.date}.`;
    }
    case 'remind_me': {
      // Reminder lives as a WhatsAppMessage row (no schema migration).
      // status='scheduled_reminder', raw.deliver_at + raw.remind_text + raw.target_phone.
      // The /api/cron/dispatch-reminders endpoint scans and sends these.
      await (prisma as any).whatsAppMessage.create({
        data: {
          twilio_sid: null,
          direction: 'outbound',
          from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
          to_phone: exec.target_phone || 'self',
          contact_phone: exec.target_phone || 'self',
          body: `⏰ תזכורת: ${exec.remind_text}`,
          num_media: 0,
          status: 'scheduled_reminder',
          raw: {
            deliver_at: exec.deliver_at,
            remind_text: exec.remind_text,
            target_phone: exec.target_phone,
          } as any,
          is_read: false,
        },
      });
      const dt = new Date(exec.deliver_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
      return `✅ תזכורת נקבעה ל-${dt}: "${exec.remind_text}".`;
    }
    default:
      throw new Error(`unknown_exec_type: ${exec.type}`);
  }
}

// ─── Public surface — used by webhook ──────────────────────────────────────

// Merge any pending half-finished intent (stored as status='pending_clarification')
// with the current message. Lets multi-turn flows like:
//   user: "שבץ עדן ערב"     → bot: "באיזה תאריך?"
//   user: "מחר"             → bot: now has employee+shift+date
// We stash the partial intent on a WhatsAppMessage outbound row (same trick
// we use for invoice drafts), and on the next message the prior intent is
// merged with whatever new fields the LLM extracts.
async function loadPendingClarification(fromPhone: string): Promise<{ id: string; partial: ParsedIntent } | null> {
  const since = new Date(Date.now() - 3 * 60 * 1000); // 3-minute window — short, intent
  const row: any = await (prisma as any).whatsAppMessage.findFirst({
    where: {
      direction: 'outbound', contact_phone: fromPhone,
      status: 'pending_clarification', is_read: false,
      created_at: { gte: since },
    },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!row) return null;
  const partial = (row.raw as any)?.partial_intent;
  if (!partial) return null;
  return { id: row.id, partial };
}

async function stashPendingClarification(fromPhone: string, partial: ParsedIntent, askText: string): Promise<void> {
  await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null, direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: fromPhone, contact_phone: fromPhone,
      body: askText, num_media: 0,
      status: 'pending_clarification',
      raw: { partial_intent: partial } as any,
      is_read: false,
    },
  }).catch(() => {});
}

async function consumePendingClarification(id: string): Promise<void> {
  await (prisma as any).whatsAppMessage.update({
    where: { id }, data: { is_read: true, status: 'clarification_resolved' },
  }).catch(() => {});
}

// Try to classify the inbound text as a write-action intent. Returns:
//   • string — reply text to send back (proposal awaiting confirmation, OR
//     a question, OR an info/error message)
//   • null — message wasn't a write action, fall through to the read router
//
// On success path we ALSO store the exec payload on the same outbound row
// so tryConfirmPendingAction can find it on the next admin message.
export async function tryProposeAction(fromPhone: string, body: string): Promise<string | null> {
  // Check for a pending clarification first — if the user is answering a
  // follow-up question, merge the new field(s) into the saved partial intent.
  const pending = await loadPendingClarification(fromPhone);
  let intent: ParsedIntent | null;
  if (pending) {
    // Treat the answer as either a single field value (e.g. "מחר" answering
    // "באיזה תאריך?") or a fully-formed restatement. Try LLM first; if it
    // returns noop or low-confidence, use the message as a raw field value
    // based on what the previous turn was missing.
    const reclassified = await classifyIntent(body);
    if (reclassified && reclassified.intent === pending.partial.intent) {
      // Merge: new non-empty fields win over the partial.
      intent = { ...pending.partial };
      for (const k of Object.keys(reclassified) as Array<keyof ParsedIntent>) {
        const v = (reclassified as any)[k];
        if (v !== undefined && v !== null && v !== '') (intent as any)[k] = v;
      }
    } else {
      // The LLM didn't recognize it as the same intent — assume it's a single
      // field fill-in. Heuristically slot into the first missing required field.
      intent = { ...pending.partial };
      const trimmed = body.trim();
      if (intent.intent === 'shift_assign') {
        if (!intent.shift_date) (intent as any).shift_date = trimmed;
        else if (!intent.shift_type) {
          if (/צהר/i.test(trimmed)) (intent as any).shift_type = 'lunch';
          else if (/ערב|לילה/i.test(trimmed)) (intent as any).shift_type = 'dinner';
        }
        else if (!intent.employee_search) (intent as any).employee_search = trimmed;
        else if (!intent.position) (intent as any).position = trimmed;
      } else if (intent.intent === 'lead_set_stage') {
        if (!intent.lead_stage) {
          const STAGE_MAP: Record<string, ParsedIntent['lead_stage']> = {
            'pending': 'pending', 'מחכה': 'pending', 'לטלפון': 'pending',
            'contacted': 'contacted', 'דיברתי': 'contacted', 'התקשרתי': 'contacted',
            'quoted': 'quoted', 'הצעה': 'quoted', 'הצעת מחיר': 'quoted',
            'won': 'won', 'נסגר': 'won', 'אישור': 'won',
            'lost': 'lost', 'בוטל': 'lost', 'לא רלוונטי': 'lost',
          };
          for (const [k, v] of Object.entries(STAGE_MAP)) {
            if (trimmed.includes(k)) { (intent as any).lead_stage = v; break; }
          }
        }
        else if (!intent.lead_search) (intent as any).lead_search = trimmed;
      } else if (intent.intent === 'invoice_mark_paid' || intent.intent === 'invoice_mark_unpaid') {
        if (!intent.invoice_number && /\d/.test(trimmed)) (intent as any).invoice_number = trimmed.match(/\d+/)?.[0];
      } else if (intent.intent === 'remind_me') {
        if (!intent.remind_at) (intent as any).remind_at = trimmed;
        else if (!intent.remind_text) (intent as any).remind_text = trimmed;
      }
    }
    await consumePendingClarification(pending.id);
  } else {
    intent = await classifyIntent(body);
    if (!intent) return null;
  }
  let proposal: { summary: string; exec: any } | string;
  switch (intent.intent) {
    case 'invoice_mark_paid':   proposal = await proposeInvoiceMarkPaid(intent); break;
    case 'invoice_mark_unpaid': proposal = await proposeInvoiceMarkUnpaid(intent); break;
    case 'lead_set_stage':      proposal = await proposeLeadSetStage(intent); break;
    case 'shift_assign':        proposal = await proposeShiftAssign(intent); break;
    case 'remind_me':           proposal = await proposeRemindMe(intent); break;
    default: return null;
  }
  if (typeof proposal === 'string') {
    // If the proposal is a clarifying question (starts with ❓), stash the
    // partial intent so the next message can complete it.
    if (proposal.startsWith('❓') && intent) {
      await stashPendingClarification(fromPhone, intent, proposal);
    }
    return proposal;
  }
  // For remind_me, pin the target phone to the requesting admin so the
  // reminder gets delivered back to them rather than dropping into 'self'.
  if (proposal.exec?.type === 'remind_me' && !proposal.exec.target_phone) {
    proposal.exec.target_phone = fromPhone;
  }
  // Stash the exec payload so confirmation handler can run it.
  await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null,
      direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: fromPhone,
      contact_phone: fromPhone,
      body: proposal.summary,
      num_media: 0,
      status: 'pending_action_confirmation',
      raw: { pending_action: proposal.exec } as any,
      is_read: false,
    },
  }).catch(() => {});
  return proposal.summary;
}

// Mirror of the invoice-confirm handler but for arbitrary actions. Returns
// reply text if it handled the message, null otherwise.
export async function tryConfirmPendingAction(fromPhone: string, body: string): Promise<string | null> {
  const trimmed = (body || '').trim();
  const isApprove = /^(כן|אישור|אשר|מאשר|מאשרת|ok|yes)\s*[.!]?$/i.test(trimmed);
  const isCancel = /^(לא|ביטול|בטל|בטלי|no|cancel)\s*[.!]?$/i.test(trimmed);
  if (!isApprove && !isCancel) return null;

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const pending: any = await (prisma as any).whatsAppMessage.findFirst({
    where: {
      direction: 'outbound',
      contact_phone: fromPhone,
      status: 'pending_action_confirmation',
      is_read: false,
      created_at: { gte: since },
    },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!pending) return null;
  const exec = (pending.raw as any)?.pending_action;
  if (!exec) return null;
  await (prisma as any).whatsAppMessage.update({ where: { id: pending.id }, data: { is_read: true } }).catch(() => {});
  if (isCancel) return '✋ ביטלתי. לא ביצעתי שום פעולה.';
  try {
    return await executeAction(exec);
  } catch (e: any) {
    return `❌ ביצוע נכשל: ${e?.message || 'unknown'}`;
  }
}
