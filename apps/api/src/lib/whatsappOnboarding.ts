// WhatsApp-driven onboarding conversation for freshly-provisioned tenants.
// State machine keyed by OnboardingState.current_step; persists between
// messages so a tenant can reply hours later and pick up where they left.
//
// v3 (2026-07-04): after the core profile steps, a MODULE MENU lets the
// owner set up everything else — checklists (file or AI-suggested),
// suppliers, roles (typed or extracted from an existing work schedule),
// employees (file / typed / WhatsApp self-signup invitations), interview
// slots, training (file or AI-suggested), customer-club import, AI
// knowledge-base files, and invoice-collection emails. Every module is
// skippable; everything collected is IMPLEMENTED in the tenant schema
// before the final message hands over the app link.

import { PrismaClient } from '@prisma/client';
import { sendWhatsApp } from './twilio.js';

const prisma: any = new PrismaClient();

type StepId =
  | 'welcome'
  | 'restaurant_name'
  | 'address'
  | 'phone'
  | 'opening_hours'
  | 'cuisine'
  | 'description'
  | 'employee_count'
  | 'tables_count'
  | 'menu_intro'
  | 'modules_menu'
  | 'm_checklists'
  | 'm_suppliers'
  | 'm_roles'
  | 'm_employees'
  | 'm_interviews'
  | 'm_training'
  | 'm_customers'
  | 'm_knowledge'
  | 'm_invoice_email'
  | 'done';

const SKIP_RE = /^(דלג|דלגי|skip|אין|לא עכשיו|אין לי)/i;
const CONFIRM_RE = /^(אישור|כן|נכון|בסדר|אוקי+|ok|יס)$/i;
const BACK_RE = /^(חזרה|תפריט|back|0)$/i;
const SUGGEST_RE = /^(הצע|תציע|הצעה|suggest)/i;

const TOTAL_STEPS = 8;

// Media-accepting steps → which extractor runs. Everything else ignores media.
const MEDIA_STEPS = new Set<StepId>([
  'menu_intro', 'm_checklists', 'm_roles', 'm_employees', 'm_customers', 'm_knowledge', 'm_training',
]);

const HEB_DAYS: Record<string, number> = {
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
  'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5,
};

function modulesMenuText(counts: Record<string, number>): string {
  const mark = (k: string) => (counts[k] ? ` (✅ ${counts[k]})` : '');
  return (
    `🧩 *הקמה מתקדמת — מה עוד להטמיע?*\n` +
    `שלח מספר, או 0 לסיום וקבלת הקישור:\n\n` +
    `1️⃣ צ'קליסטים${mark('checklists')} — שלח קובץ או שאציע לפי העסק\n` +
    `2️⃣ ספקים${mark('suppliers')}\n` +
    `3️⃣ תפקידים${mark('roles')} — רשימה או קובץ סידור עבודה\n` +
    `4️⃣ עובדים${mark('employees')} — קובץ / רשימה / הזמנות וואטסאפ\n` +
    `5️⃣ סלוטים לראיונות עבודה${mark('slots')}\n` +
    `6️⃣ תוכנית הכשרה${mark('training')} — קובץ או הצעת AI\n` +
    `7️⃣ מועדון לקוחות${mark('customers')} — ייבוא קובץ\n` +
    `8️⃣ מרכז ידע ל-AI${mark('knowledge')} — שלח קבצים\n` +
    `9️⃣ מייל לאיסוף חשבוניות${mark('invoice_email') ? ' (✅)' : ''}\n` +
    `0️⃣ *סיום — קבל את האפליקציה המוכנה*`
  );
}

const MODULE_BY_DIGIT: Record<string, StepId> = {
  '1': 'm_checklists', '2': 'm_suppliers', '3': 'm_roles', '4': 'm_employees',
  '5': 'm_interviews', '6': 'm_training', '7': 'm_customers', '8': 'm_knowledge',
  '9': 'm_invoice_email',
};

