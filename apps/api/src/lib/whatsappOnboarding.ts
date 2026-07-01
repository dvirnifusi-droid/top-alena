// WhatsApp-driven onboarding conversation for freshly-provisioned tenants.
// Design: state machine keyed by OnboardingState.current_step. Each step
// has a prompt (what we ask), a parser (interpret the reply), and a
// next-step selector. Persists to OnboardingState between messages so a
// tenant can reply hours later and pick up where they left off.

import { PrismaClient } from '@prisma/client';
import { sendWhatsApp } from './twilio.js';

const prisma: any = new PrismaClient();

type StepId =
  | 'welcome'
  | 'restaurant_name'
  | 'address'
  | 'opening_hours'
  | 'cuisine'
  | 'employee_count'
  | 'menu_intro'
  | 'done';

interface StepDef {
  id: StepId;
  prompt: (data: Record<string, any>, ctx: { restaurant_name: string; owner_name: string }) => string;
  parse?: (reply: string) => any; // returns extracted value or null if unclear
  next: StepId;
  saveTo?: string; // key in collected_data
  optional?: boolean; // can be skipped with "דלג" / "אין לי"
}

const STEPS: Record<StepId, StepDef> = {
  welcome: {
    id: 'welcome',
    prompt: (_, ctx) =>
      `🎉 שלום ${ctx.owner_name}! ברוך/ה הבא/ה ל-TopAlena.\n\n` +
      `המערכת שלך מוכנה ואני *AI* שיעזור לך לסיים את ההקמה תוך 5 דקות ✨\n\n` +
      `כל מה שאתה צריך לעשות זה לענות לי בהודעות פשוטות, ואני אכניס הכל למערכת בשבילך.\n\n` +
      `*מוכן/ה להתחיל?* שלח "כן" כדי להתחיל, או "אחר כך" אם עסוק/ה עכשיו.`,
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
      `🍽 *שלב 1 / 5 — שם המסעדה*\n\n` +
      `אנחנו רשמנו אותך בתור "${ctx.restaurant_name}".\n` +
      `מה השם המדויק כפי שאתה רוצה שהוא יופיע ללקוחות?\n\n` +
      `(אם המשך של מה שרשמת נכון — פשוט תענה "אישור")`,
    parse: (r) => r.trim(),
    saveTo: 'name',
    next: 'address',
  },
  address: {
    id: 'address',
    prompt: () =>
      `📍 *שלב 2 / 5 — כתובת*\n\n` +
      `מה הכתובת המדויקת של המסעדה?\n\n` +
      `(רחוב, מספר, עיר)`,
    parse: (r) => r.trim(),
    saveTo: 'address',
    next: 'opening_hours',
  },
  opening_hours: {
    id: 'opening_hours',
    prompt: () =>
      `🕒 *שלב 3 / 5 — שעות פתיחה*\n\n` +
      `מה שעות הפעילות של המסעדה?\n\n` +
      `(דוגמה: "א-ה 12:00-23:00, ו' 12:00-16:00, מוצש 20:00-01:00")`,
    parse: (r) => r.trim(),
    saveTo: 'opening_hours',
    next: 'cuisine',
  },
  cuisine: {
    id: 'cuisine',
    prompt: () =>
      `🥘 *שלב 4 / 5 — סוג המטבח*\n\n` +
      `איזה מטבח? (איטלקי, ישראלי, בשר על האש, סושי, בייגלה, קפה, וכו')\n\n` +
      `רק תיאור קצר בשורה אחת.`,
    parse: (r) => r.trim(),
    saveTo: 'cuisine',
    next: 'employee_count',
  },
  employee_count: {
    id: 'employee_count',
    prompt: () =>
      `👥 *שלב 5 / 5 — צוות*\n\n` +
      `כמה עובדים יש במסעדה בממוצע?\n\n` +
      `(סתם מספר בערך — "8", "12-15", וכו')`,
    parse: (r) => r.trim(),
    saveTo: 'employee_count',
    next: 'menu_intro',
  },
  menu_intro: {
    id: 'menu_intro',
    prompt: () =>
      `📸 *בונוס — התפריט*\n\n` +
      `יש לך תפריט מוכן? שלח לי תמונה או PDF ואני אקרא, אזהה מנות ומחירים, ואכניס למערכת אוטומטית.\n\n` +
      `אין לך עדיין? שלח "דלג" ונמשיך בלעדיו — תוכל להוסיף מנות מאוחר יותר.`,
    parse: (r) => {
      const t = r.trim().toLowerCase();
      if (/^(דלג|skip|אין)/.test(t)) return 'skip';
      return null; // real menu comes as media, not text — handled elsewhere
    },
    optional: true,
    next: 'done',
  },
  done: {
    id: 'done',
    prompt: (data, ctx) =>
      `🎊 *סיימנו!*\n\n` +
      `הכנסתי את הפרטים למערכת:\n` +
      `🍽 ${data.name || ctx.restaurant_name}\n` +
      `📍 ${data.address || '—'}\n` +
      `🕒 ${data.opening_hours || '—'}\n\n` +
      `מעכשיו אני העוזר האישי שלך.\n` +
      `אתה יכול לשאול אותי כל דבר:\n` +
      `• "מה היתרה שלי?"\n` +
      `• "כמה עובדים במשמרת?"\n` +
      `• "תסכם את היום שעבר"\n` +
      `• תעלה חשבוניות ואני אכניס אוטומטית\n\n` +
      `בואו נעבוד! 💪`,
    next: 'done',
  },
};

