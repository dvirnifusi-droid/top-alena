// WhatsApp-driven onboarding for freshly-provisioned tenants.
//
// v4 (2026-07-06): "העוזר החכם". A single AI brain runs the whole setup as a
// natural Hebrew conversation — ONE atomic question at a time (name, then
// address, then hours, ...), never a numbered menu. It's dual-mode: it guides
// step-by-step AND answers the owner's questions like real customer service,
// then gently continues. Any input works at any time — free text, voice
// (transcribed upstream in the webhook), or a file (menu photo, work schedule,
// employee list, checklist PDF). Files are auto-CLASSIFIED and embedded into
// the right place. The extractor + persist helpers are reused from v3.

import { PrismaClient } from '@prisma/client';
import { sendWhatsApp } from './twilio.js';

const prisma: any = new PrismaClient();

const HEB_DAYS: Record<string, number> = {
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
  'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5,
};

const sql = (q: string, ...args: any[]) => (prisma as any).$executeRawUnsafe(q, ...args);
const query = (q: string, ...args: any[]) => (prisma as any).$queryRawUnsafe(q, ...args);
const uuid = async () => (await import('node:crypto')).randomUUID();

// ===========================================================================
// v4 ORCHESTRATION — the AI brain
// ===========================================================================

// One-line human summary of what's already set up, injected into the brain
// each turn so it never re-asks something or loses track.
function summarizeState(data: Record<string, any>, tenant: any): string {
  const c = data._counts || {};
  const parts = [
    `שם: ${data.name || tenant.restaurant_name || '—'}`,
    `כתובת: ${data.address || '—'}`,
    `שעות: ${data.opening_hours || '—'}`,
    `מטבח: ${data.cuisine || '—'}`,
    `מנות בתפריט: ${c.menu ? `${c.menu} (הוטמע ✅)` : 0}`,
    `עובדים: ${c.employees || 0}${c.invited ? ` (+${c.invited} הזמנות)` : ''}`,
    `שולחנות: ${data.tables_count || c.tables || 0}${(Number(data.tables_count) || c.tables) ? ' (הוטמע ✅)' : ''}`,
  ];
  if (c.checklists) parts.push(`צ׳קליסטים: ${c.checklists}`);
  if (c.suppliers) parts.push(`ספקים: ${c.suppliers}`);
  if (c.customers) parts.push(`לקוחות במועדון: ${c.customers}`);
  if (c.knowledge) parts.push(`מסמכי ידע: ${c.knowledge}`);
  if (c.invoice_email) parts.push(`מייל חשבוניות: הוגדר`);
  return parts.join('\n');
}

// Returns the SINGLE next thing still missing, so the brain asks one atomic
// question. Core first (name→address→hours→cuisine→menu→employees→tables),
// then EVERY optional module (each skippable), then "ready to finish". The
// brain must walk through all of these — it must NOT jump to finished until
// every module below was offered (tracked via data._done_modules) or the owner
// explicitly says they're done.
const SKIP_RE = /(דלג|דלגי|אחר כך|אחרי זה|לא צריך|לא עכשיו|אין לי|אין|בהמשך|תמשיך|הבא)/i;
const DONE_RE = /(סיימתי|זה הכל|זהו|מספיק|תסיים|סיים|גמרנו|נגמר|די)/i;

// The brain returns this generic fallback when the LLM yields no usable reply
// (it does NOT throw, so a plain .catch() won't help). After a SUCCESSFUL
// import that reads terrible to the owner ("sorry, say that again?") — so use a
// deterministic success line instead whenever the brain falls back or is empty.
const BRAIN_FALLBACK_RE = /אפשר לכתוב לי את זה שוב|סליחה, רגע/;
function pickReply(brainResult: any, deterministic: string): string {
  const rep = brainResult && brainResult.reply;
  return rep && !BRAIN_FALLBACK_RE.test(rep) ? rep : deterministic;
}

// Optional modules in order. `done` = already satisfied; `offer` = how the
// brain should present it (one atomic question).
const MODULES: Array<{ key: string; done: (c: any, d: any) => boolean; offer: string }> = [
  { key: 'website', done: (c, d) => !!d._website_done, offer: 'אתר אינטרנט של העסק — אם יש, בקש שישלח את הקישור ואתה תמשוך ממנו תפריט + פרטי עסק (שם/כתובת/שעות/מטבח) אוטומטית. (אפשר "אין לי")' },
  { key: 'menu', done: (c) => c.menu > 0, offer: 'תפריט — בקש שישלח צילום או PDF ואתה תקרא את כל המנות. (אם כבר משכנו מאתר, דלג). (אפשר "אחר כך")' },
  { key: 'seating', done: (c, d) => c.seating > 0 || c.tables > 0 || d.tables_count != null, offer: 'הושבה — שאל כמה שולחנות יש בערך, *או* הצע שישלח צילום/סקיצה של מפת ההושבה אם יש לו ואתה תבנה אותה. (אפשר "אחר כך")' },
  { key: 'employees', done: (c) => c.employees > 0 || c.invited > 0, offer: 'עובדים — הוא יכול לשלוח רשימה או קובץ, *או* שתיתן לו קישור הצטרפות אחד שכל עובד נרשם דרכו לבד (action=send_join_link). (אפשר "אחר כך")' },
  { key: 'roles', done: (c) => c.roles > 0, offer: 'תפקידים במסעדה — רשימה מופרדת בפסיק, *או* קובץ סידור עבודה קיים שאזהה ממנו תפקידים, *או* שאבנה תפקידים לפי סוג העסק (action=suggest_roles). (אפשר "אחר כך")' },
  { key: 'checklists', done: (c) => c.checklists > 0, offer: 'צ׳קליסטים תפעוליים — קובץ קיים, *או* שאבנה לו צ׳קליסטים לפי סוג העסק (action=suggest_checklists). (אפשר "אחר כך")' },
  { key: 'suppliers', done: (c) => c.suppliers > 0, offer: 'ספקים שהוא עובד איתם — שורה לכל ספק (שם, קטגוריה, טלפון). (אפשר "אחר כך")' },
  { key: 'training', done: (c) => c.training > 0, offer: 'תוכנית הכשרת צוות — קובץ קיים, *או* שאבנה לו תוכנית לפי סוג העסק (action=suggest_training). (אפשר "אחר כך")' },
  { key: 'customers', done: (c) => c.customers > 0, offer: 'מועדון לקוחות — אם יש לו קובץ לקוחות מאושר דיוור, שישלח ואייבא. (אפשר "אחר כך")' },
  { key: 'knowledge', done: (c) => c.knowledge > 0, offer: 'מרכז ידע ל-AI — קבצים של נהלים/מתכונים/שאלות נפוצות שה-AI ישתמש בהם. שישלח אחד-אחד. (אפשר "אחר כך")' },
  { key: 'slots', done: (c) => c.slots > 0, offer: 'סלוטים לראיונות עבודה — ימים ושעות שנוח לו לראיין (למשל "שני 14:00"). (אפשר "אחר כך")' },
  { key: 'invoice', done: (c, d) => !!c.invoice_email || !!d._invoice_setup_sent, offer: 'איסוף חשבוניות ספקים אוטומטי מהמייל — זה דורש חיבור חד-פעמי של תיבת Gmail עם סיסמת-אפליקציה, אז אל תבקש כתובת; במקום זה הצע action=send_invoice_setup ואתה תשלח לו קישור הגדרה + הדרכה קצרה. (אפשר "אחר כך")' },
];

// Clean, user-facing question per topic — used as a deterministic fallback so
// the conversation ADVANCES even if the LLM turn fails (never "say that again"
// forever).
const FALLBACK_Q: Record<string, string> = {
  name: 'איך קוראים למסעדה?',
  address: 'מה הכתובת המדויקת? (רחוב, מספר, עיר)',
  hours: 'מה שעות הפתיחה?',
  cuisine: 'מה סוג המטבח?',
  website: 'יש לעסק אתר אינטרנט? שלח לי את הקישור ואמשוך ממנו פרטים — או כתוב "אין לי".',
  menu: 'יש לך תפריט? שלח צילום או PDF ואקרא את המנות — או "אחר כך".',
  seating: 'כמה שולחנות יש בערך? (אפשר גם לשלוח צילום מפת הושבה, או "אחר כך")',
  employees: 'רוצה להוסיף עובדים? שלח רשימה, או שאשלח קישור שכל עובד נרשם דרכו לבד. (או "אחר כך")',
  roles: 'אילו תפקידים יש במסעדה? (רשימה מופרדת בפסיק, או "אחר כך")',
  checklists: 'רוצה צ׳קליסטים תפעוליים? שלח קובץ קיים, או שאבנה לפי סוג העסק. (או "אחר כך")',
  suppliers: 'עם אילו ספקים אתה עובד? (שורה לכל ספק: שם, קטגוריה, טלפון — או "אחר כך")',
  training: 'יש תוכנית הכשרת צוות? שלח קובץ, או שאבנה לפי סוג העסק. (או "אחר כך")',
  customers: 'יש קובץ מועדון לקוחות (מאושר דיוור)? שלח אותו. (או "אחר כך")',
  knowledge: 'רוצה להעלות קבצי ידע ל-AI (נהלים/מתכונים/שאלות נפוצות)? שלח אחד-אחד. (או "אחר כך")',
  slots: 'אילו ימים ושעות נוח לך לראיין מועמדים? (למשל "שני 14:00", או "אחר כך")',
  invoice: 'רוצה איסוף חשבוניות אוטומטי מהמייל? כתוב "כן" ואשלח קישור הגדרה. (או "אחר כך")',
  finish: 'עברנו על הכל! 🎉 סיימנו את ההקמה.',
};
function fallbackReply(nm: { key: string; offer: string }): string {
  const q = FALLBACK_Q[nm.key];
  return q ? (nm.key === 'finish' ? q : `בוא נמשיך 🙂 ${q}`) : 'אפשר לכתוב לי את זה שוב? 🙏';
}

