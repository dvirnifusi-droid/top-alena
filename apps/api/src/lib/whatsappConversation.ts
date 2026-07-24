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

import { dbDate } from './bankPersist.js';
import { prisma } from '../db.js';
import {
  addScheduledEvent,
  addTask,
  completeTaskByMatch,
  listTodayEvents,
  listOpenTasks,
} from './whatsappCalendar.js';
import { matchEmployees } from './employeeMatch.js';
import { currentTenantSlug } from './whatsappRouter.js';

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
  const chrono = turns.reverse().slice(-HISTORY_WINDOW);
  // Gemini needs an alternating user/model sequence that STARTS with 'user'.
  // Agent replies aren't always persisted, so the raw history is frequently a
  // run of consecutive 'user' turns — which makes gemini-2.5 return an EMPTY
  // candidate (finishReason STOP), surfacing as "not sure how to help".
  // Collapse consecutive same-role turns (keep the latest of a run), drop any
  // leading 'model' turns, and drop a trailing 'user' turn — the caller appends
  // the current user message right after this history.
  const seq: Turn[] = [];
  for (const t of chrono) {
    if (String(t.text).startsWith('[pending]')) continue; // internal stash rows
    if (seq.length && seq[seq.length - 1].role === t.role) { seq[seq.length - 1] = t; continue; }
    seq.push(t);
  }
  while (seq.length && seq[0].role === 'model') seq.shift();
  if (seq.length && seq[seq.length - 1].role === 'user') seq.pop();
  return seq;
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
    description: 'Search for ANY private-event / lead by customer name, COMPANY name, phone, or detail — including CLOSED/confirmed events. Returns each match with status (pending/contacted/quoted/won/lost) and closed=true when status is won. USE THIS for any question about an event\'s status, e.g. "is נועם from טאגזו\'s event on 30.7 closed?", "what\'s the status of the Tagzo event?". Do NOT confuse private events with table reservations.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] },
  },
  {
    name: 'find_replacements',
    description: 'When an employee is sick / needs a shift swap: returns coworkers who SUBMITTED availability for that date but were NOT scheduled — the manager\'s call list. USE right after a sick report or when asked "מי זמין להחליף?" / "מי הגיש ולא שובץ?".',
    parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD or "היום"/"מחר"' } }, required: ['date'] },
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
  // ─── Recipe / food-cost tools (admin / manager) ────────────────────────────
  {
    name: 'get_recipe_cost',
    description: 'Lookup a dish or prep recipe by name. Returns cost, sale price, food-cost percentage. Use for questions like "כמה עולה X?", "מה הקוסט של מועבט?", "מה המחיר של פרנה?".',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] },
  },
  {
    name: 'list_high_food_cost',
    description: 'List dishes whose food-cost % is above a threshold. Use for "איזה מנות יקרות לי?", "פוד-קוסט גבוה?", "מה בעייתי בתפריט?".',
    parameters: { type: 'OBJECT', properties: { threshold: { type: 'NUMBER', description: 'Percent threshold, default 35.' } } },
  },
  {
    name: 'update_ingredient_price',
    description: 'Update the unit price of a raw ingredient (e.g. "תקין מחיר חמאה ל-25", "עדכן עגבניות ל-12"). Ripples to all recipes that use it. Admin only.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, new_price: { type: 'NUMBER' } }, required: ['name', 'new_price'] },
  },
  {
    name: 'get_my_recipe_summary',
    description: 'High-level summary of the menu: count of dishes, avg food-cost, count above 35%, dishes missing a sale price. Use when the owner asks generally about the menu state.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  // ─── Cash flow tools (admin / manager) ────────────────────────────────────
  {
    name: 'get_cash_balance',
    description: 'Project cash balance N days forward. Use for "מה היתרה?", "כמה כסף נכנס/יוצא השבוע?", "מה התזרים הצפוי?". Defaults to 14 days.',
    parameters: { type: 'OBJECT', properties: { days: { type: 'NUMBER' } } },
  },
  {
    name: 'list_unpaid_expenses',
    description: 'List unpaid expenses due in the next 30 days. Use for "מה אני חייב?", "אילו תשלומים פתוחים?", "כמה לספקים השבוע?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_expected_income',
    description: 'List expected incoming payments in the next 30 days. Use for "מי חייב לי?", "כמה כסף נכנס השבוע?", "מה התקבולים הצפויים?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  // ─── Employee-scoped tools (work for ANY role; staff see only their own data) ───
  {
    name: 'get_my_schedule',
    description: 'Get the CALLER\'S OWN upcoming work shifts. Use when a staff member asks "מתי המשמרת שלי?" / "מה הלוז שלי?" / "כשמסומן לעבוד?". Returns N days forward (default 7).',
    parameters: { type: 'OBJECT', properties: { days: { type: 'NUMBER', description: 'How many days forward to look (1-14). Defaults to 7.' } } },
  },
  {
    name: 'get_my_tips',
    description: 'Get the CALLER\'S OWN recent tip earnings. Use when asked "כמה טיפים?" / "מה הטיפ שלי?" / "כמה הרווחתי השבוע?". Returns last N days (default 7).',
    parameters: { type: 'OBJECT', properties: { days: { type: 'NUMBER', description: 'Window in days (1-60). Defaults to 7.' } } },
  },
  {
    name: 'get_my_hours',
    description: 'Get the CALLER\'S month-to-date completed shift hours. Use when asked "כמה שעות עבדתי?" / "כמה שעות החודש?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'propose_mark_sick',
    description: 'CALLER reports themselves sick — creates a sick-day request and notifies the manager. Use when employee says "אני חולה", "לא מרגיש טוב, לא אגיע", "חולה היום/מחר". Do NOT use for someone else.',
    parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'Date in YYYY-MM-DD, or the literals "today" / "tomorrow" / "היום" / "מחר".' } } },
  },
  {
    name: 'submit_availability',
    description: 'The CALLER submits their OWN work availability for the upcoming schedule (הגשת סידור/זמינות). Use when a staff member says "אני רוצה להגיש סידור", "להגיש זמינות", "אני פנוי ראשון שלישי חמישי", "לא יכול שבת", etc. FIRST make sure you know, per day, whether they are available and (optionally) the shift preference + time window — ask follow-up questions in Hebrew if the message is vague ("לאיזה שבוע?", "אילו ימים ומתי?"). Then call this with one entry per day. Do NOT submit for anyone else.',
    parameters: {
      type: 'OBJECT',
      properties: {
        entries: {
          type: 'ARRAY',
          description: 'One entry per day the caller is talking about.',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING', description: 'Date as YYYY-MM-DD or DD.MM / DD/MM (current year assumed).' },
              available: { type: 'BOOLEAN', description: 'true = available to work that day (default), false = NOT available.' },
              shift_preference: { type: 'STRING', description: 'One of: morning / noon / evening / both. Default both.' },
              from: { type: 'STRING', description: 'Earliest start HH:MM (optional).' },
              until: { type: 'STRING', description: 'Latest end HH:MM (optional).' },
              note: { type: 'STRING', description: 'Optional free note (e.g. "עד 20:00 בגלל לימודים").' },
            },
            required: ['date'],
          },
        },
      },
      required: ['entries'],
    },
  },
  // ─── Employee / HR (manager) ───────────────────────────────────────
  {
    name: 'add_employee_note',
    description: 'Log a note about an employee — positive OR negative. Use for "רשום שיוסי איחר", "תעד שליאור קיבל מחמאה מלקוח", "הערה על דנה: ניהלה משמרת מצוין". Resolve the employee by name; classify sentiment (positive/negative/neutral) from the text.',
    parameters: { type: 'OBJECT', properties: {
      employee_name: { type: 'STRING', description: 'The employee the note is about (name or part of it).' },
      text: { type: 'STRING', description: 'The note text.' },
      sentiment: { type: 'STRING', description: 'positive / negative / neutral — infer from the text.' },
    }, required: ['employee_name', 'text'] },
  },
  {
    name: 'add_employee_task',
    description: 'Add a follow-up task tied to an employee. Use for "תזכורת: שיחת משוב עם יוסי בעוד שבועיים", "לבדוק העלאת שכר לליאור בעוד חודש", "להשלים חתימה על הסכם עם דנה".',
    parameters: { type: 'OBJECT', properties: {
      employee_name: { type: 'STRING' },
      title: { type: 'STRING', description: 'The task.' },
      due_date: { type: 'STRING', description: 'Optional YYYY-MM-DD or DD.MM.' },
    }, required: ['employee_name', 'title'] },
  },
  {
    name: 'list_hr_gaps',
    description: 'Which employees need HR attention — missing signed agreement / 101 / bank details, overdue follow-ups, probation ending. Use for "מי חסר לו טפסים?", "מי צריך לחתום על הסכם?", "מי צריך טיפול?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'employee_summary',
    description: 'A 360° snapshot of ONE employee — status, which required forms are signed, recent notes, open tasks. Use for "ספר לי על יוסי", "מה המצב עם ליאור?", "כרטיס של דנה".',
    parameters: { type: 'OBJECT', properties: { employee_name: { type: 'STRING' } }, required: ['employee_name'] },
  },
  {
    name: 'log_employee_meeting',
    description: 'Record a full meeting on an employee card. Use for "תעד פגישת משוב עם יוסי: ...", "רשום שיחת אזהרה לדנה על איחורים", "שיחת שימוע ל...". meeting_type ∈ interview/onboarding/feedback/raise/role_change/warning/disciplinary/motivation/hearing/termination/general.',
    parameters: { type: 'OBJECT', properties: { employee_name: { type: 'STRING' }, meeting_type: { type: 'STRING' }, summary: { type: 'STRING', description: 'What was said / decided.' } }, required: ['employee_name', 'summary'] },
  },
  {
    name: 'set_onboarding_step',
    description: 'Mark an onboarding step done for a new hire. Use for "יוסי חתם על ההסכם", "קיבלנו את ה-101 של דנה", "ליאור עבר הדרכת בטיחות". step_key ∈ interview_done/terms_agreed/agreement_sent/agreement_signed/form_101_done/id_photo/bank_details/safety_training/pro_training/first_shift.',
    parameters: { type: 'OBJECT', properties: { employee_name: { type: 'STRING' }, step_key: { type: 'STRING' }, done: { type: 'BOOLEAN', description: 'true (default) = done, false = un-mark.' } }, required: ['employee_name', 'step_key'] },
  },
  {
    name: 'daily_status',
    description: 'A morning status briefing — today revenue, open incidents, order needs, HR gaps, today\'s schedule, all at once. Use for "מה המצב היום?", "תן לי סיכום בוקר", "מה קורה?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'issue_club_benefit',
    description: 'Issue a club benefit / coupon to a customer (resolved by phone or name). Use for "תן לדנה כהן קפה חינם", "הטבה של 20% ללקוח 0501234567". benefit = the reward text.',
    parameters: { type: 'OBJECT', properties: { customer: { type: 'STRING', description: 'Customer name or phone.' }, benefit: { type: 'STRING', description: 'The benefit text, e.g. "קפה חינם".' } }, required: ['customer', 'benefit'] },
  },
  {
    name: 'my_branch_tasks',
    description: 'THIS branch\'s tasks from network HQ (for a branch in a chain). Use for "מה המשימות מהמטה?", "מה הרשת ביקשה?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'mark_branch_task',
    description: 'Mark one of this branch\'s network-HQ tasks as done, matched by (part of) its title. Use for "סיימתי את המשימה של המטה על ...".',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] },
  },
  {
    name: 'propose_customer_campaign',
    description: 'Send a MASS marketing message to a CUSTOMER segment (owner only). Use for "שלח קמפיין ללקוחות שלא הגיעו חודשיים", "תשלח הודעה לכל הלקוחות ש...", "קמפיין יומולדת". segment ∈ all_consented / winback_30 / winback_60 / winback_90 / vip / almost_vip / birthday_this_month / birthday_today. ALWAYS requires the owner to confirm with "כן" before anything is sent — this tool only PROPOSES.',
    parameters: { type: 'OBJECT', properties: {
      segment: { type: 'STRING', description: 'Target audience segment (see list). Default all_consented.' },
      message: { type: 'STRING', description: 'The message text to send the customers.' },
    }, required: ['message'] },
  },
  // ─── Menu editing (manager) ─────────────────────────────────────────
  {
    name: 'add_menu_item',
    description: 'Add a NEW dish to the menu. Use for "תוסיף לתפריט המבורגר טלה ב-68", "מנה חדשה: סלט קיסר 42 בקטגוריה סלטים".',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, price: { type: 'NUMBER' }, category: { type: 'STRING', description: 'e.g. מנות ראשונות/עיקריות/קינוחים/שתייה. Default כללי.' }, description: { type: 'STRING' } }, required: ['name', 'price'] },
  },
  {
    name: 'set_menu_item_availability',
    description: 'Take a dish OFF the menu (86 / out of stock) or bring it back. Use for "תוריד את הפסטה מהתפריט", "נגמר הסלמון", "החזר את הפוקאצ\'ה". available=false to hide, true to restore.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, available: { type: 'BOOLEAN' } }, required: ['name', 'available'] },
  },
  {
    name: 'update_menu_item',
    description: 'Change a dish\'s price / name / category. Use for "תשנה מחיר הפיצה ל-55", "תשנה את השם של הבורגר ל-בורגר הבית", "תעביר את הטירמיסו לקטגוריה קינוחים".',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING', description: 'Current dish name.' }, new_price: { type: 'NUMBER' }, new_name: { type: 'STRING' }, new_category: { type: 'STRING' } }, required: ['name'] },
  },
  {
    name: 'remove_menu_item',
    description: 'Permanently DELETE a dish from the menu. Use for "תמחק את X מהתפריט לגמרי". (For a temporary out-of-stock use set_menu_item_availability instead.)',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] },
  },
  {
    name: 'list_menu',
    description: 'List menu dishes (optionally by category), with prices + which are currently unavailable. Use for "מה יש בתפריט?", "תראה לי את הקינוחים", "מה ירד מהתפריט?".',
    parameters: { type: 'OBJECT', properties: { category: { type: 'STRING' } } },
  },
  // ─── Deliveries (manager) ───────────────────────────────────────────
  {
    name: 'list_deliveries',
    description: 'Today\'s / open deliveries — customer, address, courier, status. Use for "מה המשלוחים היום?", "אילו משלוחים פתוחים?", "מי עדיין לא קיבל?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'update_delivery',
    description: 'Update ONE open delivery (matched by customer name/phone/address) — set status and/or courier. Use for "המשלוח של דנה יצא", "סמן שהמשלוח לרחוב הרצל 5 נמסר", "תן את המשלוח של 0501234567 לרון". status ∈ picked_up (יצא/נאסף) / delivered (נמסר) / cancelled (בוטל).',
    parameters: { type: 'OBJECT', properties: { customer: { type: 'STRING', description: 'Customer name, phone, or address.' }, status: { type: 'STRING' }, courier: { type: 'STRING' } }, required: ['customer'] },
  },
  // ─── Scheduling (admin) ────────────────────────────────────────────
  {
    name: 'build_schedule_now',
    description: 'Build the next-week work schedule right now (bypasses the Tue 16:00 cron gate). Use whenever the manager says anything like "בנה סידור", "תבנה לי סידור", "צור סידור לשבוע הבא", "אני רוצה לראות את הסידור לשבוע הבא", "תרוץ על הסידור עכשיו". Pulls submitted EmployeeAvailability + active SchedulingRules, calls the LLM builder, writes WorkShift rows, returns a summary.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'add_scheduling_rule',
    description: 'Add a constraint that the weekly schedule builder must respect. Use when the manager says things like "אבי לא עובד ראשון" (Avi does not work Sundays), "שרה ולירן לא באותה משמרת" (Sarah + Liran cannot share a shift), "יוסי מקסימום 4 משמרות בשבוע" (Yossi max 4 shifts/week), "מיכל רק ערב" (Michal evenings only). Extract the fields (employee_name, day_of_week 0-6, shift_type, other_employee_name, max_per_week) when obvious; ALWAYS pass a natural-Hebrew description of the rule.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: { type: 'STRING', description: 'One of: no_day (עובד לא עובד ביום מסוים) / no_pair (שני עובדים לא ביחד) / max_shifts (מקסימום משמרות) / shift_only (רק סוג משמרת) / note (חוק חופשי).' },
        employee_name: { type: 'STRING' },
        day_of_week: { type: 'NUMBER', description: 'Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6' },
        shift_type: { type: 'STRING', description: '"lunch" or "dinner" if the rule is specific to a shift' },
        other_employee_name: { type: 'STRING' },
        max_per_week: { type: 'NUMBER' },
        description: { type: 'STRING', description: 'Human-readable Hebrew description shown back to the manager and injected into the LLM prompt when building schedules.' },
      },
      required: ['kind', 'description'],
    },
  },
  {
    name: 'list_scheduling_rules',
    description: 'List all active scheduling rules the manager set. Use when the manager asks "מה החוקים?", "אילו כללים הגדרתי?", "תראה את החוקים לסידור".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  // ─── Reservations (manager-level) ──────────────────────────────────────────
  {
    name: 'check_availability',
    description: 'בדיקת זמינות לשולחן/הזמנה במסעדה. השתמש כשהמשתמש שואל "יש מקום ל-6 בשבת ב-20:00?", "יש מקום מחר בערב?", "כמה מקום פנוי ב-21:00?", "אפשר לשבת שמונה אנשים ביום שישי?". קריאה בלבד — מחזיר כמה מקומות תפוסים/פנויים במשבצת ה-15 דקות המבוקשת. אל תשתמש להזמנה בפועל.',
    parameters: {
      type: 'OBJECT',
      properties: {
        party_size: { type: 'NUMBER', description: 'מספר הסועדים' },
        date: { type: 'STRING', description: 'YYYY-MM-DD או ביטוי עברי: היום/מחר/מחרתיים/שבת/ראשון' },
        time: { type: 'STRING', description: 'שעה בפורמט HH:MM (שעון ישראל). אם חסר — המערכת תבקש שעה.' },
      },
      required: ['party_size', 'date'],
    },
  },
  {
    name: 'propose_create_reservation',
    description: 'הצעת יצירת הזמנת שולחן חדשה על שם לקוח. השתמש כשהמשתמש אומר "תזמין שולחן לכהן ל-4 בשבת 20:00", "תרשום הזמנה למשפחת לוי 6 אנשים מחר ב-21:00", "תכניס הזמנה ל...". המערכת תבקש אישור "כן" מהמשתמש לפני שמירה — אתה לא צריך לבקש אישור בעצמך.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customer_name: { type: 'STRING', description: 'שם הלקוח שההזמנה על שמו' },
        party_size: { type: 'NUMBER', description: 'מספר הסועדים' },
        date: { type: 'STRING', description: 'YYYY-MM-DD או ביטוי עברי: היום/מחר/שבת/ראשון' },
        time: { type: 'STRING', description: 'שעה בפורמט HH:MM (שעון ישראל)' },
        customer_phone: { type: 'STRING', description: 'טלפון הלקוח (אופציונלי)' },
        special_requests: { type: 'STRING', description: 'בקשות מיוחדות (אופציונלי)' },
      },
      required: ['customer_name', 'party_size', 'date', 'time'],
    },
  },
  {
    name: 'propose_cancel_reservation',
    description: 'הצעת ביטול הזמנת שולחן קיימת. השתמש כשהמשתמש אומר "תבטל את ההזמנה של כהן", "בטל את השולחן ל-8 של מחר", "תבטל את ההזמנה מחר בערב". חפש לפי שם לקוח ו/או תאריך. אם יש כמה התאמות — המערכת תחזיר רשימה ותצטרך לשאול איזו. המערכת תבקש אישור "כן" לפני הביטול.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customer_name: { type: 'STRING', description: 'שם הלקוח (חלקי מספיק)' },
        date: { type: 'STRING', description: 'תאריך ההזמנה YYYY-MM-DD או ביטוי עברי (אופציונלי, מצמצם התאמות)' },
      },
    },
  },
  // ─── Revenue / ordering / tips (manager-level) ─────────────────────────────
  {
    name: 'get_today_revenue',
    description: 'הכנסות ומצב המכירות של היום עכשיו (Beecomm בית-עסק + Gomiley משלוחים). טריגרים: "כמה מכרנו היום?", "מה המצב עכשיו?", "כמה כסף נכנס היום?", "כמה מזומן בקופה?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_order_needs',
    description: 'מה עוד לא הוזמן — פריטים שסומנו "צריך להזמין" ברשימות ההזמנה + ספקים שצריך להזמין מהם (לפי מלאי מול יעד) שעדיין לא הוזמנו. טריגרים: "מה צריך להזמין?", "מה חסר מהירקן?", "ממי לא הזמנתי עדיין?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'propose_mark_supplier_ordered',
    description: 'סימון שהזמנת מספק מסוים (נועל את התזכורות ליומיים). דורש אישור. טריגרים: "סמן שהזמנתי מהירקן", "הזמנתי מ<ספק>", "כבר הזמנתי מהבשר".',
    parameters: { type: 'OBJECT', properties: { supplier: { type: 'STRING', description: 'שם הספק, למשל "ירקן" / "בשר" / "אלכוהול"' } }, required: ['supplier'] },
  },
  {
    name: 'propose_lock_tips',
    description: 'נעילת דו"ח הטיפים ליום מסוים (ברירת מחדל: אתמול) כדי לסגור אותו. דורש אישור. טריגרים: "נעל את הטיפים של אתמול", "תסגור טיפים של אתמול", "נעל טיפים של <תאריך>".',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'אופציונלי: "אתמול" / "היום" / שם-יום / YYYY-MM-DD. ריק = אתמול.' },
        shift_type: { type: 'STRING', enum: ['lunch', 'dinner'], description: 'אופציונלי: נעל רק משמרת אחת. השמט = כל המשמרות של היום.' },
      },
    },
  },
  // ─── Incidents / expenses / dish pricing (manager-level) ───────────────────
  {
    name: 'propose_open_incident',
    description: 'פתיחת תקלה / אירוע חריג. Use for "תפתח תקלה: המקרר התקלקל", "יש תקלה במטבח", "דווח תקלה". חלץ description מהטקסט; אם ברור, קבע severity ו-category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        description: { type: 'STRING', description: 'תיאור התקלה כפי שנכתב.' },
        title: { type: 'STRING', description: 'כותרת קצרה (אופציונלי — ברירת מחדל: תחילת התיאור).' },
        severity: { type: 'STRING', enum: ['low', 'medium', 'high', 'critical'], description: 'ברירת מחדל medium.' },
        category: { type: 'STRING', enum: ['maintenance', 'kitchen', 'bar', 'customer_service', 'safety', 'security', 'cleanliness', 'staff', 'pos_system'], description: 'ברירת מחדל maintenance (ציוד/מקרר/תקלה טכנית).' },
      },
      required: ['description'],
    },
  },
  {
    name: 'list_incidents',
    description: 'רשימת התקלות הפתוחות (שטרם טופלו). Use for "מה פתוח?", "אילו תקלות יש?", "מה התקלות הפתוחות?".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'propose_resolve_incident',
    description: 'סימון תקלה פתוחה כטופלה. Use for "סגור את התקלה של המקרר", "התקלה במטבח טופלה", "תסמן את X כפתור". התאמה לפי תיאור/כותרת התקלה.',
    parameters: { type: 'OBJECT', properties: { match: { type: 'STRING', description: 'מילות זיהוי לתקלה (למשל "מקרר", "קופה").' } }, required: ['match'] },
  },
  {
    name: 'propose_mark_expense_paid',
    description: 'סימון הוצאה בתזרים כשולמה. Use for "סמן את ההוצאה לספק X ששולמה", "שילמתי ל-Y", "תסמן את התשלום ל-Z כבוצע". התאמה לפי שם ספק/תיאור.',
    parameters: { type: 'OBJECT', properties: { match: { type: 'STRING', description: 'שם ספק או תיאור ההוצאה.' } }, required: ['match'] },
  },
  {
    name: 'propose_set_dish_price',
    description: 'עדכון מחיר מכירה של מנה. Use for "עדכן מחיר פרנה ל-42", "תקבע את המחיר של חומוס ל-38", "המחיר של X עכשיו 55".',
    parameters: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING', description: 'שם המנה.' }, sale_price: { type: 'NUMBER', description: 'מחיר מכירה חדש בשקלים.' } },
      required: ['name', 'sale_price'],
    },
  },
  // ─── Team / schedule / events (manager + owner) ────────────────────────────
  {
    name: 'propose_team_broadcast',
    description: 'הצע לשלוח הודעה אישית בוואטסאפ לקבוצת עובדים (כל אחד מקבל 1:1). טריגרים: "תגיד לכל העובדים ש...", "תודיע למלצרים של הערב...", "שלח לכל המטבח...". audience: all=כל העובדים הפעילים, department=מחלקה/תפקיד מסוים, tonight=המשובצים להיום. דורש הרשאת בעלים.',
    parameters: {
      type: 'OBJECT',
      properties: {
        message: { type: 'STRING', description: 'תוכן ההודעה שתישלח לעובדים (בלי הפתיח — הוא נוסף אוטומטית)' },
        audience: { type: 'STRING', description: "'all' | 'department' | 'tonight'" },
        department: { type: 'STRING', description: 'שם מחלקה/תפקיד כשה-audience הוא department (למשל: מלצרים, מטבח, בר)' },
      },
      required: ['message', 'audience'],
    },
  },
  {
    name: 'propose_invite_employee',
    description: 'הצע להזמין עובד חדש לצוות. טריגרים: "תזמין עובד חדש", "הוסף עובד דני 052...", "צרף עובד לצוות". שולח לעובד קישור וואטסאפ להשלמת פרטים (תפקיד + מייל). דורש הרשאת בעלים.',
    parameters: {
      type: 'OBJECT',
      properties: {
        full_name: { type: 'STRING', description: 'שם מלא של העובד החדש' },
        phone: { type: 'STRING', description: 'מספר הטלפון של העובד (עם קידומת)' },
      },
      required: ['full_name', 'phone'],
    },
  },
  {
    name: 'propose_remove_from_shift',
    description: 'הצע להסיר/להוריד עובד ממשמרת מסוימת. טריגרים: "תוריד את דני מהמשמרת של מחר ערב", "הסר את מיכל מצהריים ביום שלישי", "בטל שיבוץ".',
    parameters: {
      type: 'OBJECT',
      properties: {
        employee_name: { type: 'STRING' },
        date: { type: 'STRING', description: 'YYYY-MM-DD או "מחר" / "רביעי"' },
        shift_type: { type: 'STRING', enum: ['lunch', 'dinner'], description: 'צהריים=lunch, ערב=dinner' },
      },
      required: ['employee_name', 'date', 'shift_type'],
    },
  },
  {
    name: 'propose_publish_schedule',
    description: 'הצע לפרסם את הסידור לשבוע הבא — כל עובד יקבל בוואטסאפ את המשמרות שלו. טריגרים: "פרסם את הסידור", "תשלח לכולם את הסידור", "הודע לצוות על המשמרות".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'propose_approve_event',
    description: 'הצע לאשר הזמנת אירוע ממתינה. טריגרים: "אשר את הזמנת האירוע של כהן", "תאשר את האירוע של משפחת לוי". דורש הרשאת בעלים.',
    parameters: {
      type: 'OBJECT',
      properties: { customer_name: { type: 'STRING', description: 'שם הלקוח של האירוע' } },
      required: ['customer_name'],
    },
  },
];