const MODULE_PROMPTS: Partial<Record<StepId, string>> = {
  m_checklists:
    `📋 *צ'קליסטים*\n\nשלח לי קובץ (תמונה/PDF) של צ'קליסט קיים ואני אקים אותו במערכת.\n` +
    `אין לך? שלח "הצע" ואבנה לך צ'קליסטים לפי סוג העסק שלך.\n(או "חזרה" לתפריט)`,
  m_suppliers:
    `🚚 *ספקים*\n\nרשום את הספקים שאתה עובד איתם — שורה לכל ספק:\n` +
    `שם, קטגוריה, טלפון\n\nדוגמה:\nירקות השדה, ירקות, 052-1234567\nמאפיית לחמים, מאפים, 03-5551234\n\n(או "חזרה")`,
  m_roles:
    `👔 *תפקידים*\n\nרשום את התפקידים במסעדה מופרדים בפסיק:\n` +
    `מלצר/ית, טבח, ברמן, אחמ"ש, שוטף כלים\n\n` +
    `או שלח קובץ של סידור עבודה קיים — אזהה את התפקידים מתוכו.\n(או "חזרה")`,
  m_employees:
    `👥 *עובדים*\n\nשלוש דרכים:\n` +
    `א. שלח קובץ/תמונה של רשימת העובדים — אקרא ואקים\n` +
    `ב. רשום ידנית — שורה לכל עובד: שם, תפקיד, טלפון\n` +
    `ג. כתוב "הזמנות" ואז רשום שם + טלפון לכל עובד — כל אחד יקבל וואטסאפ עם קישור להירשם לבד (שם מלא, מייל, תפקיד)\n\n(או "חזרה")`,
  m_interviews:
    `🗓 *סלוטים לראיונות*\n\nמתי נוח לך לקיים ראיונות עבודה? רשום שורות של יום + שעה:\n` +
    `שני 14:00\nרביעי 10:30\nחמישי 16:00\n\nמועמדים יוכלו לקבוע ראיון בסלוטים האלה אוטומטית.\n(או "חזרה")`,
  m_training:
    `🎓 *תוכנית הכשרה*\n\nשלח קובץ של תוכנית ההכשרה שלך (תמונה/PDF) ואכניס אותה למערכת.\n` +
    `אין לך? שלח "הצע" ואבנה תוכנית הכשרה לפי התפקידים וסוג העסק.\n(או "חזרה")`,
  m_customers:
    `💳 *מועדון לקוחות*\n\nשלח קובץ של רשימת הלקוחות (CSV / תמונה / PDF) — שם, טלפון, מייל, יום הולדת אם יש.\n` +
    `אני אייבא את כולם למועדון.\n(או "חזרה")`,
  m_knowledge:
    `🧠 *מרכז ידע ל-AI*\n\nשלח לי קבצים — נהלים, מתכונים, תפריטי אירועים, שאלות נפוצות — אחד אחרי השני.\n` +
    `כל קובץ ייקרא וייכנס למרכז הידע, וה-AI שלך ישתמש בו כשהוא עונה לך ולצוות.\n\nכתוב "חזרה" כשסיימת.`,
  m_invoice_email:
    `📧 *מייל לאיסוף חשבוניות*\n\nלאיזה כתובת/כתובות מייל מגיעות חשבוניות מהספקים שלך?\n` +
    `(אפשר כמה, מופרדות בפסיק. או "חזרה")`,
};

interface StepDef {
  id: StepId;
  prompt: (data: Record<string, any>, ctx: { restaurant_name: string; owner_name: string }) => string;
  parse?: (reply: string) => any;
  next: StepId;
  saveTo?: string;
  optional?: boolean;
}