function nextMissing(data: Record<string, any>): { key: string; offer: string } {
  const c = data._counts || {};
  if (!data.name) return { key: 'name', offer: 'שם המסעדה' };
  if (!data.address) return { key: 'address', offer: 'כתובת מדויקת (רחוב, מספר, עיר)' };
  if (!data.opening_hours) return { key: 'hours', offer: 'שעות פתיחה' };
  if (!data.cuisine) return { key: 'cuisine', offer: 'סוג המטבח (בשורה אחת)' };
  const done = new Set<string>(Array.isArray(data._done_modules) ? data._done_modules : []);
  for (const m of MODULES) {
    if (done.has(m.key)) continue;
    if (m.done(c, data)) continue;
    return { key: m.key, offer: m.offer };
  }
  return { key: 'finish', offer: 'עברת על הכל — עכשיו סמן finished=true, סכם בקצרה מה הוקם, והציע את הקישור לאפליקציה' };
}

// The brain. Given history + state + the owner's message, returns the natural
// reply + any structured data the owner just gave.
async function onboardingBrain(
  tenant: any, history: any[], message: string, data: Record<string, any>,
): Promise<any> {
  const { invokeLLM } = await import('./llm.js');
  const convo = (history || []).slice(-12).map((t) => `${t.role === 'assistant' ? 'עוזר' : 'בעלים'}: ${t.content}`).join('\n');
  const nm = nextMissing(data);
  const joinLink = `https://${tenant.slug}.topalena.com/JoinTeam`;
  const prompt =
    `אתה "העוזר החכם" של TOP APOLLO — מקים מסעדה בשם "${data.name || tenant.restaurant_name}" עבור ${tenant.owner_name || 'הבעלים'}.\n` +
    `דבר עברית טבעית, חמה ואנושית — כמו נציג אמיתי, לא בוט.\n\n` +
    `## חוקים\n` +
    `1. שאל שאלה אחת אטומית בכל פעם. לעולם אל תקבץ כמה דברים בשאלה אחת.\n` +
    `2. אם הבעלים שואל אותך שאלה — ענה כמו שירות לקוחות אמיתי, קצר ומדויק, ואז חזור בעדינות לשאלה הבאה.\n` +
    `3. קבל כל תשובה בשפה חופשית וחלץ את הערך. אל תמציא.\n` +
    `4. **חשוב מאוד: עבור על כל הנושאים לפי הסדר — אל תדלג ואל תסיים מוקדם.** רק אם עברת על כל הנושאים, או אם הבעלים אמר במפורש "סיימתי/זה הכל/מספיק", סמן finished=true. אחרת finished=false תמיד.\n` +
    `5. אם הבעלים אומר "דלג"/"אחר כך"/"אין לי" על הנושא הנוכחי — עבור לנושא הבא (המערכת תזכור שדילג).\n` +
    `6. תגובות קצרות (משפט-שניים) + אימוג'י אחד. חם אבל לא מוגזם.\n` +
    `7. **אל תתייחס לכשלים/תקלות קודמים בשיחה ואל תמציא בעיות.** אם פריט מופיע ב"מה כבר הוקם" עם "(הוטמע ✅)" או מספר > 0 — הוא כבר נקלט בהצלחה; אל תבקש אותו שוב ואל תגיד שהמערכת לא הצליחה למשוך אותו.\n\n` +
    `## קישור הצטרפות עובדים של המסעדה (השתמש בו רק אם הצעת action=send_join_link):\n${joinLink}\n\n` +
    `## מה כבר הוקם\n${summarizeState(data, tenant)}\n\n` +
    `## הנושא הנוכחי — שאל עליו עכשיו (asking="${nm.key}"):\n${nm.offer}\n\n` +
    `## השיחה עד כה\n${convo || '(ההתחלה)'}\n\n` +
    `## ההודעה של הבעלים עכשיו\n"${message}"\n\n` +
    `החזר JSON:\n` +
    `- reply: מה לשלוח\n` +
    `- profile: שדות שהבעלים נתן עכשיו (רק אלה שהופיעו)\n` +
    `- list_kind + list_text: אם נתן רשימה בטקסט (list_kind = employees/suppliers/roles/interview_slots/invoice_emails, list_text = הטקסט)\n` +
    `- action: אם הבעלים ביקש שתבנה לו — suggest_roles / suggest_checklists / suggest_training. אם ביקש קישור לעובדים — send_join_link. אם הנושא הוא איסוף חשבוניות מהמייל — send_invoice_setup. אחרת "".\n` +
    `- asking: "${nm.key}" (הנושא שאתה שואל עליו עכשיו)\n` +
    `- finished: true רק אם עברתם על הכל או שהבעלים אמר "סיימתי".`;

  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        profile: {
          type: 'object',
          properties: {
            name: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' },
            opening_hours: { type: 'string' }, cuisine: { type: 'string' }, description: { type: 'string' },
            employee_count: { type: 'string' }, tables_count: { type: 'string' },
          },
        },
        list_kind: { type: 'string' }, // '' | employees | suppliers | roles | invoice_emails
        list_text: { type: 'string' },
        action: { type: 'string' }, // '' | suggest_roles | suggest_checklists | suggest_training | send_join_link
        asking: { type: 'string' },
        finished: { type: 'boolean' },
      },
      required: ['reply'],
    },
    // gemini-2.5-pro is a THINKING model — reasoning tokens count against this
    // budget. 2048 got fully consumed by thinking, leaving an empty/truncated
    // JSON body → parse failure → no reply → the fallback fired every turn.
    maxOutputTokens: 8192,
    timeoutMs: 45_000,
    _ctx: { fn_name: 'onboardingBrain', tenant_slug: tenant.slug },
  });
  const out = result && result.reply ? result : { reply: fallbackReply(nm), asking: nm.key };
  if (!out.asking) out.asking = nm.key;
  return out;
}

// Runs a brain-requested action (AI suggestion / join link). Returns a short
// human note to append to the reply, or ''.
async function runBrainAction(tenant: any, action: string, data: Record<string, any>): Promise<string> {
  data._counts = data._counts || {};
  try {
    if (action === 'suggest_checklists') {
      const n = await aiSuggestChecklists(tenant, data); data._counts.checklists = (data._counts.checklists || 0) + n;
      return n ? `\n\n✅ בניתי לך ${n} צ׳קליסטים לפי סוג העסק (טיוטות — אפשר לערוך באפליקציה).` : '';
    }
    if (action === 'suggest_roles') {
      const n = await aiSuggestRoles(tenant, data); data._counts.roles = (data._counts.roles || 0) + n;
      return n ? `\n\n✅ הוספתי ${n} תפקידים מתאימים לעסק שלך.` : '';
    }
    if (action === 'suggest_training') {
      const n = await aiSuggestTraining(tenant, data); data._counts.training = (data._counts.training || 0) + n;
      return n ? `\n\n✅ בניתי תוכנית הכשרה (${n} פרקים) במרכז הידע.` : '';
    }
    if (action === 'send_join_link') {
      data._counts.invited = data._counts.invited || 1; // mark employees handled via link
      return `\n\n🔗 הנה קישור ההצטרפות לצוות — שתף אותו בקבוצת העובדים, כל אחד נרשם לבד ואתה מאשר:\nhttps://${tenant.slug}.topalena.com/JoinTeam`;
    }
    if (action === 'send_invoice_setup') {
      data._invoice_setup_sent = true; // module handled — don't re-ask
      return (
        `\n\n🧾 כדי שאאסוף חשבוניות ספקים אוטומטית מהמייל, צריך לחבר תיבת Gmail פעם אחת:\n` +
        `1️⃣ היכנס ל-https://myaccount.google.com/apppasswords (דורש אימות דו-שלבי פעיל)\n` +
        `2️⃣ צור סיסמת אפליקציה בשם *TOP APOLLO* והעתק אותה (16 תווים)\n` +
        `3️⃣ הדבק אותה + כתובת ה-Gmail כאן:\nhttps://${tenant.slug}.topalena.com/EmailInvoiceSettings\n\n` +
        `מרגע החיבור אני סורק כל 10 דקות ומכניס חשבוניות ל"בהמתנה" לאישורך.`
      );
    }
  } catch (e: any) {
    console.warn(`[onboarding] action ${action}:`, e?.message);
  }
  return '';
}