// ─── Tool implementations ──────────────────────────────────────────────────

// ═══ Owner-agent action pack (10 capabilities) — all gated on scope.can_write ═══
// Reservations · revenue · ordering · tips · incidents · expenses · pricing ·
// employee invites · shift removal · schedule publish · event approval.
// Every write stashes a pending_action and applies through executeAction() on "כן".

// ─── Reservations (manager-level) — mirror load.ts seating/slot logic ───────
const RES_toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const RES_seatingDuration = (size: number) => (size >= 11 ? 150 : size >= 6 ? 135 : 120);
const RES_isValidTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || '').trim());

async function tool_check_availability(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const size = parseInt(String(args.party_size), 10);
  if (!Number.isFinite(size) || size < 1) return { error: 'צריך מספר סועדים תקין.' };
  const dateStr = resolveDate(String(args.date || ''));
  if (!dateStr) return { error: `לא הצלחתי לפענח את התאריך "${args.date}".` };
  const time = String(args.time || '').trim();
  if (!time) return { need_time: true, message: 'לאיזו שעה לבדוק זמינות? (למשל 20:00)' };
  if (!RES_isValidTime(time)) return { error: `שעה לא תקינה "${args.time}" — פורמט HH:MM.` };

  const settings: any = await (prisma as any).reservationSettings.findFirst().catch(() => null);
  const slotCapacity = Number.isFinite(Number(settings?.slot_capacity)) && Number(settings?.slot_capacity) > 0
    ? Number(settings.slot_capacity) : 36;
  const maxParty = Number.isFinite(Number(settings?.max_party_size)) && Number(settings?.max_party_size) > 0
    ? Number(settings.max_party_size) : 12;
  if (size > maxParty) {
    return { available: false, reason: 'too_large_use_events', max_party: maxParty,
      message: `${size} סועדים חורג מהמקסימום להזמנה רגילה (${maxParty}). זה אירוע — הפנה לצוות האירועים.` };
  }

  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayNext = new Date(dayStart); dayNext.setUTCDate(dayNext.getUTCDate() + 1);
  const reservations: any[] = await (prisma as any).reservation.findMany({
    where: { date: { gte: dayStart, lt: dayNext } },
  });
  const active = (r: any) => r.status !== 'cancelled' && r.status !== 'no_show';
  const startMin = RES_toMin(time);
  const slotCount = reservations
    .filter((r: any) => active(r) && r.time && RES_toMin(r.time) >= startMin && RES_toMin(r.time) < startMin + 15)
    .reduce((sum: number, r: any) => sum + (r.party_size || 0), 0);
  const availableCapacity = Math.max(0, slotCapacity - slotCount);
  const canAccommodate = slotCount + size <= slotCapacity;

  return {
    available: canAccommodate,
    date: dateStr,
    time,
    party_size: size,
    slot_capacity: slotCapacity,
    current_capacity: slotCount,
    available_capacity: availableCapacity,
    message: canAccommodate
      ? `יש מקום ל-${size} ב-${dateStr} בשעה ${time} (פנויים ${availableCapacity} מקומות במשבצת).`
      : `אין מספיק מקום ל-${size} ב-${dateStr} בשעה ${time} — נותרו ${availableCapacity} מקומות בלבד במשבצת.`,
  };
}