const STEPS: Record<string, StepDef> = {
  welcome: {
    id: 'welcome',
    prompt: (_, ctx) =>
      `🎉 שלום ${ctx.owner_name}! ברוך/ה הבא/ה ל-TopAlena.\n\n` +
      `המערכת שלך מוכנה ואני *AI* שיקים לך את המסעדה — פרופיל, עובדים, שולחנות, תפריט, צ'קליסטים וכל השאר — מתוך שיחה פשוטה כאן ✨\n\n` +
      `בסוף תקבל קישור לאפליקציה כשהכל כבר מוטמע ומוכן.\n\n` +
      `*מוכן/ה להתחיל?* שלח "כן", או "אחר כך" אם עסוק/ה.`,
    parse: (r) => {
      const t = r.trim().toLowerCase();
      if (/^(כן|yes|ok|בסדר|נתחיל|בואו?)/.test(t)) return 'yes';
      if (/^(אחר|לא עכשיו|later)/.test(t)) return 'later';
      return null;
    },
    next: 'restaurant_name',
  },
  restaurant_name: {
    id: 'restaurant_name',
    prompt: (_, ctx) =>
      `🍽 *שלב 1 / ${TOTAL_STEPS} — שם המסעדה*\n\nרשמנו אותך בתור "${ctx.restaurant_name}".\n` +
      `מה השם המדויק כפי שיופיע ללקוחות?\n\n(אם נכון — ענה "אישור")`,
    parse: (r) => (CONFIRM_RE.test(r.trim()) ? '__KEEP__' : r.trim()),
    saveTo: 'name',
    next: 'address',
  },
  address: {
    id: 'address',
    prompt: () => `📍 *שלב 2 / ${TOTAL_STEPS} — כתובת*\n\nמה הכתובת המדויקת? (רחוב, מספר, עיר)`,
    parse: (r) => r.trim(),
    saveTo: 'address',
    next: 'phone',
  },
  phone: {
    id: 'phone',
    prompt: () =>
      `☎️ *שלב 3 / ${TOTAL_STEPS} — טלפון המסעדה*\n\nמה המספר שאליו לקוחות מתקשרים?\n(אפשר "דלג" אם זה המספר הזה)`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? '__SKIP__' : r.trim()),
    saveTo: 'phone',
    optional: true,
    next: 'opening_hours',
  },
  opening_hours: {
    id: 'opening_hours',
    prompt: () =>
      `🕒 *שלב 4 / ${TOTAL_STEPS} — שעות פתיחה*\n\n(דוגמה: "א-ה 12:00-23:00, ו' 12:00-16:00, מוצש 20:00-01:00")`,
    parse: (r) => r.trim(),
    saveTo: 'opening_hours',
    next: 'cuisine',
  },
  cuisine: {
    id: 'cuisine',
    prompt: () => `🥘 *שלב 5 / ${TOTAL_STEPS} — סוג המטבח*\n\nאיזה מטבח? תיאור קצר בשורה אחת.`,
    parse: (r) => r.trim(),
    saveTo: 'cuisine',
    next: 'description',
  },
  description: {
    id: 'description',
    prompt: () =>
      `📝 *שלב 6 / ${TOTAL_STEPS} — קצת על המסעדה*\n\n2-3 משפטים: אווירה, קהל, מה מיוחד אצלכם?\n` +
      `(עוזר ל-AI לכתוב שיווק ותדריכים בטון הנכון. אפשר "דלג")`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? '__SKIP__' : r.trim()),
    saveTo: 'description',
    optional: true,
    next: 'employee_count',
  },
  employee_count: {
    id: 'employee_count',
    prompt: () => `👥 *שלב 7 / ${TOTAL_STEPS} — צוות*\n\nכמה עובדים יש בערך? ("8", "12-15"...)`,
    parse: (r) => r.trim(),
    saveTo: 'employee_count',
    next: 'tables_count',
  },
  tables_count: {
    id: 'tables_count',
    prompt: () =>
      `🪑 *שלב 8 / ${TOTAL_STEPS} — שולחנות*\n\nכמה שולחנות יש בערך? אצור מפת הושבה בסיסית שתסדר בגרירה.\n(אפשר "דלג")`,
    parse: (r) => {
      const t = r.trim();
      if (SKIP_RE.test(t)) return '__SKIP__';
      const m = t.match(/\d+/);
      return m ? m[0] : null;
    },
    saveTo: 'tables_count',
    optional: true,
    next: 'menu_intro',
  },
  menu_intro: {
    id: 'menu_intro',
    prompt: () =>
      `📸 *התפריט*\n\nשלח תמונה או PDF של התפריט — אזהה מנות ומחירים ואכניס אוטומטית.\n` +
      `אין עדיין? שלח "דלג".`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? 'skip' : null),
    optional: true,
    next: 'modules_menu',
  },
  modules_menu: {
    id: 'modules_menu',
    prompt: (data) => modulesMenuText((data && data._counts) || {}),
    parse: (r) => r.trim(),
    next: 'modules_menu',
  },
  done: {
    id: 'done',
    prompt: (data, ctx) =>
      `🎊 *סיימנו!* הכל הוטמע במערכת של ${data.name && data.name !== '__KEEP__' ? data.name : ctx.restaurant_name}. 💪`,
    next: 'done',
  },
};