// Applies the brain's extraction to the tenant schema (profile scalars +
// text lists). Reuses v3 persist helpers. Mutates + returns `data`.
async function applyExtraction(tenant: any, result: any, data: Record<string, any>): Promise<Record<string, any>> {
  const p = result?.profile || {};
  for (const k of ['name', 'address', 'phone', 'opening_hours', 'cuisine', 'description', 'employee_count', 'tables_count']) {
    if (p[k] != null && String(p[k]).trim()) data[k] = String(p[k]).trim();
  }
  // Persist core profile as soon as we have a name — a drop-off still yields a
  // set-up app. Cheap + idempotent (COALESCE update).
  if (data.name || data.address) {
    await persistCoreData(tenant, data).catch((e: any) => console.warn('[onboarding] core persist:', e?.message));
    data._counts = data._counts || {};
    if (Number(data.tables_count) > 0) data._counts.tables = Number(data.tables_count);
  }
  data._counts = data._counts || {};
  const kind = String(result?.list_kind || '').trim();
  const text = String(result?.list_text || '').trim();
  if (kind && text) {
    try {
      if (kind === 'employees') data._counts.employees = (data._counts.employees || 0) + await insertEmployeesFromText(tenant, text);
      else if (kind === 'suppliers') data._counts.suppliers = (data._counts.suppliers || 0) + await insertSuppliersFromText(tenant, text);
      else if (kind === 'roles') data._counts.roles = (data._counts.roles || 0) + await insertRolesFromText(tenant, text);
      else if (kind === 'interview_slots') data._counts.slots = (data._counts.slots || 0) + await insertInterviewSlots(tenant, text);
      else if (kind === 'invoice_emails') {
        const emails = text.split(/[,\s]+/).filter((e) => /\S+@\S+\.\S+/.test(e));
        if (emails.length) { await saveInvoiceEmails(tenant, emails); data._counts.invoice_email = emails.length; }
      }
    } catch (e: any) {
      console.warn(`[onboarding] apply list ${kind}:`, e?.message);
    }
  }
  return data;
}

const KIND_LABEL: Record<string, string> = {
  menu: 'תפריט', work_schedule: 'סידור עבודה', employee_list: 'רשימת עובדים',
  checklist: 'צ׳קליסט', customer_list: 'מועדון לקוחות', knowledge: 'מסמך ידע',
  seating_map: 'מפת הושבה', other: 'מסמך',
};

// NOTE: never use \b next to Hebrew — JS \b is defined by [A-Za-z0-9_], which
// excludes Hebrew, so "כן\b" NEVER matches. That silently broke every Hebrew
// confirmation (file/website/seating "כן" fell through to the drop path).
// Use a negative lookahead for a following letter instead — Hebrew-safe.
const CONFIRM_YES_RE = /^\s*(כן|אישור|נכון|בסדר|סבבה|יאללה|אוקי+|ok|yes|בטח|מטמיע|תטמיע|יופי|מעולה)(?![א-תa-z])/i;

// Owner-correction → kind. If the classifier guessed wrong and the owner says
// "לא, זה סידור עבודה", this re-routes to the right extractor.
const KIND_KEYWORDS: Array<[RegExp, string]> = [
  [/תפריט|מנות|אוכל|menu/i, 'menu'],
  [/סידור|משמרת|משמרות|שיבוץ|schedule/i, 'work_schedule'],
  [/עובד|צוות|employee/i, 'employee_list'],
  [/צ.?ק.?ליסט|checklist|משימות/i, 'checklist'],
  [/לקוח|מועדון|customer/i, 'customer_list'],
  [/הושבה|שולחנות|מפה|סקיצה|seating/i, 'seating_map'],
  [/ידע|נוהל|מתכון|מסמך|knowledge/i, 'knowledge'],
];
function matchKind(text: string): string {
  for (const [re, k] of KIND_KEYWORDS) if (re.test(text)) return k;
  return '';
}

// Classify a file WITHOUT importing — returns the guessed kind, a confidence,
// and a 2-3 item sample of what the AI actually sees. Used to CONFIRM with the
// owner before anything is saved (reliability across arbitrary file formats).
async function classifyFile(tenant: any, mediaUrl: string): Promise<{ kind: string; confidence: string; sample: string[] }> {
  const { invokeLLM } = await import('./llm.js');
  const c: any = await invokeLLM({
    prompt:
      `הקובץ המצורף שייך למסעדה. סווג אותו לאחת מהקטגוריות:\n` +
      `menu (תפריט אוכל/שתייה), work_schedule (סידור עבודה/משמרות), employee_list (רשימת עובדים), ` +
      `checklist (צ׳קליסט תפעולי), customer_list (רשימת לקוחות/מועדון), seating_map (מפת הושבה/סקיצת שולחנות), ` +
      `knowledge (נוהל/מתכון/מסמך ידע/שאלות נפוצות), other.\n` +
      `החזר: kind, confidence (high/medium/low לפי כמה ברור), ו-sample — 2-3 דוגמאות קצרות ממה שאתה בפועל רואה בקובץ (שמות מנות / תפקידים / שמות עובדים / משימות / מספרי שולחנות). אל תמציא — רק מה שכתוב.`,
    fileUrls: [mediaUrl],
    responseSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        confidence: { type: 'string' },
        sample: { type: 'array', items: { type: 'string' } },
      },
      required: ['kind'],
    },
    timeoutMs: 45_000,
    _ctx: { fn_name: 'onboardingClassify', tenant_slug: tenant.slug },
  }).catch(() => ({ kind: 'other', confidence: 'low', sample: [] }));
  return {
    kind: String(c?.kind || 'other').trim(),
    confidence: String(c?.confidence || 'medium').toLowerCase(),
    sample: Array.isArray(c?.sample) ? c.sample.map((s: any) => String(s)).slice(0, 3) : [],
  };
}

// Runs the right extractor for a confirmed kind and updates counts.
async function importByKind(tenant: any, kind: string, mediaUrl: string, data: Record<string, any>): Promise<number> {
  data._counts = data._counts || {};
  let count = 0;
  try {
    if (kind === 'menu') { count = await extractAndInsertMenu(tenant, mediaUrl); data._counts.menu = (data._counts.menu || 0) + count; }
    else if (kind === 'work_schedule') { count = await extractAndInsertRolesFromFile(tenant, mediaUrl); data._counts.roles = (data._counts.roles || 0) + count; }
    else if (kind === 'employee_list') { count = await extractAndInsertEmployeesFromFile(tenant, mediaUrl); data._counts.employees = (data._counts.employees || 0) + count; }
    else if (kind === 'checklist') { count = await extractAndInsertChecklists(tenant, mediaUrl, data); data._counts.checklists = (data._counts.checklists || 0) + count; }
    else if (kind === 'customer_list') { count = await extractAndInsertCustomers(tenant, mediaUrl); data._counts.customers = (data._counts.customers || 0) + count; }
    else if (kind === 'seating_map') { count = await extractAndInsertSeating(tenant, mediaUrl); data._counts.seating = (data._counts.seating || 0) + count; }
    else { count = await extractAndInsertKnowledge(tenant, mediaUrl, 'כללי'); data._counts.knowledge = (data._counts.knowledge || 0) + count; }
  } catch (e: any) {
    console.warn(`[onboarding] import ${kind}:`, e?.message);
  }
  return count;
}

// === Public API ============================================================

export async function startOnboarding(tenantId: string): Promise<void> {
  await ensureOnboardingRow(tenantId);
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const first =
    `שלום ${tenant.owner_name || ''}! 🌿 אני העוזר החכם של TOP APOLLO, ואני אקים לך את המסעדה תוך כמה דקות — ` +
    `שאלה אחת בכל פעם. אפשר לענות בכתב, בהקלטה קולית, או פשוט לשלוח לי קבצים (תפריט, סידור עבודה, רשימת עובדים...) ואני אקרא ואטמיע לבד.\n\n` +
    `🌐 יש לעסק *אתר אינטרנט*? שלח לי עכשיו את הקישור ואמשוך ממנו לבד את רוב הפרטים — תפריט, כתובת, שעות ועוד.\n\n` +
    `או שנתחיל ידני — *איך קוראים למסעדה?*`;
  const data: Record<string, any> = { _history: [{ role: 'assistant', content: first }] };
  await setPhase(tenantId, 'active', data);
  await sendWhatsApp(tenant.owner_phone, first);
}