async function tool_propose_create_reservation(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const customer_name = String(args.customer_name || '').trim();
  if (!customer_name) return { error: 'צריך שם ללקוח.' };
  const size = parseInt(String(args.party_size), 10);
  if (!Number.isFinite(size) || size < 1) return { error: 'צריך מספר סועדים תקין.' };
  const dateStr = resolveDate(String(args.date || ''));
  if (!dateStr) return { error: `לא הצלחתי לפענח את התאריך "${args.date}".` };
  const time = String(args.time || '').trim();
  if (!RES_isValidTime(time)) return { error: `שעה לא תקינה "${args.time}" — פורמט HH:MM.` };
  const customer_phone = args.customer_phone ? String(args.customer_phone).trim() : null;
  const special_requests = args.special_requests ? String(args.special_requests).trim() : null;

  const settings: any = await (prisma as any).reservationSettings.findFirst().catch(() => null);
  const slotCapacity = Number.isFinite(Number(settings?.slot_capacity)) && Number(settings?.slot_capacity) > 0
    ? Number(settings.slot_capacity) : 36;
  const maxParty = Number.isFinite(Number(settings?.max_party_size)) && Number(settings?.max_party_size) > 0
    ? Number(settings.max_party_size) : 12;
  if (size > maxParty) {
    return { error: `${size} סועדים חורג מהמקסימום להזמנה רגילה (${maxParty}) — זה אירוע, הפנה לצוות האירועים.` };
  }

  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayNext = new Date(dayStart); dayNext.setUTCDate(dayNext.getUTCDate() + 1);
  const reservations: any[] = await (prisma as any).reservation.findMany({
    where: { date: { gte: dayStart, lt: dayNext } },
  });
  const active = (r: any) => r.status !== 'cancelled' && r.status !== 'no_show';
  const startMin = RES_toMin(time);
  const slotCount = reservations
    .filter((r: any) => active(r) && r.time && RES_toMin(r.time) >= startMin && RES_toMin(r.time) < startMin + 15)
    .reduce((sum: number, r: any) => sum + (r.party_size || 0), 0);
  const full = slotCount + size > slotCapacity;

  const endMin = RES_toMin(time) + RES_seatingDuration(size);
  const reservation_end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

  await stashPendingAction(phone, {
    type: 'create_reservation',
    customer_name,
    customer_phone,
    date: dateStr,
    time,
    party_size: size,
    reservation_end_time,
    special_requests,
    source: 'whatsapp',
    target_phone: phone,
  });

  const warn = full ? `\n⚠️ המשבצת מלאה (${slotCount}/${slotCapacity}) — יישמר כ-override.` : '';
  return {
    proposal: `📅 הזמנה: ${customer_name} · ${size} סועדים · ${dateStr} ${time}${customer_phone ? ` · ${customer_phone}` : ''}${warn}`,
    awaiting_confirmation: true,
  };
}

async function tool_propose_cancel_reservation(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const nameQ = String(args.customer_name || '').trim().toLowerCase();
  const dateStr = args.date ? resolveDate(String(args.date)) : null;
  if (!nameQ && !dateStr) return { error: 'ציין שם לקוח ו/או תאריך של ההזמנה לביטול.' };

  const todayStart = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: TZ })}T00:00:00.000Z`);
  const where: any = { status: { notIn: ['cancelled', 'no_show'] } };
  if (dateStr) {
    const ds = new Date(`${dateStr}T00:00:00.000Z`);
    const dn = new Date(ds); dn.setUTCDate(dn.getUTCDate() + 1);
    where.date = { gte: ds, lt: dn };
  } else {
    where.date = { gte: todayStart };
  }
  let candidates: any[] = await (prisma as any).reservation.findMany({ where, take: 100 });
  if (nameQ) candidates = candidates.filter((r: any) => String(r.customer_name || '').toLowerCase().includes(nameQ));
  candidates.sort((a: any, b: any) => {
    const da = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10);
    const db = b.date instanceof Date ? b.date.toISOString().slice(0, 10) : String(b.date).slice(0, 10);
    return da.localeCompare(db) || String(a.time).localeCompare(String(b.time));
  });

  if (!candidates.length) return { not_found: true, message: 'לא נמצאה הזמנה פעילה שתואמת לחיפוש.' };
  if (candidates.length > 1) {
    return {
      ambiguous: true,
      message: 'נמצאו כמה הזמנות — על איזו מדובר?',
      candidates: candidates.slice(0, 8).map((r: any) => ({
        customer_name: r.customer_name,
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        time: r.time,
        party_size: r.party_size,
      })),
    };
  }

  const r = candidates[0];
  const dStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  await stashPendingAction(phone, {
    type: 'cancel_reservation',
    reservation_id: r.id,
    customer_name: r.customer_name,
    date: dStr,
    time: r.time,
    party_size: r.party_size,
    target_phone: phone,
  });
  return {
    proposal: `❌ ביטול הזמנה: ${r.customer_name} · ${r.party_size} סועדים · ${dStr} ${r.time}`,
    awaiting_confirmation: true,
  };
}

// ─── Revenue / ordering / tips (manager-level) ─────────────────────────────
async function tool_get_today_revenue(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const [bc, gm]: any[] = await Promise.all([
    (prisma as any).beecommSnapshot.findFirst({ orderBy: { captured_at: 'desc' } }).catch(() => null),
    (prisma as any).gomileySnapshot.findFirst({ orderBy: { captured_at: 'desc' } }).catch(() => null),
  ]);
  const beecomm_total = Number(bc?.total_today) || 0;
  const beecomm_open_money = Number(bc?.open_money) || 0;
  const gomiley_total = Number(gm?.total_income) || 0;
  const gomiley_cash = Number(gm?.cash_orders_amount) || 0;
  const gomiley_cash_count = Number(gm?.cash_orders_count) || 0;
  const gomiley_orders = Number(gm?.total_orders) || 0;

  return {
    combined_total: Math.round(beecomm_total + gomiley_total),
    beecomm: { total: Math.round(beecomm_total), open_money: Math.round(beecomm_open_money) },
    gomiley: { total: Math.round(gomiley_total), orders: gomiley_orders, cash_count: gomiley_cash_count, cash_amount: Math.round(gomiley_cash) },
    cash_today_approx: Math.round(beecomm_open_money + gomiley_cash),
    last_beecomm_update: bc?.captured_at || null,
    last_gomiley_update: gm?.captured_at || null,
    note: (!bc && !gm) ? 'עדיין אין נתוני מכירות היום (Beecomm/Gomiley לא סונכרנו).' : undefined,
  };
}

async function tool_list_order_needs(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const prepRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT pi."name" AS name, pi."category" AS category, pi."unit" AS unit,
            pi."target" AS target, pi."have" AS have, pl."name" AS list_name
     FROM "PrepItem" pi JOIN "PrepList" pl ON pi."list_id" = pl."id"
     WHERE pl."list_type" = 'order' AND pi."to_prep" = true AND pi."done" = false
     ORDER BY pl."sort" ASC, pi."sort" ASC`,
  ).catch(() => []);

  const suppliers: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT "id","name","category","items","last_ordered_at"
     FROM "SupplierOrderList" ORDER BY "sort" ASC, "name" ASC`,
  ).catch(() => []);
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const suppliers_to_order = suppliers.map((s: any) => {
    const items: any[] = Array.isArray(s.items) ? s.items : [];
    const toOrder = items.filter((it) => {
      const par = Number(it.par); const cur = Number(it.current);
      return Number.isFinite(par) && Number.isFinite(cur) ? par - cur > 0 : true;
    });
    const recentlyOrdered = !!(s.last_ordered_at && (Date.now() - new Date(s.last_ordered_at).getTime() < TWO_DAYS));
    return {
      supplier: s.name, category: s.category || null,
      recently_ordered: recentlyOrdered,
      to_order_count: toOrder.length,
      to_order: toOrder.slice(0, 30).map((it) => {
        const gap = Number(it.par) - Number(it.current);
        return { product: it.product, qty: gap > 0 ? gap : null, unit: it.unit || null };
      }),
    };
  }).filter((s: any) => !s.recently_ordered && s.to_order_count > 0);

  return {
    prep_order_items: prepRows.map((r: any) => ({
      name: r.name, list: r.list_name, category: r.category || null,
      unit: r.unit || null, target: r.target || null, have: r.have || null,
    })),
    suppliers_to_order,
    empty: prepRows.length === 0 && suppliers_to_order.length === 0,
  };
}

async function tool_propose_mark_supplier_ordered(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const name = String(args?.supplier || '').trim();
  if (!name) return { error: 'איזה ספק סימנת שהזמנת ממנו?' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT "id","name","last_ordered_at" FROM "SupplierOrderList"
     WHERE "name" ILIKE $1 OR "name" ILIKE $2 ORDER BY "sort" ASC LIMIT 6`,
    `%${name}%`, `${name}%`,
  ).catch(() => []);
  if (!rows.length) return { found: false, message: `לא מצאתי ספק בשם "${name}". נסה שם אחר או פתח את רשימת הספקים.` };
  if (rows.length > 1) {
    return { ambiguous: true, message: 'יש כמה ספקים תואמים — לאיזה התכוונת?', options: rows.map((r: any) => r.name) };
  }
  const sup = rows[0];
  await stashPendingAction(phone, { type: 'mark_supplier_ordered', supplier_id: sup.id, supplier_name: sup.name, target_phone: phone });
  return { proposal: `🛒 סימון "${sup.name}" כהוזמן (לא אשלח תזכורת ליומיים)`, awaiting_confirmation: true };
}

async function tool_propose_lock_tips(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };

  const raw = String(args?.date || '').trim().toLowerCase();
  let date = resolveDate(raw);
  if (!date && (/^(אתמול|yesterday)$/.test(raw) || raw === '')) {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    t.setDate(t.getDate() - 1);
    date = t.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  if (!date) return { error: 'לא הבנתי את התאריך. נסה "אתמול" או תאריך בפורמט YYYY-MM-DD.' };
  const shift = args?.shift_type === 'lunch' ? 'lunch' : args?.shift_type === 'dinner' ? 'dinner' : null;

  const day0 = new Date(`${date}T00:00:00.000Z`);
  const day1 = new Date(`${date}T23:59:59.999Z`);
  const reports: any[] = await (prisma as any).tipReport.findMany({
    where: { date: { gte: day0, lte: day1 }, ...(shift ? { shift_type: shift } : {}) },
    take: 10,
  }).catch(() => []);
  const shiftHe = shift ? ` (${shift === 'lunch' ? 'צהריים' : 'ערב'})` : '';
  if (!reports.length) return { found: false, message: `לא נמצא דו"ח טיפים ל-${date}${shiftHe}.` };
  const already = reports.filter((r: any) => r.status === 'locked').length;
  const toLock = reports.length - already;
  if (toLock === 0) return { message: `כל דו"חות הטיפים של ${date}${shiftHe} כבר נעולים 🔒` };
  const total = reports.reduce((s: number, r: any) => s + Number(r.total_tips_collected || 0), 0);

  await stashPendingAction(phone, {
    type: 'lock_tips', date, shift_type: shift,
    locked_by: scope.employee_name || 'whatsapp', target_phone: phone,
  });
  return { proposal: `🔒 נעילת טיפים ל-${date}${shiftHe} — ${toLock} דו"ח, סה"כ ₪${Math.round(total)}`, awaiting_confirmation: true };
}

// ─── Incidents / expenses / dish pricing (manager-level) ───────────────────
async function tool_propose_open_incident(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const description = String(args.description || '').trim();
  if (!description) return { error: 'צריך תיאור לתקלה.' };
  const title = String(args.title || description).trim().slice(0, 80);
  const severity = ['low', 'medium', 'high', 'critical'].includes(String(args.severity)) ? String(args.severity) : 'medium';
  const validCats = ['maintenance', 'kitchen', 'bar', 'customer_service', 'safety', 'security', 'cleanliness', 'staff', 'pos_system'];
  const category = validCats.includes(String(args.category)) ? String(args.category) : 'maintenance';
  await stashPendingAction(phone, {
    type: 'open_incident',
    title, description, severity, category,
    reported_by: scope.employee_name || 'מנהל (WhatsApp)',
    target_phone: phone,
  });
  return { proposal: `🔧 פתיחת תקלה: ${title} · חומרה ${severity}`, awaiting_confirmation: true };
}

async function tool_list_incidents(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const rows: any[] = await (prisma as any).incident.findMany({
    where: { OR: [{ status: { in: ['open', 'in_progress', 'reported', 'pending', 'new'] } }, { status: null }] },
    orderBy: { incident_date: 'desc' },
    take: 30,
  });
  return {
    count: rows.length,
    incidents: rows.map((i: any) => ({
      id_short: i.id.slice(-6),
      title: i.title || (i.description ? i.description.slice(0, 40) : '—'),
      severity: i.severity || '—',
      category: i.category || '—',
      status: i.status || 'open',
      date: i.incident_date instanceof Date ? i.incident_date.toISOString().slice(0, 10) : String(i.incident_date || '').slice(0, 10),
    })),
  };
}

async function tool_propose_resolve_incident(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const q = String(args.match || '').trim();
  if (!q) return { error: 'איזו תקלה לסגור? תן תיאור קצר.' };
  const open: any[] = await (prisma as any).incident.findMany({
    where: { OR: [{ status: { in: ['open', 'in_progress', 'reported', 'pending', 'new'] } }, { status: null }] },
    orderBy: { incident_date: 'desc' }, take: 100,
  });
  const ql = q.toLowerCase();
  const idq = ql.replace(/[^a-z0-9]/gi, '');
  const matches = open.filter((i: any) =>
    String(i.title || '').toLowerCase().includes(ql) ||
    String(i.description || '').toLowerCase().includes(ql) ||
    (idq.length >= 4 && i.id.slice(-6).toLowerCase() === idq));
  if (!matches.length) return { error: `לא מצאתי תקלה פתוחה שמתאימה ל-"${q}".` };
  if (matches.length > 1) return {
    ambiguous: true,
    candidates: matches.slice(0, 6).map((i: any) => `${i.title || (i.description || '').slice(0, 40)} (${i.id.slice(-6)})`),
  };
  const inc = matches[0];
  const label = inc.title || (inc.description || '').slice(0, 40);
  await stashPendingAction(phone, { type: 'resolve_incident', incident_id: inc.id, incident_title: label, target_phone: phone });
  return { proposal: `✅ סגירת תקלה: ${label}`, awaiting_confirmation: true };
}