// === Public API ============================================================

export async function startOnboarding(tenantId: string): Promise<void> {
  await ensureOnboardingRow(tenantId);
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  await sendWhatsApp(
    tenant.owner_phone,
    STEPS.welcome.prompt({}, { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name }),
  );
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "OnboardingState" SET started_at = NOW(), last_message_at = NOW(), "updatedAt" = NOW() WHERE tenant_id = $1`,
    tenantId,
  );
}

export async function tryHandleOnboardingMessage(fromPhone: string, body: string): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  const data: Record<string, any> = state.collected_data || {};
  const stepId = state.current_step as StepId;

  // ── Module steps have bespoke text handling ──
  if (stepId === 'modules_menu' || stepId.startsWith('m_')) {
    return handleModuleText(tenant, state, data, stepId, body.trim(), fromPhone);
  }

  const currentStep = STEPS[stepId] || STEPS.welcome;
  const parsed = currentStep.parse ? currentStep.parse(body) : body.trim();

  if (currentStep.id === 'welcome') {
    if (parsed === 'later') {
      await sendWhatsApp(fromPhone, `בסדר, אין לחץ 🙌 מתי שתרצה — שלח "התחל" ונתחיל.`);
      return true;
    }
    if (parsed !== 'yes') {
      await sendWhatsApp(fromPhone, `לא הבנתי — שלח "כן" כדי להתחיל, או "אחר כך" אם עסוק/ה.`);
      return true;
    }
  }

  if (parsed == null && !currentStep.optional) {
    await sendWhatsApp(fromPhone, `לא הצלחתי להבין 🤔 ננסה שוב:\n\n${currentStep.prompt(data, ctxOf(tenant))}`);
    return true;
  }

  if (currentStep.saveTo && parsed != null && parsed !== '__SKIP__') {
    data[currentStep.saveTo] = parsed;
  }

  const next = STEPS[currentStep.next];
  await advanceState(state.tenant_id, state, currentStep.id, next.id, data);

  // Entering the module menu = core profile is complete → implement it now
  // so even an owner who bails at the menu still gets a set-up app.
  if (next.id === 'modules_menu' && !data._core_persisted) {
    const summary = await persistCoreData(tenant, data).catch((e: any) => {
      console.warn('[onboarding] core persist failed', e?.message);
      return null;
    });
    data._core_persisted = true;
    data._counts = data._counts || {};
    if (summary) {
      if (summary.employees) data._counts.employees = summary.employees;
      if (summary.tables) data._counts.tables = summary.tables;
    }
    await saveData(state.tenant_id, data);
    await sendWhatsApp(fromPhone, `✅ הפרופיל הבסיסי הוטמע!\n\n${modulesMenuText(data._counts)}`);
    return true;
  }

  await sendWhatsApp(fromPhone, next.prompt(data, ctxOf(tenant)));
  return true;
}

// Media (menu PDF, checklist photo, employees excel, knowledge docs...).
// Claims the message when the current step accepts files; caller ACKs and
// we process + reply in the background (Twilio has a 15s webhook timeout).
export async function tryHandleOnboardingMedia(
  fromPhone: string,
  mediaUrl: string,
  _contentType: string,
): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state || !MEDIA_STEPS.has(state.current_step as StepId)) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  const stepId = state.current_step as StepId;
  const data: Record<string, any> = state.collected_data || {};
  data._counts = data._counts || {};

  void (async () => {
    try {
      let doneMsg = '';
      if (stepId === 'menu_intro') {
        const n = await extractAndInsertMenu(tenant, mediaUrl);
        data._counts.menu = (data._counts.menu || 0) + n;
        doneMsg = `✅ ${n} מנות נקלטו מהתפריט!`;
        if (!data._core_persisted) {
          const summary = await persistCoreData(tenant, data).catch(() => null);
          data._core_persisted = true;
          if (summary?.employees) data._counts.employees = summary.employees;
          if (summary?.tables) data._counts.tables = summary.tables;
        }
        await advanceState(tenant.id, state, 'menu_intro', 'modules_menu', data);
      } else if (stepId === 'm_checklists') {
        const n = await extractAndInsertChecklists(tenant, mediaUrl, data);
        data._counts.checklists = (data._counts.checklists || 0) + n;
        doneMsg = `✅ ${n} צ'קליסטים הוקמו!`;
        await advanceState(tenant.id, state, stepId, 'modules_menu', data);
      } else if (stepId === 'm_roles') {
        const n = await extractAndInsertRolesFromFile(tenant, mediaUrl);
        data._counts.roles = (data._counts.roles || 0) + n;
        doneMsg = `✅ ${n} תפקידים זוהו מהסידור והוקמו!`;
        await advanceState(tenant.id, state, stepId, 'modules_menu', data);
      } else if (stepId === 'm_employees') {
        const n = await extractAndInsertEmployeesFromFile(tenant, mediaUrl);
        data._counts.employees = (data._counts.employees || 0) + n;
        doneMsg = `✅ ${n} עובדים נקלטו מהקובץ!`;
        await advanceState(tenant.id, state, stepId, 'modules_menu', data);
      } else if (stepId === 'm_customers') {
        const n = await extractAndInsertCustomers(tenant, mediaUrl);
        data._counts.customers = (data._counts.customers || 0) + n;
        doneMsg = `✅ ${n} לקוחות יובאו למועדון!`;
        await advanceState(tenant.id, state, stepId, 'modules_menu', data);
      } else if (stepId === 'm_training') {
        const n = await extractAndInsertKnowledge(tenant, mediaUrl, 'הכשרה');
        data._counts.training = (data._counts.training || 0) + n;
        doneMsg = `✅ תוכנית ההכשרה נקלטה (${n} פרקים)!`;
        await advanceState(tenant.id, state, stepId, 'modules_menu', data);
      } else if (stepId === 'm_knowledge') {
        const n = await extractAndInsertKnowledge(tenant, mediaUrl, 'כללי');
        data._counts.knowledge = (data._counts.knowledge || 0) + n;
        // Knowledge stays in-module for multi-file upload; "חזרה" exits.
        await saveData(tenant.id, data);
        await sendWhatsApp(fromPhone, `✅ הקובץ נכנס למרכז הידע (${data._counts.knowledge} סה"כ). שלח עוד קובץ או "חזרה" לתפריט.`);
        return;
      }
      await sendWhatsApp(fromPhone, `${doneMsg}\n\n${modulesMenuText(data._counts)}`);
    } catch (e: any) {
      console.warn('[onboarding] media processing failed:', e?.message);
      await sendWhatsApp(fromPhone, `😕 לא הצלחתי לעבד את הקובץ (${String(e?.message || '').slice(0, 80)}). נסה קובץ ברור יותר או "חזרה" לתפריט.`).catch(() => {});
    }
  })();

  return true;
}