// Text turn (also used by the webhook for transcribed voice notes).
export async function tryHandleOnboardingMessage(fromPhone: string, body: string): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  const data: Record<string, any> = state.collected_data || {};
  const history: any[] = Array.isArray(data._history) ? data._history : [];

  // ── Pending file confirmation? The owner just got "נראה לי שזה תפריט,
  // לאשר?" — interpret their reply BEFORE the normal brain flow.
  if (data._pending_file?.url) {
    const pf = data._pending_file;
    const corrected = matchKind(body);
    const confirmed = CONFIRM_YES_RE.test(body.trim());
    if (confirmed || corrected) {
      const kind = corrected || pf.kind;
      const count = await importByKind(tenant, kind, pf.url, data).catch(() => 0);
      delete data._pending_file;
      history.push({ role: 'user', content: body });
      const synthetic = count > 0
        ? `[הבעלים אישר. הטמעת ${count} פריטים מסוג ${KIND_LABEL[kind] || kind}. הודה לו בקצרה (ציין את המספר), ואז המשך לשאלה הבאה שחסרה.]`
        : `[ניסית לקרוא ${KIND_LABEL[kind] || kind} אבל לא זוהו פריטים. בקש מהבעלים לשלוח צילום ברור יותר או להמשיך.]`;
      const r = await onboardingBrain(tenant, history, synthetic, data).catch(() => null);
      await applyExtraction(tenant, r || {}, data).catch(() => {});
      const reply = pickReply(r, count > 0 ? `✅ קלטתי ${count} פריטים! נמשיך.` : 'לא הצלחתי לקרוא את הקובץ 🤔 אפשר לשלוח שוב ברור יותר?');
      history.push({ role: 'assistant', content: reply });
      data._history = history.slice(-24);
      const fin = !!(r && r.finished) && !!data.name;
      if (fin) {
        await persistCoreData(tenant, data).catch(() => null);
        await setPhase(state.tenant_id, 'done', data);
        await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data));
      } else {
        await setPhase(state.tenant_id, 'active', data);
        await sendWhatsApp(fromPhone, reply);
      }
      return true;
    }
    // Not a confirm/correction — the owner moved on. Drop the pending file and
    // treat this message normally.
    delete data._pending_file;
  }

  // ── Pending WEBSITE import confirmation? The owner pasted a URL, we pulled
  // menu + details and asked "לאשר?". Interpret their reply before the brain.
  if (data._pending_website?.url) {
    const pw = data._pending_website;
    if (CONFIRM_YES_RE.test(body.trim())) {
      const b = pw.business || {};
      for (const k of ['name', 'address', 'phone', 'opening_hours', 'cuisine', 'description']) {
        if (b[k] != null && String(b[k]).trim() && !data[k]) data[k] = String(b[k]).trim();
      }
      await persistCoreData(tenant, data).catch(() => {});
      const menuN = await insertDishes(tenant, Array.isArray(pw.dishes) ? pw.dishes : []).catch(() => 0);
      data._counts = data._counts || {};
      data._counts.menu = (data._counts.menu || 0) + menuN;
      data._website_done = true;
      delete data._pending_website;
      history.push({ role: 'user', content: body });
      const labels: Record<string, string> = { name: 'שם', address: 'כתובת', opening_hours: 'שעות', cuisine: 'מטבח' };
      const got = ['name', 'address', 'opening_hours', 'cuisine'].filter((k) => b[k]).map((k) => labels[k]).join(', ');
      const synthetic = `[הבעלים אישר ייבוא מהאתר. הוטמעו ${menuN} מנות${got ? ` ופרטי העסק (${got})` : ''}. הודה בקצרה וציין את המספר, ואז המשך לשאלה הבאה שחסרה.]`;
      const r = await onboardingBrain(tenant, history, synthetic, data).catch(() => null);
      await applyExtraction(tenant, r || {}, data).catch(() => {});
      const reply = pickReply(r, `✅ מעולה! הטמעתי ${menuN} מנות${got ? ` + פרטי העסק (${got})` : ''} מהאתר. נמשיך! 🙂`);
      history.push({ role: 'assistant', content: reply });
      data._history = history.slice(-24);
      await setPhase(state.tenant_id, 'active', data);
      await sendWhatsApp(fromPhone, reply);
      return true;
    }
    // Not "כן" — drop the pending import and treat this message normally.
    delete data._pending_website;
    data._website_done = true;
  }

  // ── Pending SEATING approval? We showed the extracted layout and asked to
  // approve before embedding. Confirm → embed + visual-edit link; a correction
  // to another kind → reroute the same file; otherwise drop and continue.
  if (data._pending_seating?.tables) {
    const ps = data._pending_seating;
    const corrected = matchKind(body);
    if (CONFIRM_YES_RE.test(body.trim()) || corrected === 'seating_map') {
      const n = await insertSeatingTables(tenant, ps.tables).catch(() => 0);
      data._counts = data._counts || {};
      data._counts.seating = (data._counts.seating || 0) + n;
      data._done_modules = Array.isArray(data._done_modules) ? data._done_modules : [];
      if (!data._done_modules.includes('seating')) data._done_modules.push('seating');
      delete data._pending_seating;
      history.push({ role: 'user', content: body });
      const editLink = `https://${tenant.slug}.topalena.com/SeatingSetup`;
      const synthetic = `[הבעלים אישר את מפת ההושבה. הוטמעו ${n} שולחנות. הודה בקצרה, ציין שאפשר לגרור ולערוך הכל ויזואלית בקישור ${editLink}, ואז המשך לשאלה הבאה שחסרה.]`;
      const r = await onboardingBrain(tenant, history, synthetic, data).catch(() => null);
      await applyExtraction(tenant, r || {}, data).catch(() => {});
      const reply = pickReply(r, `✅ הטמעתי ${n} שולחנות! אפשר לגרור ולערוך את המפה כאן:\n${editLink}\nנמשיך.`);
      history.push({ role: 'assistant', content: reply });
      data._history = history.slice(-24);
      await setPhase(state.tenant_id, 'active', data);
      await sendWhatsApp(fromPhone, reply);
      return true;
    }
    if (corrected && ps.url) {
      // Owner says the file is actually something else — reroute it.
      const count = await importByKind(tenant, corrected, ps.url, data).catch(() => 0);
      delete data._pending_seating;
      history.push({ role: 'user', content: body });
      const synthetic = count > 0
        ? `[הבעלים תיקן — הקובץ הוא ${KIND_LABEL[corrected] || corrected}. הוטמעו ${count} פריטים. הודה בקצרה והמשך לשאלה הבאה.]`
        : `[ניסית לקרוא ${KIND_LABEL[corrected] || corrected} אבל לא זוהו פריטים. בקש צילום ברור יותר או המשך.]`;
      const r = await onboardingBrain(tenant, history, synthetic, data).catch(() => null);
      await applyExtraction(tenant, r || {}, data).catch(() => {});
      const reply = pickReply(r, count > 0 ? `✅ קלטתי ${count} פריטים! נמשיך.` : 'לא הצלחתי לקרוא 🤔 אפשר לשלוח שוב ברור יותר?');
      history.push({ role: 'assistant', content: reply });
      data._history = history.slice(-24);
      await setPhase(state.tenant_id, 'active', data);
      await sendWhatsApp(fromPhone, reply);
      return true;
    }
    // Not a confirm/known correction — drop the preview and treat normally.
    delete data._pending_seating;
  }

  // ── Owner pasted a website URL (and we haven't imported/attempted yet)?
  // ACK fast, then fetch + extract menu & details in the BACKGROUND and come
  // back with a confirm-before-embed summary. The fetch can take up to ~90s —
  // it must NOT block the webhook (Twilio retries after 15s → double-process).
  const urlHit = !data._website_done && !data._pending_website && !data._website_fetching
    ? body.match(/(https?:\/\/[^\s]+|www\.[^\s.]+\.[^\s]+)/i) : null;
  if (urlHit) {
    let url = urlHit[1].replace(/[.,)]+$/, '');
    if (/^www\./i.test(url)) url = 'https://' + url;
    history.push({ role: 'user', content: body });
    data._website_fetching = true;
    data._history = history.slice(-24);
    await setPhase(state.tenant_id, 'active', data);
    await sendWhatsApp(fromPhone, '🔎 רגע, נכנס לאתר ומושך ממנו תפריט ופרטים...');
    void (async () => {
      const ext = await extractFromWebsite(tenant, url).catch(() => null);
      // Reload the latest state (the owner may have sent another message).
      const fresh = await findActiveOnboarding(fromPhone).catch(() => null);
      const d: Record<string, any> = fresh?.collected_data || data;
      const h: any[] = Array.isArray(d._history) ? d._history : history;
      delete d._website_fetching;
      const hasBiz = !!ext && ext.business && Object.keys(ext.business).some((k) => ext.business[k]);
      if (ext && (ext.dishes.length || hasBiz)) {
        d._pending_website = { url, business: ext.business, dishes: ext.dishes };
        const b = ext.business || {};
        const detail = [b.name && `שם: ${b.name}`, b.address && `כתובת: ${b.address}`, b.opening_hours && `שעות: ${b.opening_hours}`, b.cuisine && `מטבח: ${b.cuisine}`, b.phone && `טלפון: ${b.phone}`].filter(Boolean).join('\n');
        const sample = ext.dishes.slice(0, 4).map((x: any) => String(x?.name || '')).filter(Boolean).join('* · *');
        const msg =
          `מצאתי באתר 🌐\n${detail || '(לא זוהו פרטי עסק)'}\n\n` +
          (ext.dishes.length ? `🍽 *${ext.dishes.length} מנות*${sample ? ` (למשל: *${sample}*)` : ''}\n\n` : 'לא זיהיתי תפריט מהאתר.\n\n') +
          `שאטמיע את הכל? כתוב *כן* לאישור, או *לא*. (אפשר גם לשלוח צילום תפריט במקום)`;
        h.push({ role: 'assistant', content: msg });
        d._history = h.slice(-24);
        await setPhase(state.tenant_id, 'active', d).catch(() => {});
        await sendWhatsApp(fromPhone, msg).catch(() => {});
      } else {
        d._website_done = true;
        const msg = 'לא הצלחתי למשוך תוכן מהאתר 🤔 אם בא לך שלח לי צילום או PDF של התפריט ואקרא אותו — או שנמשיך הלאה.';
        h.push({ role: 'assistant', content: msg });
        d._history = h.slice(-24);
        await setPhase(state.tenant_id, 'active', d).catch(() => {});
        await sendWhatsApp(fromPhone, msg).catch(() => {});
      }
    })();
    return true;
  }

  history.push({ role: 'user', content: body });

  // If the owner skipped the current topic, remember it so we don't re-ask.
  if (SKIP_RE.test(body) && data._asking && data._asking !== 'name' && data._asking !== 'address' && data._asking !== 'hours' && data._asking !== 'cuisine') {
    data._done_modules = Array.isArray(data._done_modules) ? data._done_modules : [];
    if (!data._done_modules.includes(data._asking)) data._done_modules.push(data._asking);
  }

  const result = await onboardingBrain(tenant, history, body, data)
    .catch((e: any) => { console.warn('[onboarding] brain:', e?.message); return { reply: 'סליחה, רגע קטן... אפשר לכתוב שוב? 🙏' }; });
  await applyExtraction(tenant, result, data).catch((e: any) => console.warn('[onboarding] apply:', e?.message));

  // Run any AI action the owner asked for (build checklists/roles/training,
  // or send the employee join link) and append its result to the reply.
  let reply = result.reply;
  if (result.action) {
    const note = await runBrainAction(tenant, String(result.action), data);
    if (note) reply = `${reply}${note}`;
  }
  // Track the topic being asked so the NEXT turn can honor a skip.
  if (result.asking) data._asking = String(result.asking);

  history.push({ role: 'assistant', content: reply });
  data._history = history.slice(-24);

  // Finish ONLY when everything was covered OR the owner explicitly said so —
  // never just because the brain got eager (this is what caused early finish).
  const allCovered = nextMissing(data).key === 'finish';
  const finished = !!data.name && (!!result.finished && (allCovered || DONE_RE.test(body)));
  if (finished) {
    const summary = await persistCoreData(tenant, data).catch(() => null);
    data._counts = data._counts || {};
    if (summary?.tables) data._counts.tables = summary.tables;
    await setPhase(state.tenant_id, 'done', data);
    await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data));
  } else {
    await setPhase(state.tenant_id, 'active', data);
    await sendWhatsApp(fromPhone, reply);
  }
  return true;
}

