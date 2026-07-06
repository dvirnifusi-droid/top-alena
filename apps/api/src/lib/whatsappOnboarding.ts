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
    `מנות בתפריט: ${c.menu || 0}`,
    `עובדים: ${c.employees || 0}${c.invited ? ` (+${c.invited} הזמנות)` : ''}`,
    `שולחנות: ${data.tables_count || c.tables || 0}`,
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
// then optional extras, then "ready to finish".
function nextMissing(data: Record<string, any>): string {
  const c = data._counts || {};
  if (!data.name) return 'שם המסעדה';
  if (!data.address) return 'כתובת מדויקת (רחוב, מספר, עיר)';
  if (!data.opening_hours) return 'שעות פתיחה';
  if (!data.cuisine) return 'סוג המטבח (בשורה אחת)';
  if (!c.menu) return 'תפריט — בקש ממנו לשלוח צילום או PDF ואתה תקרא את המנות (אפשר "אחר כך")';
  if (!c.employees && !c.invited) return 'עובדים — הוא יכול לשלוח רשימה/קובץ, או שתשלח קישור הצטרפות שכל עובד נרשם לבד (אפשר "אחר כך")';
  if (data.tables_count == null && !c.tables) return 'כמה שולחנות יש בערך (אפשר "אחר כך")';
  if (!c.checklists) return 'צ׳קליסטים — קובץ קיים, או שתבנה לו לפי סוג העסק (אפשר "אחר כך")';
  if (!c.suppliers) return 'ספקים שהוא עובד איתם (אפשר "אחר כך")';
  if (!c.customers) return 'מועדון לקוחות — קובץ לייבוא (אפשר "אחר כך")';
  if (!c.knowledge) return 'מסמכי ידע ל-AI — נהלים/מתכונים/שאלות נפוצות (אפשר "אחר כך")';
  if (!c.invoice_email) return 'מייל שאליו מגיעות חשבוניות מספקים (אפשר "אחר כך")';
  return 'הכל מוכן — סמן finished=true והציע לו את הקישור לאפליקציה';
}

// The brain. Given history + state + the owner's message, returns the natural
// reply + any structured data the owner just gave.
async function onboardingBrain(
  tenant: any, history: any[], message: string, data: Record<string, any>,
): Promise<any> {
  const { invokeLLM } = await import('./llm.js');
  const convo = (history || []).slice(-12).map((t) => `${t.role === 'assistant' ? 'עוזר' : 'בעלים'}: ${t.content}`).join('\n');
  const prompt =
    `אתה "העוזר החכם" של TopAlena — מקים מסעדה בשם "${data.name || tenant.restaurant_name}" עבור ${tenant.owner_name || 'הבעלים'}.\n` +
    `דבר עברית טבעית, חמה ואנושית — כמו נציג אמיתי, לא בוט.\n\n` +
    `## חוקים\n` +
    `1. שאל שאלה אחת אטומית בכל פעם. שם = שאלה, כתובת = שאלה נפרדת, שעות = נפרדת. לעולם אל תקבץ כמה דברים בשאלה אחת.\n` +
    `2. אם הבעלים שואל אותך שאלה (איך.../מה זה.../כמה עולה/אפשר...) — ענה לו כמו שירות לקוחות אמיתי, קצר ומדויק, ואז חזור בעדינות לשאלה הבאה.\n` +
    `3. קבל כל תשובה בשפה חופשית וחלץ את הערך. אל תמציא — אם לא ברור, שאל שוב יפה.\n` +
    `4. אם הבעלים אומר "דלג"/"אחר כך"/"אין לי" — עבור לשאלה הבאה בלי לחץ.\n` +
    `5. תגובות קצרות (משפט-שניים) + אימוג'י אחד מתאים. חם אבל לא מוגזם.\n\n` +
    `## מה כבר הוקם\n${summarizeState(data, tenant)}\n\n` +
    `## מה עוד חסר — שאל את זה עכשיו (בטון טבעי):\n${nextMissing(data)}\n\n` +
    `## השיחה עד כה\n${convo || '(ההתחלה)'}\n\n` +
    `## ההודעה של הבעלים עכשיו\n"${message}"\n\n` +
    `החזר JSON: reply (מה לשלוח), profile (שדות שהבעלים נתן עכשיו — רק אלה שבאמת הופיעו), list_kind + list_text (אם נתן רשימה בטקסט של עובדים/ספקים/תפקידים/מיילים), finished (true רק אם הבעלים סיים והליבה מוכנה).`;

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
        finished: { type: 'boolean' },
      },
      required: ['reply'],
    },
    maxOutputTokens: 2048,
    timeoutMs: 40_000,
    _ctx: { fn_name: 'onboardingBrain', tenant_slug: tenant.slug },
  });
  return result && result.reply ? result : { reply: 'סליחה, רגע — אפשר לכתוב לי את זה שוב? 🙏' };
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