// === Module text handling ==================================================

async function handleModuleText(
  tenant: any, state: any, data: Record<string, any>, stepId: StepId, text: string, fromPhone: string,
): Promise<boolean> {
  data._counts = data._counts || {};

  // Menu navigation
  if (stepId === 'modules_menu') {
    const digit = text.replace(/[^\d]/g, '');
    if (digit === '0' || /סיום|סיימתי/.test(text)) {
      await advanceState(tenant.id, state, stepId, 'done', data);
      await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data));
      return true;
    }
    const target = MODULE_BY_DIGIT[digit];
    if (!target) {
      await sendWhatsApp(fromPhone, `שלח מספר בין 1 ל-9, או 0 לסיום.\n\n${modulesMenuText(data._counts)}`);
      return true;
    }
    await advanceState(tenant.id, state, stepId, target, data);
    await sendWhatsApp(fromPhone, MODULE_PROMPTS[target] || '');
    return true;
  }

  // Inside a module: "חזרה" always returns to the menu.
  if (BACK_RE.test(text) || SKIP_RE.test(text)) {
    await advanceState(tenant.id, state, stepId, 'modules_menu', data);
    await sendWhatsApp(fromPhone, modulesMenuText(data._counts));
    return true;
  }

  try {
    switch (stepId) {
      case 'm_checklists': {
        if (SUGGEST_RE.test(text)) {
          const n = await aiSuggestChecklists(tenant, data);
          data._counts.checklists = (data._counts.checklists || 0) + n;
          await backToMenu(tenant, state, data, fromPhone, `✅ בניתי לך ${n} צ'קליסטים לפי העסק (טיוטות — אפשר לערוך באפליקציה)!`);
        } else {
          await sendWhatsApp(fromPhone, `שלח קובץ, "הצע", או "חזרה" 🙂`);
        }
        return true;
      }
      case 'm_suppliers': {
        const n = await insertSuppliersFromText(tenant, text);
        data._counts.suppliers = (data._counts.suppliers || 0) + n;
        await backToMenu(tenant, state, data, fromPhone, n ? `✅ ${n} ספקים הוקמו!` : `לא זיהיתי ספקים — פורמט: שם, קטגוריה, טלפון (שורה לכל ספק).`);
        return true;
      }
      case 'm_roles': {
        const n = await insertRolesFromText(tenant, text);
        data._counts.roles = (data._counts.roles || 0) + n;
        await backToMenu(tenant, state, data, fromPhone, n ? `✅ ${n} תפקידים הוקמו!` : `לא זיהיתי תפקידים — רשום אותם מופרדים בפסיק.`);
        return true;
      }
      case 'm_employees': {
        if (/^הזמנות/.test(text)) {
          data._invite_mode = true;
          await saveData(tenant.id, data);
          await sendWhatsApp(fromPhone, `📲 מצב הזמנות: רשום שם + טלפון לכל עובד (שורה לכל אחד):\nדנה, 052-1234567\nיוסי, 054-7654321`);
          return true;
        }
        if (data._invite_mode) {
          const n = await inviteEmployeesByWhatsApp(tenant, text);
          data._invite_mode = false;
          data._counts.invited = (data._counts.invited || 0) + n;
          await backToMenu(tenant, state, data, fromPhone, `✅ נשלחו ${n} הזמנות וואטסאפ! כל עובד ימלא שם, מייל ותפקיד בעצמו.`);
          return true;
        }
        const n = await insertEmployeesFromText(tenant, text);
        data._counts.employees = (data._counts.employees || 0) + n;
        await backToMenu(tenant, state, data, fromPhone, n ? `✅ ${n} עובדים הוקמו!` : `לא זיהיתי — פורמט: שם, תפקיד, טלפון (שורה לכל עובד). או שלח קובץ.`);
        return true;
      }
      case 'm_interviews': {
        const n = await insertInterviewSlots(tenant, text);
        data._counts.slots = (data._counts.slots || 0) + n;
        await backToMenu(tenant, state, data, fromPhone, n ? `✅ ${n} סלוטים לראיונות נקבעו!` : `לא זיהיתי — פורמט: יום שעה (למשל "שני 14:00"), שורה לכל סלוט.`);
        return true;
      }
      case 'm_training': {
        if (SUGGEST_RE.test(text)) {
          const n = await aiSuggestTraining(tenant, data);
          data._counts.training = (data._counts.training || 0) + n;
          await backToMenu(tenant, state, data, fromPhone, `✅ בניתי תוכנית הכשרה לפי העסק (${n} פרקים במרכז הידע)!`);
        } else {
          await sendWhatsApp(fromPhone, `שלח קובץ, "הצע", או "חזרה" 🙂`);
        }
        return true;
      }
      case 'm_customers': {
        await sendWhatsApp(fromPhone, `שלח קובץ של רשימת הלקוחות (CSV/תמונה/PDF), או "חזרה" 🙂`);
        return true;
      }
      case 'm_knowledge': {
        await sendWhatsApp(fromPhone, `שלח קובץ ואכניס אותו למרכז הידע, או "חזרה" כשסיימת 🙂`);
        return true;
      }
      case 'm_invoice_email': {
        const emails = text.split(/[,\s]+/).filter((e) => /\S+@\S+\.\S+/.test(e));
        if (!emails.length) {
          await sendWhatsApp(fromPhone, `זה לא נראה כמו מייל 🤔 נסה שוב, או "חזרה".`);
          return true;
        }
        await saveInvoiceEmails(tenant, emails);
        data._counts.invoice_email = emails.length;
        await backToMenu(tenant, state, data, fromPhone, `✅ נשמר! חשבוניות מ-${emails.join(', ')} ייאספו למערכת.`);
        return true;
      }
    }
  } catch (e: any) {
    console.warn(`[onboarding] module ${stepId} failed:`, e?.message);
    await sendWhatsApp(fromPhone, `😕 משהו השתבש (${String(e?.message || '').slice(0, 80)}). נסה שוב או "חזרה".`);
    return true;
  }
  return true;
}

