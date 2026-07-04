// WhatsApp-driven onboarding conversation for freshly-provisioned tenants.
// Design: state machine keyed by OnboardingState.current_step. Each step
// has a prompt (what we ask), a parser (interpret the reply), and a
// next-step selector. Persists to OnboardingState between messages so a
// tenant can reply hours later and pick up where they left off.
//
// v2 (2026-07-04): the flow now actually IMPLEMENTS everything it collects —
// RestaurantProfile row, Employee rows, SeatingLayout, MenuItems from an
// uploaded PDF/image — and only then sends the "done" message with the
// app link. v1 collected 5 answers and wrote them to columns that didn't
// exist (name/cuisine instead of restaurant_name/cuisine_style), so the
// app stayed empty and the owner rightly asked what the point was.

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
  | 'employees_list'
  | 'tables_count'
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

const SKIP_RE = /^(דלג|דלגי|skip|אין|לא עכשיו|אין לי)/i;
const CONFIRM_RE = /^(אישור|כן|נכון|בסדר|אוקי+|ok|יס)$/i;

const TOTAL_STEPS = 9;

const STEPS: Record<StepId, StepDef> = {
  welcome: {
    id: 'welcome',
    prompt: (_, ctx) =>
      `🎉 שלום ${ctx.owner_name}! ברוך/ה הבא/ה ל-TopAlena.\n\n` +
      `המערכת שלך מוכנה ואני *AI* שיקים לך את המסעדה במערכת — פרופיל, עובדים, שולחנות ותפריט — הכל מתוך שיחה פשוטה כאן ✨\n\n` +
      `בסוף תקבל קישור לאפליקציה כשהכל כבר מוטמע ומוכן לעבודה.\n\n` +
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
      `🍽 *שלב 1 / ${TOTAL_STEPS} — שם המסעדה*\n\n` +
      `אנחנו רשמנו אותך בתור "${ctx.restaurant_name}".\n` +
      `מה השם המדויק כפי שאתה רוצה שהוא יופיע ללקוחות?\n\n` +
      `(אם מה שרשמנו נכון — פשוט תענה "אישור")`,
    // "אישור"/"כן" mean KEEP the registered name — v1 saved the literal
    // word אישור as the restaurant name and it leaked into the summary.
    parse: (r) => (CONFIRM_RE.test(r.trim()) ? '__KEEP__' : r.trim()),
    saveTo: 'name',
    next: 'address',
  },
  address: {
    id: 'address',
    prompt: () =>
      `📍 *שלב 2 / ${TOTAL_STEPS} — כתובת*\n\n` +
      `מה הכתובת המדויקת של המסעדה?\n\n` +
      `(רחוב, מספר, עיר)`,
    parse: (r) => r.trim(),
    saveTo: 'address',
    next: 'phone',
  },
  phone: {
    id: 'phone',
    prompt: () =>
      `☎️ *שלב 3 / ${TOTAL_STEPS} — טלפון המסעדה*\n\n` +
      `מה מספר הטלפון שבו לקוחות מתקשרים למסעדה?\n\n` +
      `(אפשר "דלג" אם זה אותו מספר שממנו אתה כותב)`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? '__SKIP__' : r.trim()),
    saveTo: 'phone',
    optional: true,
    next: 'opening_hours',
  },
  opening_hours: {
    id: 'opening_hours',
    prompt: () =>
      `🕒 *שלב 4 / ${TOTAL_STEPS} — שעות פתיחה*\n\n` +
      `מה שעות הפעילות של המסעדה?\n\n` +
      `(דוגמה: "א-ה 12:00-23:00, ו' 12:00-16:00, מוצש 20:00-01:00")`,
    parse: (r) => r.trim(),
    saveTo: 'opening_hours',
    next: 'cuisine',
  },
  cuisine: {
    id: 'cuisine',
    prompt: () =>
      `🥘 *שלב 5 / ${TOTAL_STEPS} — סוג המטבח*\n\n` +
      `איזה מטבח? (איטלקי, ישראלי, בשר על האש, סושי, קפה, וכו')\n\n` +
      `רק תיאור קצר בשורה אחת.`,
    parse: (r) => r.trim(),
    saveTo: 'cuisine',
    next: 'description',
  },
  description: {
    id: 'description',
    prompt: () =>
      `📝 *שלב 6 / ${TOTAL_STEPS} — קצת על המסעדה*\n\n` +
      `ספר לי על המסעדה ב-2-3 משפטים: מה האווירה, מי הקהל, מה מיוחד אצלכם?\n\n` +
      `(זה עוזר ל-AI שלך לכתוב שיווק, תדריכים ותשובות ללקוחות בטון הנכון. אפשר "דלג")`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? '__SKIP__' : r.trim()),
    saveTo: 'description',
    optional: true,
    next: 'employee_count',
  },
  employee_count: {
    id: 'employee_count',
    prompt: () =>
      `👥 *שלב 7 / ${TOTAL_STEPS} — צוות*\n\n` +
      `כמה עובדים יש במסעדה בממוצע?\n\n` +
      `(סתם מספר בערך — "8", "12-15", וכו')`,
    parse: (r) => r.trim(),
    saveTo: 'employee_count',
    next: 'employees_list',
  },
  employees_list: {
    id: 'employees_list',
    prompt: () =>
      `📋 *שלב 8 / ${TOTAL_STEPS} — רשימת העובדים*\n\n` +
      `רשום לי את העובדים — כל עובד בשורה נפרדת: שם, תפקיד.\n\n` +
      `דוגמה:\n` +
      `דנה, מלצרית\n` +
      `יוסי, טבח\n` +
      `רועי, ברמן\n\n` +
      `אני אצור לכל אחד כרטיס עובד במערכת. (אפשר "דלג" ולהוסיף אחר כך)`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? '__SKIP__' : r.trim()),
    saveTo: 'employees_list',
    optional: true,
    next: 'tables_count',
  },
  tables_count: {
    id: 'tables_count',
    prompt: () =>
      `🪑 *שלב 9 / ${TOTAL_STEPS} — שולחנות*\n\n` +
      `כמה שולחנות יש במסעדה בערך?\n\n` +
      `אני אצור מפת הושבה בסיסית שתוכל לסדר אחר כך בגרירה. (אפשר "דלג")`,
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
      `📸 *בונוס — התפריט*\n\n` +
      `יש לך תפריט מוכן? שלח לי תמונה או PDF ואני אקרא, אזהה מנות ומחירים, ואכניס למערכת אוטומטית.\n\n` +
      `אין לך עדיין? שלח "דלג" ונמשיך בלעדיו — תוכל להוסיף מנות מאוחר יותר.`,
    parse: (r) => (SKIP_RE.test(r.trim()) ? 'skip' : null), // real menu comes as media
    optional: true,
    next: 'done',
  },
  done: {
    id: 'done',
    // The real done message is built by buildDoneMessage() with the persist
    // summary — this static prompt is only a fallback.
    prompt: (data, ctx) =>
      `🎊 *סיימנו!* הפרטים הוטמעו במערכת של ${data.name && data.name !== '__KEEP__' ? data.name : ctx.restaurant_name}.\n` +
      `מעכשיו אני העוזר האישי שלך — שאל אותי כל דבר 💪`,
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

  // Required steps re-ask on unparseable input.
  if (parsed == null && !currentStep.optional) {
    await sendWhatsApp(fromPhone, `לא הצלחתי להבין 🤔 ננסה שוב:\n\n${currentStep.prompt(state.collected_data || {}, { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name })}`);
    return true;
  }

  // Save collected data if the step maps to a field (skip markers excluded)
  const data: Record<string, any> = state.collected_data || {};
  if (currentStep.saveTo && parsed != null && parsed !== '__SKIP__') {
    data[currentStep.saveTo] = parsed;
  }

  // Move to next step
  const next = STEPS[currentStep.next];
  const completedSteps: string[] = Array.isArray(state.completed_steps) ? state.completed_steps : [];
  if (!completedSteps.includes(currentStep.id)) completedSteps.push(currentStep.id);

  await (prisma as any).$executeRawUnsafe(
    `UPDATE "OnboardingState"
     SET current_step = $1, completed_steps = $2::jsonb, collected_data = $3::jsonb,
         last_message_at = NOW(),
         completed_at = ${next.id === 'done' && currentStep.id !== 'done' ? 'NOW()' : 'completed_at'},
         "updatedAt" = NOW()
     WHERE tenant_id = $4`,
    next.id, JSON.stringify(completedSteps), JSON.stringify(data), state.tenant_id,
  );

  if (currentStep.id === 'done') return true; // already finished earlier

  if (next.id === 'done') {
    // IMPLEMENT first, announce after — the whole promise of the flow is
    // that the link arrives when the system is already set up.
    const summary = await persistOnboardingData(tenant, data).catch((e: any) => {
      console.warn('[onboarding] persist failed', e?.message);
      return null;
    });
    await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data, summary, 0));
    return true;
  }

  await sendWhatsApp(
    fromPhone,
    next.prompt(data, { restaurant_name: tenant.restaurant_name, owner_name: tenant.owner_name }),
  );
  return true;
}