async function tool_propose_mark_expense_paid(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const q = String(args.match || '').trim();
  if (!q) return { error: 'איזו הוצאה לסמן כשולמה? תן שם ספק או תיאור.' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, date::date AS date, source, description, category, amount
     FROM "CashFlowEntry"
     WHERE type = 'expense' AND status = 'planned'
       AND (source ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
     ORDER BY date ASC LIMIT 6`,
    `%${q}%`,
  );
  if (!rows.length) return { error: `לא מצאתי הוצאה פתוחה שמתאימה ל-"${q}".` };
  if (rows.length > 1) return {
    ambiguous: true,
    candidates: rows.map((r: any) => `${r.source || r.description || r.category} — ₪${Math.round(Number(r.amount))} (${r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date})`),
  };
  const e = rows[0];
  const label = e.source || e.description || e.category;
  const amount = Math.round(Number(e.amount));
  await stashPendingAction(phone, { type: 'mark_expense_paid', entry_id: e.id, expense_label: label, amount, target_phone: phone });
  return { proposal: `💸 סימון הוצאה כשולמה: ${label} · ₪${amount}`, awaiting_confirmation: true };
}

async function tool_propose_set_dish_price(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const name = String(args.name || '').trim();
  const price = Number(args.sale_price);
  if (!name) return { error: 'איזו מנה לעדכן?' };
  if (!Number.isFinite(price) || price <= 0) return { error: 'צריך מחיר חיובי בשקלים.' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, kind, sale_price FROM "Recipe"
     WHERE (name ILIKE $1 OR name ILIKE $2) AND kind = 'DISH' LIMIT 5`,
    `%${name}%`, `${name}%`,
  );
  if (!rows.length) return { error: `לא מצאתי מנה בשם "${name}".` };
  if (rows.length > 1) return {
    ambiguous: true,
    candidates: rows.map((r: any) => `${r.name}${r.sale_price ? ` (נוכחי ₪${r.sale_price})` : ''}`),
  };
  const rec = rows[0];
  await stashPendingAction(phone, {
    type: 'set_dish_price', recipe_id: rec.id, recipe_name: rec.name,
    sale_price: price, old_price: rec.sale_price ?? null, target_phone: phone,
  });
  return { proposal: `🍽️ עדכון מחיר: ${rec.name} → ₪${price}${rec.sale_price ? ` (מ-₪${rec.sale_price})` : ''}`, awaiting_confirmation: true };
}

// ─── Team / schedule / events ──────────────────────────────────────────────
async function tool_propose_team_broadcast(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.is_owner) return { error: 'רק הבעלים יכול לשלוח הודעה לכל הצוות.' };
  const message = String(args.message || '').trim();
  if (message.length < 3) return { error: 'צריך תוכן הודעה.' };
  const audience = ['all', 'department', 'tonight', 'today'].includes(String(args.audience)) ? String(args.audience) : 'all';
  const department = args.department ? String(args.department) : undefined;
  const { resolveBroadcastRecipients } = await import('./teamNudges.js');
  const recipients = await resolveBroadcastRecipients(audience, department);
  if (!recipients.length) return { error: `לא נמצאו עובדים עם טלפון לקהל המבוקש (${audience === 'tonight' ? 'משובצי היום' : department || 'כולם'}).` };
  await stashPendingAction(phone, { type: 'team_broadcast', message, audience, department: department || '', target_phone: phone });
  const sample = recipients.slice(0, 6).map((r: any) => r.full_name).join(', ');
  const audLabel = audience === 'tonight' || audience === 'today' ? 'המשובצים להיום' : audience === 'department' ? `מחלקת ${department}` : 'כל העובדים הפעילים';
  return {
    proposal: `📢 שליחת הודעה אישית ל-*${recipients.length} עובדים* (${audLabel}):\n"${message}"\n\nנמענים: ${sample}${recipients.length > 6 ? ` ועוד ${recipients.length - 6}` : ''}`,
    awaiting_confirmation: true,
  };
}

async function tool_propose_invite_employee(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  if (!scope.is_owner) return { error: 'רק הבעלים יכול לבצע פעולה זו.' };
  const fullName = String(args.full_name || '').trim();
  const empPhone = String(args.phone || '').replace(/[^\d+]/g, '');
  if (fullName.length < 2) return { error: 'צריך שם מלא של העובד.' };
  if (empPhone.replace(/\D/g, '').length < 9) return { error: 'מספר טלפון לא תקין. שלח מספר עם קידומת.' };
  const existing = await (prisma as any).employee.findFirst({ where: { phone: empPhone } }).catch(() => null);
  if (existing) return { error: `כבר קיים עובד עם הטלפון ${empPhone} (${existing.full_name}).` };
  await stashPendingAction(phone, { type: 'invite_employee', full_name: fullName, phone: empPhone, target_phone: phone });
  return { proposal: `👤 הזמנת עובד חדש: *${fullName}* → ${empPhone}\nיישלח לו קישור להשלמת פרטים (תפקיד + מייל).`, awaiting_confirmation: true };
}

async function tool_propose_remove_from_shift(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const m = matchEmployees(String(args.employee_name || ''), emps);
  if (!m.exact.length) {
    if (m.suggestions.length) return {
      not_found: true,
      message: `לא מצאתי עובד פעיל בשם "${args.employee_name}". התכוונת לאחד מאלה?`,
      suggestions: m.suggestions.map((e: any) => e.full_name),
    };
    return { error: `לא נמצא עובד פעיל בשם "${args.employee_name}".` };
  }
  if (m.exact.length > 1) return { ambiguous: true, candidates: m.exact.map((e: any) => e.full_name) };
  const emp = m.exact[0];
  const dateStr = resolveDate(args.date);
  if (!dateStr) return { error: `לא הצלחתי לפענח את התאריך "${args.date}".` };
  const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
  const shift = all.find((s: any) => {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return d === dateStr && s.shift_type === args.shift_type;
  });
  if (!shift || !(shift.assigned_staff || []).some((a: any) => a.employee_id === emp.id)) {
    return { error: `${emp.full_name} לא משובץ ל${args.shift_type === 'lunch' ? 'צהריים' : 'ערב'} ${dateStr}.` };
  }
  await stashPendingAction(phone, {
    type: 'remove_from_shift',
    employee_id: emp.id, employee_name: emp.full_name,
    date: dateStr, shift_type: args.shift_type,
    target_phone: phone,
  });
  return { proposal: `🗑 הסרת *${emp.full_name}* מ${args.shift_type === 'lunch' ? 'צהריים' : 'ערב'} ${dateStr}`, awaiting_confirmation: true };
}

async function tool_propose_publish_schedule(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const ilDay = dayMap[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date())] ?? 0;
  const daysUntilNextSunday = ilDay === 0 ? 7 : 7 - ilDay;
  const weekSet = new Set<string>();
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setUTCDate(d.getUTCDate() + daysUntilNextSunday + i); weekSet.add(d.toISOString().slice(0, 10)); }
  const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 2000 });
  const empIds = new Set<string>();
  for (const s of all) {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    if (!weekSet.has(d)) continue;
    for (const a of (s.assigned_staff || [])) if (a?.employee_id) empIds.add(a.employee_id);
  }
  if (!empIds.size) return { error: 'אין משמרות משובצות לשבוע הבא — בנה את הסידור קודם.' };
  await stashPendingAction(phone, { type: 'publish_schedule', target_phone: phone });
  return { proposal: `📢 פרסום הסידור לשבוע הבא — כל עובד יקבל בוואטסאפ את המשמרות שלו.\nייכללו *${empIds.size}* עובדים.`, awaiting_confirmation: true };
}

async function tool_propose_approve_event(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  if (!scope.is_owner) return { error: 'רק הבעלים יכול לבצע פעולה זו.' };
  const q = String(args.customer_name || '').trim();
  if (!q) return { error: 'למי לאשר את האירוע? שלח שם לקוח.' };
  const bookings: any[] = await (prisma as any).eventBooking.findMany({ take: 500 });
  const pending = bookings.filter((b: any) => b.approval_status !== 'approved' && b.approval_status !== 'rejected');
  if (!pending.length) return { error: 'אין הזמנות אירוע ממתינות לאישור.' };
  const asEmp = pending.map((b: any) => ({ ...b, full_name: b.customer_name || '' }));
  let hit = matchEmployees(q, asEmp).exact;
  if (!hit.length) hit = matchEmployees(q, asEmp).suggestions;
  if (!hit.length) return { error: `לא מצאתי הזמנת אירוע ממתינה בשם "${q}".` };
  if (hit.length > 1) return {
    ambiguous: true,
    message: 'יש כמה הזמנות ממתינות תואמות — איזו?',
    candidates: hit.map((b: any) => `${b.customer_name} · ${b.event_date}${b.guest_count ? ` · ${b.guest_count} סועדים` : ''}`),
  };
  const b: any = hit[0];
  await stashPendingAction(phone, { type: 'approve_event', booking_id: b.id, customer_name: b.customer_name, target_phone: phone });
  return {
    proposal: `🎉 אישור אירוע: *${b.customer_name || 'לקוח'}* · ${b.event_date}${b.event_time ? ` ${b.event_time}` : ''}${b.guest_count ? ` · ${b.guest_count} סועדים` : ''}${b.total_ils ? ` · ₪${b.total_ils}` : ''}`,
    awaiting_confirmation: true,
  };
}

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
    invoice_number: i.invoice_number, supplier: sups[i.supplier_id] || '?', amount: i.total_amount, date: dbDate(i.invoice_date),
  })) };
}

async function tool_search_employee(args: any, _phone: string): Promise<any> {
  const nameArg = String(args?.name || '').trim();
  if (!nameArg) return { matches: [] };
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 });
  const mm = matchEmployees(nameArg, emps);
  const picked = mm.exact.length ? mm.exact : mm.suggestions;
  // cross_script_guess=true means these are transliteration guesses (e.g. a
  // Latin paste of a Hebrew name) — the agent should ask the user to confirm.
  return {
    cross_script_guess: !mm.exact.length && mm.suggestions.length > 0,
    matches: picked.slice(0, 8).map((e: any) => ({
      id: e.id, name: e.full_name, phone: e.phone,
      positions: (e.positions || []).map((p: any) => p?.position_name || p).filter(Boolean),
    })),
  };
}

async function tool_search_lead(args: any, _phone: string): Promise<any> {
  const q = String(args?.query || '').toLowerCase().trim();
  if (!q) return { matches: [] };
  const qDigits = q.replace(/\D/g, '');
  const leads: any[] = await (prisma as any).eventLead.findMany({ orderBy: { id: 'desc' }, take: 300 });
  // Search ALL string fields (customer name, COMPANY / business name, notes, type…)
  // so "נועם מחברת טאגזו" matches whether the company sits in contact/business/notes.
  const hay = (l: any) => Object.values(l).filter((v) => typeof v === 'string').join(' ').toLowerCase();
  const matches = leads.filter((l: any) => hay(l).includes(q) || (qDigits.length >= 4 && String(l.contact_phone || '').replace(/\D/g, '').includes(qDigits)));
  return { matches: matches.slice(0, 8).map((l: any) => ({
    id: l.id, name: l.contact_name, company: l.business_name || l.company_name || l.company || null,
    phone: l.contact_phone, status: l.status, closed: l.status === 'won',
    event_date: l.event_date, event_time: l.event_time || null, guests: l.guest_count, type: l.event_type,
  })) };
}