async function backToMenu(tenant: any, state: any, data: Record<string, any>, fromPhone: string, msg: string) {
  await advanceState(tenant.id, state, state.current_step, 'modules_menu', data);
  await sendWhatsApp(fromPhone, `${msg}\n\n${modulesMenuText(data._counts || {})}`);
}

// === Persistence helpers ===================================================

const sql = (q: string, ...args: any[]) => (prisma as any).$executeRawUnsafe(q, ...args);
const query = (q: string, ...args: any[]) => (prisma as any).$queryRawUnsafe(q, ...args);
const uuid = async () => (await import('node:crypto')).randomUUID();

function ctxOf(tenant: any) {
  return { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name };
}

async function saveData(tenantId: string, data: Record<string, any>) {
  await sql(
    `UPDATE "OnboardingState" SET collected_data = $1::jsonb, last_message_at = NOW(), "updatedAt" = NOW() WHERE tenant_id = $2`,
    JSON.stringify(data), tenantId,
  );
}

async function advanceState(tenantId: string, state: any, fromStep: string, toStep: string, data: Record<string, any>) {
  const completedSteps: string[] = Array.isArray(state.completed_steps) ? state.completed_steps : [];
  if (!completedSteps.includes(fromStep)) completedSteps.push(fromStep);
  state.current_step = toStep;
  state.completed_steps = completedSteps;
  await sql(
    `UPDATE "OnboardingState"
     SET current_step = $1, completed_steps = $2::jsonb, collected_data = $3::jsonb,
         last_message_at = NOW(),
         completed_at = ${toStep === 'done' ? 'NOW()' : 'completed_at'},
         "updatedAt" = NOW()
     WHERE tenant_id = $4`,
    toStep, JSON.stringify(completedSteps), JSON.stringify(data), tenantId,
  );
}

