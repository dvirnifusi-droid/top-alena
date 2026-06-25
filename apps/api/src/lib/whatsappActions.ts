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
        '*shift_assign* — שיבוץ עובד למשמרת. "שבץ עדן למחר ערב כמלצר", "תוסיף את משה לסידור צהריים היום". (גרסה ראשונית — פרטים יושלמו)',
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
      maxOutputTokens: 400,
      timeoutMs: 8000,
    });
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

async function proposeShiftAssign(_p: ParsedIntent): Promise<string> {
  return '🚧 שיבוץ עובד מ-WhatsApp בקרוב (גרסה הבאה). בינתיים — דרך AvailabilityRequests באפליקציה.';
}

async function proposeRemindMe(p: ParsedIntent): Promise<{ summary: string; exec: any } | string> {
  if (!p.remind_at) return '❓ מתי? לדוגמה: "תזכיר לי מחר ב-14:00 לבדוק את האירוע".';
  if (!p.remind_text) return '❓ על מה? לדוגמה: "תזכיר לי ב-14:00 לבדוק את האירוע".';
  return {
    summary: [
      `⏰ *לקבוע תזכורת?*`,
      `🕒 ${p.remind_at}`,
      `📝 ${p.remind_text}`,
      '',
      '_⚠️ הגרסה הראשונית שומרת רק את הכוונה. שליחה אוטומטית בקומיט הבא._',
      '',
      'ענה *כן* לאישור או *לא* לביטול.',
    ].join('\n'),
    exec: { type: 'remind_me', remind_at: p.remind_at, remind_text: p.remind_text },
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
    case 'remind_me':
      return `✅ תזכורת נשמרה (שליחה בפועל תופעל בעדכון הבא).`;
    default:
      throw new Error(`unknown_exec_type: ${exec.type}`);
  }
}

// ─── Public surface — used by webhook ──────────────────────────────────────

// Try to classify the inbound text as a write-action intent. Returns:
//   • string — reply text to send back (proposal awaiting confirmation, OR
//     a question, OR an info/error message)
//   • null — message wasn't a write action, fall through to the read router
//
// On success path we ALSO store the exec payload on the same outbound row
// so tryConfirmPendingAction can find it on the next admin message.
export async function tryProposeAction(fromPhone: string, body: string): Promise<string | null> {
  const intent = await classifyIntent(body);
  if (!intent) return null;
  let proposal: { summary: string; exec: any } | string;
  switch (intent.intent) {
    case 'invoice_mark_paid':   proposal = await proposeInvoiceMarkPaid(intent); break;
    case 'invoice_mark_unpaid': proposal = await proposeInvoiceMarkUnpaid(intent); break;
    case 'lead_set_stage':      proposal = await proposeLeadSetStage(intent); break;
    case 'shift_assign':        proposal = await proposeShiftAssign(intent); break;
    case 'remind_me':           proposal = await proposeRemindMe(intent); break;
    default: return null;
  }
  if (typeof proposal === 'string') return proposal;
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