// File turn — CLASSIFY ONLY, then ask the owner to confirm before embedding.
// Nothing is saved until the owner says "כן" (or corrects the kind). This is
// what makes it reliable across arbitrary file formats: the owner always sees
// what the AI understood + a real sample, and approves before anything lands.
export async function tryHandleOnboardingMedia(
  fromPhone: string, mediaUrl: string, _contentType: string,
): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  void (async () => {
    const data: Record<string, any> = state.collected_data || {};
    const history: any[] = Array.isArray(data._history) ? data._history : [];
    const { kind, confidence, sample } = await classifyFile(tenant, mediaUrl);
    // Seating sketch → extract the layout and show a real preview for approval
    // BEFORE embedding (step 4). One confirm (the layout), not two.
    if (kind === 'seating_map') {
      const tables = await extractSeatingTables(tenant, mediaUrl).catch(() => []);
      if (tables.length) {
        data._pending_seating = { url: mediaUrl, tables };
        const msg =
          `🪑 קיבלתי את הסקיצה ובניתי ממנה טיוטת מפה:\n*${seatingSummary(tables)}*\n\n` +
          `לאשר שאטמיע? כתוב *כן* — ותוכל אחר כך לגרור ולערוך הכל ויזואלית. אם לא זיהיתי נכון, תגיד לי מה זה (תפריט / עובדים / צ׳קליסט...).`;
        history.push({ role: 'user', content: '(שלח סקיצת הושבה)' });
        history.push({ role: 'assistant', content: msg });
        data._history = history.slice(-24);
        await setPhase(tenant.id, 'active', data).catch(() => {});
        await sendWhatsApp(fromPhone, msg).catch(() => {});
        return;
      }
      // extraction empty → fall through to the generic confirm below
    }
    // Stash the file so the owner's next reply ("כן" / "לא, זה תפריט") can act.
    data._pending_file = { url: mediaUrl, kind };
    const label = KIND_LABEL[kind] || 'מסמך';
    const sampleTxt = sample.length ? `\n\nראיתי בקובץ למשל: *${sample.join('* · *')}*` : '';
    const hedge = confidence === 'low' ? 'אני לא לגמרי בטוח, אבל ' : '';
    const msg =
      `📋 קיבלתי את הקובץ. ${hedge}נראה לי ש*זה ${label}*.${sampleTxt}\n\n` +
      `שאקרא ואטמיע את כולו? כתוב *כן* לאישור — או תגיד לי מה זה אם טעיתי (תפריט / סידור עבודה / עובדים / צ׳קליסט / לקוחות / מסמך ידע) 🙂`;
    history.push({ role: 'user', content: '(שלח קובץ)' });
    history.push({ role: 'assistant', content: msg });
    data._history = history.slice(-24);
    await setPhase(tenant.id, 'active', data).catch(() => {});
    await sendWhatsApp(fromPhone, msg).catch(() => {});
  })();

  return true;
}

async function setPhase(tenantId: string, phase: string, data: Record<string, any>): Promise<void> {
  await sql(
    `UPDATE "OnboardingState"
     SET current_step = $1, collected_data = $2::jsonb, last_message_at = NOW(),
         completed_at = ${phase === 'done' ? 'NOW()' : 'completed_at'}, "updatedAt" = NOW()
     WHERE tenant_id = $3`,
    phase, JSON.stringify(data), tenantId,
  );
}

// ===========================================================================
// PERSISTENCE + EXTRACTION HELPERS (reused from v3, unchanged)
// ===========================================================================