// Core profile + employees-by-count + seating. Runs once, entering modules_menu.
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
  const items = await llmExtract(
    mediaUrl,
    `הקובץ הוא תפריט מסעדה. חלץ את כל המנות: name, category (ראשונות/עיקריות/שתייה... או "כללי"), price (מספר בלבד), description אם יש. אל תמציא.`,
    { name: { type: 'string' }, category: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' } },
    'items', tenant.slug,
  );
  const schema = `tenant_${tenant.slug}`;
  let n = 0;
  for (const it of items) {
    const name = String(it?.name || '').trim();
    if (!name) continue;
    await sql(
      `INSERT INTO "${schema}"."MenuItem" ("id", "name", "category", "description", "price", "available", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      await uuid(), name, String(it?.category || 'כללי'), it?.description ? String(it.description) : null, Number(it?.price) || 0,
    ).then(() => n++).catch((e: any) => console.warn('[onboarding] menu insert:', e?.message));
  }
  return n;
}

async function extractAndInsertChecklists(tenant: any, mediaUrl: string, _data: Record<string, any>): Promise<number> {
  const lists = await llmExtract(
    mediaUrl,
    `הקובץ הוא צ'קליסט תפעולי של מסעדה (או כמה). חלץ: title (שם הצ'קליסט), category (פתיחה/סגירה/מטבח/בר/ניקיון או "כללי"), items (מערך של משימות כטקסט).`,
    { title: { type: 'string' }, category: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
    'checklists', tenant.slug,
  );
  return insertChecklists(tenant, lists);
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

async function aiSuggestChecklists(tenant: any, data: Record<string, any>): Promise<number> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `בנה 3 צ'קליסטים תפעוליים למסעדה מסוג "${data.cuisine || 'כללי'}"` +
      `${data.description ? ` (${data.description})` : ''}: פתיחת בוקר, סגירת ערב, ומטבח.\n` +
      `לכל אחד: title, category, items (6-12 משימות קצרות בעברית).`,
    responseSchema: {
      type: 'object',
      properties: {
        checklists: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' }, category: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['checklists'],
    },
    _ctx: { fn_name: 'onboardingSuggestChecklists', tenant_slug: tenant.slug },
  });
  return insertChecklists(tenant, Array.isArray(result?.checklists) ? result.checklists : []);
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

// WhatsApp self-signup: creates a PendingInvitation in the tenant schema and
// sends each employee a personal link to the tenant's public completion form.
async function inviteEmployeesByWhatsApp(tenant: any, text: string): Promise<number> {
  const schema = `tenant_${tenant.slug}`;
  // Ensure the (lazy) invitation table exists in this tenant's schema with
  // the shape completeEmployeeInvitation expects.
  await sql(`CREATE TABLE IF NOT EXISTS "${schema}"."PendingInvitation" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "token" TEXT UNIQUE,
      "full_name" TEXT NOT NULL,
      "phone" TEXT,
      "email" TEXT,
      "role" TEXT,
      "status" TEXT NOT NULL DEFAULT 'sent',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" TIMESTAMP(3)
    )`).catch(() => {});
  await sql(`ALTER TABLE "${schema}"."PendingInvitation" ADD COLUMN IF NOT EXISTS "token" TEXT`).catch(() => {});
  await sql(`ALTER TABLE "${schema}"."PendingInvitation" ADD COLUMN IF NOT EXISTS "phone" TEXT`).catch(() => {});

  const { randomUUID } = await import('node:crypto');
  let n = 0;
  for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split(/[,،]+/).map((p) => p.trim()).filter(Boolean);
    const fullName = parts[0];
    const phone = (parts[1] || '').replace(/[^\d+]/g, '');
    if (!fullName || phone.length < 9) continue;
    const token = randomUUID().replace(/-/g, '').slice(0, 24);
    try {
      await sql(
        `INSERT INTO "${schema}"."PendingInvitation" ("id", "token", "full_name", "phone", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'sent', NOW(), NOW())`,
        randomUUID(), token, fullName, phone,
      );
      const link = `https://${tenant.slug}.topalena.com/EmployeeComplete?t=${token}`;
      await sendWhatsApp(phone,
        `שלום ${fullName} 🌿\nהוזמנת להצטרף לצוות ${tenant.restaurant_name}.\nלהשלמת הפרטים (שם מלא, מייל, תפקיד) לחץ כאן:\n${link}\n\nזה ייקח דקה 🚀`,
      ).catch((e: any) => console.warn('[onboarding] invite send failed:', e?.message));
      n++;
    } catch (e: any) {
      console.warn('[onboarding] invitation insert failed:', e?.message);
    }
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

async function aiSuggestTraining(tenant: any, data: Record<string, any>): Promise<number> {
  const { invokeLLM } = await import('./llm.js');
  const result: any = await invokeLLM({
    prompt:
      `בנה תוכנית הכשרה לצוות מסעדה מסוג "${data.cuisine || 'כללי'}"` +
      `${data.description ? ` (${data.description})` : ''}. חלק לפי תפקידים (מלצרים, מטבח, ברמנים).\n` +
      `לכל פרק: title (שם הפרק כולל התפקיד), content (תוכן ההכשרה — 5-10 נקודות מפורטות בעברית).`,
    responseSchema: {
      type: 'object',
      properties: {
        chapters: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } },
        },
      },
      required: ['chapters'],
    },
    _ctx: { fn_name: 'onboardingSuggestTraining', tenant_slug: tenant.slug },
  });
  const chapters: any[] = Array.isArray(result?.chapters) ? result.chapters : [];
  return insertKnowledgeEntries(tenant, chapters, 'הכשרה');
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

// === Shared helpers ========================================================

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
    c.tables ? `✅ מפת הושבה עם ${c.tables} שולחנות` : '',
    c.employees ? `✅ ${c.employees} כרטיסי עובדים` : '',
    c.invited ? `✅ ${c.invited} הזמנות וואטסאפ לעובדים` : '',
    c.roles ? `✅ ${c.roles} תפקידים` : '',
    c.checklists ? `✅ ${c.checklists} צ'קליסטים` : '',
    c.suppliers ? `✅ ${c.suppliers} ספקים` : '',
    c.slots ? `✅ ${c.slots} סלוטים לראיונות` : '',
    c.training ? `✅ תוכנית הכשרה (${c.training} פרקים)` : '',
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