// Called from the Twilio webhook when a media message arrives. If the
// sender is mid-onboarding at the menu step, we take over: caller should
// ACK immediately (Twilio 15s timeout) — we extract + insert + finish in
// the background. Returns true when the media was claimed.
export async function tryHandleOnboardingMedia(
  fromPhone: string,
  mediaUrl: string,
  _contentType: string,
): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state || state.current_step !== 'menu_intro') return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  void (async () => {
    let menuCount = 0;
    try {
      const { invokeLLM } = await import('./llm.js');
      const result: any = await invokeLLM({
        prompt:
          `הקובץ המצורף הוא תפריט מסעדה (עברית או אנגלית). חלץ את כל המנות.\n` +
          `לכל מנה: name (שם), category (קטגוריה כמו ראשונות/עיקריות/שתייה — אם לא ברור רשום "כללי"), price (מספר בלבד, בלי ₪), description (אם יש).\n` +
          `אל תמציא מנות. החזר את כולן.`,
        fileUrls: [mediaUrl],
        responseSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  category: { type: 'string' },
                  price: { type: 'number' },
                  description: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
          required: ['items'],
        },
        maxOutputTokens: 32768,
        timeoutMs: 90_000,
        _ctx: { fn_name: 'onboardingMenuExtract', tenant_slug: tenant.slug },
      });
      const items: any[] = Array.isArray(result?.items) ? result.items : [];
      const { randomUUID } = await import('node:crypto');
      const schema = `tenant_${tenant.slug}`;
      for (const it of items) {
        const name = String(it?.name || '').trim();
        if (!name) continue;
        try {
          await (prisma as any).$executeRawUnsafe(
            `INSERT INTO "${schema}"."MenuItem" ("id", "name", "category", "description", "price", "available", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
            randomUUID(), name, String(it?.category || 'כללי'), it?.description ? String(it.description) : null,
            Number(it?.price) || 0,
          );
          menuCount++;
        } catch (e: any) {
          console.warn('[onboarding] menu item insert failed:', e?.message);
        }
      }
    } catch (e: any) {
      console.warn('[onboarding] menu extraction failed:', e?.message);
    }

    // Finish the flow: persist everything + advance state to done.
    const data: Record<string, any> = state.collected_data || {};
    const summary = await persistOnboardingData(tenant, data).catch((e: any) => {
      console.warn('[onboarding] persist failed', e?.message);
      return null;
    });
    const completedSteps: string[] = Array.isArray(state.completed_steps) ? state.completed_steps : [];
    if (!completedSteps.includes('menu_intro')) completedSteps.push('menu_intro');
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "OnboardingState"
       SET current_step = 'done', completed_steps = $1::jsonb, completed_at = NOW(),
           last_message_at = NOW(), "updatedAt" = NOW()
       WHERE tenant_id = $2`,
      JSON.stringify(completedSteps), state.tenant_id,
    ).catch(() => {});
    await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data, summary, menuCount)).catch(() => {});
  })();

  return true;
}