async function tool_find_replacements(args: any, _phone: string): Promise<any> {
  const raw = String(args?.date || '').trim().toLowerCase();
  let date = raw;
  if (/^(היום|today)$/.test(raw)) date = ymd();
  else if (/^(מחר|tomorrow)$/.test(raw)) date = ymd(new Date(Date.now() + 864e5));
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = ymd(new Date(Date.now() + 864e5));
  const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const avail: any[] = await (prisma as any).$queryRawUnsafe(`SELECT employee_id, employee_name, availability_type FROM "EmployeeAvailability" WHERE date=$1`, date).catch(() => []);
  const shifts: any[] = await (prisma as any).$queryRawUnsafe(`SELECT assigned_staff FROM "WorkShift" WHERE date=$1`, date).catch(() => []);
  const schedIds = new Set<string>(); const schedNames = new Set<string>();
  for (const s of shifts) for (const a of (Array.isArray(s.assigned_staff) ? s.assigned_staff : [])) { if (a?.employee_id) schedIds.add(String(a.employee_id)); if (a?.employee_name) schedNames.add(norm(a.employee_name)); }
  const seen = new Set<string>(); const candidates: any[] = [];
  for (const a of avail) {
    if (/unavail|לא ?זמין|busy|block|חסום|חופש/.test(norm(a.availability_type))) continue;
    if (schedIds.has(String(a.employee_id || '')) || schedNames.has(norm(a.employee_name))) continue;
    const k = String(a.employee_id || '') || norm(a.employee_name); if (!k || seen.has(k)) continue; seen.add(k);
    candidates.push({ name: a.employee_name });
  }
  return { date, candidates, count: candidates.length };
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
    amount: i.total_amount, date: dbDate(i.invoice_date), payment_status: i.payment_status,
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
  const m = matchEmployees(String(args.employee_name || ''), emps);
  if (!m.exact.length) {
    if (m.suggestions.length) return {
      not_found: true,
      message: `לא מצאתי עובד פעיל בשם "${args.employee_name}". האם התכוונת לאחד מאלה?`,
      suggestions: m.suggestions.map((e: any) => e.full_name),
    };
    return { error: `לא נמצא עובד פעיל בשם "${args.employee_name}" — בדוק איות או הוסף אותו.` };
  }
  if (m.exact.length > 1) return { ambiguous: true, candidates: m.exact.map((e: any) => e.full_name) };
  const emp = m.exact[0];
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
  const m = matchEmployees(search, emps);
  if (!m.exact.length) {
    // No same-script match. A Latin paste of a Hebrew-stored name (e.g.
    // "Shiden Kitreab Berhe" vs "שידן קיבראב ברחה") lands here — surface the
    // best cross-script guesses so the manager confirms the right person
    // instead of hitting a dead-end and re-pasting.
    if (m.suggestions.length) return {
      not_found: true,
      message: `לא מצאתי עובד פעיל בשם "${search}". האם התכוונת לאחד מאלה?`,
      suggestions: m.suggestions.map((e: any) => e.full_name),
    };
    return { error: `לא נמצא עובד פעיל בשם "${search}" — בדוק איות או הוסף אותו במערכת.` };
  }
  if (m.exact.length > 1) return {
    ambiguous: true,
    candidates: m.exact.slice(0, 6).map((e: any) => e.full_name),
  };
  const emp = m.exact[0];

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

// ─── Recipe / food-cost tools (admin only) ────────────────────────────────

async function tool_get_recipe_cost(args: any, _phone: string): Promise<any> {
  const name = String(args.name || '').trim();
  if (!name) return { error: 'name required' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, kind, total_cost, sale_price, food_cost_percent, category
     FROM "Recipe" WHERE name ILIKE $1 OR name ILIKE $2 LIMIT 5`,
    `%${name}%`, `${name}%`,
  );
  if (!rows.length) return { found: false, message: 'לא נמצאה מנה בשם הזה' };
  return {
    found: true,
    matches: rows.map((r) => ({
      name: r.name,
      kind: r.kind === 'DISH' ? 'מנה' : 'הכנה',
      category: r.category,
      cost: r.total_cost ? `₪${r.total_cost.toFixed(2)}` : 'לא חושב',
      sale_price: r.sale_price ? `₪${r.sale_price.toFixed(2)}` : 'לא הוזן',
      food_cost: r.food_cost_percent ? `${r.food_cost_percent.toFixed(1)}%` : '—',
    })),
  };
}

async function tool_list_high_food_cost(args: any, _phone: string): Promise<any> {
  const threshold = Number(args.threshold || 35);
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT name, total_cost, sale_price, food_cost_percent
     FROM "Recipe" WHERE kind = 'DISH' AND food_cost_percent > $1
     ORDER BY food_cost_percent DESC LIMIT 30`,
    threshold,
  );
  return {
    threshold_percent: threshold,
    count: rows.length,
    dishes: rows.map((r) => ({
      name: r.name,
      cost: `₪${r.total_cost?.toFixed(2)}`,
      price: `₪${r.sale_price?.toFixed(2)}`,
      food_cost: `${r.food_cost_percent.toFixed(1)}%`,
    })),
  };
}

async function tool_update_ingredient_price(args: any, _phone: string): Promise<any> {
  const name = String(args.name || '').trim();
  const price = Number(args.new_price);
  if (!name || !Number.isFinite(price) || price <= 0) return { error: 'name and positive new_price required' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, price_per_unit, unit, supplier_name FROM "Ingredient"
     WHERE name ILIKE $1 OR name ILIKE $2 LIMIT 5`,
    `%${name}%`, `${name}%`,
  );
  if (!rows.length) return { error: 'לא נמצא רכיב בשם הזה' };
  if (rows.length > 1) {
    return {
      ambiguous: true,
      message: 'יש כמה רכיבים תואמים — איזה מהם?',
      options: rows.map((r) => `${r.name} (${r.supplier_name || '—'}) — נוכחי ₪${r.price_per_unit}`),
    };
  }
  const target = rows[0];
  const old = target.price_per_unit;
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Ingredient" SET price_per_unit = $1, "updatedAt" = NOW() WHERE id = $2`,
    price, target.id,
  );
  // Ripple to all recipes (cheap — ~80 ingredients × few queries each).
  const { default: load } = await import('../functions/load.js').then(m => ({ default: (m as any).recomputeAllRecipeCosts || (() => Promise.resolve()) })).catch(() => ({ default: () => Promise.resolve() }));
  try { await load(); } catch { /* helper not exported — silently skip ripple */ }
  return {
    ok: true,
    message: `✅ ${target.name}: ₪${old ?? '?'} → ₪${price} ל-${target.unit}. כל המנות שמשתמשות בו עודכנו.`,
  };
}

// ─── Cash flow tools (admin / manager) ──────────────────────────────────

async function tool_get_cash_balance(args: any, _phone: string): Promise<any> {
  const days = Math.min(60, parseInt(String(args.days || 14)) || 14);
  const horizon = new Date(Date.now() + days * 86400 * 1000);
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT date::date AS date, type, amount FROM "CashFlowEntry"
     WHERE date <= $1 ORDER BY date ASC`, horizon,
  );
  let bal = 0;
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'income') { bal += amt; income += amt; } else { bal -= amt; expense += amt; }
  }
  return {
    horizon_days: days,
    projected_balance: Math.round(bal),
    total_income_window: Math.round(income),
    total_expense_window: Math.round(expense),
  };
}

async function tool_list_unpaid_expenses(_args: any, _phone: string): Promise<any> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, date::date AS date, source, category, amount, payment_method
     FROM "CashFlowEntry"
     WHERE type = 'expense' AND status = 'planned' AND date <= NOW() + INTERVAL '30 days'
     ORDER BY date ASC LIMIT 30`,
  );
  return {
    count: rows.length,
    total_amount: Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0)),
    items: rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      supplier: r.source || '—',
      category: r.category,
      amount: `₪${Math.round(Number(r.amount)).toLocaleString()}`,
      payment_method: r.payment_method || '—',
    })),
  };
}

async function tool_list_expected_income(_args: any, _phone: string): Promise<any> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT date::date AS date, source, category, amount
     FROM "CashFlowEntry"
     WHERE type = 'income' AND status = 'planned' AND date <= NOW() + INTERVAL '30 days'
     ORDER BY date ASC LIMIT 30`,
  );
  return {
    count: rows.length,
    total_amount: Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0)),
    items: rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      source: r.source || r.category,
      amount: `₪${Math.round(Number(r.amount)).toLocaleString()}`,
    })),
  };
}

async function tool_get_my_recipe_summary(_args: any, _phone: string): Promise<any> {
  const dishes: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n, AVG(food_cost_percent)::float AS avg_fc,
            COUNT(CASE WHEN food_cost_percent > 35 THEN 1 END)::int AS high_fc_n,
            COUNT(CASE WHEN sale_price IS NULL THEN 1 END)::int AS missing_price_n
     FROM "Recipe" WHERE kind = 'DISH'`,
  );
  const r = dishes[0] || {};
  return {
    total_dishes: r.n || 0,
    avg_food_cost: r.avg_fc ? `${r.avg_fc.toFixed(1)}%` : '—',
    dishes_above_35: r.high_fc_n || 0,
    dishes_missing_price: r.missing_price_n || 0,
  };
}

// ─── Employee-scoped tools ────────────────────────────────────────────────
// Used by staff (non-admin) numbers to query their OWN data only.

async function tool_get_my_schedule(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.employee_id) return { error: 'unauthenticated' };
  const days = Math.min(14, parseInt(String(args.days || 7)) || 7);
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) + 'T00:00:00.000Z');
  const end = new Date(today.getTime() + days * 86400 * 1000);
  const shifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: today, lt: end } }, take: 50,
  });
  const mine = [];
  for (const ws of shifts) {
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    const me = staff.find((a: any) => a?.employee_id === scope.employee_id);
    if (me) mine.push({
      date: ws.date instanceof Date ? ws.date.toISOString().slice(0, 10) : String(ws.date).slice(0, 10),
      shift_type: ws.shift_type === 'lunch' ? 'צהריים' : 'ערב',
      position: me.position, start: me.start_time, end: me.end_time,
    });
  }
  mine.sort((a, b) => a.date.localeCompare(b.date));
  return { name: scope.employee_name, shifts: mine, total: mine.length };
}

async function tool_get_my_tips(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.employee_id) return { error: 'unauthenticated' };
  const days = Math.min(60, parseInt(String(args.days || 7)) || 7);
  const since = new Date(Date.now() - days * 86400 * 1000);
  const reports: any[] = await (prisma as any).tipReport.findMany({
    where: { date: { gte: since } }, take: 60,
  });
  const mine: any[] = [];
  let total = 0;
  for (const r of reports) {
    const sd = Array.isArray(r.staff_details) ? r.staff_details : [];
    const me = sd.find((s: any) => s?.employee_id === scope.employee_id ||
      (s?.employee_name && scope.employee_name && s.employee_name.trim().toLowerCase() === scope.employee_name.trim().toLowerCase()));
    if (me) {
      const earn = me.total_earnings || me.final_tip || 0;
      total += earn;
      mine.push({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        earnings: Math.round(earn),
        hours: me.effective_hours || 0,
      });
    }
  }
  return { name: scope.employee_name, days, total: Math.round(total), shifts: mine.length, breakdown: mine.slice(0, 10) };
}

async function tool_get_my_hours(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.employee_id) return { error: 'unauthenticated' };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tracking: any[] = await (prisma as any).$queryRaw`
    SELECT date::text AS date_str, total_hours, effective_hours, status
    FROM "ShiftTracking"
    WHERE employee_id = ${scope.employee_id} AND date >= ${monthStart}
    ORDER BY date DESC
  `;
  const completed = tracking.filter((t) => t.status === 'completed');
  const totalH = completed.reduce((s, t) => s + (t.effective_hours || t.total_hours || 0), 0);
  return {
    name: scope.employee_name,
    month: monthStart.toISOString().slice(0, 7),
    shifts_completed: completed.length,
    total_hours: Math.round(totalH * 10) / 10,
    open_shifts: tracking.filter((t) => t.status === 'active' || t.status === 'on_break').length,
  };
}

async function tool_propose_mark_sick(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.employee_id) return { error: 'unauthenticated' };
  const dateRaw = String(args.date || 'today').toLowerCase();
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) + 'T00:00:00.000Z');
  let when = today;
  if (dateRaw === 'tomorrow' || dateRaw === 'מחר') when = new Date(today.getTime() + 86400 * 1000);
  // Stash a proposal (managers will see + approve in app)
  await (prisma as any).whatsAppMessage.create({
    data: {
      body: `[sick_request:${scope.employee_id}:${when.toISOString().slice(0, 10)}] ${scope.employee_name} מבקש חופש מחלה ל-${when.toISOString().slice(0, 10)}`,
      direction: 'inbound', status: 'sick_request_pending',
      from_phone: phone, to_phone: 'system', contact_phone: phone, is_read: false,
    },
  }).catch(() => {});
  // Notify admins
  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (adminNumbers.length) {
    // Sick-report alert goes to MANAGERS, who did not just message us — so
    // free-form could miss them. Template with SMS fallback.
    const { notifyOwner } = await import('./waTemplates.js');
    const msg = `🤒 ${scope.employee_name} מדווח/ת חולה ל-${when.toISOString().slice(0, 10)}. בדוק/י סידור והחלף/י אם צריך.`;
    for (const a of adminNumbers) {
      try { await notifyOwner(a, 'דיווח מחלה', msg); } catch { /* noop */ }
    }
  }
  return { ok: true, message: `דווחת חולה ל-${when.toISOString().slice(0, 10)}. שלחתי הודעה למנהל, הוא יסדר מחליף. רפואה שלמה 💚` };
}

// ─── Scheduling rules (admin) ─────────────────────────────────────────────

async function tool_build_schedule_now(_args: any, _phone: string): Promise<any> {
  const { runWeeklyScheduleBuild } = await import('../functions/load.js');
  const res: any = await runWeeklyScheduleBuild({ force: true });
  if (res?.skipped) return { skipped: true, reason: res.reason };
  // No availability submitted → the builder can't assign anyone. Return a CLEAR
  // message so the agent doesn't say the misleading "built, 0 shifts assigned".
  if (res.no_availability) {
    return {
      ok: false,
      no_availability: true,
      target_week: res.target_week,
      insights: res.insights || [],
      message: `⚠️ עדיין לא ניתן לשבץ — הצוות לא הגיש זמינות לשבוע ${res.target_week || 'הבא'}. ${(res.insights || []).join(' ')}\nרוצה שאשלח לצוות תזכורת להגיש זמינות?`,
    };
  }
  const asg = res.assignmentCount || 0;
  const sh = res.createdShifts || 0;
  return {
    ok: true,
    created_shifts: sh,
    assignment_count: asg,
    missing: res.missing || [],
    insights: res.insights || [],
    target_week: res.target_week,
    message: `✅ בניתי את הסידור לשבוע ${res.target_week || 'הבא'}: *${asg}* שיבוצים ב-${sh} משמרות.${(res.missing || []).length ? ` (לא הגישו זמינות: ${(res.missing || []).slice(0, 8).join(', ')})` : ''}`,
  };
}

async function tool_add_scheduling_rule(args: any, _phone: string): Promise<any> {
  const description = String(args.description || '').trim();
  if (!description) return { error: 'description required' };
  const kind = String(args.kind || 'note');
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "SchedulingRule"(
       "id","kind","employee_name","day_of_week","shift_type",
       "other_employee_name","max_per_week","description"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    randomUUID(), kind,
    args.employee_name || null,
    args.day_of_week != null ? args.day_of_week : null,
    args.shift_type || null,
    args.other_employee_name || null,
    args.max_per_week != null ? args.max_per_week : null,
    description,
  );
  return { ok: true, message: `✅ נוסף חוק: ${description}` };
}