// Core profile + seating. Idempotent; safe to call repeatedly.
async function persistCoreData(
  tenant: any, data: Record<string, any>,
): Promise<{ profile: boolean; employees: number; tables: number }> {
  const slug = tenant.slug;
  const schema = `tenant_${slug}`;
  const summary = { profile: false, employees: 0, tables: 0 };
  const finalName = data.name && data.name !== '__KEEP__' ? String(data.name) : String(tenant.restaurant_name || slug);

  if (finalName !== tenant.restaurant_name) {
    await sql(`UPDATE "Tenant" SET restaurant_name = $1, "updatedAt" = NOW() WHERE id = $2`, finalName, tenant.id).catch(() => {});
  }

  try {
    for (const col of [
      `"address" TEXT`, `"city" TEXT`, `"phone" TEXT`, `"description" TEXT`,
      `"opening_hours" JSONB`, `"cuisine_style" TEXT`, `"business_type" TEXT`, `"business_context" TEXT`,
    ]) {
      await sql(`ALTER TABLE "${schema}"."RestaurantProfile" ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    const existing: any[] = await query(`SELECT id FROM "${schema}"."RestaurantProfile" LIMIT 1`);
    const hoursJson = JSON.stringify(String(data.opening_hours || ''));
    if (existing.length) {
      await sql(
        `UPDATE "${schema}"."RestaurantProfile" SET
           restaurant_name = $1, address = COALESCE($2, address), phone = COALESCE($3, phone),
           opening_hours = COALESCE($4::jsonb, opening_hours), cuisine_style = COALESCE($5, cuisine_style),
           description = COALESCE($6, description), "updatedAt" = NOW()
         WHERE id = $7`,
        finalName, data.address || null, data.phone || null,
        data.opening_hours ? hoursJson : null, data.cuisine || null, data.description || null, existing[0].id,
      );
    } else {
      await sql(
        `INSERT INTO "${schema}"."RestaurantProfile"
           ("id", "restaurant_name", "address", "phone", "opening_hours", "cuisine_style", "description", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())`,
        await uuid(), finalName, data.address || null, data.phone || null,
        data.opening_hours ? hoursJson : JSON.stringify(''), data.cuisine || null, data.description || null,
      );
    }
    summary.profile = true;
  } catch (e: any) {
    console.warn('[onboarding] profile persist failed:', e?.message);
  }

  const tableCount = Number(data.tables_count) || 0;
  if (tableCount > 0 && tableCount <= 200) {
    try {
      const existing: any[] = await query(`SELECT COUNT(*)::int AS n FROM "${schema}"."SeatingLayout"`);
      if ((existing[0]?.n || 0) === 0) {
        const tables = Array.from({ length: tableCount }, (_, i) => ({
          table_number: String(i + 1), min_capacity: 2, max_capacity: 4,
          location: 'indoor', area: 'ראשי', combinable_with: [], features: [],
          x: 40 + (i % 6) * 120, y: 40 + Math.floor(i / 6) * 120, width: 80, height: 80,
        }));
        await sql(
          `INSERT INTO "${schema}"."SeatingLayout" ("id", "layout_name", "tables", "createdAt", "updatedAt")
           VALUES ($1, 'מפה ראשית', $2::jsonb, NOW(), NOW())`,
          await uuid(), JSON.stringify(tables),
        );
        summary.tables = tableCount;
      }
    } catch (e: any) {
      console.warn('[onboarding] seating persist failed:', e?.message);
    }
  }

  return summary;
}

// --- extraction/insert helpers (each returns how many rows were created) ---

async function llmExtract(mediaUrl: string, prompt: string, schemaProps: any, listKey: string, tenantSlug: string): Promise<any[]> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt,
    fileUrls: [mediaUrl],
    responseSchema: {
      type: 'object',
      properties: { [listKey]: { type: 'array', items: { type: 'object', properties: schemaProps } } },
      required: [listKey],
    },
    maxOutputTokens: 32768,
    timeoutMs: 90_000,
    _ctx: { fn_name: 'onboardingExtract', tenant_slug: tenantSlug },
  });
  return Array.isArray(result?.[listKey]) ? result[listKey] : [];
}

async function extractAndInsertMenu(tenant: any, mediaUrl: string): Promise<number> {
  // listKey `dishes`, NOT `items` (Gemini keyword collision → empty).
  const items = await llmExtract(
    mediaUrl,
    `הקובץ הוא תפריט מסעדה. חלץ את כל המנות: name, category (ראשונות/עיקריות/שתייה... או "כללי"), price (מספר בלבד), description אם יש. אל תמציא.`,
    { name: { type: 'string' }, category: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' } },
    'dishes', tenant.slug,
  );
  return insertDishes(tenant, items);
}

// Shared MenuItem insert — used by both the file extractor and the website
// importer. One MenuItem table, split by `category` (food categories + שתייה
// for drinks); there is no separate "food menu" vs "drink menu".
async function insertDishes(tenant: any, dishes: any[]): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const it of (Array.isArray(dishes) ? dishes : []).slice(0, 400)) {
    const name = String(it?.name || '').trim();
    if (!name) continue;
    await sql(
      `INSERT INTO "${schema}"."MenuItem" ("id", "name", "category", "description", "price", "available", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      await uuid(), name.slice(0, 200), String(it?.category || 'כללי').slice(0, 80), it?.description ? String(it.description).slice(0, 500) : null, Number(it?.price) || 0,
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] menu insert:', e?.message));
  }
  return n;
}

// === Website import ========================================================
// Pull the menu + business details straight from the owner's existing website
// so onboarding can start from a URL instead of a photo. Best-effort: fetches
// the landing page + a couple of menu/about sub-pages, strips to text, keeps
// any JSON-LD (Restaurant schema is gold), and lets the LLM extract.

async function fetchHtml(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TopApolloBot/1.0; +https://topalena.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he,en;q=0.8',
      },
    } as any);
    clearTimeout(t);
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/html|text/i.test(ct)) return '';
    return (await res.text()).slice(0, 600_000);
  } catch { return ''; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonLd(html: string): string {
  const out: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 4) out.push(m[1].trim().slice(0, 4000));
  return out.length ? `\n\n[JSON-LD]\n${out.join('\n')}` : '';
}

function findRelevantLinks(html: string, base: string): string[] {
  let origin: URL;
  try { origin = new URL(base); } catch { return []; }
  const kw = /(menu|תפריט|food|אוכל|משקאות|בר|about|אודות|עלינו|contact|צור.?קשר|שעות|hours)/i;
  const links: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 6) {
    const href = m[1]; const text = m[2].replace(/<[^>]+>/g, ' ');
    if (!kw.test(href) && !kw.test(text)) continue;
    try {
      const abs = new URL(href, base);
      if (abs.origin !== origin.origin) continue; // same-site only
      const s = abs.toString().split('#')[0];
      if (s !== base && !links.includes(s)) links.push(s);
    } catch { /* ignore bad href */ }
  }
  return links;
}

async function fetchWebsiteText(url: string): Promise<string> {
  const mainHtml = await fetchHtml(url);
  if (!mainHtml) return '';
  let combined = htmlToText(mainHtml) + extractJsonLd(mainHtml);
  const seen = new Set<string>([url.split('#')[0]]);
  const subs = findRelevantLinks(mainHtml, url);
  // If the landing page exposes few/no menu links (splash pages, JS navs),
  // also probe the most common menu/about paths so we still find the menu.
  if (subs.length < 2) {
    try {
      const o = new URL(url);
      for (const p of ['menu', 'תפריט', 'our-menu', 'food', 'about', 'אודות', 'contact']) {
        const guess = `${o.origin}/${encodeURI(p)}`;
        if (!subs.includes(guess)) subs.push(guess);
      }
    } catch { /* bad base URL */ }
  }
  for (const l of subs.slice(0, 5)) {
    if (seen.has(l)) continue;
    seen.add(l);
    const h = await fetchHtml(l);
    if (h) combined += `\n\n[${l}]\n` + htmlToText(h) + extractJsonLd(h);
    if (combined.length > 30_000) break;
  }
  return combined.slice(0, 30_000);
}

async function extractFromWebsite(tenant: any, url: string): Promise<{ business: any; dishes: any[] } | null> {
  const text = await fetchWebsiteText(url);
  if (!text || text.length < 40) return null;
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `להלן טקסט שחולץ מאתר אינטרנט של מסעדה/עסק אוכל. חלץ ממנו רק מה שבאמת מופיע — אל תמציא כלום.\n` +
      `1. business: name, address, phone, opening_hours (טקסט חופשי), cuisine (סוג מטבח), description (משפט תיאור קצר).\n` +
      `2. dishes: כל המנות/פריטי התפריט — לכל אחת name, category (ראשונות/עיקריות/שתייה/קינוחים... או "כללי"), price (מספר בלבד), description אם יש.\n` +
      `אם שדה לא מופיע — השאר ריק. אם אין תפריט בטקסט — dishes ריק.\n\n===\n${text}`,
    responseSchema: {
      type: 'object',
      properties: {
        business: {
          type: 'object',
          properties: {
            name: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' },
            opening_hours: { type: 'string' }, cuisine: { type: 'string' }, description: { type: 'string' },
          },
        },
        // `dishes`, NOT `items` (Gemini keyword collision → empty).
        dishes: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' } } },
        },
      },
      required: ['dishes'],
    },
    maxOutputTokens: 32768,
    timeoutMs: 90_000,
    _ctx: { fn_name: 'onboardingWebsite', tenant_slug: tenant.slug },
  }).catch(() => null);
  if (!result) return null;
  return { business: result.business || {}, dishes: Array.isArray(result.dishes) ? result.dishes : [] };
}

async function extractAndInsertChecklists(tenant: any, mediaUrl: string, _data: Record<string, any>): Promise<number> {
  // Inner property `tasks`, NOT `items` (Gemini keyword collision → empty).
  const lists = await llmExtract(
    mediaUrl,
    `הקובץ הוא צ'קליסט תפעולי של מסעדה (או כמה). חלץ: title (שם הצ'קליסט), category (פתיחה/סגירה/מטבח/בר/ניקיון או "כללי"), tasks (מערך של משימות כטקסט).`,
    { title: { type: 'string' }, category: { type: 'string' }, tasks: { type: 'array', items: { type: 'string' } } },
    'checklists', tenant.slug,
  );
  const normalized = lists.map((cl: any) => ({ ...cl, items: Array.isArray(cl?.tasks) ? cl.tasks : (cl?.items || []) }));
  return insertChecklists(tenant, normalized);
}