// === Public API ============================================================

export async function startOnboarding(tenantId: string): Promise<void> {
  await ensureOnboardingRow(tenantId);
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const step = STEPS.welcome;
  await sendWhatsApp(
    tenant.owner_phone,
    step.prompt({}, { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name }),
  );
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "OnboardingState" SET started_at = NOW(), last_message_at = NOW(), "updatedAt" = NOW() WHERE tenant_id = $1`,
    tenantId,
  );
}

// Called from the Twilio webhook. Returns true if the message was handled
// as an onboarding reply. Returns false if the sender isn't a tenant owner
// mid-onboarding — caller should continue with normal routing.
export async function tryHandleOnboardingMessage(fromPhone: string, body: string): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  const currentStep = STEPS[state.current_step as StepId] || STEPS.welcome;
  const parsed = currentStep.parse ? currentStep.parse(body) : body.trim();

  // Welcome — handle "later" specially.
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

  // Save collected data if the step maps to a field
  const data: Record<string, any> = state.collected_data || {};
  if (currentStep.saveTo && parsed != null) {
    data[currentStep.saveTo] = parsed;
  }

  // Move to next step
  const next = STEPS[currentStep.next];
  const completedSteps: string[] = Array.isArray(state.completed_steps) ? state.completed_steps : [];
  if (!completedSteps.includes(currentStep.id)) completedSteps.push(currentStep.id);

  const isDone = next.id === 'done' && currentStep.id === 'done';
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "OnboardingState"
     SET current_step = $1, completed_steps = $2::jsonb, collected_data = $3::jsonb,
         last_message_at = NOW(),
         completed_at = ${next.id === 'done' && currentStep.id !== 'done' ? 'NOW()' : 'completed_at'},
         "updatedAt" = NOW()
     WHERE tenant_id = $4`,
    next.id, JSON.stringify(completedSteps), JSON.stringify(data), state.tenant_id,
  );

  if (isDone) return true; // already sent the done message

  await sendWhatsApp(
    fromPhone,
    next.prompt(data, { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name }),
  );

  // If we've just entered 'done', persist the collected data into the
  // tenant's RestaurantProfile so the app shows it immediately.
  if (next.id === 'done') {
    await persistRestaurantProfile(tenant.slug, data).catch((e) =>
      console.warn('[onboarding] persist profile failed', e?.message),
    );
  }
  return true;
}

// === Helpers ==============================================================

async function ensureOnboardingRow(tenantId: string): Promise<void> {
  // ON CONFLICT DO NOTHING — safe to call multiple times.
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "OnboardingState" ("id", "tenant_id") VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO NOTHING`,
    randomUUID(), tenantId,
  );
}

async function getTenant(tenantId: string): Promise<any | null> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, owner_name, owner_phone, owner_email, status
     FROM "Tenant" WHERE id = $1`, tenantId,
  );
  return rows[0] || null;
}

async function findActiveOnboarding(fromPhone: string): Promise<any | null> {
  const digits = String(fromPhone || '').replace(/\D/g, '').replace(/^0/, '972');
  const variants = [fromPhone, digits, `0${digits.replace(/^972/, '')}`, `+${digits}`];
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT os.tenant_id, os.current_step, os.completed_steps, os.collected_data
     FROM "OnboardingState" os
     INNER JOIN "Tenant" t ON t.id = os.tenant_id
     WHERE os.current_step <> 'done' AND t.owner_phone = ANY($1::text[])
     LIMIT 1`,
    variants,
  );
  return rows[0] || null;
}

// Writes the collected onboarding data into the tenant's own schema so the
// app shows the profile from day 1.
async function persistRestaurantProfile(slug: string, data: Record<string, any>): Promise<void> {
  const schema = `tenant_${slug}`;
  const { randomUUID } = await import('node:crypto');
  // Best-effort — the RestaurantProfile schema may vary. Wrap in try/catch.
  try {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "${schema}"."RestaurantProfile" ("id", "name", "address", "opening_hours", "cuisine", "notes", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      randomUUID(),
      data.name || null, data.address || null, data.opening_hours || null,
      data.cuisine || null,
      `employees≈${data.employee_count || '?'}`,
    );
  } catch (e: any) {
    console.warn('[onboarding] RestaurantProfile insert failed', e?.message);
  }
}