async function tool_list_scheduling_rules(_args: any, _phone: string): Promise<any> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, description FROM "SchedulingRule" WHERE active = true ORDER BY "createdAt" DESC LIMIT 30`,
  );
  return { count: rows.length, rules: rows };
}

// Employee submits their OWN availability for the coming schedule via WhatsApp.
// Records EmployeeAvailability rows (one per day) — the same source the schedule
// builder + replacement-finder read. Replaces any prior submission for that day.
async function tool_submit_availability(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.employee_id) return { error: 'unauthenticated' };
  const entries: any[] = Array.isArray(args?.entries) ? args.entries : [];
  if (!entries.length) return { error: 'no_entries' };
  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const curYear = Number(todayISO.slice(0, 4));
  const parseDate = (s: any): string | null => {
    const t = String(s || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(t);
    if (m) { const d = m[1].padStart(2, '0'); const mo = m[2].padStart(2, '0'); let y = m[3] ? Number(m[3]) : curYear; if (y < 100) y += 2000; return `${y}-${mo}-${d}`; }
    return null;
  };
  const normPref = (p: any) => { const s = String(p || '').toLowerCase(); if (/morning|בוקר/.test(s)) return 'morning'; if (/noon|צהר/.test(s)) return 'noon'; if (/evening|ערב/.test(s)) return 'evening'; return 'both'; };
  const results: { date: string; available: boolean }[] = [];
  for (const e of entries) {
    const iso = parseDate(e.date);
    if (!iso) continue;
    const available = e.available !== false;
    const dayStart = new Date(iso + 'T00:00:00.000Z');
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    await (prisma as any).employeeAvailability.deleteMany({ where: { employee_id: scope.employee_id, date: { gte: dayStart, lt: dayEnd } } }).catch(() => {});
    await (prisma as any).employeeAvailability.create({
      data: {
        employee_id: scope.employee_id,
        employee_name: scope.employee_name || '',
        date: dayStart,
        availability_type: available ? 'available' : 'unavailable',
        shift_preference: normPref(e.shift_preference),
        available_from: e.from ? String(e.from).slice(0, 5) : null,
        available_until: e.until ? String(e.until).slice(0, 5) : null,
        reason: e.note ? String(e.note).slice(0, 200) : null,
      },
    }).catch(() => {});
    results.push({ date: iso, available });
  }
  if (!results.length) return { error: 'no_valid_dates', message: 'לא הצלחתי לפענח את התאריכים — נסה לכתוב כמו 27.07 או 2026-07-27.' };
  const avail = results.filter((r) => r.available).map((r) => r.date);
  const unavail = results.filter((r) => !r.available).map((r) => r.date);
  return {
    ok: true, submitted: results.length,
    summary: `✅ נרשמה זמינות ל-${results.length} ימים.${avail.length ? ` פנוי: ${avail.join(', ')}.` : ''}${unavail.length ? ` לא פנוי: ${unavail.join(', ')}.` : ''} המנהל יראה את זה בבניית הסידור.`,
  };
}

// ── Employee / HR tool handlers (manager-gated) ────────────────────────────
async function ensureCrmTablesWa(): Promise<void> {
  await (prisma as any).$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeNote" ("id" TEXT PRIMARY KEY,"employee_id" TEXT NOT NULL,"sentiment" TEXT DEFAULT 'neutral',"text" TEXT,"created_by" TEXT,"created_by_name" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  await (prisma as any).$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeTask" ("id" TEXT PRIMARY KEY,"employee_id" TEXT NOT NULL,"title" TEXT,"assignee" TEXT,"due_date" DATE,"status" TEXT DEFAULT 'open',"source" TEXT,"created_by_name" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
}
async function resolveEmployeeWa(name: string): Promise<{ emp: any; suggestions: any[] }> {
  const emps: any[] = await (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 }).catch(() => []);
  const mm = matchEmployees(String(name || ''), emps);
  if (mm.exact.length === 1) return { emp: mm.exact[0], suggestions: [] };
  return { emp: null, suggestions: (mm.exact.length ? mm.exact : mm.suggestions).slice(0, 5) };
}
async function tool_add_employee_note(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const text = String(args?.text || '').trim(); if (!text) return { error: 'no_text' };
  const { emp, suggestions } = await resolveEmployeeWa(args?.employee_name);
  if (!emp) return { need_clarification: true, suggestions: suggestions.map((e) => e.full_name) };
  await ensureCrmTablesWa();
  const sentiment = ['positive', 'negative', 'neutral'].includes(String(args?.sentiment)) ? String(args.sentiment) : 'neutral';
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(`INSERT INTO "EmployeeNote" ("id","employee_id","sentiment","text","created_by_name","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`, randomUUID(), emp.id, sentiment, text.slice(0, 1000), scope.employee_name || 'מנהל (WhatsApp)').catch(() => {});
  return { ok: true, employee: emp.full_name, sentiment, saved: text };
}
async function tool_add_employee_task(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const title = String(args?.title || '').trim(); if (!title) return { error: 'no_title' };
  const { emp, suggestions } = await resolveEmployeeWa(args?.employee_name);
  if (!emp) return { need_clarification: true, suggestions: suggestions.map((e) => e.full_name) };
  await ensureCrmTablesWa();
  // parse due date (YYYY-MM-DD or DD.MM)
  let due: Date | null = null;
  const t = String(args?.due_date || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) due = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  else { m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(t); if (m) { const y = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(0, 4)); due = new Date(`${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`); } }
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(`INSERT INTO "EmployeeTask" ("id","employee_id","title","due_date","status","source","created_by_name","createdAt") VALUES ($1,$2,$3,$4,'open','whatsapp',$5,NOW())`, randomUUID(), emp.id, title.slice(0, 300), due, scope.employee_name || 'מנהל').catch(() => {});
  return { ok: true, employee: emp.full_name, task: title, due_date: due ? due.toISOString().slice(0, 10) : null };
}
async function tool_list_hr_gaps(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const emps: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, full_name, id_number, bank_details FROM "Employee" WHERE COALESCE(status,'active')<>'terminated'`).catch(() => []);
  const forms: any[] = await (prisma as any).$queryRawUnsafe(`SELECT employee_id, form_type, signed FROM "EmployeeForm"`).catch(() => []);
  const signed: Record<string, Set<string>> = {};
  for (const f of forms) if (f.signed) (signed[f.employee_id] = signed[f.employee_id] || new Set()).add(f.form_type);
  const out: any[] = [];
  for (const e of emps) { const s = signed[e.id] || new Set(); const g: string[] = []; if (!s.has('work_agreement')) g.push('הסכם'); if (!s.has('101')) g.push('101'); if (!e.bank_details) g.push('בנק'); if (!e.id_number) g.push('ת"ז'); if (g.length) out.push({ name: e.full_name, missing: g }); }
  return { total: out.length, checked: emps.length, employees: out.slice(0, 30) };
}
async function tool_employee_summary(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { emp, suggestions } = await resolveEmployeeWa(args?.employee_name);
  if (!emp) return { need_clarification: true, suggestions: suggestions.map((e) => e.full_name) };
  await ensureCrmTablesWa();
  const forms: any[] = await (prisma as any).$queryRawUnsafe(`SELECT form_type FROM "EmployeeForm" WHERE employee_id=$1 AND signed=true`, emp.id).catch(() => []);
  const signed = new Set(forms.map((f) => f.form_type));
  const notes: any[] = await (prisma as any).$queryRawUnsafe(`SELECT sentiment, text FROM "EmployeeNote" WHERE employee_id=$1 ORDER BY "createdAt" DESC LIMIT 3`, emp.id).catch(() => []);
  const tasks: any[] = await (prisma as any).$queryRawUnsafe(`SELECT title FROM "EmployeeTask" WHERE employee_id=$1 AND status<>'done' ORDER BY COALESCE("due_date",'9999-12-31') ASC LIMIT 5`, emp.id).catch(() => []);
  return {
    name: emp.full_name, status: emp.status, position: (emp.positions || [])[0]?.position_name || emp.role || null,
    forms_signed: ['work_agreement', '101', 'food_safety', 'allergens', 'work_safety'].filter((f) => signed.has(f)).length,
    forms_missing: ['הסכם', '101'].filter((_, i) => !signed.has(i === 0 ? 'work_agreement' : '101')),
    recent_notes: notes.map((n) => `${n.sentiment === 'positive' ? '👍' : n.sentiment === 'negative' ? '⚠️' : '•'} ${n.text}`),
    open_tasks: tasks.map((t) => t.title),
  };
}

// Morning briefing — aggregates the existing read tools so the agent composes a
// single "what's the status today" answer. Read-only, manager-gated.
async function tool_daily_status(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const [rev, orders, incidents, hr, sched] = await Promise.all([
    tool_get_today_revenue({}, phone).catch(() => null),
    tool_list_order_needs({}, phone).catch(() => null),
    tool_list_incidents({}, phone).catch(() => null),
    tool_list_hr_gaps({}, phone).catch(() => null),
    tool_list_today_schedule({}, phone).catch(() => null),
  ]);
  return { revenue: rev, order_needs: orders, open_incidents: incidents, hr_gaps: (hr as any)?.total ?? null, today_schedule: sched };
}

// Log a full meeting on an employee's card (interview/feedback/warning/raise/…).
async function tool_log_employee_meeting(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { emp, suggestions } = await resolveEmployeeWa(args?.employee_name);
  if (!emp) return { need_clarification: true, suggestions: suggestions.map((e) => e.full_name) };
  await (prisma as any).$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeMeeting" ("id" TEXT PRIMARY KEY,"employee_id" TEXT NOT NULL,"meeting_type" TEXT NOT NULL,"meeting_at" TIMESTAMP(3),"participants" TEXT,"purpose" TEXT,"summary" TEXT,"decisions" TEXT,"followup_task" TEXT,"followup_date" DATE,"followup_done" BOOLEAN NOT NULL DEFAULT false,"doc_url" TEXT,"emp_signed" BOOLEAN NOT NULL DEFAULT false,"mgr_signed" BOOLEAN NOT NULL DEFAULT false,"salary_from" DOUBLE PRECISION,"salary_to" DOUBLE PRECISION,"salary_effective" DATE,"salary_reason" TEXT,"role_change" TEXT,"created_by" TEXT,"created_by_name" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  const VALID = ['interview', 'onboarding', 'feedback', 'raise', 'role_change', 'warning', 'disciplinary', 'motivation', 'hearing', 'termination', 'general'];
  const mtype = VALID.includes(String(args?.meeting_type)) ? String(args.meeting_type) : 'general';
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "EmployeeMeeting" ("id","employee_id","meeting_type","meeting_at","summary","created_by_name","createdAt") VALUES ($1,$2,$3,NOW(),$4,$5,NOW())`,
    randomUUID(), emp.id, mtype, String(args?.summary || '').slice(0, 2000) || null, scope.employee_name || 'מנהל',
  ).catch(() => {});
  return { ok: true, employee: emp.full_name, meeting_type: mtype };
}

// Mark an onboarding step done for a new hire.
async function tool_set_onboarding_step(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { emp, suggestions } = await resolveEmployeeWa(args?.employee_name);
  if (!emp) return { need_clarification: true, suggestions: suggestions.map((e) => e.full_name) };
  const KEYS = ['interview_done', 'terms_agreed', 'agreement_sent', 'agreement_signed', 'form_101_done', 'id_photo', 'bank_details', 'safety_training', 'pro_training', 'first_shift'];
  const step = KEYS.includes(String(args?.step_key)) ? String(args.step_key) : null;
  if (!step) return { error: 'unknown_step', valid: KEYS };
  await (prisma as any).$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeOnboardingStep" ("id" TEXT PRIMARY KEY,"employee_id" TEXT NOT NULL,"step_key" TEXT NOT NULL,"done" BOOLEAN NOT NULL DEFAULT false,"done_at" TIMESTAMP(3),"file_url" TEXT,"note" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  await (prisma as any).$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeOnboardingStep_emp_step" ON "EmployeeOnboardingStep" ("employee_id","step_key")`).catch(() => {});
  const { randomUUID } = await import('node:crypto');
  const done = args?.done === false ? false : true;
  const ex: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id FROM "EmployeeOnboardingStep" WHERE employee_id=$1 AND step_key=$2 LIMIT 1`, emp.id, step).catch(() => []);
  if (ex.length) await (prisma as any).$executeRawUnsafe(`UPDATE "EmployeeOnboardingStep" SET done=$1, done_at=$2, "updatedAt"=NOW() WHERE id=$3`, done, done ? new Date() : null, ex[0].id).catch(() => {});
  else await (prisma as any).$executeRawUnsafe(`INSERT INTO "EmployeeOnboardingStep" ("id","employee_id","step_key","done","done_at","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())`, randomUUID(), emp.id, step, done, done ? new Date() : null).catch(() => {});
  return { ok: true, employee: emp.full_name, step, done };
}

// Issue a club benefit (coupon) to a customer resolved by phone or name.
async function tool_issue_club_benefit(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const desc = String(args?.benefit || '').trim(); if (!desc) return { error: 'no_benefit' };
  const q = String(args?.customer || '').trim();
  const digits = q.replace(/[^\d]/g, '');
  let cust: any = null;
  if (digits.length >= 7) { const r: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, name, phone FROM "Customer" WHERE phone LIKE $1 LIMIT 2`, `%${digits.slice(-9)}%`).catch(() => []); cust = r.length === 1 ? r[0] : null; if (r.length > 1) return { need_clarification: true, note: 'כמה לקוחות עם הטלפון הזה' }; }
  if (!cust && q) { const r: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, name, phone FROM "Customer" WHERE name ILIKE $1 LIMIT 4`, `%${q}%`).catch(() => []); if (r.length === 1) cust = r[0]; else if (r.length > 1) return { need_clarification: true, suggestions: r.map((c) => `${c.name} (${c.phone || '—'})`) }; }
  if (!cust) return { error: 'customer_not_found', note: 'לא נמצא לקוח — נסה טלפון מלא או שם מדויק.' };
  const { grantBenefit } = await import('./clubCore.js');
  const b = await grantBenefit({ customerId: cust.id, description: desc.slice(0, 200), source: `wa_manual_${Date.now()}`, validDays: 30 }).catch(() => null);
  if (!b) return { error: 'grant_failed' };
  return { ok: true, customer: cust.name, benefit: desc, code: (b as any).code || null };
}

// This branch's network tasks (from HQ) + mark one done.
async function tool_my_branch_tasks(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT b.task_id, b.done, t.title, t.detail, t.due_date FROM public."NetworkTaskBranch" b JOIN public."NetworkTask" t ON t.id=b.task_id WHERE b.slug=$1 ORDER BY b.done ASC, t."createdAt" DESC LIMIT 30`,
    currentTenantSlug(),
  ).catch(() => []);
  return { tasks: rows.map((r) => ({ id: r.task_id, title: r.title, detail: r.detail, due: r.due_date, done: r.done })), open: rows.filter((r) => !r.done).length };
}
async function tool_mark_branch_task(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const slug = currentTenantSlug();
  const title = String(args?.title || '').trim();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT b.task_id, t.title FROM public."NetworkTaskBranch" b JOIN public."NetworkTask" t ON t.id=b.task_id WHERE b.slug=$1 AND COALESCE(b.done,false)=false AND t.title ILIKE $2 LIMIT 2`,
    slug, `%${title}%`,
  ).catch(() => []);
  if (rows.length !== 1) return rows.length ? { need_clarification: true, suggestions: rows.map((r) => r.title) } : { error: 'task_not_found' };
  await (prisma as any).$executeRawUnsafe(`UPDATE public."NetworkTaskBranch" SET done=true, done_at=NOW() WHERE slug=$1 AND task_id=$2`, slug, rows[0].task_id).catch(() => {});
  return { ok: true, marked_done: rows[0].title };
}

// Mass customer campaign — OWNER only, and ALWAYS requires an explicit "כן"
// confirm before anything is sent (consent/24h-throttle/opt-out are enforced by
// sendCustomerCampaign on execute). The propose step only previews the count.
const CAMPAIGN_SEGMENTS = ['all_consented', 'winback_30', 'winback_60', 'winback_90', 'vip', 'almost_vip', 'birthday_this_month', 'birthday_today'];
async function tool_propose_customer_campaign(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.is_owner) return { error: 'רק הבעלים יכול לשלוח קמפיין ללקוחות.' };
  const message = String(args?.message || '').trim();
  if (message.length < 5) return { error: 'צריך תוכן הודעה לקמפיין (לפחות כמה מילים).' };
  const segment = CAMPAIGN_SEGMENTS.includes(String(args?.segment)) ? String(args.segment) : 'all_consented';
  // Preview the recipient count through the real segment builder.
  let count = 0;
  try {
    const { functionHandlers } = await import('../functions/index.js');
    const pv: any = await functionHandlers['previewCustomerSegment']({ user: { id: 'wa-owner', role: 'owner', email: '' }, body: { segment }, req: {} } as any);
    count = (pv?.count ?? pv?.total ?? (Array.isArray(pv?.customers) ? pv.customers.length : 0)) || 0;
  } catch { /* preview best-effort */ }
  if (!count) return { error: 'לא נמצאו לקוחות מסכימים בסגמנט הזה — נסה סגמנט אחר (כולם / לא-הגיעו-חודשיים / VIP / יומולדת).' };
  const segLabel: Record<string, string> = { all_consented: 'כל הלקוחות המסכימים', winback_30: 'לא הגיעו חודש', winback_60: 'לא הגיעו חודשיים', winback_90: 'לא הגיעו 3 חודשים', vip: 'לקוחות VIP', almost_vip: 'קרובים ל-VIP', birthday_this_month: 'ימי הולדת החודש', birthday_today: 'ימי הולדת היום' };
  await stashPendingAction(phone, { type: 'customer_campaign', segment, message });
  return {
    proposal: `📣 שליחת קמפיין ל-*${count} לקוחות* (${segLabel[segment]}):\n"${message}"\n\n⚠️ זו שליחה המונית ללקוחות אמיתיים. ההסכמות + מגבלת 24ש' נאכפות אוטומטית. לאשר?`,
    awaiting_confirmation: true,
  };
}