async function insertChecklists(tenant: any, lists: any[]): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const cl of lists) {
    const title = String(cl?.title || '').trim();
    const items = Array.isArray(cl?.items) ? cl.items : [];
    if (!title || !items.length) continue;
    await sql(
      `INSERT INTO "${schema}"."Checklist" ("id", "title", "category", "frequency", "items", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'daily', $4::jsonb, 'active', NOW(), NOW())`,
      await uuid(), title, String(cl?.category || 'כללי'),
      JSON.stringify(items.map((t: any, i: number) => ({ id: i + 1, text: String(t) }))),
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] checklist insert:', e?.message));
  }
  return n;
}

async function insertSuppliersFromText(tenant: any, text: string): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split(/[,،]+/).map((p) => p.trim()).filter(Boolean);
    const name = parts[0];
    if (!name || name.length < 2) continue;
    const category = parts[1] || 'כללי';
    const phone = parts[2] || null;
    await sql(
      `INSERT INTO "${schema}"."Supplier" ("id", "company_name", "supplier_id", "contact_person", "email", "phone", "category", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())`,
      await uuid(), name, `SUP-${(n + 1).toString().padStart(3, '0')}-${Date.now() % 10000}`, name,
      `supplier-${n + 1}@pending.topalena.com`, phone, category,
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] supplier insert:', e?.message));
  }
  return n;
}

async function insertRolesFromText(tenant: any, text: string): Promise<number> {
  const names = text.split(/[,\n،]+/).map((r) => r.trim()).filter((r) => r.length >= 2 && r.length <= 40);
  return insertRoles(tenant, names);
}

async function extractAndInsertRolesFromFile(tenant: any, mediaUrl: string): Promise<number> {
  const roles = await llmExtract(
    mediaUrl,
    `הקובץ הוא סידור עבודה של מסעדה. חלץ את רשימת התפקידים הייחודיים שמופיעים בו (מלצר, טבח, ברמן, אחמ"ש...). לכל תפקיד: name בלבד.`,
    { name: { type: 'string' } },
    'roles', tenant.slug,
  );
  return insertRoles(tenant, roles.map((r: any) => String(r?.name || '').trim()).filter(Boolean));
}

async function insertRoles(tenant: any, names: string[]): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const name of names) {
    if (!name) continue;
    const exists: any[] = await query(`SELECT 1 FROM "${schema}"."Role" WHERE name = $1 LIMIT 1`, name).catch(() => []);
    if (exists.length) continue;
    await sql(
      `INSERT INTO "${schema}"."Role" ("id", "name", "level", "is_active", "createdAt", "updatedAt")
       VALUES ($1, $2, 'staff', true, NOW(), NOW())`,
      await uuid(), name,
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] role insert:', e?.message));
  }
  return n;
}

async function insertEmployeesFromText(tenant: any, text: string): Promise<number> {
  const rows = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[,\-–—:،]+/).map((p) => p.trim()).filter(Boolean);
    return { full_name: parts[0], role: parts[1] || 'עובד', phone: parts[2] || null };
  });
  return insertEmployees(tenant, rows);
}

async function extractAndInsertEmployeesFromFile(tenant: any, mediaUrl: string): Promise<number> {
  const emps = await llmExtract(
    mediaUrl,
    `הקובץ הוא רשימת עובדים של מסעדה (אקסל/טבלה/צילום). חלץ לכל עובד: full_name, role (אם מופיע), phone (אם מופיע), email (אם מופיע). אל תמציא.`,
    { full_name: { type: 'string' }, role: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } },
    'employees', tenant.slug,
  );
  return insertEmployees(tenant, emps);
}

async function insertEmployees(tenant: any, rows: any[]): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const r of rows) {
    const fullName = String(r?.full_name || '').trim();
    if (!fullName || fullName.length < 2) continue;
    await sql(
      `INSERT INTO "${schema}"."Employee" ("id", "full_name", "email", "phone", "role", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())`,
      await uuid(), fullName,
      r?.email && /\S+@\S+/.test(r.email) ? String(r.email).toLowerCase() : `${tenant.slug}-${Date.now() % 100000}-${n}@pending.topalena.com`,
      r?.phone ? String(r.phone) : null, String(r?.role || 'עובד'),
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] employee insert:', e?.message));
  }
  return n;
}

async function insertInterviewSlots(tenant: any, text: string): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[אבגדהו])'?\s+(\d{1,2}:\d{2})/);
    if (!m) continue;
    const weekday = HEB_DAYS[m[1]];
    if (weekday == null) continue;
    await sql(
      `INSERT INTO "${schema}"."InterviewSlotTemplate" ("id", "weekday", "time", "duration_minutes", "active")
       VALUES ($1, $2, $3, 30, true)`,
      await uuid(), weekday, m[2],
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] slot insert:', e?.message));
  }
  return n;
}

async function extractAndInsertCustomers(tenant: any, mediaUrl: string): Promise<number> {
  const customers = await llmExtract(
    mediaUrl,
    `הקובץ הוא רשימת לקוחות / מועדון לקוחות של מסעדה (טבלה/CSV/צילום). ` +
    `חלץ לכל לקוח: name, phone (חובה — דלג על שורות בלי טלפון), email אם יש, birthday אם יש (פורמט YYYY-MM-DD או DD/MM). אל תמציא.`,
    { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, birthday: { type: 'string' } },
    'customers', tenant.slug,
  );
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const c of customers) {
    const phone = String(c?.phone || '').replace(/[^\d+]/g, '');
    if (phone.length < 9) continue;
    const exists: any[] = await query(`SELECT 1 FROM "${schema}"."Customer" WHERE phone = $1 LIMIT 1`, phone).catch(() => []);
    if (exists.length) continue;
    // marketing_consent=true: this is the owner's existing club — members
    // already opted in with the restaurant (חוק הספאם consent lives there).
    await sql(
      `INSERT INTO "${schema}"."Customer" ("id", "phone", "name", "email", "birthday", "marketing_consent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      await uuid(), phone, c?.name ? String(c.name) : null,
      c?.email && /\S+@\S+/.test(c.email) ? String(c.email).toLowerCase() : null,
      c?.birthday ? String(c.birthday) : null,
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] customer insert:', e?.message));
  }
  return n;
}

async function extractAndInsertKnowledge(tenant: any, mediaUrl: string, category: string): Promise<number> {
  const entries = await llmExtract(
    mediaUrl,
    `הקובץ הוא מסמך ידע של מסעדה (נוהל / מתכון / תפריט / הסכם / שאלות נפוצות). ` +
    `חלץ את התוכן כערכי ידע: לכל נושא — title קצר ו-content מלא ומפורט בעברית (אל תקצר מדי — זה ישמש AI לענות על שאלות). אם המסמך הוא נושא אחד, החזר ערך אחד.`,
    { title: { type: 'string' }, content: { type: 'string' } },
    'entries', tenant.slug,
  );
  return insertKnowledgeEntries(tenant, entries, category);
}

async function insertKnowledgeEntries(tenant: any, entries: any[], category: string): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const e of entries) {
    const title = String(e?.title || '').trim();
    const content = String(e?.content || '').trim();
    if (!title || !content) continue;
    await sql(
      `INSERT INTO "${schema}"."KnowledgeBase" ("id", "category", "title", "content", "priority", "last_updated", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'medium', NOW(), NOW(), NOW())`,
      await uuid(), category, title, content,
    ).then(() => n++).catch((err: any) => console.warn('[onboarding] knowledge insert:', err?.message));
  }
  return n;
}

async function saveInvoiceEmails(tenant: any, emails: string[]): Promise<void> {
  const schema = `tenant_${tenant.slug}`;
  await sql(`ALTER TABLE "${schema}"."RestaurantProfile" ADD COLUMN IF NOT EXISTS "invoice_inbox_emails" TEXT`).catch(() => {});
  const existing: any[] = await query(`SELECT id FROM "${schema}"."RestaurantProfile" LIMIT 1`);
  if (existing.length) {
    await sql(`UPDATE "${schema}"."RestaurantProfile" SET invoice_inbox_emails = $1, "updatedAt" = NOW() WHERE id = $2`,
      emails.join(','), existing[0].id);
  } else {
    await sql(
      `INSERT INTO "${schema}"."RestaurantProfile" ("id", "restaurant_name", "invoice_inbox_emails", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())`,
      await uuid(), tenant.restaurant_name || tenant.slug, emails.join(','),
    );
  }
}

// --- AI suggestions (when the owner has no file of their own) --------------

async function aiSuggestChecklists(tenant: any, data: Record<string, any>): Promise<number> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `בנה 3 צ'קליסטים תפעוליים למסעדה מסוג "${data.cuisine || 'כללי'}"` +
      `${data.description ? ` (${data.description})` : ''}: פתיחת בוקר, סגירת ערב, ומטבח.\n` +
      `לכל אחד: title, category, tasks (6-12 משימות קצרות בעברית).`,
    responseSchema: {
      type: 'object',
      properties: {
        checklists: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' }, category: { type: 'string' },
              tasks: { type: 'array', items: { type: 'string' } }, // NOT `items` (Gemini keyword collision)
            },
          },
        },
      },
      required: ['checklists'],
    },
    _ctx: { fn_name: 'onboardingSuggestChecklists', tenant_slug: tenant.slug },
  });
  const lists = (Array.isArray(result?.checklists) ? result.checklists : []).map((cl: any) => ({
    ...cl, items: Array.isArray(cl?.tasks) ? cl.tasks : (cl?.items || []),
  }));
  return insertChecklists(tenant, lists);
}