// Classifies an inbound file and routes it to the right extractor. Returns
// the kind + how many rows were embedded.
async function classifyAndImport(
  tenant: any, mediaUrl: string, _contentType: string, data: Record<string, any>,
): Promise<{ kind: string; count: number }> {
  const { invokeLLM } = await import('./llm.js');
  const c: any = await invokeLLM({
    prompt:
      `הקובץ המצורף שייך למסעדה שמתחילה לעבוד עם המערכת. סווג אותו לאחת מהקטגוריות:\n` +
      `menu (תפריט אוכל/שתייה), work_schedule (סידור עבודה), employee_list (רשימת עובדים), ` +
      `checklist (צ׳קליסט תפעולי), customer_list (רשימת לקוחות/מועדון), knowledge (נוהל/מתכון/מסמך ידע/שאלות נפוצות), other.\n` +
      `החזר kind בלבד.`,
    fileUrls: [mediaUrl],
    responseSchema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'] },
    timeoutMs: 40_000,
    _ctx: { fn_name: 'onboardingClassify', tenant_slug: tenant.slug },
  }).catch(() => ({ kind: 'other' }));

  const kind = String(c?.kind || 'other').trim();
  data._counts = data._counts || {};
  let count = 0;
  try {
    if (kind === 'menu') { count = await extractAndInsertMenu(tenant, mediaUrl); data._counts.menu = (data._counts.menu || 0) + count; }
    else if (kind === 'work_schedule') { count = await extractAndInsertRolesFromFile(tenant, mediaUrl); data._counts.roles = (data._counts.roles || 0) + count; }
    else if (kind === 'employee_list') { count = await extractAndInsertEmployeesFromFile(tenant, mediaUrl); data._counts.employees = (data._counts.employees || 0) + count; }
    else if (kind === 'checklist') { count = await extractAndInsertChecklists(tenant, mediaUrl, data); data._counts.checklists = (data._counts.checklists || 0) + count; }
    else if (kind === 'customer_list') { count = await extractAndInsertCustomers(tenant, mediaUrl); data._counts.customers = (data._counts.customers || 0) + count; }
    else { count = await extractAndInsertKnowledge(tenant, mediaUrl, 'כללי'); data._counts.knowledge = (data._counts.knowledge || 0) + count; }
  } catch (e: any) {
    console.warn(`[onboarding] import ${kind}:`, e?.message);
  }
  return { kind, count };
}

const KIND_LABEL: Record<string, string> = {
  menu: 'תפריט', work_schedule: 'סידור עבודה', employee_list: 'רשימת עובדים',
  checklist: 'צ׳קליסט', customer_list: 'מועדון לקוחות', knowledge: 'מסמך ידע', other: 'מסמך',
};

// === Public API ============================================================

export async function startOnboarding(tenantId: string): Promise<void> {
  await ensureOnboardingRow(tenantId);
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const first =
    `שלום ${tenant.owner_name || ''}! 🌿 אני העוזר החכם של TopAlena, ואני אקים לך את המסעדה תוך כמה דקות — ` +
    `שאלה אחת בכל פעם. אפשר לענות בכתב, בהקלטה קולית, או פשוט לשלוח לי קבצים (תפריט, סידור עבודה, רשימת עובדים...) ואני אקרא ואטמיע לבד.\n\n` +
    `בוא נתחיל — *איך קוראים למסעדה?*`;
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
  history.push({ role: 'user', content: body });

  const result = await onboardingBrain(tenant, history, body, data)
    .catch((e: any) => { console.warn('[onboarding] brain:', e?.message); return { reply: 'סליחה, רגע קטן... אפשר לכתוב שוב? 🙏' }; });
  await applyExtraction(tenant, result, data).catch((e: any) => console.warn('[onboarding] apply:', e?.message));

  history.push({ role: 'assistant', content: result.reply });
  data._history = history.slice(-24);

  const finished = !!result.finished && !!data.name;
  if (finished) {
    const summary = await persistCoreData(tenant, data).catch(() => null);
    data._counts = data._counts || {};
    if (summary?.tables) data._counts.tables = summary.tables;
    await setPhase(state.tenant_id, 'done', data);
    await sendWhatsApp(fromPhone, buildDoneMessage(tenant, data));
  } else {
    await setPhase(state.tenant_id, 'active', data);
    await sendWhatsApp(fromPhone, result.reply);
  }
  return true;
}

// File turn — classify + embed, then let the brain acknowledge naturally and
// ask the next thing. ACK immediately in the caller; this runs in background.
export async function tryHandleOnboardingMedia(
  fromPhone: string, mediaUrl: string, contentType: string,
): Promise<boolean> {
  const state = await findActiveOnboarding(fromPhone);
  if (!state) return false;
  const tenant = await getTenant(state.tenant_id);
  if (!tenant) return false;

  void (async () => {
    const data: Record<string, any> = state.collected_data || {};
    const history: any[] = Array.isArray(data._history) ? data._history : [];
    let synthetic: string;
    try {
      const { kind, count } = await classifyAndImport(tenant, mediaUrl, contentType, data);
      synthetic = `[המערכת קלטה קובץ מסוג "${KIND_LABEL[kind] || kind}" והטמיעה ${count} פריטים. תודה לבעלים על הקובץ בקצרה, ואז המשך לשאלה הבאה שחסרה.]`;
    } catch (e: any) {
      synthetic = `[הקובץ לא נקרא (${String(e?.message || '').slice(0, 60)}). בקש מהבעלים לשלוח שוב בצילום ברור יותר, או להמשיך.]`;
    }
    history.push({ role: 'user', content: '(שלח קובץ)' });
    const result = await onboardingBrain(tenant, history, synthetic, data)
      .catch(() => ({ reply: 'קלטתי את הקובץ ✅ נמשיך!' }));
    await applyExtraction(tenant, result, data).catch(() => {});
    history.push({ role: 'assistant', content: result.reply });
    data._history = history.slice(-24);
    await setPhase(tenant.id, 'active', data).catch(() => {});
    await sendWhatsApp(fromPhone, result.reply).catch(() => {});
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
    c.tables ? `✅ מפת הושבה עם ${c.tables} שולחנות` : '',
    c.employees ? `✅ ${c.employees} כרטיסי עובדים` : '',
    c.invited ? `✅ ${c.invited} הזמנות וואטסאפ לעובדים` : '',
    c.roles ? `✅ ${c.roles} תפקידים` : '',
    c.checklists ? `✅ ${c.checklists} צ'קליסטים` : '',
    c.suppliers ? `✅ ${c.suppliers} ספקים` : '',
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