// ── Menu editing (manager) ─────────────────────────────────────────────────
async function resolveMenuItem(name: string): Promise<{ item: any; suggestions: any[] }> {
  const q = String(name || '').trim(); if (!q) return { item: null, suggestions: [] };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, name, category, price, available FROM "MenuItem" WHERE name ILIKE $1 OR name ILIKE $2 LIMIT 5`, `%${q}%`, `${q}%`).catch(() => []);
  if (rows.length === 1) return { item: rows[0], suggestions: [] };
  return { item: null, suggestions: rows.slice(0, 5) };
}
async function tool_add_menu_item(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const name = String(args?.name || '').trim(); const price = Number(args?.price);
  if (!name || !Number.isFinite(price) || price < 0) return { error: 'צריך שם מנה ומחיר.' };
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "MenuItem" ("id","name","category","description","price","available","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
    randomUUID(), name.slice(0, 120), String(args?.category || 'כללי').slice(0, 60), String(args?.description || '').slice(0, 500) || null, price,
  ).catch(() => {});
  return { ok: true, added: name, price, category: String(args?.category || 'כללי') };
}
async function tool_set_menu_item_availability(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { item, suggestions } = await resolveMenuItem(args?.name);
  if (!item) return { need_clarification: true, suggestions: suggestions.map((i) => i.name) };
  const available = args?.available === true || String(args?.available).toLowerCase() === 'true';
  await (prisma as any).$executeRawUnsafe(`UPDATE "MenuItem" SET available=$1, "updatedAt"=NOW() WHERE id=$2`, available, item.id).catch(() => {});
  return { ok: true, item: item.name, available };
}
async function tool_update_menu_item(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { item, suggestions } = await resolveMenuItem(args?.name);
  if (!item) return { need_clarification: true, suggestions: suggestions.map((i) => i.name) };
  const sets: string[] = []; const vals: any[] = [];
  if (args?.new_price != null && Number.isFinite(Number(args.new_price))) { sets.push(`price=$${sets.length + 1}`); vals.push(Number(args.new_price)); }
  if (args?.new_name) { sets.push(`name=$${sets.length + 1}`); vals.push(String(args.new_name).slice(0, 120)); }
  if (args?.new_category) { sets.push(`category=$${sets.length + 1}`); vals.push(String(args.new_category).slice(0, 60)); }
  if (!sets.length) return { error: 'לא צוין מה לעדכן (מחיר/שם/קטגוריה).' };
  await (prisma as any).$executeRawUnsafe(`UPDATE "MenuItem" SET ${sets.join(', ')}, "updatedAt"=NOW() WHERE id=$${sets.length + 1}`, ...vals, item.id).catch(() => {});
  return { ok: true, item: item.name, updated: { price: args?.new_price, name: args?.new_name, category: args?.new_category } };
}
async function tool_remove_menu_item(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const { item, suggestions } = await resolveMenuItem(args?.name);
  if (!item) return { need_clarification: true, suggestions: suggestions.map((i) => i.name) };
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "MenuItem" WHERE id=$1`, item.id).catch(() => {});
  return { ok: true, deleted: item.name };
}
async function tool_list_menu(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const cat = String(args?.category || '').trim();
  const rows: any[] = cat
    ? await (prisma as any).$queryRawUnsafe(`SELECT name, category, price, available FROM "MenuItem" WHERE category ILIKE $1 ORDER BY name LIMIT 100`, `%${cat}%`).catch(() => [])
    : await (prisma as any).$queryRawUnsafe(`SELECT name, category, price, available FROM "MenuItem" ORDER BY category, name LIMIT 200`).catch(() => []);
  return { count: rows.length, unavailable: rows.filter((r) => r.available === false).map((r) => r.name), items: rows.slice(0, 60).map((r) => ({ name: r.name, category: r.category, price: r.price, available: r.available !== false })) };
}

// ── Deliveries (manager) ───────────────────────────────────────────────────
async function tool_list_deliveries(_args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) + 'T00:00:00.000Z');
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT customer_name, customer_phone, address, neighborhood, courier_name, delivery_status, total_delivery_amount FROM "Delivery" WHERE date >= $1 OR COALESCE(delivery_status,'pending') NOT IN ('delivered','cancelled') ORDER BY date DESC LIMIT 40`, today,
  ).catch(() => []);
  const open = rows.filter((r) => !['delivered', 'cancelled'].includes(String(r.delivery_status || 'pending')));
  return { total: rows.length, open: open.length, deliveries: rows.slice(0, 25).map((r) => ({ customer: r.customer_name, address: r.address, area: r.neighborhood, courier: r.courier_name, status: r.delivery_status || 'pending', amount: r.total_delivery_amount })) };
}
async function tool_update_delivery(args: any, phone: string): Promise<any> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  if (!scope.can_write) return { error: 'הפעולה הזו דורשת הרשאת מנהל.' };
  const q = String(args?.customer || '').trim(); const digits = q.replace(/[^\d]/g, '');
  let rows: any[] = [];
  if (digits.length >= 7) rows = await (prisma as any).$queryRawUnsafe(`SELECT id, customer_name, address, delivery_status FROM "Delivery" WHERE customer_phone LIKE $1 AND COALESCE(delivery_status,'pending') NOT IN ('delivered','cancelled') ORDER BY date DESC LIMIT 3`, `%${digits.slice(-9)}%`).catch(() => []);
  if (!rows.length && q) rows = await (prisma as any).$queryRawUnsafe(`SELECT id, customer_name, address, delivery_status FROM "Delivery" WHERE (customer_name ILIKE $1 OR address ILIKE $1) AND COALESCE(delivery_status,'pending') NOT IN ('delivered','cancelled') ORDER BY date DESC LIMIT 3`, `%${q}%`).catch(() => []);
  if (rows.length !== 1) return rows.length ? { need_clarification: true, suggestions: rows.map((r) => `${r.customer_name || ''} · ${r.address}`) } : { error: 'לא נמצא משלוח פתוח תואם.' };
  const d = rows[0];
  const statusMap: Record<string, string> = { picked_up: 'picked_up', out: 'picked_up', delivered: 'delivered', cancelled: 'cancelled', canceled: 'cancelled' };
  const st = statusMap[String(args?.status || '').toLowerCase()] || null;
  const sets: string[] = []; const vals: any[] = [];
  // Placeholders are numbered by VALS position; NOW() sets carry no value.
  if (st) { vals.push(st); sets.push(`delivery_status=$${vals.length}`); if (st === 'picked_up') sets.push(`picked_up_at=NOW()`); if (st === 'delivered') sets.push(`delivered_at=NOW()`); }
  if (args?.courier) { vals.push(String(args.courier).slice(0, 80)); sets.push(`courier_name=$${vals.length}`); }
  if (!sets.length) return { error: 'לא צוין מה לעדכן (סטטוס/שליח).' };
  vals.push(d.id);
  await (prisma as any).$executeRawUnsafe(`UPDATE "Delivery" SET ${sets.join(', ')} WHERE id=$${vals.length}`, ...vals).catch(() => {});
  return { ok: true, delivery: `${d.customer_name || ''} · ${d.address}`, status: st || d.delivery_status, courier: args?.courier || undefined };
}

const TOOL_HANDLERS: Record<string, (args: any, phone: string) => Promise<any>> = {
  build_schedule_now: tool_build_schedule_now,
  add_scheduling_rule: tool_add_scheduling_rule,
  list_scheduling_rules: tool_list_scheduling_rules,
  // Recipe / food-cost (admin/manager)
  get_recipe_cost: tool_get_recipe_cost,
  list_high_food_cost: tool_list_high_food_cost,
  update_ingredient_price: tool_update_ingredient_price,
  get_my_recipe_summary: tool_get_my_recipe_summary,
  // Cash flow (admin/manager)
  get_cash_balance: tool_get_cash_balance,
  list_unpaid_expenses: tool_list_unpaid_expenses,
  list_expected_income: tool_list_expected_income,
  // Employee-scoped
  get_my_schedule: tool_get_my_schedule,
  get_my_tips: tool_get_my_tips,
  get_my_hours: tool_get_my_hours,
  propose_mark_sick: tool_propose_mark_sick,
  submit_availability: tool_submit_availability,
  add_employee_note: tool_add_employee_note,
  add_employee_task: tool_add_employee_task,
  list_hr_gaps: tool_list_hr_gaps,
  employee_summary: tool_employee_summary,
  daily_status: tool_daily_status,
  log_employee_meeting: tool_log_employee_meeting,
  set_onboarding_step: tool_set_onboarding_step,
  issue_club_benefit: tool_issue_club_benefit,
  my_branch_tasks: tool_my_branch_tasks,
  mark_branch_task: tool_mark_branch_task,
  propose_customer_campaign: tool_propose_customer_campaign,
  add_menu_item: tool_add_menu_item,
  set_menu_item_availability: tool_set_menu_item_availability,
  update_menu_item: tool_update_menu_item,
  remove_menu_item: tool_remove_menu_item,
  list_menu: tool_list_menu,
  list_deliveries: tool_list_deliveries,
  update_delivery: tool_update_delivery,
  list_today_schedule: tool_list_today_schedule,
  list_today_events: tool_list_today_events,
  list_open_tasks: tool_list_open_tasks,
  list_open_leads: tool_list_open_leads,
  get_recent_tips: tool_get_recent_tips,
  get_unpaid_invoices: tool_get_unpaid_invoices,
  search_employee: tool_search_employee,
  search_lead: tool_search_lead,
  find_replacements: tool_find_replacements,
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
  // ─── Owner-agent action pack (10 capabilities) ───────────────────────────
  check_availability: tool_check_availability,
  propose_create_reservation: tool_propose_create_reservation,
  propose_cancel_reservation: tool_propose_cancel_reservation,
  get_today_revenue: tool_get_today_revenue,
  list_order_needs: tool_list_order_needs,
  propose_mark_supplier_ordered: tool_propose_mark_supplier_ordered,
  propose_lock_tips: tool_propose_lock_tips,
  propose_open_incident: tool_propose_open_incident,
  list_incidents: tool_list_incidents,
  propose_resolve_incident: tool_propose_resolve_incident,
  propose_mark_expense_paid: tool_propose_mark_expense_paid,
  propose_set_dish_price: tool_propose_set_dish_price,
  propose_invite_employee: tool_propose_invite_employee,
  propose_team_broadcast: tool_propose_team_broadcast,
  propose_remove_from_shift: tool_propose_remove_from_shift,
  propose_publish_schedule: tool_propose_publish_schedule,
  propose_approve_event: tool_propose_approve_event,
};

// ─── Agent loop ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE_TEMPLATE = `אתה העוזר האישי של בעל מסעדת "{brand}" ב-WhatsApp.
ענה בשפה שבה כותבים אליך — עברית, אנגלית או ספרדית — תמיד התאם לשפת ההודעה האחרונה. תשובה טבעית, קצרה, ידידותית. אתה מנהל את המסעדה והלוז האישי שלו.

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