async function aiSuggestRoles(tenant: any, data: Record<string, any>): Promise<number> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `הצע רשימת תפקידים טיפוסית למסעדה מסוג "${data.cuisine || 'כללי'}"` +
      `${data.description ? ` (${data.description})` : ''}. החזר roles — מערך של שמות תפקידים בעברית (מלצר/ית, טבח, ברמן/ית, אחמ"ש, שוטף כלים, מארח/ת... התאם לעסק).`,
    responseSchema: { type: 'object', properties: { roles: { type: 'array', items: { type: 'string' } } }, required: ['roles'] },
    _ctx: { fn_name: 'onboardingSuggestRoles', tenant_slug: tenant.slug },
  });
  return insertRoles(tenant, (Array.isArray(result?.roles) ? result.roles : []).map((r: any) => String(r).trim()).filter(Boolean));
}

async function aiSuggestTraining(tenant: any, data: Record<string, any>): Promise<number> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `בנה תוכנית הכשרה לצוות מסעדה מסוג "${data.cuisine || 'כללי'}"` +
      `${data.description ? ` (${data.description})` : ''}. חלק לפי תפקידים (מלצרים, מטבח, ברמנים).\n` +
      `לכל פרק: title (שם הפרק כולל התפקיד), content (5-10 נקודות מפורטות בעברית).`,
    responseSchema: {
      type: 'object',
      properties: { chapters: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } } } },
      required: ['chapters'],
    },
    _ctx: { fn_name: 'onboardingSuggestTraining', tenant_slug: tenant.slug },
  });
  return insertKnowledgeEntries(tenant, Array.isArray(result?.chapters) ? result.chapters : [], 'הכשרה');
}

// Seating map from an image/sketch → SeatingLayout the owner can drag-fix.
// Extract the table layout from a sketch WITHOUT inserting — so the owner can
// approve/adjust the preview before it embeds (step 4: sketch-for-approval).
async function extractSeatingTables(tenant: any, mediaUrl: string): Promise<any[]> {
  // property `tables`, NOT `items` — collision-safe.
  const rows = await llmExtract(
    mediaUrl,
    `הקובץ הוא מפת הושבה / סקיצה של מסעדה. חלץ את השולחנות: label (מספר/שם), capacity (מספר סועדים), x ו-y (מיקום יחסי 0-100), shape (table/bar/booth/outdoor). אל תמציא.`,
    { label: { type: 'string' }, capacity: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, shape: { type: 'string' } },
    'tables', tenant.slug,
  );
  return rows.map((t: any, i: number) => ({
    table_number: String(t?.label || i + 1),
    min_capacity: Math.max(1, Math.floor((Number(t?.capacity) || 2) * 0.5)),
    max_capacity: Math.max(2, Number(t?.capacity) || 4),
    location: t?.shape === 'outdoor' ? 'outdoor' : 'indoor',
    area: t?.shape === 'bar' ? 'בר' : t?.shape === 'booth' ? 'פינה' : 'ראשי',
    combinable_with: [], features: [],
    x: Math.round((Number(t?.x) || 50) * 6), y: Math.round((Number(t?.y) || 50) * 5),
    width: 80, height: 80,
  }));
}

async function insertSeatingTables(tenant: any, tables: any[]): Promise<number> {
  if (!Array.isArray(tables) || !tables.length) return 0;
  const schema = `tenant_${tenant.slug}`;
  try {
    const existing: any[] = await query(`SELECT id FROM "${schema}"."SeatingLayout" LIMIT 1`);
    if (existing.length) {
      await sql(`UPDATE "${schema}"."SeatingLayout" SET tables = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`, JSON.stringify(tables), existing[0].id);
    } else {
      await sql(
        `INSERT INTO "${schema}"."SeatingLayout" ("id", "layout_name", "tables", "createdAt", "updatedAt") VALUES ($1, 'מפה ראשית', $2::jsonb, NOW(), NOW())`,
        await uuid(), JSON.stringify(tables),
      );
    }
  } catch (e: any) {
    console.warn('[onboarding] seating image insert:', e?.message);
  }
  return tables.length;
}

// One-line human summary of an extracted layout (count + areas + capacity).
function seatingSummary(tables: any[]): string {
  const byArea: Record<string, number> = {};
  let cap = 0;
  for (const t of tables) {
    const a = String(t?.area || 'ראשי');
    byArea[a] = (byArea[a] || 0) + 1;
    cap += Number(t?.max_capacity) || 0;
  }
  const areas = Object.entries(byArea).map(([a, n]) => `${a}: ${n}`).join(', ');
  return `${tables.length} שולחנות (${areas}), קיבולת ~${cap} סועדים`;
}

async function extractAndInsertSeating(tenant: any, mediaUrl: string): Promise<number> {
  return insertSeatingTables(tenant, await extractSeatingTables(tenant, mediaUrl));
}

// === Shared helpers ========================================================

// Lightweight check used by the webhook to decide whether to transcribe an
// inbound voice note into the onboarding brain (vs. the admin voice agent).
export async function isOnboardingActive(fromPhone: string): Promise<boolean> {
  const s = await findActiveOnboarding(fromPhone).catch(() => null);
  return !!s;
}

export async function ensureOnboardingRow(tenantId: string): Promise<void> {
  const { randomUUID } = await import('node:crypto');
  await sql(
    `INSERT INTO "OnboardingState" ("id", "tenant_id") VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO NOTHING`,
    randomUUID(), tenantId,
  );
}

async function getTenant(tenantId: string): Promise<any | null> {
  const rows: any[] = await query(
    `SELECT id, slug, restaurant_name, owner_name, owner_phone, owner_email, status
     FROM "Tenant" WHERE id = $1`, tenantId,
  );
  return rows[0] || null;
}

async function findActiveOnboarding(fromPhone: string): Promise<any | null> {
  const digits = String(fromPhone || '').replace(/\D/g, '').replace(/^0/, '972');
  const variants = [fromPhone, digits, `0${digits.replace(/^972/, '')}`, `+${digits}`];
  const rows: any[] = await query(
    `SELECT os.tenant_id, os.current_step, os.completed_steps, os.collected_data
     FROM "OnboardingState" os
     INNER JOIN "Tenant" t ON t.id = os.tenant_id
     WHERE os.current_step <> 'done' AND t.owner_phone = ANY($1::text[])
     LIMIT 1`,
    variants,
  );
  return rows[0] || null;
}

function buildDoneMessage(tenant: any, data: Record<string, any>): string {
  const name = data.name && data.name !== '__KEEP__' ? data.name : tenant.restaurant_name;
  const c = data._counts || {};
  const link = `https://${tenant.slug}.topalena.com`;
  const lines = [
    `🎊 *סיימנו — הכל הוטמע במערכת!*`,
    ``,
    `🍽 ${name}`,
    data.address ? `📍 ${data.address}` : '',
    data.opening_hours ? `🕒 ${data.opening_hours}` : '',
    ``,
    `*מה הוקם עבורך:*`,
    `✅ פרופיל עסקי מלא`,
    c.menu ? `✅ ${c.menu} מנות בתפריט` : '',
    (c.seating || c.tables) ? `✅ מפת הושבה עם ${c.seating || c.tables} שולחנות` : '',
    c.employees ? `✅ ${c.employees} כרטיסי עובדים` : '',
    c.invited ? `✅ קישור הצטרפות לעובדים נשלח` : '',
    c.roles ? `✅ ${c.roles} תפקידים` : '',
    c.checklists ? `✅ ${c.checklists} צ'קליסטים` : '',
    c.suppliers ? `✅ ${c.suppliers} ספקים` : '',
    c.training ? `✅ תוכנית הכשרה (${c.training} פרקים)` : '',
    c.slots ? `✅ ${c.slots} סלוטים לראיונות` : '',
    c.customers ? `✅ ${c.customers} לקוחות במועדון` : '',
    c.knowledge ? `✅ ${c.knowledge} מסמכים במרכז הידע` : '',
    c.invoice_email ? `✅ מייל איסוף חשבוניות` : '',
    ``,
    `🔗 *היכנס לאפליקציה שלך — הכל כבר בפנים:*`,
    link,
    `(המייל והסיסמה הזמנית נשלחו לך קודם)`,
    ``,
    `מעכשיו אני העוזר האישי שלך — שאל אותי כל דבר, שלח חשבוניות, בקש סיכומים. בואו נעבוד! 💪`,
  ];
  return lines.filter((l) => l !== '').join('\n');
}