// === Helpers ==============================================================

export async function ensureOnboardingRow(tenantId: string): Promise<void> {
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

// Writes EVERYTHING the conversation collected into the tenant's schema:
// RestaurantProfile (real column names!), Employee rows, SeatingLayout.
// Returns a summary for the done message. Idempotent-ish: profile is
// upserted; employees/tables are only created if none exist yet, so a
// re-run doesn't duplicate.
async function persistOnboardingData(
  tenant: any,
  data: Record<string, any>,
): Promise<{ profile: boolean; employees: number; tables: number }> {
  const slug = tenant.slug;
  const schema = `tenant_${slug}`;
  const { randomUUID } = await import('node:crypto');
  const sql = (q: string, ...args: any[]) => (prisma as any).$executeRawUnsafe(q, ...args);
  const query = (q: string, ...args: any[]) => (prisma as any).$queryRawUnsafe(q, ...args);
  const summary = { profile: false, employees: 0, tables: 0 };

  const finalName =
    data.name && data.name !== '__KEEP__' ? String(data.name) : String(tenant.restaurant_name || slug);

  // 0. Corrected name propagates to the platform Tenant row (used by the
  // welcome messages, PlatformAdmin, and brand lookups).
  if (finalName !== tenant.restaurant_name) {
    await sql(`UPDATE "Tenant" SET restaurant_name = $1, "updatedAt" = NOW() WHERE id = $2`, finalName, tenant.id)
      .catch(() => {});
  }

  // 1. RestaurantProfile — REAL columns (v1 wrote to name/cuisine which
  // don't exist → silent failure, empty app). Older tenant schemas may
  // predate the business-profile columns; add them idempotently first.
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
           restaurant_name = $1,
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           opening_hours = COALESCE($4::jsonb, opening_hours),
           cuisine_style = COALESCE($5, cuisine_style),
           description = COALESCE($6, description),
           "updatedAt" = NOW()
         WHERE id = $7`,
        finalName, data.address || null, data.phone || null,
        data.opening_hours ? hoursJson : null,
        data.cuisine || null, data.description || null, existing[0].id,
      );
    } else {
      await sql(
        `INSERT INTO "${schema}"."RestaurantProfile"
           ("id", "restaurant_name", "address", "phone", "opening_hours", "cuisine_style", "description", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())`,
        randomUUID(), finalName, data.address || null, data.phone || null,
        data.opening_hours ? hoursJson : JSON.stringify(''),
        data.cuisine || null, data.description || null,
      );
    }
    summary.profile = true;
  } catch (e: any) {
    console.warn('[onboarding] profile persist failed:', e?.message);
  }

  // 2. Employees — "שם, תפקיד" per line. Only if the tenant has none yet.
  if (data.employees_list) {
    try {
      const existing: any[] = await query(`SELECT COUNT(*)::int AS n FROM "${schema}"."Employee"`);
      if ((existing[0]?.n || 0) === 0) {
        const lines = String(data.employees_list).split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/[,\-–—:]+/).map((p: string) => p.trim()).filter(Boolean);
          const fullName = parts[0];
          const role = parts[1] || 'עובד';
          if (!fullName || fullName.length < 2) continue;
          await sql(
            `INSERT INTO "${schema}"."Employee" ("id", "full_name", "email", "role", "status", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())`,
            randomUUID(), fullName,
            `${slug}-${summary.employees + 1}@pending.topalena.com`, // Employee.email is NOT NULL; placeholder until real email is set in-app
            role,
          ).catch((e: any) => console.warn('[onboarding] employee insert failed:', e?.message));
          summary.employees++;
        }
      }
    } catch (e: any) {
      console.warn('[onboarding] employees persist failed:', e?.message);
    }
  }

  // 3. Seating — a simple grid layout the owner can drag-fix in the app.
  const tableCount = Number(data.tables_count) || 0;
  if (tableCount > 0 && tableCount <= 200) {
    try {
      const existing: any[] = await query(`SELECT COUNT(*)::int AS n FROM "${schema}"."SeatingLayout"`);
      if ((existing[0]?.n || 0) === 0) {
        const tables = Array.from({ length: tableCount }, (_, i) => ({
          table_number: String(i + 1),
          min_capacity: 2,
          max_capacity: 4,
          location: 'indoor',
          area: 'ראשי',
          combinable_with: [],
          features: [],
          x: 40 + (i % 6) * 120,
          y: 40 + Math.floor(i / 6) * 120,
          width: 80,
          height: 80,
        }));
        await sql(
          `INSERT INTO "${schema}"."SeatingLayout" ("id", "layout_name", "tables", "createdAt", "updatedAt")
           VALUES ($1, 'מפה ראשית', $2::jsonb, NOW(), NOW())`,
          randomUUID(), JSON.stringify(tables),
        );
        summary.tables = tableCount;
      }
    } catch (e: any) {
      console.warn('[onboarding] seating persist failed:', e?.message);
    }
  }

  return summary;
}

function buildDoneMessage(
  tenant: any,
  data: Record<string, any>,
  summary: { profile: boolean; employees: number; tables: number } | null,
  menuCount: number,
): string {
  const name = data.name && data.name !== '__KEEP__' ? data.name : tenant.restaurant_name;
  const link = `https://${tenant.slug}.topalena.com`;
  const lines: string[] = [
    `🎊 *סיימנו — הכל הוטמע במערכת!*`,
    ``,
    `🍽 ${name}`,
    data.address ? `📍 ${data.address}` : '',
    data.opening_hours ? `🕒 ${data.opening_hours}` : '',
    data.cuisine ? `🥘 ${data.cuisine}` : '',
    ``,
    `*מה נוצר עבורך:*`,
    summary?.profile ? `✅ פרופיל עסקי מלא` : `⚠️ הפרופיל לא נשמר — נשלים באפליקציה`,
    summary && summary.employees > 0 ? `✅ ${summary.employees} כרטיסי עובדים` : '',
    summary && summary.tables > 0 ? `✅ מפת הושבה עם ${summary.tables} שולחנות` : '',
    menuCount > 0 ? `✅ ${menuCount} מנות נקלטו מהתפריט` : '',
    ``,
    `🔗 *היכנס לאפליקציה שלך — הכל כבר בפנים:*`,
    link,
    `(המייל והסיסמה הזמנית נשלחו לך קודם)`,
    ``,
    `מעכשיו אני העוזר האישי שלך. אפשר לשאול אותי כל דבר:`,
    `• "כמה עובדים במשמרת?"`,
    `• "תסכם את היום שעבר"`,
    `• תעלה חשבוניות ואני אכניס אוטומטית`,
    ``,
    `בואו נעבוד! 💪`,
  ];
  return lines.filter((l) => l !== '').join('\n');
}