*ניהול המסעדה — 10 יכולות (כולן דורשות הרשאת מנהל; יצירה/ביטול/עדכון עוברים אישור "כן" אוטומטי — אל תבקש אישור בעצמך)*:
- *הזמנות שולחן*: "יש מקום ל-X בתאריך/שעה?" → check_availability · "תזמין שולחן ל..." → propose_create_reservation · "תבטל את ההזמנה של..." → propose_cancel_reservation. שעות = שעון ישראל; העבר תאריך כפי שנכתב.
- *מכירות היום*: "כמה מכרנו?"/"מה המצב עכשיו?" → get_today_revenue (Beecomm+Gomiley, סה"כ ומזומן).
- *הזמנות מספקים*: "מה צריך להזמין?"/"מה חסר מהירקן?" → list_order_needs (רק מה שעדיין לא הוזמן) · "סמן שהזמנתי מ<ספק>" → propose_mark_supplier_ordered.
- *טיפים*: "נעל את הטיפים של אתמול" → propose_lock_tips (ברירת מחדל: אתמול).
- *תקלות*: "תפתח תקלה: ..." → propose_open_incident · "מה פתוח?" → list_incidents · "סגור את התקלה של X" → propose_resolve_incident.
- *הוצאות ומחירים*: "סמן שההוצאה ל-X שולמה"/"שילמתי ל-Y" → propose_mark_expense_paid · "עדכן מחיר X ל-N" → propose_set_dish_price.
- *צוות ואירועים*: "תזמין עובד חדש ..." → propose_invite_employee (בעלים בלבד) · "תוריד את X ממחר ערב" → propose_remove_from_shift · "פרסם את הסידור" → propose_publish_schedule · "אשר את האירוע של X" → propose_approve_event (בעלים בלבד) · "תגיד לכל העובדים / למלצרים של הערב ש..." → propose_team_broadcast (בעלים בלבד — כל עובד מקבל הודעה אישית).

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
  - אם בהודעה יש *שם אדם + תפקיד מסעדה* (קופה ואריזות / מארחת / מלצר / ברמן / טבח / שטיפה / ראנר / אחראי משמרת) ואחריו 1+ שורות תאריך+שעות → זה *תמיד* propose_employee_shifts_batch, גם אם רק שורה אחת. לעולם לא propose_event_add_batch.
  - שורות בפורמט "DD.M טווח-שעות" או "DD/M טווח-שעות" (תאריך + טווח שעות עם מקף, *בלי כותרת*) = *משמרות עבודה* → תמיד propose_employee_shifts_batch.
  - מילות-טריגר שמחייבות שיבוץ עובד (לא פגישה): "שבץ", "שיבוץ", "תשבץ", "סידור עבודה", "משמרת", "משמרות", "תכניס לסידור", "להכניס לדוחות עובדים", "להוסיף לדוח", "סיכום חודשי".
  - *⚠️ אל תקרא ל-propose_shift_assign* אם המשתמש כתב שעות מדויקות (כמו "17:00-00:30") — propose_shift_assign מצמיד לסוגי משמרת קבועים ומאבד את השעות שלך. תקרא תמיד ל-*propose_employee_shifts_batch* (גם עבור משמרת אחת בלבד) כשיש לך שעת התחלה+סיום ספציפיות.
  - "להכניס לדוחות עובדים" / "סיכום חודשי" = בדיוק אותו פעולה כמו "שבץ למשמרת" — שניהם כותבים ל-WorkShift. אל תשאל את המשתמש איזה מהם — תפעל ישר עם propose_employee_shifts_batch.
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

// Role-scoped prompt: staff get a TIGHT prompt that limits them to personal
// tools (no leads/invoices/employees of others). Owner/manager get the full
// SYSTEM_PROMPT_BASE.
const STAFF_PROMPT_TEMPLATE = `אתה העוזר האישי של {name} ב-WhatsApp במסעדת "{brand}".

תפקיד {name}: {role}.

עיקרון: ענה רק על דברים שקשורים אליו/ה. *אל* תיתן מידע על עובדים אחרים, לידים, חשבוניות, או נתוני העסק.

כלים זמינים:
- get_my_schedule — המשמרות הקרובות שלי
- get_my_tips — הטיפים שלי
- get_my_hours — שעות שעבדתי החודש
- propose_mark_sick — אני חולה היום/מחר

שאלות נפוצות וכיצד לענות:
- "מתי המשמרת הבאה שלי?" → get_my_schedule({days:3})
- "כמה טיפים יש לי השבוע?" → get_my_tips({days:7})
- "כמה שעות החודש?" → get_my_hours()
- "אני חולה" → propose_mark_sick({date:"today"})
- "אני חולה מחר" → propose_mark_sick({date:"tomorrow"})

חוקים:
1. ענה בשפה שבה כותבים אליך — עברית, אנגלית או ספרדית. תמיד התאם את שפת התשובה לשפת ההודעה האחרונה. שמור על תשובות קצרות וידידותיות. (Reply in the user's language: Hebrew, English or Spanish. / Responde en el idioma del usuario.)
2. אם שואלים על עובד אחר / נתוני כסף / לידים → "אין לי גישה לנתון הזה. תפנה למנהל אם צריך"
3. בקשות מורכבות (סידור עתידי, החלפת משמרת) → "כרגע לא יכול לטפל בזה בצ'אט, פנה במשמרת או באפליקציה"`;

async function buildSystemPrompt(phone: string): Promise<string> {
  const { resolveAccessScope } = await import('./whatsappPermissions.js');
  const scope = await resolveAccessScope(phone);
  const { getBrandName } = await import('./brandName.js');
  const brandName = await getBrandName();
  const SYSTEM_PROMPT_BASE = SYSTEM_PROMPT_BASE_TEMPLATE.replaceAll('{brand}', brandName);
  const STAFF_PROMPT = STAFF_PROMPT_TEMPLATE.replaceAll('{brand}', brandName);

  // Staff / guest → restricted prompt
  if (scope.role === 'staff' || scope.role === 'guest') {
    let base = STAFF_PROMPT
      .replace(/\{name\}/g, scope.employee_name)
      .replace(/\{role\}/g, scope.role_label_he);
    if (scope.role === 'guest') {
      base += `\n\n⚠️ המספר שלך לא רשום במערכת. הסוכן יוכל לעזור רק במידע ציבורי כללי. אם אתה עובד — פנה למנהל לרישום.`;
    }
    return base;
  }

  // Managers + owner → full SYSTEM_PROMPT_BASE with role banner.
  const roleBanner = scope.is_owner
    ? ''
    : `\n\n*אתה מדבר עם ${scope.employee_name} (${scope.role_label_he})*. הוא מורשה לראות הכל בתחום אחריותו.`;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const pending: any = await (prisma as any).whatsAppMessage.findFirst({
    where: { contact_phone: phone, status: 'pending_action_confirmation', is_read: false, created_at: { gte: since } },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!pending) return SYSTEM_PROMPT_BASE + roleBanner;
  const exec = (pending.raw as any)?.pending_action || {};
  const summary = String(pending.body || '').slice(0, 300);
  return `${SYSTEM_PROMPT_BASE}${roleBanner}

*הקשר פעיל — יש הצעה ממתינה לאישור:*
${summary}
type=${exec.type || '?'} · נשלח לפני ${Math.round((Date.now() - new Date(pending.created_at).getTime()) / 60_000)} דקות.
אם ההודעה הבאה היא תיקון לפרטים שלמעלה — השתמש ב-modify_pending_proposal.`;
}

// ─── Tool router ────────────────────────────────────────────────────────────
// Handing all ~54 owner tools to gemini-2.5 in one call is unreliable — it
// returns empty candidates or picks the wrong tool on many phrasings. So we
// first classify the message into ONE intent group with a cheap LLM call and
// expose only that group's tools (6-12) plus a few universal ones. A short,
// focused list makes tool selection accurate for almost any wording.
const UNIVERSAL_TOOLS = ['list_pending_proposals', 'modify_pending_proposal', 'cancel_pending_proposal'];
const TOOL_GROUPS: Record<string, string[]> = {
  finance: ['get_today_revenue', 'get_cash_balance', 'list_unpaid_expenses', 'list_expected_income', 'get_recent_tips', 'propose_mark_expense_paid', 'propose_lock_tips', 'get_recipe_cost', 'list_high_food_cost', 'update_ingredient_price', 'get_my_recipe_summary', 'propose_set_dish_price', 'daily_status'],
  schedule: ['list_today_schedule', 'build_schedule_now', 'add_scheduling_rule', 'list_scheduling_rules', 'propose_shift_assign', 'propose_employee_shifts_batch', 'propose_remove_from_shift', 'propose_publish_schedule', 'search_employee', 'propose_invite_employee', 'propose_mark_sick', 'find_replacements', 'submit_availability'],
  reservations: ['check_availability', 'propose_create_reservation', 'propose_cancel_reservation'],
  orders: ['list_order_needs', 'propose_mark_supplier_ordered'],
  incidents: ['propose_open_incident', 'list_incidents', 'propose_resolve_incident'],
  events: ['propose_approve_event', 'list_open_leads', 'search_lead', 'propose_lead_set_stage', 'propose_event_add', 'propose_event_add_batch'],
  tasks: ['propose_task_add', 'propose_task_done', 'list_open_tasks', 'propose_task_add_batch', 'propose_remind_me', 'list_today_events', 'update_scheduled_event', 'cancel_scheduled_event', 'my_branch_tasks', 'mark_branch_task'],
  invoices: ['get_unpaid_invoices', 'search_invoice', 'propose_invoice_mark_paid'],
  team: ['propose_team_broadcast', 'search_employee', 'list_today_schedule', 'add_employee_note', 'add_employee_task', 'list_hr_gaps', 'employee_summary', 'log_employee_meeting', 'set_onboarding_step', 'issue_club_benefit', 'propose_customer_campaign'],
  menu: ['list_menu', 'add_menu_item', 'set_menu_item_availability', 'update_menu_item', 'remove_menu_item', 'propose_set_dish_price', 'get_recipe_cost'],
  deliveries: ['list_deliveries', 'update_delivery'],
};
// When the intent is unclear, a modest common set (still far smaller than 54).
const GENERAL_TOOLS = ['get_today_revenue', 'daily_status', 'list_today_schedule', 'build_schedule_now', 'check_availability', 'propose_create_reservation', 'list_order_needs', 'list_incidents', 'propose_open_incident', 'get_unpaid_invoices', 'propose_task_add', 'propose_remind_me', 'list_open_tasks', 'search_employee', 'issue_club_benefit'];
const STAFF_TOOLS = ['get_my_schedule', 'get_my_tips', 'get_my_hours', 'propose_mark_sick', 'submit_availability'];

// Deterministic keyword routing — covers the vast majority of phrasings without
// an LLM call. Order matters: more specific intents first. The LLM classifier is
// only a fallback for wording the keywords miss.
const INTENT_KEYWORDS: Array<[string, RegExp]> = [
  ['team', /תגיד לכל|תודיע לכל|שלח לכל|הודעה לכל|תעדכן את (כל|ה)|לכל העובדים|לכל הצוות|תגיד למלצרים|תגיד לטבחים|תגיד למטבח/],
  ['team', /הערה על|תעד ש|מחמאה|מי חסר (לו )?טפסים|מי צריך לחתום|חסר.{0,6}(הסכם|טופס|101)|ספר לי על|מה המצב עם|כרטיס עובד|כרטיס של|שיחת משוב|שיחת אזהרה|שימוע|העלאת שכר|קמפיין|לכל הלקוחות|הטבה ל/],
  ['deliveries', /משלוח|משלוחים|שליח|נמסר|יצא לדרך|מי קיבל.{0,10}משלוח/],
  ['menu', /תפריט|הוסף מנה|מנה חדשה|תוריד.{0,12}(מהתפריט|מנה)|נגמר ה|מחק.{0,6}מנה|מה (יש )?בתפריט|תעדכן.{0,6}מנה|86 ל/],
  ['reservations', /יש מקום|מקום פנוי|(תזמין|להזמין|תרשום|תכניס).{0,12}(שולחן|מקום|הזמנה)|שולחן ל|סועדים|לשבת|רזרב|בטל.{0,10}הזמנה/],
  ['orders', /ירקן|ספק|מה חסר|מה צריך להזמין|צריך להזמין|מלאי|הזמנתי מ|סמן שהזמנתי|מהבשר|מהאלכוהול/],
  ['incidents', /תקלה|תקלות|התקלקל|נשבר|לא עובד|לא עובדת|מה פתוח|אירוע חריג|קלקול|דליפה|סגור.{0,10}תקלה/],
  ['invoices', /חשבונית|חשבוניות|חשבונית ספק/],
  ['events', /אירוע פרטי|ליד|לידים|הצעת מחיר|אשר.{0,10}אירוע|חתונה|מסיבה|אירוע של/],
  ['schedule', /סידור|משמר|זמינות|שבץ|שיבוץ|מי עובד|פרסם.{0,10}סידור|מחלה|חולה|תוריד.{0,12}(מ|ממשמרת)|לו"?ז|עובד חדש|הזמן עובד/],
  ['finance', /מכר|כמה מכרנו|כמה כסף|הכנס|מזומן|קופ|טיפ|הוצא|שילמתי|מחיר|עלות|פוד.?קוסט|רווח|מה המצב/],
  ['tasks', /משימה|משימות|תזכורת|תזכיר|יומן|פגיש|תזכור|לעשות/],
];
function keywordIntent(message: string): string | null {
  const m = String(message || '');
  for (const [cat, re] of INTENT_KEYWORDS) if (re.test(m)) return cat;
  return null;
}

async function classifyIntent(message: string): Promise<string> {
  const kw = keywordIntent(message);
  if (kw) return kw;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'general';
  const prompt =
    `סווג את בקשת המשתמש לעסק לקטגוריה אחת בלבד. החזר אך ורק את מילת המפתח באנגלית, בלי שום דבר נוסף.\n` +
    `finance = מכירות/הכנסות/כמה מכרנו/מזומן/קופה/טיפים/הוצאות/תשלום לספק/מחיר מנה/עלות מזון/פוד קוסט\n` +
    `schedule = סידור עבודה/משמרות/מי עובד/זמינות/שבץ/תוריד ממשמרת/פרסם סידור/הוסף עובד/דיווח מחלה\n` +
    `reservations = הזמנת שולחן/יש מקום/תזמין/בטל הזמנה\n` +
    `orders = הזמנות מספקים/מה חסר/מה צריך להזמין/סמן שהזמנתי/מלאי\n` +
    `incidents = תקלה/אירוע חריג/מה פתוח/סגור תקלה\n` +
    `events = אירוע פרטי/ליד/הצעת מחיר/אשר אירוע\n` +
    `tasks = משימה/תזכורת/יומן/פגישה/תזכיר לי\n` +
    `invoices = חשבונית ספק/סמן ששולמה/חפש חשבונית\n` +
    `team = תגיד לכל העובדים/תודיע לצוות/שלח הודעה למלצרים · או ניהול עובד ספציפי: רשום הערה על עובד/תעד שעובד איחר/מחמאה/תזכורת לעובד/מי חסר לו טפסים/מי צריך לחתום/ספר לי על עובד/כרטיס עובד · או קמפיין ללקוחות/הטבה ללקוח\n` +
    `menu = תפריט/מנה/הוסף מנה/תוריד מהתפריט/נגמר/86/שנה מחיר מנה/מחק מנה/מה בתפריט/קטגוריה\n` +
    `deliveries = משלוח/משלוחים/שליח/יצא/נמסר/מי קיבל/כתובת\n` +
    `general = ברכה/שאלה כללית/לא ברור\n` +
    `בקשה: "${String(message).slice(0, 300)}"`;
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // thinkingBudget:0 — 2.5-flash is a thinking model; without this the small
      // token budget is consumed by thinking and the classifier returns nothing
      // (→ always "general"). Disable thinking so it answers directly.
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 30, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const data: any = await res.json().catch(() => ({}));
    const raw = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('').toLowerCase();
    const cat = (raw.match(/finance|schedule|reservations|orders|incidents|events|tasks|invoices|team|menu|deliveries|general/) || ['general'])[0];
    return cat;
  } catch { return 'general'; }
}

// Resolve the focused tool declarations for a caller + message.
async function routedToolDeclarations(role: string, message: string): Promise<{ decls: any[]; group: string }> {
  if (role === 'staff' || role === 'guest') {
    return { decls: TOOL_DECLARATIONS.filter((d: any) => STAFF_TOOLS.includes(d.name)), group: 'self' };
  }
  const cat = await classifyIntent(message);
  const names = new Set<string>([...UNIVERSAL_TOOLS, ...(TOOL_GROUPS[cat] || GENERAL_TOOLS)]);
  return { decls: TOOL_DECLARATIONS.filter((d: any) => names.has(d.name)), group: cat };
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

  // Route to a FOCUSED tool set (see routedToolDeclarations): staff get their 4
  // self-service tools; owners/managers get only the group matching the message
  // intent (+ universal). A short list makes gemini-2.5 map almost any phrasing
  // to the right tool instead of returning empty or picking the wrong one.
  let activeDecls = TOOL_DECLARATIONS;
  try {
    const { resolveAccessScope } = await import('./whatsappPermissions.js');
    const role = (await resolveAccessScope(phone)).role;
    const routed = await routedToolDeclarations(role, userMessage);
    activeDecls = routed.decls.length ? routed.decls : TOOL_DECLARATIONS;
    console.log('[conversation] router', JSON.stringify({ role, group: routed.group, tools: activeDecls.length }));
  } catch { /* keep full list on scope error */ }

  const body: any = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ functionDeclarations: activeDecls }],
    generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
  };
  let retriedEmpty = false;

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
    if (text) {
      // Persist the reply as an outbound row so the NEXT turn's loadHistory has a
      // 'model' turn to alternate against (otherwise history is all-user → empty).
      await (prisma as any).whatsAppMessage.create({
        data: {
          twilio_sid: null, direction: 'outbound',
          from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
          to_phone: phone, contact_phone: phone,
          body: text.slice(0, 2000), num_media: 0, status: 'agent_reply', is_read: true,
        },
      }).catch(() => {});
      return text;
    }
    // Empty candidate — log WHY (gemini-2.5 returns an empty candidate with
    // finishReason MALFORMED_FUNCTION_CALL when it fails to build a valid call,
    // or blocks on safety). This is what surfaces as an unhelpful "not sure".
    try {
      console.warn('[conversation] EMPTY', JSON.stringify({
        iter,
        finishReason: cand?.finishReason,
        block: data?.promptFeedback?.blockReason,
        candN: data?.candidates?.length,
        contentsN: contents.length,
        toolsN: TOOL_DECLARATIONS.length,
      }).slice(0, 500));
    } catch { /* noop */ }
    // gemini-2.5 intermittently returns an EMPTY candidate (finishReason STOP or
    // MALFORMED_FUNCTION_CALL) — often transient, or the model choked on the tool
    // list for a particular phrasing. Retry the SAME request once (usually
    // succeeds); if it's still empty, drop the tools so the user at least gets a
    // plain-text answer instead of the unhelpful "not sure".
    if (!retriedEmpty) {
      retriedEmpty = true;
      continue;
    }
    if ((body as any).tools) {
      delete (body as any).tools;
      continue;
    }
    return '🤔 לא בטוח איך לעזור עם זה. תוכל להרחיב?';
  }
  return '🤔 התקבלו יותר מדי קריאות לכלים. נסה שוב עם בקשה פשוטה יותר.';
}
