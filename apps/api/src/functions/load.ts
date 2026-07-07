/**
 * Registers all ported functions. Each function mirrors the Deno entry.ts
 * under base44/functions/<name>/ — see base44/functions/* for original sources.
 *
 * Functions marked TODO are stubs that need their original logic ported.
 */
import './emailInvoices.js';
import './checklistAi.js';
import './employeePay.js';
import './cashflowLive.js';
import './laborCost.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { registerFn, functionHandlers } from './index.js';
import { sendSms, sendWhatsApp, sendWhatsAppTemplate } from '../lib/twilio.js';
import { pushover, pushoverToAdmins, pushoverEventsOwners } from '../lib/pushover.js';
import { fireTriggers } from '../lib/triggers.js';
import { sendTelegramMessage } from '../lib/telegram.js';
import { sendEmail } from '../lib/email.js';
import { invokeLLM, generateImage } from '../lib/llm.js';
import { driveAccessToken, listDriveFiles, downloadDriveFile } from '../lib/gdrive.js';
import { uploadStreamToS3 } from '../lib/storage.js';
import { MODULE_CATALOG, SUB_FEATURE_CATALOG } from '../lib/modules.js';
import { getMyMonthlyUsage } from '../lib/aiUsage.js';
import { getBrandName, renderBrand } from '../lib/brandName.js';
import { businessContextBlock, invalidateBusinessContextCache } from '../lib/businessContext.js';
import { Readable } from 'node:stream';
import webpush from 'web-push';
import {
  distanceMeters,
  GEOFENCE_IN_RADIUS_M,
  GEOFENCE_OUT_RADIUS_M,
  GEOFENCE_WARMUP_SECONDS,
  HEARTBEAT_INTERVAL_SECONDS,
} from '../lib/geofence.js';

// Configure VAPID once (free browser/PWA push). Keys from env.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@alenabepita.co.il',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

const db = prisma as any; // generic delegate access

// Public deploy marker — lets us confirm which build is live (and that
// auto-deploy is working) without server access. Bump on each deploy test.
registerFn('deployInfo', async () => ({ version: 'checklist-item-schema-2026-07-08', ts: new Date().toISOString(), publicFns: Array.from((await import('./index.js')).publicFunctions).sort() }), { public: true });



// TEMP diagnostic: tells whether a given file URL would be rewritten by the
// preSerialization hook. Lets us confirm both that the deploy is live and
// that the stored URL format actually matches our regex. Safe to remove.
registerFn('debugRewrite', async ({ body }) => {
  const { url } = body as any;
  // import lazily so this stays a no-op cost when unused
  const { rewriteFileUrl } = await import('../lib/urlRewrite.js');
  return { input: url, rewritten: rewriteFileUrl(url) };
}, { public: true });

/* ----- Recruitment AI agent (public, anonymous candidates) ----- */

const RECRUITMENT_SYSTEM_PROMPT_TEMPLATE = `אתה מנהל הגיוס הדיגיטלי של מסעדת '{brand}'. המטרה שלך היא לערוך ראיון ראשוני וסינון למועמדים, כדי לחסוך לבעלים זמן ולוודא שרק אנשים רלוונטיים יגיעו לראיון פרונטלי.

פתח את השיחה (רק כשאין עדיין שום הודעה מהמועמד) בברכה חמה:
"היי! כאן העוזר הדיגיטלי של מסעדת {brand} 🌿 תודה על הפנייה. כדי שנוכל לבדוק התאמה, אני צריך לשאול אותך כמה שאלות קצרות. מוכן/ה?"

שאל שאלה אחת בכל פעם, בסדר הבא. אל תעבור לשאלה הבאה לפני שקיבלת תשובה ברורה לקודמת:
1. מה השם המלא שלך ומה הגיל?
2. מה מספר הטלפון שלך? (חשוב לצורך יצירת קשר)
3. לאיזה תפקיד את/ה פונה? (מלצרות / מטבח / בר / מארחת / אחמש)
4. ספר/י בקצרה על ניסיון קודם במסעדות (איפה עבדת וכמה זמן).
5. כמה משמרות בשבוע את/ה יכול/ה לעבוד? **חייב לקבל מספר** (1–7). אם המועמד עונה במילים ("כמה", "הרבה", "תלוי"), שאל שוב בעדינות עד שתקבל מספר ספציפי. אל תעבור לשאלה 6 לפני שיש לך מספר.
6. האם את/ה זמין/ה לעבוד בסופי שבוע — חמישי בערב ומוצ"ש? זהו תנאי חשוב אצלנו. (זאת שאלה נפרדת מהקודמת — אל תאחד אותן.)
7. מתי את/ה יכול/ה להתחיל לעבוד?
8. באיזה עיר את/ה גר/ה?
9. משהו שלא שאלנו ואת/ה רוצה לשתף אותנו?

חוקי סינון (לאכוף בקפדנות):
- אם הגיל מתחת ל-17: השב "תודה על הפנייה! כרגע המיונים הם לגילאי 17 ומעלה. נשמור את פרטיך לעתיד 🙏" וסיים (complete=true, rejected=true, rejection_reason="גיל מתחת ל-17").
- אם המועמד מציין שלא יכול לעבוד כלל בסופ"ש: השב "תודה על הכנות! עבודה בסופי שבוע (חמישי ערב / מוצש) היא חלק בלתי נפרד מהעבודה אצלנו. לצערי לא נוכל להתקדם הפעם 🙏" וסיים (complete=true, rejected=true, rejection_reason="אין זמינות לסופי שבוע").

בסיום איסוף כל 8 הפרטים (כשהוא לא נדחה):
- חשב ציון התאמה 0-100 לפי: ניסיון רלוונטי, זמינות, אזור מגורים (קרבה לראשל"צ), גיל.
- השב: "מעולה, תודה על כל המידע! 🌿 העברתי את הפרטים למנהל המסעדה. אם תהיה התאמה, נחזור אליך בהקדם לתיאום ראיון. בהצלחה!"
- החזר complete=true, rejected=false, score=<מספר>.

חוקי תפעול קריטיים:
- ב-collected תמיד שמור את כל מה שאספת עד כה (אל תאבד מידע בין סבבים).
- שמור את הטלפון ב-collected.phone בדיוק כפי שהמועמד מסר (בלי שינוי).
- אם המועמד עונה כמה שאלות בבת אחת — קלוט הכל ועבור לשאלה הבאה שעדיין לא נענתה.
- אל תזכיר בשיחה את שמות השדות (full_name, role_applied וכו') — דבר טבעי.
- ענה תמיד בעברית, חם ומקצועי, עם אימוג'י עדין (לא יותר מ-2 בהודעה).

בכל סבב החזר אך ורק JSON עם השדות: reply (string), collected (object), complete (boolean), rejected (boolean), rejection_reason (string?), score (number?).`;

/* ----- Marketing AI advisor ----- */

const MARKETING_ADVISOR_PERSONA = `
אתה יועץ שיווק בכיר במסעדנות וקמעונאות מקומית בישראל. אתה שואל שאלות חכמות, מבין דאטה, ומפרק כל אסטרטגיה לפעולות יומיות מאוד קונקרטיות שניתן לבצע — לא הצהרות כלליות.

חוקי תפעול:
- ענה תמיד בעברית, חם אבל מקצועי.
- כל המלצה חייבת להתחשב במגבלות העסק (כשרות, שעות פתיחה, תקציב, משאבי זמן/צוות).
- אל תציע פעולות שמנוגדות לאופי העסק (למשל קידום שעות שאינן פתוחות, מנות שאינן כשרות לעסק כשר).
- אם העסק מוכר אלכוהול/טבק — סמן אזהרות על הגבלות פרסום ממומן (Meta/Google חוסמים) ועקוף עם ערוצים מותרים.
- שלב פעולות ONLINE (סושיאל / ממומן / מייל) עם פעולות OFFLINE (שלטים / שיתופי פעולה מקומיים / נטוורקינג).
- כל משימה חייבת לכלול: כותרת קצרה, פירוט "איך לעשות בפועל" צעד אחר צעד, זמן משוער, ערוץ/פלטפורמה, עלות משוערת (אם רלוונטי), KPI שניתן למדוד.

לוגיקת תקציב (חובה לפעול לפיה):
- 0–1,500 ₪ בחודש: 90% מהמשימות אורגניות — סושיאל אורגני, שיווק שותפים מקומיים, שלוט פיזי, מהלכי קהילה. הימנע מקמפיינים ממומנים שדורשים תקציב כבד.
- 1,500–3,000 ₪: שילוב — חלק ממומן (Meta Boosted) + רוב אורגני. הנחה לבדוק תוצאות שבוע-שבוע.
- 3,000 ₪ ומעלה: הקם קמפיינים ממומנים אמיתיים בפייסבוק/אינסטגרם/גוגל, חשב כמה לידים/חשיפות התקציב אמור להניב לפי עלויות שוק ממוצעות בישראל (CPM ~₪25-50, CPC ~₪1.5-4 למסעדנות), והנחה אופטימיזציה שבועית.
- אם אתה רואה שהיעד שהבעלים הציב (הכפלת מחזור תוך 6 חודשים) **לא ריאלי בתקציב הקיים** — תגיד לו ישירות, אל תחסוך ממנו: כתוב "התקציב הזה לא יספיק להכפיל את המחזור. ההמלצה שלי: להגדיל ל-X₪ בחודש לפחות". זה חלק מתפקידך.

נתונים שצריך לקחת בחשבון אם זמינים: דוחות סיום משמרת אחרונים (הכנסות בפועל, סועדים בפועל, פידבק לקוחות, אירועים מרכזיים). השתמש בהם כדי להתאים המלצות (למשל אם פידבק לקוחות מציין שירות איטי — אל תציע קמפיין שיביא עוד עומס לפני שהבעיה התפעולית נפתרה).
`.trim();

function pickStr(o: any, ...keys: string[]) {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// Save / load the deep business profile (questionnaire answers).
registerFn('saveBusinessProfile', async ({ body }) => {
  const p = (body as any)?.profile || {};
  const existing = await db.businessProfile.findFirst();
  const data = {
    business_name: pickStr(p, 'business_name', 'businessName'),
    business_type: pickStr(p, 'business_type', 'businessType'),
    logo_url: pickStr(p, 'logo_url', 'logoUrl') || null,
    profile_data: p,
    brand_persona: pickStr(p, 'brand_persona', 'persona'),
    target_audience: pickStr(p, 'target_audience', 'audience'),
    primary_offering: pickStr(p, 'primary_offering', 'offering'),
    is_kosher: typeof p.is_kosher === 'boolean' ? p.is_kosher : null,
    monthly_budget: typeof p.monthly_budget === 'number' ? p.monthly_budget : null,
    weekly_owner_time_hours:
      typeof p.weekly_owner_time_hours === 'number' ? p.weekly_owner_time_hours : null,
    completed: p.completed === true,
    completed_at: p.completed ? new Date().toISOString() : null,
  };
  const saved = existing
    ? await db.businessProfile.update({ where: { id: existing.id }, data })
    : await db.businessProfile.create({ data });
  return { profile: saved };
});

registerFn('getBusinessProfile', async () => {
  const p = await db.businessProfile.findFirst();
  return { profile: p ?? null };
});

// Helper: pull last 30 days of ShiftEndReport summaries to give AI real context.
async function recentShiftContext() {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const reports = await db.shiftEndReport.findMany({
      where: { shift_date: { gte: since } },
      orderBy: { shift_date: 'desc' },
      take: 60,
    });
    if (!reports.length) return '';
    const summary = reports.map((r: any) =>
      `${r.shift_date} ${r.shift_type === 'lunch' ? 'צהריים' : 'ערב'} · סועדים: ${r.total_covers ?? '-'} · הכנסות: ₪${r.total_revenue ?? '-'}${r.customer_feedback ? ` · פידבק: ${String(r.customer_feedback).slice(0, 80)}` : ''}`,
    ).join('\n');
    return `\n--- נתוני 30 הימים האחרונים מדוחות סיום משמרת ---\n${summary}\n`;
  } catch { return ''; }
}

// Generate 6-month strategy + initial tasks based on the saved profile.
registerFn('generateMarketingStrategy', async () => {
  const profile = await db.businessProfile.findFirst();
  if (!profile?.profile_data) throw new Error('profile_not_found');
  const shiftContext = await recentShiftContext();

  const result: any = await invokeLLM({
    prompt:
      MARKETING_ADVISOR_PERSONA +
      `\n\nמטרת השיחה: לבנות אסטרטגיית שיווק ל-6 חודשים שמטרתה להכפיל את המחזור החודשי של העסק.\n\n` +
      `--- פרופיל העסק ---\n${JSON.stringify(profile.profile_data, null, 2)}\n--- סוף פרופיל ---${shiftContext}\n` +
      `החזר JSON בלבד עם השדות:\n` +
      `- goal_summary (string): משפט אחד שמתאר את היעד.\n` +
      `- monthly_plan: מערך של 6 חודשים, לכל חודש: { month: 1-6, focus: "...", theme: "...", expected_outcomes: ["..."], milestones: ["..."] }.\n` +
      `- initial_tasks: 12-16 משימות לחודש הראשון בלבד, **מפוזרות על פני 4 השבועות של החודש**:\n` +
      `  - בשבוע 1: 3-4 משימות התנעה ובסיס (אופטימיזציה, הקמת קמפיינים, חזרה לבסיס).\n` +
      `  - בשבוע 2: 3-4 משימות פעילות שוטפת + תוכן.\n` +
      `  - בשבוע 3: 3-4 משימות לחיזוק מומנטום ובדיקת תוצאות.\n` +
      `  - בשבוע 4: 2-4 משימות מתקדמות / ניתוח חודש + הכנה לחודש הבא.\n` +
      `  כל משימה חייבת לכלול week_in_month (1-4), day_offset_in_week (1-7 — איזה יום בתוך השבוע), monthly_theme (שכפול ה-theme של החודש 1 שכבר נתת ב-monthly_plan), וגם: title, description (3-6 משפטים מפורטים על איך לבצע בפועל), task_type ('online' / 'offline'), platform (facebook/instagram/tiktok/google/email/sms/whatsapp/sign/event/local_partner/none), priority (high/medium/low), estimated_time (דקות), budget_required (₪), ai_reasoning (למה זה רלוונטי דווקא לעסק הזה ולחודש הזה).\n\n` +
      `**קריטי: כל משימה חייבת לתמוך באבני הדרך של החודש הראשון.** אם אבן דרך אומרת "השקת קמפיין ממומן", חייבת להיות משימה ספציפית להקמת הקמפיין בשבוע 1.`,
    responseSchema: {
      type: 'object',
      properties: {
        goal_summary: { type: 'string' },
        monthly_plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              month: { type: 'integer' },
              focus: { type: 'string' },
              theme: { type: 'string' },
              expected_outcomes: { type: 'array', items: { type: 'string' } },
              milestones: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        initial_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              task_type: { type: 'string' },
              platform: { type: 'string' },
              priority: { type: 'string' },
              estimated_time: { type: 'integer' },
              budget_required: { type: 'number' },
              week_in_month: { type: 'integer' },        // 1-4
              day_offset_in_week: { type: 'integer' },   // 1-7
              monthly_theme: { type: 'string' },
              ai_reasoning: { type: 'string' },
            },
          },
        },
      },
    },
  });

  const existing = await db.marketingStrategy.findFirst({ where: { active: true } });
  if (existing) await db.marketingStrategy.update({ where: { id: existing.id }, data: { active: false } });

  const strategy = await db.marketingStrategy.create({
    data: {
      goal_summary: result?.goal_summary || 'הכפלת המחזור החודשי תוך 6 חודשים',
      months_plan: result?.monthly_plan || [],
      generated_at: new Date().toISOString(),
      generated_by: 'gemini',
      active: true,
    },
  });

  // Materialize the initial tasks — distribute them across the 4 weeks of
  // month 1, computing the actual due_date from week_in_month + day_offset.
  const today = new Date();
  const monthStart = today; // month 1 starts today
  const initialTasks = Array.isArray(result?.initial_tasks) ? result.initial_tasks : [];
  let created = 0;
  for (const t of initialTasks) {
    try {
      const week = Math.max(1, Math.min(4, parseInt(String(t.week_in_month ?? 1)) || 1));
      const day = Math.max(1, Math.min(7, parseInt(String(t.day_offset_in_week ?? 1)) || 1));
      const offsetDays = (week - 1) * 7 + (day - 1);
      const due = new Date(monthStart.getTime() + offsetDays * 86400000);
      const baseData: any = {
        task_type: t.task_type || 'online',
        title: String(t.title || '').slice(0, 200),
        description: String(t.description || ''),
        priority: t.priority || 'medium',
        platform: t.platform || null,
        estimated_time: typeof t.estimated_time === 'number' ? t.estimated_time : null,
        budget_required: typeof t.budget_required === 'number' ? t.budget_required : null,
        due_date: due.toISOString().slice(0, 10),
        status: 'pending',
        ai_reasoning: t.ai_reasoning || null,
      };
      const opt: any = {
        strategy_id: strategy.id,
        month_number: 1,
        week_in_month: week,
        monthly_theme: t.monthly_theme || (Array.isArray(result?.monthly_plan) ? result.monthly_plan[0]?.theme : null) || null,
      };
      try { await db.marketingTask.create({ data: { ...baseData, ...opt } }); }
      catch (e: any) {
        if (/unknown (arg|column)/i.test(String(e?.message))) {
          await db.marketingTask.create({ data: baseData }); // schema not pushed yet — keep going
        } else { throw e; }
      }
      created++;
    } catch (e: any) {
      console.error('[marketingTask.create]', e?.message);
    }
  }

  return { strategy, tasks_created: created };
});

// Generate a full month of tasks (12-16) for months 2-6 of the strategy.
// Picks up where the previous month left off, based on what got done.
registerFn('generateMonthTasks', async ({ body }) => {
  const monthNumber = Math.max(2, Math.min(6, parseInt(String((body as any)?.month_number || 2)) || 2));
  const profile = await db.businessProfile.findFirst();
  if (!profile?.profile_data) throw new Error('profile_not_found');
  const strategy = await db.marketingStrategy.findFirst({ where: { active: true } });
  if (!strategy) throw new Error('strategy_not_found');
  const shiftContext = await recentShiftContext();
  const monthsPlan = Array.isArray(strategy.months_plan) ? strategy.months_plan : [];
  const targetMonth = monthsPlan.find((m: any) => Number(m.month) === monthNumber) || monthsPlan[monthNumber - 1] || {};

  // Snapshot what got done in the previous month so we can build on it.
  const previousMonthTasks = await db.marketingTask.findMany({
    where: { strategy_id: strategy.id, month_number: monthNumber - 1 },
    take: 50,
  }).catch(() => []);
  const completed = previousMonthTasks.filter((t: any) => t.status === 'completed');
  const skipped = previousMonthTasks.filter((t: any) => t.status !== 'completed');

  const result: any = await invokeLLM({
    prompt:
      MARKETING_ADVISOR_PERSONA +
      `\n\nאתה מייצר משימות לחודש ${monthNumber} מתוך 6 בתכנית של 6 חודשים.\n\n` +
      `--- פרופיל ---\n${JSON.stringify(profile.profile_data)}\n` +
      `--- אסטרטגיה כללית (6 חודשים) ---\n${JSON.stringify(monthsPlan)}\n` +
      `--- חודש זה ---\n${JSON.stringify(targetMonth)}\n` +
      `${shiftContext}` +
      `--- מה הושלם בחודש הקודם (חודש ${monthNumber - 1}) ---\n${completed.map((t: any) => `✓ ${t.title}`).join('\n') || '(אין נתונים)'}\n` +
      `--- מה לא הושלם בחודש הקודם (נדלג בחודש הזה) ---\n${skipped.map((t: any) => `× ${t.title}`).join('\n') || '(הכל הושלם)'}\n\n` +
      `החזר 12-16 משימות לחודש ${monthNumber}, מפוזרות על פני 4 השבועות. כל משימה: title, description, task_type, platform, priority, estimated_time, budget_required, week_in_month (1-4), day_offset_in_week (1-7), monthly_theme, ai_reasoning. JSON בלבד.`,
    responseSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              task_type: { type: 'string' },
              platform: { type: 'string' },
              priority: { type: 'string' },
              estimated_time: { type: 'integer' },
              budget_required: { type: 'number' },
              week_in_month: { type: 'integer' },
              day_offset_in_week: { type: 'integer' },
              monthly_theme: { type: 'string' },
              ai_reasoning: { type: 'string' },
            },
          },
        },
      },
    },
  });

  // The month starts (monthNumber-1)*30 days from "now" (the strategy start).
  // We use today as the reference and offset from there.
  const today = new Date();
  const monthStart = new Date(today.getTime() + (monthNumber - 1) * 30 * 86400000);
  const list = Array.isArray(result?.tasks) ? result.tasks : [];
  let created = 0;
  for (const t of list) {
    try {
      const week = Math.max(1, Math.min(4, parseInt(String(t.week_in_month ?? 1)) || 1));
      const day = Math.max(1, Math.min(7, parseInt(String(t.day_offset_in_week ?? 1)) || 1));
      const offsetDays = (week - 1) * 7 + (day - 1);
      const due = new Date(monthStart.getTime() + offsetDays * 86400000);
      const baseData: any = {
        task_type: t.task_type || 'online',
        title: String(t.title || '').slice(0, 200),
        description: String(t.description || ''),
        priority: t.priority || 'medium',
        platform: t.platform || null,
        estimated_time: typeof t.estimated_time === 'number' ? t.estimated_time : null,
        budget_required: typeof t.budget_required === 'number' ? t.budget_required : null,
        due_date: due.toISOString().slice(0, 10),
        status: 'pending',
        ai_reasoning: t.ai_reasoning || null,
      };
      const opt: any = {
        strategy_id: strategy.id,
        month_number: monthNumber,
        week_in_month: week,
        monthly_theme: t.monthly_theme || targetMonth?.theme || null,
      };
      try { await db.marketingTask.create({ data: { ...baseData, ...opt } }); }
      catch (e: any) {
        if (/unknown (arg|column)/i.test(String(e?.message))) {
          await db.marketingTask.create({ data: baseData });
        } else { throw e; }
      }
      created++;
    } catch (e: any) { console.error('[marketingTask.create]', e?.message); }
  }
  return { tasks_created: created, month_number: monthNumber };
});

// Generate a fresh batch of N tasks (when the owner finishes the current pile).
registerFn('generateNextMarketingTasks', async ({ body }) => {
  const profile = await db.businessProfile.findFirst();
  if (!profile?.profile_data) throw new Error('profile_not_found');
  const strategy = await db.marketingStrategy.findFirst({ where: { active: true } });
  const shiftContext = await recentShiftContext();
  const recent = await db.marketingTask.findMany({
    orderBy: { created_date: 'desc' },
    take: 30,
  });
  const count = Math.min(Math.max(parseInt(String((body as any)?.count || 7)) || 7, 3), 15);

  const result: any = await invokeLLM({
    prompt:
      MARKETING_ADVISOR_PERSONA +
      `\n\nצור ${count} משימות שיווק חדשות לעסק על בסיס הפרופיל והאסטרטגיה.\n` +
      `אל תחזור על משימות שכבר קיימות (להלן רשימת הקיימות).\n\n` +
      `--- פרופיל ---\n${JSON.stringify(profile.profile_data)}\n--- אסטרטגיה ---\n${JSON.stringify(strategy?.months_plan || [])}\n${shiftContext}--- משימות קיימות (לא לחזור) ---\n${recent.map((t: any) => `- ${t.title}`).join('\n')}\n\n` +
      `החזר JSON: { tasks: [{ title, description, task_type, platform, priority, estimated_time, budget_required, due_date_offset_days, ai_reasoning }] }`,
    responseSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              task_type: { type: 'string' },
              platform: { type: 'string' },
              priority: { type: 'string' },
              estimated_time: { type: 'integer' },
              budget_required: { type: 'number' },
              due_date_offset_days: { type: 'integer' },
              ai_reasoning: { type: 'string' },
            },
          },
        },
      },
    },
  });

  const today = new Date();
  const list = Array.isArray(result?.tasks) ? result.tasks : [];
  let created = 0;
  for (const t of list) {
    try {
      const due = new Date(today.getTime() + ((t.due_date_offset_days ?? 1) * 86400000));
      await db.marketingTask.create({
        data: {
          task_type: t.task_type || 'online',
          title: String(t.title || '').slice(0, 200),
          description: String(t.description || ''),
          priority: t.priority || 'medium',
          platform: t.platform || null,
          estimated_time: typeof t.estimated_time === 'number' ? t.estimated_time : null,
          budget_required: typeof t.budget_required === 'number' ? t.budget_required : null,
          due_date: due.toISOString().slice(0, 10),
          status: 'pending',
          ai_reasoning: t.ai_reasoning || null,
        },
      });
      created++;
    } catch (e: any) { console.error('[marketingTask.create]', e?.message); }
  }
  return { tasks_created: created };
});

// Read menu / drinks photos with Gemini vision and extract structured items
// (name, price, category) so the AI advisor knows the real catalog.
registerFn('extractMenuFromPhotos', async ({ body }) => {
  const urls = (body as any)?.urls;
  if (!Array.isArray(urls) || !urls.length) throw new Error('urls required');

  // The image URLs we store are relative (/api/files/...). Gemini needs them
  // reachable; the file-rewrite layer keeps them domain-relative so we let
  // invokeLLM forward them. Some Gemini wrappers want absolute — accept both.
  const result: any = await invokeLLM({
    prompt:
      `מצורפות תמונות של תפריט מסעדה (אוכל / שתייה / קוקטיילים).\n` +
      `חלץ ממנהן רשימה מובנית של פריטים. שמור על שמות הפריטים בעברית בדיוק כפי שהם בתפריט, וזהה מחיר אם נראה.\n` +
      `קטגוריות אפשריות: מנות פתיחה, ראשונות, עיקריות, צמחוני, ילדים, קינוחים, שתייה קלה, יין, בירה, אלכוהול, קוקטיילים, חמים, אחר.\n` +
      `החזר JSON בלבד.`,
    fileUrls: urls,
    responseSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        // `dishes`, NOT `items` (Gemini keyword collision empties it).
        dishes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
              category: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  });

  if (result && !result.items && Array.isArray(result.dishes)) result.items = result.dishes;
  return { menu: result };
});

// Expand a task into a detailed step-by-step plan (owner asks "how do I do this?").
registerFn('expandMarketingTask', async ({ body }) => {
  const { task_id } = body as any;
  if (!task_id) throw new Error('task_id required');
  const task = await db.marketingTask.findUnique({ where: { id: task_id } });
  if (!task) throw new Error('task_not_found');
  const profile = await db.businessProfile.findFirst();

  const result: any = await invokeLLM({
    prompt:
      MARKETING_ADVISOR_PERSONA +
      `\n\nהמשתמש לחץ "הסבר לי בפירוט איך לעשות את המשימה הזו".\nכתוב מדריך מעשי, צעד אחר צעד, מאוד קונקרטי. אם זה ממומן — כלול הצעות לקהל יעד מדויק, ניסוח מודעה, ותקציב מומלץ.\n\n` +
      `--- משימה ---\n${JSON.stringify({ title: task.title, description: task.description, platform: task.platform, task_type: task.task_type, ai_reasoning: task.ai_reasoning })}\n` +
      `--- פרופיל ---\n${JSON.stringify(profile?.profile_data || {})}\n\n` +
      `החזר JSON: { steps: ["צעד 1...", "צעד 2..."], copy: "הצעת ניסוח/קופי אם רלוונטי", warnings: ["אזהרות חשובות"], success_metric: "איך נדע שהצלחנו" }`,
    responseSchema: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'string' } },
        copy: { type: 'string' },
        warnings: { type: 'array', items: { type: 'string' } },
        success_metric: { type: 'string' },
      },
    },
  });
  return { expansion: result };
});

// Open chat with the marketing advisor — for ad-hoc questions.
registerFn('marketingAdvisorChat', async ({ body }) => {
  const { history, message } = body as any;
  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];
  const profile = await db.businessProfile.findFirst();
  const strategy = await db.marketingStrategy.findFirst({ where: { active: true } });

  const transcript = turns
    .map((t) => `${t.role === 'assistant' ? 'יועץ' : 'בעלים'}: ${t.content}`)
    .join('\n');

  const result: any = await invokeLLM({
    prompt:
      MARKETING_ADVISOR_PERSONA +
      `\n\nאתה משוחח עם בעל העסק על שיווק. שמור על קשר עם הפרופיל והאסטרטגיה, ותן עצות קונקרטיות.\n\n` +
      `--- פרופיל ---\n${JSON.stringify(profile?.profile_data || {})}\n--- אסטרטגיה ---\n${JSON.stringify(strategy?.months_plan || [])}\n--- שיחה עד כה ---\n${transcript || '(תחילת השיחה)'}\nבעלים: ${message || ''}\n\nענה ב-JSON: { reply: "התשובה לבעל העסק" }`,
    responseSchema: {
      type: 'object',
      properties: { reply: { type: 'string' } },
    },
  });

  // Persist both sides
  if (message) {
    await db.marketingAdvisorMessage.create({ data: { role: 'user', content: String(message) } }).catch(() => {});
  }
  if (result?.reply) {
    await db.marketingAdvisorMessage.create({ data: { role: 'assistant', content: String(result.reply) } }).catch(() => {});
  }

  return { reply: result?.reply || 'מצטער, אירעה תקלה. נסה שוב.' };
});

registerFn('chatJobApplication', async ({ body }) => {
  const { history, message, source, lead_id: leadIdRaw, language: languageRaw } = body as any;
  const leadId = typeof leadIdRaw === 'string' && leadIdRaw.trim() ? leadIdRaw.trim().slice(0, 80) : null;
  // Language the candidate is using. Default Hebrew. Locked to a small whitelist
  // so the prompt-injection surface stays narrow.
  const language = (() => {
    const allowed = ['Hebrew', 'English', 'Russian'];
    const raw = typeof languageRaw === 'string' ? languageRaw.trim() : '';
    return allowed.includes(raw) ? raw : 'Hebrew';
  })();
  // Normalize utm_source to a short token we save on the candidate.
  const candidateSource =
    typeof source === 'string' && source.trim()
      ? source.trim().slice(0, 40).toLowerCase()
      : 'web_chat';

  // Cooking-side positions defined by the manager. The bot asks every
  // applicant to one of these the explicit bishul-akum question.
  const kashrutPositions = await db.workPosition
    .findMany({ where: { requires_kashrut: true, is_active: true }, select: { position_name: true } })
    .catch(() => [] as any[]);
  const kashrutPositionNames: string[] = kashrutPositions.map((p: any) => p.position_name).filter(Boolean);
  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];
  const transcript = turns
    .map((t) => `${t.role === 'assistant' ? 'עוזר' : 'מועמד'}: ${t.content}`)
    .join('\n');
  const newPart = message ? `\nמועמד: ${message}` : '';

  // Conditional kashrut instruction — added only when the manager has marked
  // at least one position as requires_kashrut. Otherwise the bot never asks.
  const kashrutClause = kashrutPositionNames.length
    ? `\n\n--- שאלת כשרות חובה ---\nהתפקידים הבאים במסעדה דורשים עמידה בדיני כשרות במטבח: ${kashrutPositionNames.join(', ')}.\nאם המועמד בחר אחד מהתפקידים האלה בשאלה 3 (או הזכיר אותו), **לפני שאתה ממשיך לשאלה הבאה** הוסף את השאלה הזו, מילה במילה (פעם אחת בלבד):\n"מעולה! תודה ששיתפת. המטבח שלנו פועל תחת השגחת כשרות קפדנית, הדורשת מהעובדים במשמרת הראשונה לבצע את הדלקת האש והתנורים. האם תוכל/י לעמוד בדרישה הזו כחלק מהתפקיד?"\nאחרי שתקבל תשובה: שמור את הערך (true/false) ב-collected.kashrut_capable, ועבור לשאלה הבאה.\nלתפקידים שלא ברשימה (מלצר/מארחת/קופה/וכו') — אל תשאל את השאלה הזו בכלל.`
    : '';

  // Language directive — keep the screening logic in Hebrew internally
  // (extracting fields, scoring) but render the candidate-facing `reply` in
  // their preferred language. This way the manager dashboard stays consistent
  // while the candidate experiences the chat fully in Arabic/English/Russian.
  const langDirective = language === 'Hebrew'
    ? ''
    : `\n\n--- LANGUAGE DIRECTIVE ---\nThe candidate is communicating in ${language}. Your "reply" field MUST be written in ${language}, even if the rest of the schema/prompt is in Hebrew. Be warm, natural, and use idiomatic ${language}.\nField extraction (collected, ai_summary, notes) should still be in Hebrew so the manager can read it.`;

  const brandName = await getBrandName();
  const bpBlock = await businessContextBlock();
  const RECRUITMENT_SYSTEM_PROMPT = RECRUITMENT_SYSTEM_PROMPT_TEMPLATE.replaceAll('{brand}', brandName);
  const prompt = `${bpBlock}${RECRUITMENT_SYSTEM_PROMPT}${kashrutClause}${langDirective}\n\n--- שיחה עד כה ---\n${transcript || '(אין עדיין הודעות — זו תחילת השיחה)'}${newPart}\n\nהחזר את התגובה הבאה כ-JSON בלבד.`;

  const result: any = await invokeLLM({
    prompt: prompt + `\n\nחובה: ברגע ש-complete=true (גם אם rejected=true), חובה להחזיר score כ-מספר 0-100. אסור להחזיר null או להשאיר את השדה ריק.`,
    responseSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        collected: { type: 'object' },
        complete: { type: 'boolean' },
        rejected: { type: 'boolean' },
        rejection_reason: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['reply', 'complete'],
    },
  });

  const parseInt2 = (v: any): number | null => {
    if (typeof v === 'number') return Math.round(v);
    if (typeof v === 'string') {
      const n = parseInt(v.replace(/\D/g, ''));
      return isNaN(n) ? null : n;
    }
    return null;
  };
  const parseBool = (v: any): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /^(true|yes|כן|jah|ja)$/i.test(v.trim());
    return false;
  };

  let candidate_id: string | null = null;

  // ── PARTIAL SAVE ─────────────────────────────────────────────────────
  // As soon as we have phone OR (name+role), persist whatever we've
  // collected so the candidate's details don't disappear if they close
  // the tab before the chat finishes. Upserts by phone so re-entries on
  // the same number update the existing row instead of duplicating.
  const partialCollected = (result?.collected || {}) as any;
  const partialPhone = partialCollected.phone ? String(partialCollected.phone).trim() : null;
  const partialName = partialCollected.full_name || partialCollected.name || null;
  let existingPartial: any = null;
  // Try matching by lead_id FIRST (browser-stable id, works even before phone)
  if (leadId) {
    existingPartial = await db.jobCandidate.findFirst({
      where: { lead_id: leadId },
      orderBy: { id: 'desc' },
    }).catch(() => null);
  }
  // Fall back to phone (legacy entry points, returning candidates on a new browser)
  if (!existingPartial && partialPhone) {
    existingPartial = await db.jobCandidate.findFirst({
      where: { phone: partialPhone },
      orderBy: { id: 'desc' },
    }).catch(() => null);
  }
  if (existingPartial) candidate_id = existingPartial.id;
  // Save only when there's real data — NOT just on chat-open. We want a
  // record once we have phone OR (name + role). lead_id alone is NOT enough,
  // otherwise every page open would create a placeholder row and spam push.
  if (!result?.complete && (partialPhone || (partialName && partialCollected.role_applied))) {
    const partialData: any = {
      full_name: partialName || 'מועמד בתהליך',
      age: parseInt2(partialCollected.age),
      phone: partialPhone,
      city: partialCollected.city || null,
      role_applied: partialCollected.role_applied || null,
      experience: partialCollected.experience || null,
      shifts_per_week: parseInt2(partialCollected.shifts_per_week),
      weekend_availability:
        typeof partialCollected.weekend_availability === 'boolean'
          ? partialCollected.weekend_availability
          : (partialCollected.weekend_availability ? parseBool(partialCollected.weekend_availability) : null),
      start_date: partialCollected.start_date || null,
      status: 'pending',
      source: candidateSource,
      lead_id: leadId,
    };
    // Drop null/undefined keys so update doesn't overwrite existing values with null
    const cleaned: any = {};
    for (const [k, v] of Object.entries(partialData)) {
      if (v != null && v !== '' && v !== undefined) cleaned[k] = v;
    }
    const partialTranscript = [
      ...turns,
      ...(message ? [{ role: 'user', content: String(message) }] : []),
      ...(result?.reply ? [{ role: 'assistant', content: String(result.reply) }] : []),
    ];
    try {
      if (existingPartial) {
        await db.jobCandidate.update({
          where: { id: existingPartial.id },
          data: { ...cleaned, transcript: partialTranscript, updated_date: new Date().toISOString() },
        });
      } else {
        const created = await db.jobCandidate.create({
          data: {
            ...cleaned,
            transcript: partialTranscript,
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString(),
          },
        });
        candidate_id = created.id;
        fireTriggers('JobCandidate', 'created', created).catch(() => {});
      }
    } catch (e: any) {
      console.warn('[chatJobApplication partial-save] failed', e?.message);
    }
  }
  // ── END PARTIAL SAVE ────────────────────────────────────────────────

  if (result?.complete) {
    const rejected = !!result.rejected;
    let score = typeof result.score === 'number' ? Math.round(result.score) : null;

    // Final extraction pass: re-read the FULL transcript with a strict schema,
    // because the per-turn `collected` from the chat model is often lossy
    // (forgets the name on the closing turn, etc.). The transcript is truth.
    const fullTranscript = [
      ...turns,
      { role: 'user', content: message || '' },
      { role: 'assistant', content: result?.reply || '' },
    ]
      .map((t: any) => `${t.role === 'assistant' ? 'עוזר' : 'מועמד'}: ${t.content}`)
      .join('\n');
    let extracted: any = {};
    try {
      extracted = await invokeLLM({
        prompt:
          `מצורף תמלול של ראיון גיוס בעברית. חלץ את הפרטים הבאים מהדברים שהמועמד אמר.\n` +
          `אם פרט לא נאמר במפורש — החזר null. שמור טלפון בדיוק כפי שנאמר (כולל מקפים אם היו).\n` +
          `weekend_availability=true אם המועמד אמר שהוא זמין לסופ"ש (אפילו חלקית), false אם אמר שאינו זמין.\n` +
          `kashrut_capable: אם נשאלה השאלה על דיני בישול גויים — true אם ענה כן, false אם ענה לא, null אם לא נשאל או לא ברור.\n` +
          `notes: רק ציטוטים קונקרטיים שהמועמד אמר שראויים להסבה ספציפית למנהל (למשל "מבקש לעבוד רק עד 22:00", "חבר של עובד X").\n` +
          `אם אין משהו ספציפי שכדאי להעביר — החזר null. אסור להמציא או לנחש. אסור לכתוב מילים כמו "test" אם המועמד לא אמר אותן בעצמו.\n` +
          `ai_summary: סיכום 2-3 משפטים על המועמד למנהל (חוזקות, חולשות, התרשמות כללית).\n\n` +
          `--- תמלול ---\n${fullTranscript}\n--- סוף ---\n\nהחזר JSON בלבד.`,
        responseSchema: {
          type: 'object',
          properties: {
            full_name: { type: 'string' },
            age: { type: 'integer' },
            phone: { type: 'string' },
            role_applied: { type: 'string' },
            experience: { type: 'string' },
            shifts_per_week: { type: 'integer' },
            weekend_availability: { type: 'boolean' },
            start_date: { type: 'string' },
            city: { type: 'string' },
            notes: { type: 'string' },
            kashrut_capable: { type: 'boolean' },
            ai_summary: { type: 'string' },
          },
        },
      }) as any;
    } catch (e: any) {
      console.error('extraction failed', e?.message);
    }

    // Kashrut screening: if the role applied is one the manager flagged as
    // requires_kashrut AND the candidate said "no" to bishul akum, drop the
    // score by 21 (capped to 79) so they go through manual review instead of
    // auto-booking a slot. Applies uniformly to anyone applying to that role,
    // regardless of name.
    const c = (result.collected || {}) as any;
    const appliedRole = String(extracted.role_applied || c.role_applied || '').toLowerCase();
    const kashrutRequiredForRole =
      kashrutPositionNames.length > 0 &&
      kashrutPositionNames.some((p) => {
        const pn = String(p).toLowerCase();
        return pn === appliedRole || appliedRole.includes(pn) || pn.includes(appliedRole);
      });
    const kashrutCapable =
      typeof extracted.kashrut_capable === 'boolean'
        ? extracted.kashrut_capable
        : typeof c.kashrut_capable === 'boolean'
          ? c.kashrut_capable
          : null;
    if (!rejected && kashrutRequiredForRole && kashrutCapable === false && typeof score === 'number') {
      const penalized = Math.max(0, score - 21);
      score = Math.min(penalized, 79);
    }

    // Merge: extracted (truth) wins; fall back to the chat-model's collected.
    const d: any = {
      full_name: extracted.full_name || c.full_name || c.name || null,
      age: extracted.age ?? parseInt2(c.age),
      phone: extracted.phone || (c.phone ? String(c.phone) : null),
      role_applied: extracted.role_applied || c.role_applied || null,
      experience: extracted.experience || c.experience || null,
      shifts_per_week: extracted.shifts_per_week ?? parseInt2(c.shifts_per_week),
      weekend_availability:
        typeof extracted.weekend_availability === 'boolean'
          ? extracted.weekend_availability
          : parseBool(c.weekend_availability),
      start_date: extracted.start_date || c.start_date || null,
      city: extracted.city || c.city || null,
      notes: extracted.notes || c.notes || null,
    };

    // Score fallback: if LLM forgot to return a score on a non-rejected
    // complete chat, compute a simple heuristic so the candidate doesn't get
    // stuck in pending+null limbo (which masquerades as "abandoned" + blocks
    // the interview-slot booking flow which requires score >= 80).
    if (!rejected && (score == null || Number.isNaN(score))) {
      const hasPhone = !!d.phone;
      const hasRole = !!d.role_applied;
      const hasExp = !!d.experience;
      const expYears = (() => {
        const m = /(\d+)\s*שנ/.exec(String(d.experience || ''));
        return m ? parseInt(m[1]) : 0;
      })();
      if (hasPhone && hasRole) {
        let s = 70; // base — they completed the chat with phone+role
        if (hasExp) s += 5;
        if (expYears >= 2) s += 5;
        if (expYears >= 5) s += 5;
        if (d.weekend_availability) s += 5;
        if (d.shifts_per_week && d.shifts_per_week >= 4) s += 5;
        score = Math.min(s, 95);
      } else {
        score = hasPhone ? 50 : 30;
      }
    }

    // Server-side completion guard: Gemini sometimes marks complete=true and
    // emits a score before all required fields are actually in the transcript.
    // If a non-rejected candidate is missing one of the must-have fields, we
    // override completion, ask for the missing field, and skip persistence so
    // the interview continues until the data is real.
    if (!rejected) {
      const hasWeekendAnswer =
        typeof extracted.weekend_availability === 'boolean' ||
        typeof c.weekend_availability === 'boolean' ||
        (typeof c.weekend_availability === 'string' && c.weekend_availability.trim() !== '');
      const missingPrompts: Array<[boolean, string]> = [
        [!d.full_name || d.full_name === 'מועמד', 'רק שאוודא — מה השם המלא שלך?'],
        [d.age == null, 'ומה הגיל שלך?'],
        [!d.phone, 'מה מספר הטלפון שלך? (חשוב לצורך יצירת קשר)'],
        [!d.role_applied, 'לאיזה תפקיד את/ה פונה? (מלצרות / מטבח / בר / מארחת / אחמש)'],
        [!d.experience, 'ספר/י בקצרה על ניסיון קודם במסעדות — איפה עבדת וכמה זמן.'],
        [d.shifts_per_week == null, 'כמה משמרות בשבוע את/ה יכול/ה לעבוד? (מספר בין 1 ל-7)'],
        [!hasWeekendAnswer, 'האם את/ה זמין/ה לעבוד בסופי שבוע — חמישי בערב ומוצ"ש?'],
      ];
      const nextMissing = missingPrompts.find(([isMissing]) => isMissing);
      if (nextMissing) {
        return {
          reply: `כמעט סיימנו — חסר לי עוד פרט אחד 🌿\n${nextMissing[1]}`,
          complete: false,
          rejected: false,
          candidate_id: null,
          score: null,
        };
      }
    }

    const baseData: any = {
      full_name: d.full_name || 'מועמד',
      age: d.age,
      city: d.city,
      phone: d.phone,
      role_applied: d.role_applied,
      experience: d.experience,
      shifts_per_week: d.shifts_per_week,
      weekend_availability: d.weekend_availability,
      start_date: d.start_date,
      status: rejected ? 'rejected' : 'pending',
      score,
      notes: rejected ? (result.rejection_reason || d.notes) : d.notes,
      ai_summary: extracted.ai_summary || null,
      source: candidateSource,
    };
    const optionalKashrut = { kashrut_required: kashrutRequiredForRole || null, kashrut_capable: kashrutCapable };
    // Full conversation snapshot so future bad records can be recovered manually.
    // Saved as an optional spread — if `prisma db push` hasn't added the column
    // yet, the retry below drops it and the candidate still lands in the dashboard.
    const optionalTranscript = {
      transcript: [
        ...turns,
        ...(message ? [{ role: 'user', content: String(message) }] : []),
        ...(result?.reply ? [{ role: 'assistant', content: String(result.reply) }] : []),
      ],
    };

    let cand: any = null;
    // If the partial save already created/found a record for this phone,
    // UPDATE that one instead of creating a duplicate.
    const reuseId = candidate_id || existingPartial?.id || null;
    try {
      if (reuseId) {
        cand = await db.jobCandidate.update({
          where: { id: reuseId },
          data: { ...baseData, ...optionalKashrut, ...optionalTranscript },
        });
      } else {
        cand = await db.jobCandidate.create({ data: { ...baseData, ...optionalKashrut, ...optionalTranscript } });
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      // Most common cause: db push hasn't added a newly added column yet
      // (kashrut_* / transcript). Retry without optional spreads so the
      // candidate still lands in the dashboard.
      if (msg.toLowerCase().includes('kashrut') || msg.toLowerCase().includes('transcript') || /unknown (arg|column)/i.test(msg)) {
        console.warn('[jobCandidate.create] retrying without optional fields:', msg);
        try {
          cand = reuseId
            ? await db.jobCandidate.update({ where: { id: reuseId }, data: baseData })
            : await db.jobCandidate.create({ data: baseData });
        } catch (e2: any) { console.error('[jobCandidate.create] retry also failed:', e2?.message); }
      } else {
        console.error('[jobCandidate.create] failed:', msg);
      }
    }

    if (cand) {
      candidate_id = cand.id;
      // Fire the JobCandidate.created trigger manually — db.* direct calls
      // bypass the /api/entities route, so we have to dispatch ourselves.
      fireTriggers('JobCandidate', 'created', cand).catch((e) =>
        console.warn('[trigger] JobCandidate.created (manual) failed:', e?.message),
      );

      if (!rejected && (score ?? 0) > 60) {
        const lines = [
          `שם: ${cand.full_name}${cand.age ? ` (${cand.age})` : ''}`,
          `תפקיד: ${cand.role_applied || '-'}`,
          `עיר: ${cand.city || '-'}`,
          `טלפון: ${cand.phone || '-'}`,
          `משמרות/שבוע: ${cand.shifts_per_week ?? '-'}`,
          `סופ"ש: ${cand.weekend_availability ? 'כן' : 'לא'}`,
          `יכול להתחיל: ${cand.start_date || '-'}`,
          `ניסיון: ${(cand.experience || '-').slice(0, 220)}`,
          `ציון: ${score}`,
          `מקור: ${candidateSource}`,
        ];
        pushoverToAdmins('🎯 מועמד גיוס חדש (ציון גבוה)', lines.join('\n')).catch(() => {});
      }
    }
  }

  return {
    reply: result?.reply || 'מצטער, אירעה תקלה. תוכל/י לנסות שוב?',
    complete: !!result?.complete,
    rejected: !!result?.rejected,
    candidate_id,
    score: result?.complete ? (typeof result.score === 'number' ? Math.round(result.score) : null) : null,
  };
}, { public: true });

/* ----- Interview scheduling ----- */

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// PUBLIC — candidate sees available slots for the next 2 weeks.
registerFn('getAvailableInterviewSlots', async ({ body }) => {
  const { candidate_id } = body as any;
  if (!candidate_id) throw new Error('candidate_id required');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!cand) throw new Error('candidate_not_found');
  if ((cand.score ?? 0) < 80) return { slots: [], reason: 'below_threshold' };
  if (cand.status === 'rejected') return { slots: [], reason: 'rejected' };

  const templates = await db.interviewSlotTemplate.findMany({ where: { active: true } });
  if (!templates.length) return { slots: [], reason: 'no_templates' };

  // Already-booked: collect (date,time) of non-cancelled interviews in next 21 days
  const booked = await db.interview.findMany({
    where: { status: { in: ['scheduled', 'showed', 'completed'] } },
  });
  const bookedKey = new Set(booked.map((b: any) => `${b.scheduled_date}|${b.scheduled_time}`));

  const out: any[] = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  // 1) One-off templates with a specific_date — emit only on that date.
  for (const t of templates) {
    const spec = (t as any).specific_date;
    if (!spec) continue;
    if (spec < todayStr || spec > horizon) continue;
    const key = `${spec}|${t.time}`;
    if (bookedKey.has(key)) continue;
    const wd = new Date(spec + 'T00:00').getDay();
    out.push({
      date: spec,
      time: t.time,
      weekday_name: WEEKDAY_NAMES[wd],
      duration_minutes: t.duration_minutes ?? 30,
    });
  }

  // 2) Weekly-recurring templates (no specific_date) — emit for each matching
  //    weekday in the next 14 days.
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const weekday = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    for (const t of templates) {
      if ((t as any).specific_date) continue;
      if (t.weekday !== weekday) continue;
      const key = `${dateStr}|${t.time}`;
      if (bookedKey.has(key)) continue;
      out.push({
        date: dateStr,
        time: t.time,
        weekday_name: WEEKDAY_NAMES[weekday],
        duration_minutes: t.duration_minutes ?? 30,
      });
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { slots: out.slice(0, 16) }; // cap at 16 to keep the list digestible
}, { public: true });

// PUBLIC — candidate books a slot from the chat.
registerFn('bookInterview', async ({ body }) => {
  const { candidate_id, date, time } = body as any;
  if (!candidate_id || !date || !time) throw new Error('missing_params');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!cand) throw new Error('candidate_not_found');
  if ((cand.score ?? 0) < 80) throw new Error('below_threshold');

  // Race-safe-ish: re-check the slot isn't taken
  const taken = await db.interview.findFirst({
    where: { scheduled_date: date, scheduled_time: time, status: { in: ['scheduled', 'showed', 'completed'] } },
  });
  if (taken) throw new Error('slot_taken');

  const tpl = await db.interviewSlotTemplate.findFirst({ where: { time } });
  const interview = await db.interview.create({
    data: {
      candidate_id,
      candidate_name: cand.full_name,
      candidate_phone: cand.phone,
      scheduled_date: date,
      scheduled_time: time,
      duration_minutes: tpl?.duration_minutes ?? 30,
      status: 'scheduled',
    },
  });
  fireTriggers('Interview', 'created', interview).catch(() => {});

  await db.jobCandidate.update({ where: { id: candidate_id }, data: { status: 'interview_scheduled' } });

  // Notify the owner immediately
  const summary =
    `${cand.full_name || 'מועמד'} (${cand.role_applied || '-'})\n` +
    `📅 ${date} בשעה ${time}\n` +
    `📞 ${cand.phone || '-'}\n` +
    `ציון: ${cand.score ?? '-'}`;
  pushoverToAdmins('📅 ראיון חדש נקבע', summary).catch(() => {});

  return { interview };
}, { public: true });

// AUTH — owner sets the weekly recurring slot template.
registerFn('getInterviewSlotTemplates', async () => {
  const templates = await db.interviewSlotTemplate.findMany({ orderBy: [{ weekday: 'asc' }, { time: 'asc' }] });
  return { templates };
});
registerFn('saveInterviewSlotTemplates', async ({ body }) => {
  const { templates } = body as any;
  if (!Array.isArray(templates)) throw new Error('templates array required');
  // Replace the whole set (simple and predictable for the owner)
  await db.interviewSlotTemplate.deleteMany({});
  if (templates.length) {
    // Try with specific_date; if column doesn't exist yet, retry without
    // (see CLAUDE.md §4.7 — db push lag).
    const payload = templates.map((t: any) => ({
      weekday: parseInt(t.weekday),
      time: String(t.time),
      duration_minutes: typeof t.duration_minutes === 'number' ? t.duration_minutes : 30,
      active: t.active !== false,
      specific_date: t.specific_date && /^\d{4}-\d{2}-\d{2}$/.test(t.specific_date) ? t.specific_date : null,
    }));
    try {
      await db.interviewSlotTemplate.createMany({ data: payload });
    } catch (e: any) {
      if (/unknown (arg|column)|specific_date/i.test(String(e?.message))) {
        await db.interviewSlotTemplate.createMany({
          data: payload.map(({ specific_date: _drop, ...rest }) => rest),
        });
      } else { throw e; }
    }
  }
  return { ok: true, count: templates.length };
});

// AUTH — recruitment dashboard: upcoming interviews, top candidates not yet
// scheduled (80+, still pending), candidates 50-79 to call back.
registerFn('getRecruitmentInbox', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db.interview.findMany({
    where: { scheduled_date: { gte: today } },
    orderBy: [{ scheduled_date: 'asc' }, { scheduled_time: 'asc' }],
    take: 50,
  });
  const recent = await db.interview.findMany({
    where: { scheduled_date: { lt: today }, status: { in: ['scheduled', 'showed', 'no_show'] } },
    orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'desc' }],
    take: 20,
  });
  const toCallBack = await db.jobCandidate.findMany({
    where: { status: 'pending', score: { gte: 50, lt: 80 } },
    orderBy: { created_date: 'desc' },
    take: 50,
  });
  const topUnscheduled = await db.jobCandidate.findMany({
    where: { status: 'pending', score: { gte: 80 } },
    orderBy: { created_date: 'desc' },
    take: 50,
  });

  // For each trainee, attach their next scheduled menu exam (if any) so the
  // pipeline UI can show the date/time and "passed/failed" buttons.
  const trainees = await db.jobCandidate.findMany({
    where: { status: { in: ['trainee', 'active'] } },
    orderBy: { created_date: 'desc' },
    take: 100,
  });
  const traineeIds = trainees.map((t: any) => t.id);
  const menuExams = traineeIds.length
    ? await db.interview.findMany({
        where: { candidate_id: { in: traineeIds }, type: 'menu_exam' },
        orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'desc' }],
      })
    : [];
  // Map candidate -> latest open menu exam (status=scheduled), else null
  const latestExamByCand: Record<string, any> = {};
  for (const ex of menuExams) {
    if (latestExamByCand[ex.candidate_id]) continue;
    if (ex.status === 'scheduled') latestExamByCand[ex.candidate_id] = ex;
  }
  const traineesEnriched = trainees.map((t: any) => ({
    ...t,
    next_menu_exam: latestExamByCand[t.id] || null,
  }));

  // Read recruitment knobs from RestaurantProfile (owner-tunable).
  const profile = await db.restaurantProfile.findFirst().catch(() => null);
  const minScore = profile?.recruitment_min_score ?? 80;
  const monthlyTargets = profile?.recruitment_monthly_targets || null;

  // Rejected candidates — LLM decided not to pursue. Keep visible so the
  // owner can audit AI decisions and recover false negatives.
  const rejected = await db.jobCandidate.findMany({
    where: { status: 'rejected' },
    orderBy: { id: 'desc' },
    take: 100,
  });

  // Abandoned: started the chat but never completed screening.
  // Heuristic: status=pending, no score (chat never finalized).
  const abandoned = await db.jobCandidate.findMany({
    where: { status: 'pending', score: null },
    orderBy: { id: 'desc' },
    take: 100,
  });

  // Tag each abandoned record with the stage they dropped at, by walking
  // the fields the chat collects in order.
  const stageOf = (c: any): string => {
    if (!c.phone) return 'phone';                       // never gave phone
    if (!c.role_applied) return 'role';                 // never picked role
    if (!c.experience) return 'experience';
    if (c.shifts_per_week == null) return 'shifts';
    if (c.weekend_availability == null) return 'weekend';
    if (!c.start_date) return 'start_date';
    return 'final_review';                              // got to end but never finalized
  };
  const abandonedEnriched = abandoned.map((c: any) => ({
    ...c,
    abandoned_stage: stageOf(c),
    transcript_turns: Array.isArray(c.transcript) ? c.transcript.length : 0,
  }));

  // Funnel — count candidates at each stage of the application pipeline.
  // Uses the same 100-row sample as above plus a total count for accuracy.
  const totalCount = await db.jobCandidate.count();
  const allRecent = await db.jobCandidate.findMany({ take: 500, orderBy: { id: 'desc' } });
  const funnel = {
    started: allRecent.length,                                                                    // chat opened
    gave_phone: allRecent.filter((c: any) => c.phone).length,                                     // step 1
    gave_role: allRecent.filter((c: any) => c.role_applied).length,                               // step 2
    completed_screening: allRecent.filter((c: any) => c.score != null || c.status === 'rejected').length, // step 3
    approved: allRecent.filter((c: any) => c.status === 'pending' && (c.score ?? 0) >= 80).length,
    interview_scheduled: allRecent.filter((c: any) => c.status === 'interview_scheduled').length,
    hired: allRecent.filter((c: any) => ['hired', 'trainee', 'active'].includes(c.status)).length,
    rejected: rejected.length,
    abandoned: abandoned.length,
    total: totalCount,
  };

  // Source breakdown — how each lead landed (facebook/whatsapp/web_chat/...).
  const sourceCounts: Record<string, number> = {};
  allRecent.forEach((c: any) => {
    const s = c.source || 'unknown';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  });

  // 30-day trend — counts per day for the last 30 days.
  const now = new Date();
  const trend30: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    trend30.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const trendIdx: Record<string, number> = {};
  trend30.forEach((t, i) => { trendIdx[t.date] = i; });
  allRecent.forEach((c: any) => {
    const d = String(c.createdAt || '').slice(0, 10);
    if (d in trendIdx) trend30[trendIdx[d]].count++;
  });

  // Rejection reason categorization — parse notes/ai_summary for keywords.
  const reasonOf = (c: any): string => {
    const txt = String((c.notes || '') + ' ' + (c.ai_summary || '')).toLowerCase();
    if (/test|בדיקה|מבחן/.test(txt)) return 'test';
    if (/גיל|מתחת|17|18|צעיר/.test(txt)) return 'age';
    if (/כשרות|שבת|דתי|שומר/.test(txt)) return 'kashrut';
    if (/סופ.?ש|שישי|שבת/.test(txt)) return 'weekend';
    if (/מיקום|רחוק|ירושלים|תל ?אביב|חיפה/.test(txt)) return 'location';
    if (/ניסיון|חסר/.test(txt)) return 'experience';
    if (/זמינ|שעות/.test(txt)) return 'availability';
    return 'other';
  };
  const rejectionReasons: Record<string, number> = {};
  rejected.forEach((c: any) => {
    const r = reasonOf(c);
    rejectionReasons[r] = (rejectionReasons[r] || 0) + 1;
  });

  // Duplicate detection — same phone (normalized) used by 2+ candidates.
  // Returns the phone + count + first/last candidate so owner can merge.
  const byPhone: Record<string, any[]> = {};
  allRecent.forEach((c: any) => {
    if (!c.phone) return;
    const norm = String(c.phone).replace(/\D/g, '').replace(/^0/, '+972');
    if (!byPhone[norm]) byPhone[norm] = [];
    byPhone[norm].push(c);
  });
  const duplicates = Object.entries(byPhone)
    .filter(([, arr]) => arr.length > 1)
    .map(([phone, arr]) => ({
      phone,
      count: arr.length,
      latest_name: arr[0]?.full_name,
      latest_id: arr[0]?.id,
      latest_status: arr[0]?.status,
      candidate_ids: arr.map((c) => c.id),
    }));

  // Hiring goals progress — for each role in `recruitment_monthly_targets`,
  // count how many were hired this month from JobCandidate.status='active'/'trainee'.
  const goalsProgress: Array<{ role: string; target: number; hired: number }> = [];
  if (monthlyTargets && typeof monthlyTargets === 'object') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    for (const [role, target] of Object.entries(monthlyTargets)) {
      if (typeof target !== 'number') continue;
      const hired = allRecent.filter((c: any) =>
        ['hired', 'trainee', 'active'].includes(c.status) &&
        c.role_applied === role &&
        String(c.createdAt || '') >= monthStart,
      ).length;
      goalsProgress.push({ role, target, hired });
    }
  }

  return {
    upcoming, recent, toCallBack, topUnscheduled,
    trainees: traineesEnriched,
    rejected,
    abandoned: abandonedEnriched,
    funnel,
    // New analytics surfaces:
    source_counts: sourceCounts,
    trend_30: trend30,
    rejection_reasons: rejectionReasons,
    duplicates,
    settings: {
      min_score: minScore,
      monthly_targets: monthlyTargets,
    },
    goals_progress: goalsProgress,
  };
});

// Clone all WorkShift records from one week into another. Preserves
// shift_type, start_time, end_time, positions_needed, and assigned_staff.
// Owner-only. Skips dates that already have a WorkShift to avoid duplicates.
registerFn('copyShiftsFromLastWeek', async ({ body, user }) => {
  if (!user) throw new Error('unauthorized');
  const { source_week_start, target_week_start } = (body || {}) as any;
  if (!source_week_start || !target_week_start) throw new Error('source_week_start + target_week_start required');
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sourceStart = new Date(source_week_start + 'T00:00:00');
  const targetStart = new Date(target_week_start + 'T00:00:00');
  if (isNaN(sourceStart.getTime()) || isNaN(targetStart.getTime())) throw new Error('invalid_date');
  const sourceEnd = new Date(sourceStart); sourceEnd.setDate(sourceEnd.getDate() + 7);

  // Pull every WorkShift in the source range
  const sourceShifts = await db.workShift.findMany({
    where: { date: { gte: sourceStart, lt: sourceEnd } },
    take: 200,
  });
  // What target dates already exist? Don't overwrite.
  const targetEnd = new Date(targetStart); targetEnd.setDate(targetEnd.getDate() + 7);
  const existing = await db.workShift.findMany({
    where: { date: { gte: targetStart, lt: targetEnd } },
    take: 200,
  });
  const existingKey = new Set(existing.map((w: any) => `${fmt(new Date(w.date))}|${w.shift_type}`));
  const offsetDays = Math.round((targetStart.getTime() - sourceStart.getTime()) / 86400000);

  const created: any[] = [];
  const skipped: any[] = [];
  for (const s of sourceShifts) {
    const oldDate = new Date(s.date);
    const newDate = new Date(oldDate); newDate.setDate(newDate.getDate() + offsetDays);
    const key = `${fmt(newDate)}|${s.shift_type}`;
    if (existingKey.has(key)) { skipped.push({ date: fmt(newDate), shift_type: s.shift_type }); continue; }
    try {
      const out = await db.workShift.create({
        data: {
          date: newDate,
          shift_type: s.shift_type,
          start_time: s.start_time,
          end_time: s.end_time,
          positions_needed: s.positions_needed,
          assigned_staff: s.assigned_staff,
          notes: s.notes,
        },
      });
      created.push({ id: out.id, date: fmt(newDate), shift_type: s.shift_type });
    } catch (e: any) {
      skipped.push({ date: fmt(newDate), shift_type: s.shift_type, error: e?.message });
    }
  }
  return { created: created.length, skipped: skipped.length, details: { created, skipped } };
});

// Cleanup orphan placeholders — rows the partial-save created on chat open
// before the user typed anything. Identified by name="מועמד בתהליך" / "מועמד
// אנונימי" AND null phone. Idempotent and owner-only.
registerFn('cleanupPlaceholderCandidates', async ({ user }) => {
  if (!user?.email) throw new Error('unauthorized');
  if (String(user.email).toLowerCase() !== 'dvirnifusi@gmail.com') {
    throw new Error('owner_only');
  }
  const deleted = await (prisma as any).$executeRawUnsafe(
    `DELETE FROM "JobCandidate" WHERE phone IS NULL AND (full_name = 'מועמד בתהליך' OR full_name = 'מועמד אנונימי' OR full_name IS NULL OR full_name = '')`,
  );
  return { deleted: Number(deleted) };
}, { public: true });

// Ensure JobCandidate.lead_id exists. Needed for incremental save of partial
// chats — see chatJobApplication. Run once after deploy.
registerFn('ensureLeadIdColumn', async () => {
  const stmts = [
    `ALTER TABLE "JobCandidate" ADD COLUMN IF NOT EXISTS "lead_id" TEXT`,
    `CREATE INDEX IF NOT EXISTS "JobCandidate_lead_id_idx" ON "JobCandidate" ("lead_id")`,
  ];
  const results: any[] = [];
  for (const stmt of stmts) {
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return { results };
}, { public: true });

// Ensure the recruitment knob columns exist on RestaurantProfile. Schema
// declared them; this guarantees the DB matches before Prisma client reads.
registerFn('ensureRecruitmentColumns', async () => {
  const stmts = [
    `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "recruitment_min_score" INTEGER DEFAULT 80`,
    `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "recruitment_monthly_targets" JSONB`,
  ];
  const results: any[] = [];
  for (const stmt of stmts) {
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return { results };
}, { public: true });

// One-click recovery: take a rejected candidate back to pending so a manager
// can reach out manually or re-evaluate.
registerFn('unrejectCandidate', async ({ body }) => {
  const { candidate_id } = (body || {}) as any;
  if (!candidate_id) throw new Error('candidate_id required');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!cand) throw new Error('candidate_not_found');
  if (cand.status !== 'rejected') throw new Error('not_rejected');
  await db.jobCandidate.update({
    where: { id: candidate_id },
    data: {
      status: 'pending',
      notes: `${cand.notes || ''}${cand.notes ? '\n' : ''}[manager_override] החזרה מ-rejected ב-${new Date().toISOString()}`,
    },
  });
  return { ok: true, candidate_id };
});

// Owner-tunable AI minimum score for the "top candidates" bucket.
registerFn('updateRecruitmentMinScore', async ({ body }) => {
  const { score } = (body || {}) as any;
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('score_out_of_range');
  const profile = await db.restaurantProfile.findFirst();
  if (!profile) throw new Error('no_profile');
  await db.restaurantProfile.update({ where: { id: profile.id }, data: { recruitment_min_score: Math.round(n) } });
  return { ok: true, recruitment_min_score: Math.round(n) };
});

// Owner-tunable monthly hiring targets, e.g. {waiter: 3, kitchen: 2, runner: 1}
registerFn('updateRecruitmentTargets', async ({ body }) => {
  const { targets } = (body || {}) as any;
  if (!targets || typeof targets !== 'object') throw new Error('targets_object_required');
  const profile = await db.restaurantProfile.findFirst();
  if (!profile) throw new Error('no_profile');
  await db.restaurantProfile.update({ where: { id: profile.id }, data: { recruitment_monthly_targets: targets } });
  return { ok: true, recruitment_monthly_targets: targets };
});

// Cron handler — fires a WhatsApp nudge (well, queues a `wa.me` URL log) for
// each abandoned candidate > 24h that hasn't been nudged yet. Marks them
// with u_notified_abandoned=true so the same candidate isn't nudged twice.
// Triggered by /api/cron/abandoned-reminder.
export async function sendAbandonedReminder() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = await db.jobCandidate.findMany({
    where: {
      status: 'pending',
      score: null,
      u_notified_abandoned: { not: true },
      createdAt: { lte: cutoff },
      phone: { not: null },
    },
    take: 50,
  });
  const results: Array<{ id: string; name: string; phone: string; ok: boolean; err?: string }> = [];
  for (const c of candidates) {
    try {
      // Pushover to owner so they can ping back manually.
      await pushoverToAdmins(
        `🚪 ליד גיוס נטוש > 24h — ${c.full_name || '-'}`,
        [
          `📱 ${c.phone || '-'}`,
          `💼 ${c.role_applied || '-'}${c.city ? ' · ' + c.city : ''}`,
          c.ai_summary ? `🤖 ${String(c.ai_summary).slice(0, 120)}` : null,
          `🔗 https://wa.me/${String(c.phone).replace(/\D/g, '').replace(/^0/, '972')}`,
        ].filter(Boolean).join('\n'),
      );
      await db.jobCandidate.update({ where: { id: c.id }, data: { u_notified_abandoned: true } });
      results.push({ id: c.id, name: c.full_name || '-', phone: c.phone, ok: true });
    } catch (e: any) {
      results.push({ id: c.id, name: c.full_name || '-', phone: c.phone, ok: false, err: e?.message });
    }
  }
  return { reminded: results.filter((r) => r.ok).length, attempted: candidates.length, results };
}

// AUTH — manager-side slot helpers (no candidate-score check).
registerFn('getInterviewSlotsForManager', async () => {
  const templates = await db.interviewSlotTemplate.findMany({ where: { active: true } });
  if (!templates.length) return { slots: [] };
  const booked = await db.interview.findMany({
    where: { status: { in: ['scheduled', 'showed', 'completed'] } },
  });
  const bookedKey = new Set(booked.map((b: any) => `${b.scheduled_date}|${b.scheduled_time}`));
  const out: any[] = [];
  const now = new Date();
  for (let i = 1; i <= 21; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const weekday = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    for (const t of templates) {
      if (t.weekday !== weekday) continue;
      const key = `${dateStr}|${t.time}`;
      if (bookedKey.has(key)) continue;
      out.push({
        date: dateStr,
        time: t.time,
        weekday_name: WEEKDAY_NAMES[weekday],
        duration_minutes: t.duration_minutes ?? 30,
      });
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { slots: out };
});

registerFn('bookInterviewByManager', async ({ body }) => {
  const { candidate_id, date, time, type } = body as any;
  if (!candidate_id || !date || !time) throw new Error('missing_params');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!cand) throw new Error('candidate_not_found');
  const t = type === 'menu_exam' ? 'menu_exam' : 'interview';

  const taken = await db.interview.findFirst({
    where: { scheduled_date: date, scheduled_time: time, status: { in: ['scheduled', 'showed', 'completed'] } },
  });
  if (taken) throw new Error('slot_taken');

  const tpl = await db.interviewSlotTemplate.findFirst({ where: { time } });
  const interview = await db.interview.create({
    data: {
      candidate_id,
      candidate_name: cand.full_name,
      candidate_phone: cand.phone,
      scheduled_date: date,
      scheduled_time: time,
      duration_minutes: tpl?.duration_minutes ?? 30,
      status: 'scheduled',
      type_: t,
    },
  });
  fireTriggers('Interview', 'created', interview).catch(() => {});

  if (t === 'menu_exam') {
    await db.jobCandidate.update({
      where: { id: candidate_id },
      data: { training_stage: 'menu_exam_scheduled' },
    });
  } else {
    await db.jobCandidate.update({ where: { id: candidate_id }, data: { status: 'interview_scheduled' } });
  }
  return { interview };
});

// Manager marks the menu exam result. On pass -> menu_exam_passed (ready to
// start training shifts). On fail -> menu_exam_failed (manager can schedule
// another exam). Either way the Interview row is closed.
registerFn('setMenuExamResult', async ({ body }) => {
  const { candidate_id, interview_id, passed } = body as any;
  if (!candidate_id || typeof passed !== 'boolean') throw new Error('missing_params');
  if (interview_id) {
    await db.interview.update({
      where: { id: interview_id },
      data: { status: 'completed', notes: passed ? 'עבר מבחן תפריט' : 'נכשל במבחן תפריט' },
    }).catch(() => {});
  }
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  const attempts = (cand?.menu_exam_attempts ?? 0) + 1;
  const stage = passed ? 'menu_exam_passed' : 'menu_exam_failed';
  const updated = await db.jobCandidate.update({
    where: { id: candidate_id },
    data: { training_stage: stage, menu_exam_attempts: attempts },
  });
  return { candidate: updated };
});

// Manager completed one training shift for the candidate. Increments counter;
// moving to 'active_waiter' is a separate explicit action (advanceCandidateStage).
// Manager removes a candidate (and any attached interview/menu-exam rows).
registerFn('deleteCandidate', async ({ body }) => {
  const { candidate_id } = body as any;
  if (!candidate_id) throw new Error('candidate_id required');
  await db.interview.deleteMany({ where: { candidate_id } }).catch(() => {});
  await db.jobCandidate.delete({ where: { id: candidate_id } });
  return { ok: true };
});

registerFn('completeTrainingSession', async ({ body }) => {
  const { candidate_id } = body as any;
  if (!candidate_id) throw new Error('candidate_id required');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  const sessions = (cand?.training_sessions_completed ?? 0) + 1;
  const updated = await db.jobCandidate.update({
    where: { id: candidate_id },
    data: {
      training_sessions_completed: sessions,
      training_stage: cand?.training_stage === 'menu_exam_passed' ? 'training' : (cand?.training_stage || 'training'),
      status: 'trainee',
    },
  });
  return { candidate: updated };
});

registerFn('markInterviewStatus', async ({ body }) => {
  const { id, status, notes } = body as any;
  if (!id || !status) throw new Error('id and status required');
  const data: any = { status };
  if (notes !== undefined) data.notes = notes;
  const interview = await db.interview.update({ where: { id }, data });
  // If candidate showed → mark candidate accordingly; if no_show, mark candidate as no_show too
  if (status === 'no_show') {
    await db.jobCandidate.update({ where: { id: interview.candidate_id }, data: { status: 'no_show' } }).catch(() => {});
  } else if (status === 'showed' || status === 'completed') {
    await db.jobCandidate.update({ where: { id: interview.candidate_id }, data: { status: 'interviewed' } }).catch(() => {});
  }
  return { interview };
});

// Cancel a scheduled interview entirely: delete the row (frees the time
// slot and removes it from "upcoming interviews"), and bump the candidate
// back to a re-schedulable state so they reappear in "top candidates".
registerFn('cancelInterview', async ({ body }) => {
  const { id } = body as any;
  if (!id) throw new Error('id required');
  const iv = await db.interview.findUnique({ where: { id } });
  if (!iv) throw new Error('interview not found');

  await db.interview.delete({ where: { id } }).catch(() => {});

  // Reset candidate status if it was bumped by scheduling. We don't touch
  // candidates that already passed an earlier stage (hired, trainee, etc).
  if (iv.candidate_id) {
    const cand = await db.jobCandidate.findUnique({ where: { id: iv.candidate_id } });
    if (cand && (cand.status === 'scheduled' || cand.status === 'interview_scheduled')) {
      await db.jobCandidate.update({
        where: { id: iv.candidate_id },
        data: { status: 'pending' },
      }).catch(() => {});
    }
  }
  return { ok: true };
});

// AUTH — move a candidate through training pipeline.
// Stages: 'hired' -> 'trainee_tables' -> 'trainee_bar' -> 'trainee_kitchen' -> 'active_waiter'
// ----- Internal scheduler: send Pushover ~3h before each interview -----
// Runs every 15 minutes inside the API process. Idempotent via reminder_sent_at.
export async function checkInterviewReminders() {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Look at today + tomorrow (covers reminders for tomorrow-early interviews)
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    const candidates = await db.interview.findMany({
      where: {
        status: 'scheduled',
        scheduled_date: { in: [today, tomorrow] },
        reminder_sent_at: null,
      },
    });
    for (const iv of candidates) {
      const dt = new Date(`${iv.scheduled_date}T${iv.scheduled_time}:00`);
      const diffMs = dt.getTime() - now.getTime();
      // Window: 2h45m–3h15m before. Tightens to ~30min span so we hit it once.
      if (diffMs < 2.75 * 3600 * 1000 || diffMs > 3.25 * 3600 * 1000) continue;

      const cand = await db.jobCandidate.findUnique({ where: { id: iv.candidate_id } });
      const lines = [
        `${iv.candidate_name || cand?.full_name || 'מועמד'} (${cand?.role_applied || '-'})`,
        `📅 היום בשעה ${iv.scheduled_time}`,
        `📞 ${iv.candidate_phone || cand?.phone || '-'}`,
        `🏙️ ${cand?.city || '-'}`,
        cand?.score ? `ציון: ${cand.score}` : '',
        cand?.ai_summary ? `\n${cand.ai_summary}` : '',
      ].filter(Boolean).join('\n');
      await pushoverToAdmins('⏰ ראיון עבודה בעוד ~3 שעות', lines).catch((e) =>
        console.error('reminder push failed', e?.message),
      );
      await db.interview.update({ where: { id: iv.id }, data: { reminder_sent_at: new Date().toISOString() } });
    }
  } catch (e: any) {
    console.error('interview reminder scan failed', e?.message);
  }
}

// Start the scheduler on import. Runs every 15 min; first run after 30s so the
// API doesn't block boot if the DB isn't ready immediately.
if (!(globalThis as any).__interviewReminderTimer) {
  (globalThis as any).__interviewReminderTimer = setTimeout(function loop() {
    checkInterviewReminders().finally(() => {
      (globalThis as any).__interviewReminderTimer = setTimeout(loop, 15 * 60 * 1000);
    });
  }, 30 * 1000);
}

// ── CEO daily brief scheduler (Asia/Jerusalem) ───────────────────────────────
// Fires at 09:00, 17:00, 00:00 local time. Idempotent: only fires once per
// window per day, even if the loop hits the same minute twice.
export async function checkCeoDailyBriefs() {
  try {
    const tz = 'Asia/Jerusalem';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = fmt.format(new Date()).split(':');
    const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayLocal = dateFmt.format(new Date());

    const windows: Record<string, string> = { '09': 'cron_morning', '17': 'cron_afternoon', '00': 'cron_night' };
    const trigger = windows[hh];
    if (!trigger) return;
    if (parseInt(mm) > 14) return; // only fire in the first 15 minutes of the window

    // Already ran for this window today?
    const ceo = await db.agent.findUnique({ where: { name: 'CEO' } });
    if (!ceo) return;
    const existing = await db.agentRun.findFirst({
      where: {
        agent_id: ceo.id,
        trigger,
        started_at: { gte: `${todayLocal}T00:00:00`, lt: `${todayLocal}T23:59:59` },
      },
    });
    if (existing) return;

    // Fire the real brief by reusing the registered handler.
    const handler = functionHandlers['runCeoDailyBrief'];
    if (handler) await handler({ body: { trigger }, user: null as any, req: null as any });
  } catch (e: any) {
    console.error('CEO daily brief scan failed', e?.message);
  }
}

if (!(globalThis as any).__ceoDailyBriefTimer) {
  (globalThis as any).__ceoDailyBriefTimer = setTimeout(function loop() {
    checkCeoDailyBriefs().finally(() => {
      (globalThis as any).__ceoDailyBriefTimer = setTimeout(loop, 5 * 60 * 1000);
    });
  }, 60 * 1000);
}

// ============================================================================
// DAILY BIRTHDAY + ANNIVERSARY CRON — fires once per day around 09:00 IL.
// Sends a celebratory WhatsApp to every customer whose birthday/anniversary
// is today and who consented to marketing. De-duplicated via the existing
// last_marketing_sent_at + 24h throttle baked into sendCustomerCampaign logic.
// ============================================================================
async function runDailyCelebrationCampaigns(force = false) {
  if (!force) {
    // Same kill switch as drips — no automatic customer sends until the
    // owner sets DRIP_CAMPAIGNS_ENABLED=true in apps/api/.env.
    if (process.env.DRIP_CAMPAIGNS_ENABLED !== 'true') return;
    const ilHour = (new Date().getUTCHours() + 3) % 24;
    if (ilHour !== 9) return; // only at 09:00 IL
    // Use a daily lock so we don't re-fire if the timer ticks twice within 9:00 IL hour.
    const today = new Date().toISOString().slice(0, 10);
    const lockKey = (globalThis as any).__lastDailyCelebrationsDate;
    if (lockKey === today) return;
    (globalThis as any).__lastDailyCelebrationsDate = today;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const baseGate: any = {
    marketing_consent: true,
    marketing_unsubscribed_at: null,
    phone: { not: '' },
    OR: [{ last_marketing_sent_at: null }, { last_marketing_sent_at: { lt: cutoff } }],
  };

  // 1) Birthday today
  const brand = await getBrandName();
  const bdayTemplate = `יום הולדת שמח, {name}! 🎉🎂\nאיזה יום מיוחד — אם תבוא היום, הקינוח על ${brand} 🍰\nנשמח לחגוג איתך 🌿`;
  try {
    const bdayList = await db.customer.findMany({
      where: { ...baseGate, birthday_mmdd: mmdd },
      take: 200,
    });
    let ok = 0, fail = 0;
    const failures: any[] = [];
    for (const c of bdayList) {
      try {
        const rendered = bdayTemplate.replace(/\{name\}/g, c.name || 'אורח/ת יקר/ה');
        const out = await sendWhatsApp(c.phone, rendered);
        if ((out as any)?.skipped) { fail++; failures.push({ phone: c.phone, reason: 'skipped' }); }
        else { ok++; await db.customer.update({ where: { id: c.id }, data: { last_marketing_sent_at: new Date() } }).catch(() => {}); }
      } catch (e: any) {
        fail++; failures.push({ phone: c.phone, reason: e?.message?.slice(0, 100) });
      }
    }
    if (bdayList.length > 0) {
      await db.campaignSend.create({ data: {
        campaign_key: 'birthday_today_auto', campaign_label: 'יום הולדת היום (אוטומטי)',
        segment_key: 'birthday_today', channel: 'whatsapp', message_template: bdayTemplate,
        recipient_count: bdayList.length, success_count: ok, failure_count: fail,
        failure_reasons: failures.length ? failures.slice(0, 20) : undefined,
        sent_by: 'cron@topalena.com',
      }}).catch(() => {});
      console.log(`[cron] birthday_today: ${ok}/${bdayList.length} sent`);
    }
  } catch (e: any) {
    console.warn('[cron] birthday cron failed:', e?.message);
  }

  // 2) Anniversary today
  const annivTemplate = 'מזל טוב, {name}! 🥂\nהיום יום מיוחד — בוא לחגוג אצלנו ויש לנו מתנה.\nרוטשילד 104, ראשון לציון 🌿';
  try {
    const annList = await db.customer.findMany({
      where: { ...baseGate, anniversary_mmdd: mmdd },
      take: 200,
    });
    let ok = 0, fail = 0;
    const failures: any[] = [];
    for (const c of annList) {
      try {
        const rendered = annivTemplate.replace(/\{name\}/g, c.name || 'אורח/ת יקר/ה');
        const out = await sendWhatsApp(c.phone, rendered);
        if ((out as any)?.skipped) { fail++; failures.push({ phone: c.phone, reason: 'skipped' }); }
        else { ok++; await db.customer.update({ where: { id: c.id }, data: { last_marketing_sent_at: new Date() } }).catch(() => {}); }
      } catch (e: any) {
        fail++; failures.push({ phone: c.phone, reason: e?.message?.slice(0, 100) });
      }
    }
    if (annList.length > 0) {
      await db.campaignSend.create({ data: {
        campaign_key: 'anniversary_today_auto', campaign_label: 'יום נישואים היום (אוטומטי)',
        segment_key: 'anniversary_today', channel: 'whatsapp', message_template: annivTemplate,
        recipient_count: annList.length, success_count: ok, failure_count: fail,
        failure_reasons: failures.length ? failures.slice(0, 20) : undefined,
        sent_by: 'cron@topalena.com',
      }}).catch(() => {});
      console.log(`[cron] anniversary_today: ${ok}/${annList.length} sent`);
    }
  } catch (e: any) {
    console.warn('[cron] anniversary cron failed:', e?.message);
  }
}

// ============================================================================
// DRIP CAMPAIGNS — automated lifecycle messages
// ============================================================================
// Three drips run via the same cron tick (every 30 min):
//   - Welcome: 18-36h after first ever visit
//   - NPS: 2-4 days after any completed visit
//   - Pre-birthday: 7 days before customer's birthday_mmdd
//
// Each drip is gated by a per-customer column so we never double-send.
// All respect marketing_consent + last_marketing_sent_at 24h throttle.
// ============================================================================

const DRIP_TEMPLATES = {
  welcome: 'תודה ששמת אותנו במפה שלך, {name} 🌿\nתקווה שנהניתם — לקראת הביקור הבא יש לך 10% הנחה.\nרק תגיד "ראיתי בוואטסאפ" למלצר.\n{brand}',
  nps_high: 'היי {name}, איך היה אצלנו?\nאם נהנית — נשמח לביקורת קטנה ב-Google:\nhttps://g.page/r/topalena-review\nתודה רבה 🌿',
  nps_low: 'היי {name},\nאיך היה אצלנו? תן לנו 1-5 בקצרה.\nכל משוב נכנס ישירות למנהל ועוזר לנו להשתפר 🌿',
  pre_birthday: 'היי {name}! 🎂\nבעוד שבוע יש לך יום הולדת — נשמח לחגוג איתך!\nתזמין שולחן וקבל קינוח חינם.\nרוטשילד 104, ראשון לציון 🌿',
};

async function runDripCampaigns(force = false) {
  // ── KILL SWITCH ──────────────────────────────────────────────────────────
  // Drips are OFF until the owner explicitly enables them by setting
  // DRIP_CAMPAIGNS_ENABLED=true in apps/api/.env. Added 2026-06-11 after the
  // bulk consent migration made 19K customers eligible — auto-sending without
  // an explicit opt-in from the OWNER is not acceptable. The admin-only
  // manual trigger (runDripCampaignsNow) passes force=true.
  if (!force && process.env.DRIP_CAMPAIGNS_ENABLED !== 'true') {
    return;
  }
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const baseGate: any = {
    marketing_consent: true,
    marketing_unsubscribed_at: null,
    phone: { not: '' },
    OR: [{ last_marketing_sent_at: null }, { last_marketing_sent_at: { lt: cutoff24h } }],
  };

  // === 1) Welcome drip — first visit 18-36h ago ============================
  try {
    const minAge = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    const maxAge = new Date(now.getTime() - 18 * 60 * 60 * 1000);
    const candidates = await db.customer.findMany({
      where: { ...baseGate, visit_count: 1, last_visit: { gte: minAge, lte: maxAge }, welcome_sent_at: null },
      take: 50,
    });
    if (candidates.length > 0) {
      let ok = 0, fail = 0;
      for (const c of candidates) {
        try {
          const msg = DRIP_TEMPLATES.welcome.replace(/\{name\}/g, c.name || 'אורח/ת יקר/ה').replace(/\{brand\}/g, await getBrandName());
          const out = await sendWhatsApp(c.phone, msg);
          if (!(out as any)?.skipped) {
            ok++;
            await db.customer.update({ where: { id: c.id }, data: {
              welcome_sent_at: new Date(), last_marketing_sent_at: new Date(),
            }}).catch(() => {});
          } else { fail++; }
        } catch { fail++; }
      }
      await db.campaignSend.create({ data: {
        campaign_key: 'drip_welcome', campaign_label: 'ברוך הבא (אוטומטי)',
        segment_key: 'first_visit_24h', channel: 'whatsapp',
        message_template: DRIP_TEMPLATES.welcome,
        recipient_count: candidates.length, success_count: ok, failure_count: fail,
        estimated_cost_ils: Number((candidates.length * 0.13).toFixed(2)),
        sent_by: 'drip@topalena.com',
      }}).catch(() => {});
      console.log(`[drip] welcome: ${ok}/${candidates.length}`);
    }
  } catch (e: any) { console.warn('[drip] welcome failed:', e?.message); }

  // === 2) NPS drip — visit completed 2-4 days ago =========================
  try {
    const minAge = new Date(now.getTime() - 4 * 86400000);
    const maxAge = new Date(now.getTime() - 2 * 86400000);
    const candidates = await db.customer.findMany({
      where: { ...baseGate, last_visit: { gte: minAge, lte: maxAge }, nps_sent_at: null },
      take: 100,
    });
    if (candidates.length > 0) {
      let ok = 0, fail = 0;
      for (const c of candidates) {
        try {
          // Use 'high' template for VIPs (assume happy), 'low' template for everyone else
          const template = c.loyalty_tier === 'vip' ? DRIP_TEMPLATES.nps_high : DRIP_TEMPLATES.nps_low;
          const msg = template.replace(/\{name\}/g, c.name || 'אורח/ת יקר/ה');
          const out = await sendWhatsApp(c.phone, msg);
          if (!(out as any)?.skipped) {
            ok++;
            await db.customer.update({ where: { id: c.id }, data: {
              nps_sent_at: new Date(), last_marketing_sent_at: new Date(),
            }}).catch(() => {});
          } else { fail++; }
        } catch { fail++; }
      }
      await db.campaignSend.create({ data: {
        campaign_key: 'drip_nps', campaign_label: 'NPS / משוב (אוטומטי)',
        segment_key: 'recent_visitors', channel: 'whatsapp',
        message_template: DRIP_TEMPLATES.nps_low,
        recipient_count: candidates.length, success_count: ok, failure_count: fail,
        estimated_cost_ils: Number((candidates.length * 0.13).toFixed(2)),
        sent_by: 'drip@topalena.com',
      }}).catch(() => {});
      console.log(`[drip] nps: ${ok}/${candidates.length}`);
    }
  } catch (e: any) { console.warn('[drip] nps failed:', e?.message); }

  // === 3) Pre-birthday — 7 days before ====================================
  try {
    const future = new Date(now.getTime() + 7 * 86400000);
    const targetMmdd = String(future.getMonth() + 1).padStart(2, '0') + '-' + String(future.getDate()).padStart(2, '0');
    const currentYear = now.getFullYear();
    const candidates = await db.customer.findMany({
      where: {
        ...baseGate,
        birthday_mmdd: targetMmdd,
        OR: [
          ...(baseGate.OR || []),
          { pre_birthday_sent_year: null },
          { pre_birthday_sent_year: { lt: currentYear } },
        ],
      },
      take: 100,
    });
    if (candidates.length > 0) {
      let ok = 0, fail = 0;
      for (const c of candidates) {
        if (c.pre_birthday_sent_year === currentYear) continue; // double-check
        try {
          const msg = DRIP_TEMPLATES.pre_birthday.replace(/\{name\}/g, c.name || 'אורח/ת יקר/ה');
          const out = await sendWhatsApp(c.phone, msg);
          if (!(out as any)?.skipped) {
            ok++;
            await db.customer.update({ where: { id: c.id }, data: {
              pre_birthday_sent_year: currentYear, last_marketing_sent_at: new Date(),
            }}).catch(() => {});
          } else { fail++; }
        } catch { fail++; }
      }
      await db.campaignSend.create({ data: {
        campaign_key: 'drip_pre_birthday', campaign_label: 'שבוע לפני יום הולדת (אוטומטי)',
        segment_key: 'birthday_in_7d', channel: 'whatsapp',
        message_template: DRIP_TEMPLATES.pre_birthday,
        recipient_count: candidates.length, success_count: ok, failure_count: fail,
        estimated_cost_ils: Number((candidates.length * 0.13).toFixed(2)),
        sent_by: 'drip@topalena.com',
      }}).catch(() => {});
      console.log(`[drip] pre_birthday: ${ok}/${candidates.length}`);
    }
  } catch (e: any) { console.warn('[drip] pre_birthday failed:', e?.message); }
}

if (!(globalThis as any).__dripCampaignsTimer) {
  // Tick every 30 min — each drip self-gates so we won't re-send.
  (globalThis as any).__dripCampaignsTimer = setTimeout(function loop() {
    runDripCampaigns().finally(() => {
      (globalThis as any).__dripCampaignsTimer = setTimeout(loop, 30 * 60 * 1000);
    });
  }, 5 * 60 * 1000); // first run 5 min after startup
}

registerFn('runDripCampaignsNow', async ({ user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  await runDripCampaigns(true);
  return { triggered: true };
});

// ============================================================================
// AI PERSONALIZATION — Gemini rewrites a generic template to be customer-specific
// ============================================================================
// Owner clicks ✨ Personalize → backend calls Gemini with customer context →
// returns a custom opening sentence + adapted body.
// Optional: not part of automated flow, used in compose UI.
registerFn('personalizeWithAI', async ({ body }) => {
  const { template, customer_id, customer_phone } = body as any;
  if (!template) throw new Error('template required');
  let customer: any = null;
  if (customer_id) customer = await db.customer.findUnique({ where: { id: customer_id } });
  else if (customer_phone) customer = await db.customer.findFirst({ where: { phone: String(customer_phone).replace(/[^\d]/g, '') } });
  if (!customer) {
    // Synthetic "average" customer profile for preview without specific match
    customer = { name: 'אורח לדוגמה', visit_count: 3, loyalty_tier: 'regular', last_visit: new Date(Date.now() - 30 * 86400000) };
  }
  const prompt = `אתה כותב הודעה אישית בעברית למסעדת "${await getBrandName()}".
פרטי הלקוח:
- שם: ${customer.name || 'אורח'}
- מספר ביקורים: ${customer.visit_count || 0}
- סטטוס: ${customer.loyalty_tier === 'vip' ? 'VIP' : 'רגיל'}
- ביקור אחרון: ${customer.last_visit ? new Date(customer.last_visit).toLocaleDateString('he-IL') : 'אין נתון'}

הטמפלייט הגנרי:
"""${template}"""

המשימה: שכתב את ההודעה כך שתהיה אישית ומדויקת ללקוח הזה. שמור על הטון הקיים. עברית טבעית, חמה אבל לא מתחנפת. עד 4 שורות. ללא המילה "יקר/ה". בלי placeholders.

החזר רק את הטקסט הסופי, ללא הסבר.`;

  try {
    const result: any = await invokeLLM({ prompt, timeoutMs: 15000, maxOutputTokens: 400, maxAttempts: 2 } as any);
    const text = (typeof result === 'string' ? result : result?.text || result?.response || '').trim();
    if (!text) return { ok: false, error: 'empty_response', personalized: template };
    return { ok: true, personalized: text, customer: { name: customer.name, visits: customer.visit_count, tier: customer.loyalty_tier } };
  } catch (e: any) {
    return { ok: false, error: e?.message, personalized: template };
  }
});

// ============================================================================
// A/B TEST — send N variants 50/50 (or evenly split) and track per-variant
// ============================================================================
// Each variant gets a separate CampaignSend row with the same campaign_key
// but different campaign_label suffix ("(A)", "(B)") so analytics can compare.
registerFn('sendABTestCampaign', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { segment, variants, channel, campaign_key, campaign_label, custom_filter, media_url } = body as any;
  if (!Array.isArray(variants) || variants.length < 2) throw new Error('Need >= 2 variants');
  if (variants.length > 5) throw new Error('Max 5 variants');
  if (!segment) throw new Error('segment required');

  // Resolve recipients ONCE so we can split them
  const where = buildSegmentWhere(segment, custom_filter);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // AND-combine — see sendCustomerCampaign comment (OR-clobbering hazard).
  const finalWhere: any = {
    AND: [
      where,
      { OR: [{ last_marketing_sent_at: null }, { last_marketing_sent_at: { lt: cutoff } }] },
    ],
  };
  const allRecipients = await db.customer.findMany({ where: finalWhere, take: 500 });
  // Shuffle + chunk
  const shuffled = [...allRecipients].sort(() => Math.random() - 0.5);
  const chunkSize = Math.ceil(shuffled.length / variants.length);
  const useWa = channel === 'whatsapp' || !channel;
  const channelStr = useWa ? 'whatsapp' : 'sms';
  const brandAB = await getBrandName();
  const sends: any[] = [];

  for (let i = 0; i < variants.length; i++) {
    const variantLabel = String.fromCharCode(65 + i); // A, B, C...
    const chunk = shuffled.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length === 0) continue;

    const parentSend = await db.campaignSend.create({
      data: {
        campaign_key: (campaign_key || segment) + `_ab_${variantLabel}`,
        campaign_label: `${campaign_label || segment} (${variantLabel})`,
        segment_key: segment,
        segment_filter: custom_filter || undefined,
        channel: channelStr,
        message_template: variants[i],
        media_url: media_url || null,
        recipient_count: chunk.length,
        estimated_cost_ils: Number((chunk.length * 0.13).toFixed(2)),
        sent_by: (user as any)?.email || null,
      },
    });

    let ok = 0, fail = 0;
    const statusCallback = `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/api/twilio/campaign-status`;
    for (const c of chunk) {
      const recipient = await db.campaignRecipient.create({
        data: {
          campaign_send_id: parentSend.id, customer_id: c.id, phone: c.phone,
          customer_name: c.name || null, status: 'queued',
        },
      }).catch(() => null);
      try {
        const rendered = renderTemplate(variants[i], c as any, brandAB);
        const out = useWa
          ? await sendWhatsApp(c.phone, rendered, { mediaUrl: media_url, statusCallback, recipientId: recipient?.id })
          : await sendSms(c.phone, rendered);
        if ((out as any)?.skipped) { fail++; }
        else {
          ok++;
          await db.customer.update({ where: { id: c.id }, data: { last_marketing_sent_at: new Date() } }).catch(() => {});
          if (recipient && (out as any)?.sid) {
            await db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'sent', twilio_sid: (out as any).sid } }).catch(() => {});
          }
        }
      } catch { fail++; }
    }
    await db.campaignSend.update({ where: { id: parentSend.id }, data: { success_count: ok, failure_count: fail } }).catch(() => {});
    sends.push({ variant: variantLabel, send_id: parentSend.id, recipients: chunk.length, sent: ok, failed: fail });
  }

  return { ok: true, sends, total: allRecipients.length };
});

if (!(globalThis as any).__dailyCelebrationsTimer) {
  // Tick every 15 min, the function self-gates to 09:00 IL + once-per-day.
  (globalThis as any).__dailyCelebrationsTimer = setTimeout(function loop() {
    runDailyCelebrationCampaigns().finally(() => {
      (globalThis as any).__dailyCelebrationsTimer = setTimeout(loop, 15 * 60 * 1000);
    });
  }, 60 * 1000);
}

// Manual trigger (admin can force-run from anywhere)
registerFn('runDailyCelebrationsNow', async ({ user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  await runDailyCelebrationCampaigns(true);
  return { triggered: true };
});

registerFn('advanceCandidateStage', async ({ body }) => {
  const { candidate_id, stage } = body as any;
  if (!candidate_id || !stage) throw new Error('missing_params');
  const updates: any = { training_stage: stage };
  if (stage === 'hired' || stage === 'trainee_tables') updates.hired_at = new Date().toISOString();
  if (stage === 'active_waiter') updates.status = 'active';
  else updates.status = 'trainee';
  const cand = await db.jobCandidate.update({ where: { id: candidate_id }, data: updates });
  return { candidate: cand };
});

/* ----- Queue ----- */

registerFn(
  'createQueueEntry',
  async ({ body }) => {
    const {
      customer_name,
      phone,
      party_size,
      seating_preference,
      customer_notes,
      table_duration_preference,
    } = body as any;
    if (!customer_name || !phone || !party_size) {
      throw new Error('Missing required fields');
    }
    let previousCredits = 0;
    const customer = await db.customer.findFirst({ where: { phone: phone.trim() } });
    if (customer) previousCredits = customer.coin_balance ?? 0;

    const entry = await db.queueEntry.create({
      data: {
        customer_name: customer_name.trim(),
        phone: phone.trim(),
        party_size: parseInt(party_size),
        seating_preference: seating_preference || 'no_preference',
        customer_notes: customer_notes || null,
        table_duration_preference: table_duration_preference || 'any',
        status: 'pending',
        timestamp_register: new Date().toISOString(),
        time_credits_earned: previousCredits,
      },
    });
    return { entry };
  },
  { public: true },
);

registerFn(
  'getQueueEntry',
  async ({ body }) => {
    const { entryId, id, phone } = body as any;
    const key = entryId || id;
    if (key) {
      const entry = await db.queueEntry.findUnique({ where: { id: key } });
      if (!entry) throw new Error('Entry not found');
      return { entry };
    }
    if (phone) {
      const entry = await db.queueEntry.findFirst({ where: { phone, status: 'pending' } });
      return { entry };
    }
    throw new Error('Missing entryId');
  },
  { public: true },
);

registerFn(
  'getQueuePosition',
  async ({ body }) => {
    const { entryId, id } = body as any;
    const key = entryId || id;
    if (!key) throw new Error('Missing entryId');

    // Pull the recent queue (same as Base44: newest 300 by registration)
    const all = await db.queueEntry.findMany({
      orderBy: { timestamp_register: 'desc' },
      take: 300,
    });

    // Position within the active queue (ordered by sort_order)
    const activeQueue = all
      .filter((e: any) => e.status === 'active')
      .sort((a: any, b: any) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const activePos = activeQueue.findIndex((e: any) => e.id === key);
    if (activePos >= 0) {
      const mine = activeQueue[activePos];
      const samePartyAhead = activeQueue
        .slice(0, activePos)
        .filter((e: any) => e.party_size === mine.party_size).length;
      return { position: activePos + 1, status: 'active', total: activeQueue.length, samePartyAhead, partySize: mine.party_size };
    }

    // Otherwise position within the pending queue (ordered by registration time)
    const pendingQueue = all
      .filter((e: any) => e.status === 'pending')
      .sort((a: any, b: any) => new Date(a.timestamp_register).getTime() - new Date(b.timestamp_register).getTime());
    const pendingPos = pendingQueue.findIndex((e: any) => e.id === key);
    if (pendingPos >= 0) {
      const mine = pendingQueue[pendingPos];
      const samePartyAhead = pendingQueue
        .slice(0, pendingPos)
        .filter((e: any) => e.party_size === mine.party_size).length;
      return { position: pendingPos + 1, status: 'pending', total: pendingQueue.length, samePartyAhead, partySize: mine.party_size };
    }

    return { position: null, status: 'not_found' };
  },
  { public: true },
);

// Public: limited self-service updates a customer makes to their OWN queue entry
// from the anonymous /QueueJoin page (push subscription, live location, leaving
// the queue, privacy deletion). Whitelisted fields only — never status->seated etc.
registerFn('updateQueueEntry', async ({ body }) => {
  const { entryId, data } = body as any;
  if (!entryId || !data || typeof data !== 'object') throw new Error('Missing entryId or data');

  const ALLOWED = new Set([
    'push_subscription',
    'last_lat',
    'last_lng',
    'last_location_at',
    'proximity_response',
    'customer_notes',
    'notes',
    'customer_name', // only used by privacy deletion ('[נמחק]')
    'phone', // only used by privacy deletion ('[נמחק]')
    'timestamp_end',
    'feedback_rating', // customer star rating from QueueFeedback
  ]);
  const clean: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (ALLOWED.has(k)) clean[k] = v;
  }
  // The only status transition a customer may trigger is leaving the queue.
  if (data.status === 'abandoned') clean.status = 'abandoned';

  const entry = await db.queueEntry.update({ where: { id: entryId }, data: clean });
  return { success: true, entry };
}, { public: true });

/* ----- Waiting-room trivia game (public, anonymous customers) ----- */

registerFn('createGameSession', async ({ body }) => {
  const { player_name, queue_entry_id } = body as any;
  const session = await db.queueGameSession.create({
    data: {
      player_name: player_name || 'אורח',
      queue_entry_id: queue_entry_id || null,
      score: 0,
      answers: [],
      finished: false,
    },
  });
  return { session };
}, { public: true });

registerFn('updateGameSession', async ({ body }) => {
  const { sessionId, score, answers, finished } = body as any;
  if (!sessionId) throw new Error('Missing sessionId');
  const data: any = {};
  if (score !== undefined) data.score = score;
  if (answers !== undefined) data.answers = answers;
  if (finished !== undefined) data.finished = finished;
  const session = await db.queueGameSession.update({ where: { id: sessionId }, data });
  return { session };
}, { public: true });

registerFn('getGameLeaderboard', async () => {
  const sessions = await db.queueGameSession.findMany({
    where: { finished: true },
    orderBy: { score: 'desc' },
    take: 10,
  });
  // Only expose nickname + score (no entry linkage) to the public leaderboard.
  return { leaderboard: sessions.map((s: any) => ({ id: s.id, player_name: s.player_name, score: s.score })) };
}, { public: true });

registerFn('seatGuest', async ({ body }) => {
  const { entryId, id } = body as any;
  const key = entryId || id;
  if (!key) throw new Error('Missing entryId');

  const entry = await db.queueEntry.findUnique({ where: { id: key } });
  const now = new Date().toISOString();
  const seatedEntry = await db.queueEntry.update({
    where: { id: key },
    data: {
      status: 'seated',
      proximity_response: 'yes',
      timestamp_end: now,
      timestamp_seated: now,
      seat_called_at: null,
    },
  });

  // Persist earned credits to the Customer record (loyalty balance)
  if (entry?.phone && (entry.time_credits_earned ?? 0) > 0) {
    try {
      const customer = await db.customer.findFirst({ where: { phone: entry.phone } });
      if (customer) {
        await db.customer.update({
          where: { id: customer.id },
          data: {
            coin_balance: (customer.coin_balance || 0) + entry.time_credits_earned,
            last_visit: now,
            visit_count: (customer.visit_count || 0) + 1,
          },
        });
      } else {
        await db.customer.create({
          data: {
            phone: entry.phone,
            name: entry.customer_name,
            coin_balance: entry.time_credits_earned,
            visit_count: 1,
            last_visit: now,
          },
        });
      }
    } catch (e) {
      console.warn('Could not save credits to Customer:', e);
    }
  }

  return { success: true, entry: seatedEntry };
}, { public: true });

/* ----- SMS ----- */

registerFn('sendSms', async ({ body }) => {
  const { to, message } = body as any;
  if (!to || !message) throw new Error('to and message required');
  return sendSms(to, message);
});

// Diagnostic — exposes which Twilio env vars are set and tests if the
// configured WhatsApp sender is registered with Twilio (cheap GET to the
// IncomingPhoneNumbers list). Used by /AdminWhatsApp.
registerFn('getWhatsAppStatus', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : '');
  const templateSid = process.env.TWILIO_WA_TEMPLATE_SID || 'HX42bd4ae96abaa7312aeeae1af997c3da';
  const mask = (s: string | undefined) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '';
  const out: any = {
    has_sid: !!sid,
    has_token: !!token,
    has_from: !!from,
    has_template: !!templateSid,
    from_masked: from ? from.replace(/(\+?\d{4})\d+(\d{2})/, '$1…$2') : '',
    template_masked: mask(templateSid),
    sender_ok: null as boolean | null,
    sender_error: null as string | null,
  };
  // Try a tiny send-validate call — Twilio rejects bad senders immediately.
  // We use a fake number 'whatsapp:+15005550006' (Twilio magic test number).
  if (sid && token && from) {
    try {
      const creds = Buffer.from(`${sid}:${token}`).toString('base64');
      // Lookup the WhatsApp sender via /Channels API would be ideal, but
      // simplest probe: POST a message to magic test number — Twilio returns
      // 21606 if the From channel doesn't exist (our actual problem).
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: 'whatsapp:+15005550006', Body: 'probe' }),
      });
      const data: any = await r.json();
      if (r.ok) {
        out.sender_ok = true;
      } else {
        out.sender_ok = false;
        out.sender_error = `${data?.code || r.status}: ${data?.message || 'unknown'}`;
      }
    } catch (e: any) {
      out.sender_ok = false;
      out.sender_error = e?.message || String(e);
    }
  }
  return out;
});

// Preview broadcast — counts how many recipients an audience filter matches,
// without sending anything. Used by /AdminWhatsApp before "send" is clicked.
registerFn('previewWhatsAppBroadcast', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const audience = String((body as any)?.audience || '');
  const ph = (s: string) => /^(\+?972|0)\d{8,9}$/.test(String(s || '').replace(/[\s-]/g, ''));
  if (audience === 'delivery_customers') {
    const all: any[] = await (db as any).deliveryCustomer.findMany({ select: { customer_phone: true } });
    return { count: all.filter(c => ph(c.customer_phone || '')).length };
  }
  if (audience === 'delivery_inactive_30d') {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const all: any[] = await (db as any).deliveryCustomer.findMany({ select: { customer_phone: true, last_order_date: true } });
    return { count: all.filter(c => ph(c.customer_phone || '') && (!c.last_order_date || new Date(c.last_order_date) < cutoff)).length };
  }
  if (audience === 'reservations_past_30d') {
    const since = new Date(Date.now() - 30 * 86400_000);
    const all: any[] = await (db as any).reservation.findMany({
      where: { date: { gte: since } },
      select: { customer_phone: true },
    });
    const seen = new Set<string>();
    for (const r of all) {
      const p = String(r.customer_phone || '').replace(/[\s-]/g, '');
      if (ph(p)) seen.add(p);
    }
    return { count: seen.size };
  }
  return { count: 0 };
});

// Send broadcast — iterates the matched audience and calls sendWhatsApp per
// recipient. Best-effort; returns counts of sent/failed/skipped.
registerFn('sendWhatsAppBroadcast', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body as any) || {};
  const audience = String(b.audience || '');
  const message = String(b.message || '').trim();
  if (!message) throw new Error('message required');
  const ph = (s: string) => /^(\+?972|0)\d{8,9}$/.test(String(s || '').replace(/[\s-]/g, ''));

  let recipients: string[] = [];
  if (audience === 'delivery_customers') {
    const all: any[] = await (db as any).deliveryCustomer.findMany({ select: { customer_phone: true } });
    recipients = all.map(c => c.customer_phone || '').filter(ph);
  } else if (audience === 'delivery_inactive_30d') {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const all: any[] = await (db as any).deliveryCustomer.findMany({ select: { customer_phone: true, last_order_date: true } });
    recipients = all
      .filter(c => ph(c.customer_phone || '') && (!c.last_order_date || new Date(c.last_order_date) < cutoff))
      .map(c => c.customer_phone as string);
  } else if (audience === 'reservations_past_30d') {
    const since = new Date(Date.now() - 30 * 86400_000);
    const all: any[] = await (db as any).reservation.findMany({
      where: { date: { gte: since } },
      select: { customer_phone: true },
    });
    const seen = new Set<string>();
    for (const r of all) {
      const p = String(r.customer_phone || '').replace(/[\s-]/g, '');
      if (ph(p)) seen.add(p);
    }
    recipients = [...seen];
  } else {
    throw new Error('unknown audience: ' + audience);
  }

  // Dedupe
  recipients = [...new Set(recipients)];

  let sent = 0, failed = 0;
  for (const to of recipients) {
    try {
      await sendWhatsApp(to, message);
      sent += 1;
    } catch {
      failed += 1;
    }
    // Throttle so we don't hammer Twilio (60 req/sec is the default)
    await new Promise(r => setTimeout(r, 50));
  }
  return { sent, failed, skipped: 0, total: recipients.length };
});

registerFn('sendWhatsApp', async ({ body }) => {
  const { to, message } = body as any;
  if (!to || !message) throw new Error('to and message required');
  // Delegate to lib — it normalizes Israeli phones (0XX → +972XX) and
  // surfaces Twilio error codes properly.
  return sendWhatsApp(String(to), String(message));
});

// ============================================================================
// WhatsApp Inbox — list conversations + per-contact messages + send reply.
// Powered by the WhatsAppMessage table populated by /api/twilio webhook.
// ============================================================================

// List of conversations (one per contact_phone) with last message + unread count
registerFn('getWhatsAppConversations', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  // Get all messages, grouped by contact_phone client-side (easier than complex Prisma group)
  const all: any[] = await (db as any).whatsAppMessage.findMany({
    orderBy: { created_at: 'desc' },
    take: 1000,
  });
  const byContact = new Map<string, any>();
  for (const m of all) {
    const key = m.contact_phone;
    if (!byContact.has(key)) {
      byContact.set(key, {
        contact_phone: key,
        last_message: m,
        unread_count: 0,
        total_count: 0,
      });
    }
    const conv = byContact.get(key);
    conv.total_count += 1;
    if (m.direction === 'inbound' && !m.is_read) conv.unread_count += 1;
  }
  // Try to enrich with name from DeliveryCustomer or Reservation
  const phones = [...byContact.keys()];
  const norm = (s: string) => String(s || '').replace(/\D/g, '').replace(/^972/, '0');
  const customers: any[] = await (db as any).deliveryCustomer.findMany({
    where: { customer_phone: { in: phones.map(norm) } },
    select: { customer_phone: true, customer_name: true },
  }).catch(() => []);
  const nameByPhone = new Map<string, string>();
  for (const c of customers) {
    if (c.customer_phone && c.customer_name) nameByPhone.set(c.customer_phone, c.customer_name);
  }
  return {
    conversations: [...byContact.values()].map(c => ({
      ...c,
      contact_name: nameByPhone.get(norm(c.contact_phone)) || null,
    })).sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()),
  };
});

// Get all messages for a specific contact (paginated by `before` for older)
registerFn('getWhatsAppMessages', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body as any) || {};
  const phone = String(b.contact_phone || '');
  if (!phone) throw new Error('contact_phone required');
  // Match both with and without whatsapp: prefix variants
  const stripped = phone.replace(/^whatsapp:/i, '');
  const messages: any[] = await (db as any).whatsAppMessage.findMany({
    where: {
      OR: [
        { contact_phone: stripped },
        { contact_phone: `whatsapp:${stripped}` },
      ],
    },
    orderBy: { created_at: 'asc' },
    take: 200,
  });
  return { messages };
});

// Mark conversation as read (all inbound messages from this contact)
registerFn('markWhatsAppConversationRead', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body as any) || {};
  const phone = String(b.contact_phone || '');
  if (!phone) throw new Error('contact_phone required');
  const stripped = phone.replace(/^whatsapp:/i, '');
  const r = await (db as any).whatsAppMessage.updateMany({
    where: {
      direction: 'inbound',
      is_read: false,
      OR: [
        { contact_phone: stripped },
        { contact_phone: `whatsapp:${stripped}` },
      ],
    },
    data: { is_read: true },
  });
  return { ok: true, updated: r.count };
});

// Delete an entire WhatsApp conversation (all inbound + outbound messages
// for a given contact_phone). Admin-only, irreversible.
registerFn('deleteWhatsAppConversation', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body as any) || {};
  const phone = String(b.contact_phone || '');
  if (!phone) throw new Error('contact_phone required');
  const stripped = phone.replace(/^whatsapp:/i, '');
  const r = await (db as any).whatsAppMessage.deleteMany({
    where: {
      OR: [
        { contact_phone: stripped },
        { contact_phone: `whatsapp:${stripped}` },
      ],
    },
  });
  return { ok: true, deleted: r.count };
});

// Send WhatsApp reply — uses the lib (normalizes + uses template if needed)
// and persists the outbound message so it shows up in the inbox.
registerFn('sendWhatsAppReply', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body as any) || {};
  const contactPhone = String(b.contact_phone || '');
  const message = String(b.message || '').trim();
  if (!contactPhone || !message) throw new Error('contact_phone and message required');

  const result = await sendWhatsApp(contactPhone, message);
  const sid = (result as any)?.sid || null;
  const stripped = contactPhone.replace(/^whatsapp:/i, '');
  const fromEnv = process.env.TWILIO_WHATSAPP_FROM ?? `whatsapp:${process.env.TWILIO_PHONE_NUMBER || ''}`;
  const fromPhone = fromEnv.replace(/^whatsapp:/i, '');

  // Persist outbound row for UI
  await (db as any).whatsAppMessage.create({
    data: {
      twilio_sid: sid,
      direction: 'outbound',
      from_phone: fromPhone,
      to_phone: stripped,
      contact_phone: stripped,
      body: message,
      status: (result as any)?.success ? 'sent' : 'failed',
      is_read: true,  // outbound is always "read" by owner
    },
  }).catch(() => { /* best effort */ });

  return { ok: true, sid, result };
});

registerFn('sendCustomerEmail', async ({ body }) => {
  const { to, subject, body: text, html } = body as any;
  return sendEmail({ to, subject, text, html });
});

registerFn('sendQueueSms', async ({ body }) => {
  const { to, message } = body as any;
  if (!to || !message) throw new Error('to and message required');
  return sendSms(to, message);
});

registerFn('sendFeedbackSms', async ({ body }) => {
  const { to, message } = body as any;
  return sendSms(to, message);
});

registerFn('sendRatingRequest', async ({ body }) => {
  const { phone, link } = body as any;
  return sendSms(phone, `נשמח לדירוג: ${link}`);
});

registerFn('sendCoupleOffer', async ({ body }) => {
  const { phone, message } = body as any;
  return sendSms(phone, message);
});

registerFn('sendGroupOffer', async ({ body }) => {
  const { phone, message } = body as any;
  return sendSms(phone, message);
});

registerFn('sendAbandonedReminder', async ({ body }) => {
  const { phone, message } = body as any;
  return sendSms(phone, message);
});

// ============================================================================
// CUSTOMER SEGMENTATION + BULK MARKETING CAMPAIGNS
// ============================================================================
// Replaces the 4 hardcoded one-shot campaigns with a flexible system:
//   1. Owner picks a SEGMENT (birthday this month / not visited 30d / VIP / ...)
//   2. Owner sees preview: count of matched customers + 5 sample names
//   3. Owner edits the TEMPLATE (with {name}, {coins}, {days_since_visit} placeholders)
//   4. System bulk-sends via WhatsApp/SMS, throttling per customer
//   5. Every send is logged to CampaignSend for history + analytics
// ============================================================================

type CustomerLike = {
  id: string; phone: string; name: string | null;
  visit_count: number | null; coin_balance: number | null;
  loyalty_tier: string | null; last_visit: Date | string | null;
  birthday_mmdd: string | null;
  marketing_consent: boolean; marketing_unsubscribed_at: Date | string | null;
  last_marketing_sent_at: Date | string | null;
};

// Build a Prisma `where` clause for a named segment.
function buildSegmentWhere(segment: string, customFilter?: any): any {
  const now = new Date();
  const baseGate: any = {
    marketing_consent: true,
    marketing_unsubscribed_at: null,
    phone: { not: '' },
  };
  switch (segment) {
    case 'birthday_this_month': {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      return { ...baseGate, birthday_mmdd: { startsWith: mm + '-' } };
    }
    case 'birthday_today': {
      const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      return { ...baseGate, birthday_mmdd: mmdd };
    }
    case 'anniversary_this_month': {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      return { ...baseGate, anniversary_mmdd: { startsWith: mm + '-' } };
    }
    case 'anniversary_today': {
      const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      return { ...baseGate, anniversary_mmdd: mmdd };
    }
    case 'winback_30': {
      const cutoff = new Date(now.getTime() - 30 * 86400000);
      const noEarlier = new Date(now.getTime() - 60 * 86400000);
      return { ...baseGate, last_visit: { lt: cutoff, gte: noEarlier } };
    }
    case 'winback_60': {
      const cutoff = new Date(now.getTime() - 60 * 86400000);
      const noEarlier = new Date(now.getTime() - 90 * 86400000);
      return { ...baseGate, last_visit: { lt: cutoff, gte: noEarlier } };
    }
    case 'winback_90': {
      const cutoff = new Date(now.getTime() - 90 * 86400000);
      return { ...baseGate, last_visit: { lt: cutoff } };
    }
    case 'vip': return { ...baseGate, loyalty_tier: 'vip' };
    case 'almost_vip': return { ...baseGate, loyalty_tier: 'regular', visit_count: { gte: 5 } };
    case 'high_spenders': return { ...baseGate, visit_count: { gte: 10 } };
    case 'with_coins': return { ...baseGate, coin_balance: { gt: 0 } };
    case 'all_consented': return baseGate;
    case 'custom': {
      const w: any = { ...baseGate };
      if (customFilter?.tier) w.loyalty_tier = customFilter.tier;
      if (customFilter?.min_visits) w.visit_count = { gte: Number(customFilter.min_visits) };
      if (customFilter?.min_coins) w.coin_balance = { gte: Number(customFilter.min_coins) };
      if (customFilter?.days_since_visit_min) {
        const c = new Date(now.getTime() - Number(customFilter.days_since_visit_min) * 86400000);
        w.last_visit = { ...(w.last_visit || {}), lt: c };
      }
      return w;
    }
    // Hand-picked recipients — owner selected specific customers in the UI.
    // Still gated by consent + not-unsubscribed (baseGate) for spam-law safety.
    case 'manual': {
      const ids = Array.isArray(customFilter?.customer_ids) ? customFilter.customer_ids : [];
      return { ...baseGate, id: { in: ids } };
    }
    // Customers missing club-profile details (birthday or city) — targets of
    // the "complete your details, earn benefits" campaign with {update_link}.
    case 'missing_details': {
      return {
        ...baseGate,
        OR: [{ birthday_mmdd: null }, { city: null }],
      };
    }
    default: return baseGate;
  }
}

// Render a template with {name}, {coins}, {days_since_visit}, {visit_count}, {tier}
function renderTemplate(template: string, c: CustomerLike, brand?: string): string {
  const now = Date.now();
  const lastVisitMs = c.last_visit ? new Date(c.last_visit).getTime() : null;
  const daysSinceVisit = lastVisitMs ? Math.floor((now - lastVisitMs) / 86400000) : 0;
  const replacements: Record<string, string> = {
    name: c.name || 'אורח/ת יקר/ה',
    coins: String(c.coin_balance || 0),
    days_since_visit: String(daysSinceVisit),
    visit_count: String(c.visit_count || 0),
    tier: c.loyalty_tier === 'vip' ? 'VIP' : 'רגיל',
    city: (c as any).city || '',
    brand: brand || 'המסעדה',
    // Personal profile-completion link — cid doubles as an unguessable token.
    update_link: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/ClubUpdate?cid=${c.id}`,
  };
  const rendered = template.replace(/\{(\w+)\}/g, (m, k) => replacements[k] ?? m);
  // Belt-and-suspenders: strip any lingering hardcoded עלינא from stored templates
  // written before multi-tenant. Legit tenants named עלינא still get their brand
  // rewritten to itself — no-op.
  return brand ? rendered.replaceAll('עלינא', brand) : rendered;
}

// ============================================================================
// EVENT VENDORS — partner/supplier CRM
// ============================================================================
// Covers everything from event producers + group-tour operators to DJs and
// photographers. Tracks commercial terms, agreements, activity timeline,
// event attribution (referrer vs service provider), and commission payouts.

registerFn('listVendors', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin' && !(user as any)?.managed_department) throw new Error('admin only');
  const { q, category, status, page, page_size } = (body as any) || {};
  const take = Math.min(Math.max(Number(page_size) || 50, 10), 200);
  const skip = Math.max(Number(page) || 0, 0) * take;
  const where: any = {};
  const query = String(q || '').trim();
  if (query.length >= 2) {
    const digits = query.replace(/[^\d]/g, '');
    const or: any[] = [
      { business_name: { contains: query, mode: 'insensitive' } },
      { contact_name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ];
    if (digits.length >= 3) {
      or.push({ phone: { contains: digits } });
      or.push({ whatsapp: { contains: digits } });
    }
    where.OR = or;
  }
  if (status && status !== 'all') where.status = status;
  // category filter — Json array contains (Postgres jsonb @>)
  if (category && category !== 'all') {
    where.AND = [...(where.AND || []),
      { categories: { array_contains: category } } as any,
    ];
  }
  const [total, rows] = await Promise.all([
    db.vendor.count({ where }),
    db.vendor.findMany({
      where, take, skip,
      orderBy: [{ createdAt: 'desc' }],
    }),
  ]);
  return { total, rows, page: Math.max(Number(page) || 0, 0), page_size: take };
});

registerFn('createVendor', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const data = body as any;
  if (!data?.business_name) throw new Error('business_name required');
  const v = await db.vendor.create({
    data: {
      business_name: String(data.business_name).slice(0, 120),
      contact_name: data.contact_name || null,
      phone: data.phone ? String(data.phone).replace(/[^\d+]/g, '') : null,
      whatsapp: data.whatsapp ? String(data.whatsapp).replace(/[^\d+]/g, '') : null,
      email: data.email || null,
      city: data.city || null,
      website: data.website || null,
      instagram: data.instagram || null,
      business_id: data.business_id || null,
      vat_type: data.vat_type || null,
      categories: Array.isArray(data.categories) ? data.categories : undefined,
      specialties: data.specialties || null,
      default_commission_pct: data.default_commission_pct != null ? Number(data.default_commission_pct) : null,
      default_commission_fixed_ils: data.default_commission_fixed_ils != null ? Number(data.default_commission_fixed_ils) : null,
      commission_stage: data.commission_stage || 'on_event_date',
      bank_name: data.bank_name || null,
      bank_branch: data.bank_branch || null,
      bank_account: data.bank_account || null,
      bank_account_owner: data.bank_account_owner || null,
      insurance_url: data.insurance_url || null,
      insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
      business_license_url: data.business_license_url || null,
      business_license_expiry: data.business_license_expiry ? new Date(data.business_license_expiry) : null,
      status: data.status || 'active',
      rating: data.rating != null ? Number(data.rating) : null,
      internal_notes: data.internal_notes || null,
      marketing_consent: data.marketing_consent !== false,
      marketing_consent_at: data.marketing_consent !== false ? new Date() : null,
      created_by: (user as any)?.email || null,
    },
  });
  return { vendor: v };
});

registerFn('updateVendor', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id, ...patch } = body as any;
  if (!id) throw new Error('id required');
  // Normalize date fields
  const data: any = { ...patch };
  for (const k of ['insurance_expiry', 'business_license_expiry']) {
    if (data[k] !== undefined) data[k] = data[k] ? new Date(data[k]) : null;
  }
  for (const k of ['default_commission_pct', 'default_commission_fixed_ils', 'rating']) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') data[k] = Number(data[k]);
    else if (data[k] === '' || data[k] === null) data[k] = null;
  }
  const v = await db.vendor.update({ where: { id }, data });
  return { vendor: v };
});

registerFn('getVendor', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin' && !(user as any)?.managed_department) throw new Error('admin only');
  const { id } = body as any;
  if (!id) throw new Error('id required');
  const [vendor, agreements, eventLinks, timeline] = await Promise.all([
    db.vendor.findUnique({ where: { id } }),
    db.vendorAgreement.findMany({ where: { vendor_id: id }, orderBy: { createdAt: 'desc' } }),
    db.eventVendor.findMany({ where: { vendor_id: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.vendorContact.findMany({ where: { vendor_id: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  if (!vendor) throw new Error('not_found');
  // Hydrate event titles
  const evIds = (eventLinks as any[]).map((e: any) => e.event_booking_id).filter(Boolean) as string[];
  const events = evIds.length
    ? await db.eventBooking.findMany({ where: { id: { in: evIds } } })
    : [];
  const eventsById = new Map(events.map((e: any) => [e.id, e]));
  const enrichedLinks = eventLinks.map((l: any) => ({
    ...l,
    event: l.event_booking_id ? eventsById.get(l.event_booking_id) || null : null,
  }));
  // Split events into open (future, not cancelled/completed) vs closed
  // so the owner sees at a glance what's still in flight vs. settled.
  const todayIso = new Date().toISOString().slice(0, 10);
  const isClosed = (l: any) => {
    if (!l.event) return false; // unlinked stays in open
    const d = String(l.event.event_date || '').slice(0, 10);
    const st = String(l.event.status || '').toLowerCase();
    if (st === 'completed' || st === 'cancelled') return true;
    if (d && d < todayIso) return true;
    return false;
  };
  const openLinks = enrichedLinks.filter((l: any) => !isClosed(l));
  const closedLinks = enrichedLinks.filter(isClosed);
  // Revenue ATTRIBUTED to this vendor — only referrer role (they brought the
  // client). Service providers worked at the event but didn't bring it in.
  const referrerLinks = enrichedLinks.filter((l: any) => l.role === 'referrer' && l.event);
  const stats = {
    total_events: enrichedLinks.length,
    open_count: openLinks.length,
    closed_count: closedLinks.length,
    revenue_brought_ils: referrerLinks.reduce((s: any, l: any) => s + (Number(l.event?.total_ils) || 0), 0),
    total_commission_due: enrichedLinks
      .filter((l: any) => l.payment_status !== 'paid' && l.payment_status !== 'waived')
      .reduce((s: any, l: any) => s + (Number(l.commission_amount_ils) || 0), 0),
    total_commission_paid: enrichedLinks
      .filter((l: any) => l.payment_status === 'paid')
      .reduce((s: any, l: any) => s + (Number(l.paid_amount_ils) || Number(l.commission_amount_ils) || 0), 0),
  };
  return { vendor, agreements, events: enrichedLinks, open_events: openLinks, closed_events: closedLinks, timeline, stats };
});

registerFn('deleteVendor', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id } = body as any;
  if (!id) throw new Error('id required');
  await db.vendorContact.deleteMany({ where: { vendor_id: id } }).catch(() => {});
  await db.vendorAgreement.deleteMany({ where: { vendor_id: id } }).catch(() => {});
  await db.eventVendor.deleteMany({ where: { vendor_id: id } }).catch(() => {});
  await db.vendor.delete({ where: { id } });
  return { ok: true };
});

// === Agreements ============================================================
registerFn('addVendorAgreement', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const d = body as any;
  if (!d?.vendor_id) throw new Error('vendor_id required');
  // Mark previous active agreements as 'replaced' so only one is current.
  await db.vendorAgreement.updateMany({
    where: { vendor_id: d.vendor_id, status: 'active' },
    data: { status: 'replaced' },
  }).catch(() => {});
  const a = await db.vendorAgreement.create({
    data: {
      vendor_id: d.vendor_id,
      title: d.title || null,
      file_url: d.file_url || null,
      commission_pct: d.commission_pct != null ? Number(d.commission_pct) : null,
      commission_fixed_ils: d.commission_fixed_ils != null ? Number(d.commission_fixed_ils) : null,
      commission_stage: d.commission_stage || null,
      valid_from: d.valid_from ? new Date(d.valid_from) : null,
      valid_until: d.valid_until ? new Date(d.valid_until) : null,
      status: 'active',
      notes: d.notes || null,
      created_by: (user as any)?.email || null,
    },
  });
  return { agreement: a };
});

// ============================================================================
// WHATSAPP TEMPLATES — list + submit-for-approval helpers (Twilio Content API)
// ============================================================================
// Surfaces Meta approval status inside the app so the owner doesn't have to
// dig through the Twilio Console. Reuses the existing TWILIO_* env vars.

function twilioBasicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('missing TWILIO credentials');
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

registerFn('listWhatsAppTemplates', async ({ user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const auth = twilioBasicAuth();
  const res = await fetch('https://content.twilio.com/v1/Content?PageSize=50', {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error('twilio_list_failed: ' + res.status);
  const data: any = await res.json();
  const contents = data.contents || [];
  // For each, also fetch approval status (one request each, capped at 30).
  const enriched: any[] = [];
  for (const c of contents.slice(0, 30)) {
    let approval: any = null;
    try {
      const ar = await fetch(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`, {
        headers: { Authorization: auth },
      });
      if (ar.ok) approval = await ar.json();
    } catch { /* ignore */ }
    enriched.push({
      sid: c.sid,
      friendly_name: c.friendly_name,
      language: c.language,
      types: Object.keys(c.types || {}),
      body: (c.types?.['twilio/text']?.body) || '',
      variables: c.variables || null,
      date_created: c.date_created,
      whatsapp_status: approval?.whatsapp?.status || 'unsubmitted',
      whatsapp_category: approval?.whatsapp?.category || null,
      rejection_reason: approval?.whatsapp?.rejection_reason || null,
    });
  }
  return { templates: enriched, total: contents.length };
});

registerFn('submitWhatsAppTemplate', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { sid, name, category } = body as any;
  if (!sid) throw new Error('sid required');
  if (!name) throw new Error('name required (lowercase, snake_case, max 60)');
  if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(String(category))) {
    throw new Error('category must be UTILITY | MARKETING | AUTHENTICATION');
  }
  const auth = twilioBasicAuth();
  const res = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_'), category }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`submit_failed: ${data?.message || res.status}`);
  return { ok: true, approval: data };
});

// Helper: send a message using a pre-approved template (bypasses the 24h
// service-window restriction). Variables are positional ({{1}}, {{2}}, ...).
registerFn('sendWhatsAppViaTemplate', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { to, content_sid, variables } = body as any;
  if (!to || !content_sid) throw new Error('to + content_sid required');
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = twilioBasicAuth();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM not set');
  const cleanPhone = String(to).replace(/[^\d+]/g, '');
  const normalized = cleanPhone.startsWith('+') ? cleanPhone : cleanPhone.startsWith('972') ? '+' + cleanPhone : cleanPhone.startsWith('0') ? '+972' + cleanPhone.slice(1) : '+' + cleanPhone;
  const params = new URLSearchParams({
    From: from,
    To: `whatsapp:${normalized}`,
    ContentSid: content_sid,
  });
  if (variables && typeof variables === 'object') {
    params.append('ContentVariables', JSON.stringify(variables));
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`send_failed: ${data?.message || res.status}`);
  return { ok: true, sid: data.sid, status: data.status };
});

// Mark a VendorAgreement as signed (offline). The owner clicks 'סמן כחתום'
// after the vendor returned a signed PDF, optionally with a signature image URL.
registerFn('markVendorAgreementSigned', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id, signed_by_name, signed_signature_url, file_url } = body as any;
  if (!id) throw new Error('id required');
  const data: any = { signed_at: new Date() };
  if (signed_by_name) data.signed_by_name = String(signed_by_name).slice(0, 80);
  if (signed_signature_url) data.signed_signature_url = signed_signature_url;
  if (file_url) data.file_url = file_url;
  const a = await db.vendorAgreement.update({ where: { id }, data });
  return { agreement: a };
});

// Events dashboard payload — open events list, status counts, monthly
// rollup for a Gantt-style chart, and aggregate vendor/commission stats.
registerFn('eventsDashboard', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin' && !(user as any)?.managed_department) throw new Error('admin only');
  const { from, to } = (body as any) || {};
  const today = new Date().toISOString().slice(0, 10);
  // Default window: 3 months back → 9 months forward
  const defaultFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const defaultTo = new Date(Date.now() + 270 * 86400000).toISOString().slice(0, 10);
  const rangeFrom = from || defaultFrom;
  const rangeTo = to || defaultTo;

  const allBookings: any[] = await (db.eventBooking.findMany as any)({
    orderBy: { event_date: 'asc' },
    take: 500,
  });
  // Filter by window
  const events = allBookings.filter(e => {
    const d = String(e.event_date || '').slice(0, 10);
    return d >= rangeFrom && d <= rangeTo;
  });

  const isClosedEvent = (e: any) => {
    const d = String(e.event_date || '').slice(0, 10);
    const st = String(e.status || '').toLowerCase();
    if (st === 'completed' || st === 'cancelled') return true;
    if (d && d < today) return true;
    return false;
  };
  const open = events.filter(e => !isClosedEvent(e));
  const closed = events.filter(isClosedEvent);

  // Vendors per event
  const evIds = events.map(e => e.id);
  const vendorLinks = evIds.length
    ? await db.eventVendor.findMany({ where: { event_booking_id: { in: evIds } } })
    : [];
  const vendorIds = [...new Set(vendorLinks.map((l: any) => l.vendor_id))];
  const vendors = vendorIds.length ? await db.vendor.findMany({ where: { id: { in: vendorIds } } }) : [];
  const vById = new Map(vendors.map((v: any) => [v.id, v]));
  const linksByEvent = new Map<string, any[]>();
  for (const l of vendorLinks) {
    const arr = linksByEvent.get(l.event_booking_id || '') || [];
    arr.push({ ...l, vendor: vById.get(l.vendor_id) || null });
    linksByEvent.set(l.event_booking_id || '', arr);
  }
  const enriched = events.map(e => ({
    ...e,
    is_closed: isClosedEvent(e),
    vendor_links: linksByEvent.get(e.id) || [],
  }));

  // Monthly rollup for the Gantt header
  const months = new Map<string, { key: string; open: number; closed: number; revenue: number }>();
  for (const e of enriched) {
    const ym = String(e.event_date || '').slice(0, 7);
    if (!ym) continue;
    if (!months.has(ym)) months.set(ym, { key: ym, open: 0, closed: 0, revenue: 0 });
    const m = months.get(ym)!;
    if (e.is_closed) m.closed++; else m.open++;
    m.revenue += Number(e.total_ils || 0);
  }
  const monthly = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));

  const stats = {
    total_open: open.length,
    total_closed: closed.length,
    revenue_pipeline_open: open.reduce((s, e) => s + (Number(e.total_ils) || 0), 0),
    revenue_realized_closed: closed.reduce((s, e) => s + (Number(e.total_ils) || 0), 0),
    deposits_received: events
      .filter(e => (e as any).payment_status === 'paid' || (e as any).payment_status === 'partial')
      .reduce((s, e) => s + (Number((e as any).deposit_amount_ils) || 0), 0),
    commissions_due: vendorLinks
      .filter((l: any) => l.payment_status !== 'paid' && l.payment_status !== 'waived')
      .reduce((s: any, l: any) => s + (Number(l.commission_amount_ils) || 0), 0),
    commissions_paid: vendorLinks
      .filter((l: any) => l.payment_status === 'paid')
      .reduce((s: any, l: any) => s + (Number(l.paid_amount_ils) || Number(l.commission_amount_ils) || 0), 0),
  };

  return { events: enriched, open, closed, monthly, stats, range: { from: rangeFrom, to: rangeTo } };
});

// === Event ↔ vendor linking + commissions ==================================
function computeCommissionFromEvent(ev: any, pct?: number | null, fixed?: number | null): number {
  if (fixed && fixed > 0) return Math.round(Number(fixed));
  const total = Number(ev?.total_ils) || 0;
  if (pct && pct > 0 && total > 0) return Math.round(total * (Number(pct) / 100));
  return 0;
}

registerFn('linkVendorToEvent', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { vendor_id, event_booking_id, role, service_type, commission_pct, commission_fixed_ils, commission_stage, notes } = body as any;
  if (!vendor_id) throw new Error('vendor_id required');
  if (!event_booking_id) throw new Error('event_booking_id required');
  if (!role || !['referrer', 'service'].includes(role)) throw new Error("role must be 'referrer' or 'service'");
  // Pull vendor defaults if per-event values not given
  const vendor = await db.vendor.findUnique({ where: { id: vendor_id } });
  const ev = await db.eventBooking.findUnique({ where: { id: event_booking_id } });
  const usePct = commission_pct != null ? Number(commission_pct) : vendor?.default_commission_pct;
  const useFixed = commission_fixed_ils != null ? Number(commission_fixed_ils) : vendor?.default_commission_fixed_ils;
  const useStage = commission_stage || vendor?.commission_stage || 'on_event_date';
  const amount = computeCommissionFromEvent(ev, usePct as any, useFixed as any);
  const link = await db.eventVendor.create({
    data: {
      vendor_id, event_booking_id, role, service_type: service_type || null,
      commission_pct: usePct as any,
      commission_fixed_ils: useFixed as any,
      commission_stage: useStage,
      commission_amount_ils: amount || null,
      payment_status: 'pending',
      notes: notes || null,
      created_by: (user as any)?.email || null,
    },
  });
  return { link };
});

registerFn('updateEventVendor', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id, ...patch } = body as any;
  if (!id) throw new Error('id required');
  const data: any = { ...patch };
  if (data.paid_at !== undefined) data.paid_at = data.paid_at ? new Date(data.paid_at) : null;
  for (const k of ['commission_pct', 'commission_fixed_ils', 'commission_amount_ils', 'paid_amount_ils']) {
    if (data[k] !== undefined && data[k] !== '' && data[k] !== null) data[k] = Number(data[k]);
  }
  const link = await db.eventVendor.update({ where: { id }, data });
  return { link };
});

registerFn('unlinkVendorFromEvent', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id } = body as any;
  if (!id) throw new Error('id required');
  await db.eventVendor.delete({ where: { id } });
  return { ok: true };
});

registerFn('listEventVendors', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin' && !(user as any)?.managed_department) throw new Error('admin only');
  const { event_booking_id } = body as any;
  if (!event_booking_id) throw new Error('event_booking_id required');
  const links = await db.eventVendor.findMany({
    where: { event_booking_id },
    orderBy: { createdAt: 'asc' },
  });
  const vendorIds = [...new Set(links.map((l: any) => l.vendor_id))];
  const vendors = vendorIds.length ? await db.vendor.findMany({ where: { id: { in: vendorIds } } }) : [];
  const vMap = new Map(vendors.map((v: any) => [v.id, v]));
  return { links: links.map((l: any) => ({ ...l, vendor: vMap.get(l.vendor_id) || null })) };
});

// === Commission report (across all events) =================================
registerFn('vendorCommissionsReport', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { from, to, status } = (body as any) || {};
  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (status && status !== 'all') where.payment_status = status;
  const links = await db.eventVendor.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000 });
  const vendorIds = [...new Set(links.map((l: any) => l.vendor_id))];
  const vendors = vendorIds.length ? await db.vendor.findMany({ where: { id: { in: vendorIds } } }) : [];
  const vMap = new Map(vendors.map((v: any) => [v.id, v]));
  const evIds = [...new Set(links.map((l: any) => l.event_booking_id).filter(Boolean) as string[])];
  const events = evIds.length ? await db.eventBooking.findMany({ where: { id: { in: evIds } } }) : [];
  const eMap = new Map(events.map((e: any) => [e.id, e]));
  const rows = links.map((l: any) => ({
    ...l,
    vendor: vMap.get(l.vendor_id) || null,
    event: l.event_booking_id ? eMap.get(l.event_booking_id) || null : null,
  }));
  const totals = {
    total_due: rows.filter((r: any) => r.payment_status === 'pending').reduce((s: any, r: any) => s + (Number(r.commission_amount_ils) || 0), 0),
    total_paid: rows.filter((r: any) => r.payment_status === 'paid').reduce((s: any, r: any) => s + (Number(r.paid_amount_ils) || Number(r.commission_amount_ils) || 0), 0),
    total_partial: rows.filter((r: any) => r.payment_status === 'partial').reduce((s: any, r: any) => s + (Number(r.paid_amount_ils) || 0), 0),
    count: rows.length,
  };
  return { rows, totals };
});

// === Activity log helpers ===================================================
registerFn('logVendorContact', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { vendor_id, kind, subject, body: text } = body as any;
  if (!vendor_id || !kind) throw new Error('vendor_id + kind required');
  const c = await db.vendorContact.create({
    data: {
      vendor_id, kind, subject: subject || null, body: text || null,
      created_by: (user as any)?.email || null,
    },
  });
  return { contact: c };
});

// One-shot: WhatsApp a vendor + log it to their timeline.
registerFn('sendVendorWhatsApp', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { vendor_id, message } = body as any;
  if (!vendor_id || !message) throw new Error('vendor_id + message required');
  const v = await db.vendor.findUnique({ where: { id: vendor_id } });
  if (!v) throw new Error('vendor not found');
  const phone = v.whatsapp || v.phone;
  if (!phone) throw new Error('no whatsapp/phone on vendor');
  const out: any = await sendWhatsApp(phone, message);
  await db.vendorContact.create({
    data: {
      vendor_id, kind: 'whatsapp_out',
      subject: null, body: message,
      twilio_sid: out?.sid || null,
      created_by: (user as any)?.email || null,
    },
  }).catch(() => {});
  return out;
});

// One-shot: Email a vendor + log it.
registerFn('sendVendorEmail', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { vendor_id, subject, html } = body as any;
  if (!vendor_id || !subject || !html) throw new Error('vendor_id + subject + html required');
  const v = await db.vendor.findUnique({ where: { id: vendor_id } });
  if (!v || !v.email) throw new Error('vendor has no email');
  const out: any = await sendEmail({ to: v.email, subject, html });
  await db.vendorContact.create({
    data: {
      vendor_id, kind: 'email_out',
      subject, body: html,
      resend_id: out?.id || null,
      created_by: (user as any)?.email || null,
    },
  }).catch(() => {});
  return out;
});

// === Vendor marketing campaigns ============================================
// Same idea as customer campaigns but the audience is vendors. Lets the owner
// announce 'we have new wedding packages' or 'special this month'.
registerFn('previewVendorSegment', async ({ body }) => {
  const { category, exclude_ids } = (body as any) || {};
  const where: any = {
    marketing_consent: true,
    marketing_unsubscribed_at: null,
    status: 'active',
    OR: [{ whatsapp: { not: null } }, { phone: { not: null } }, { email: { not: null } }],
  };
  if (category && category !== 'all') where.AND = [{ categories: { array_contains: category } as any }];
  if (Array.isArray(exclude_ids) && exclude_ids.length) {
    where.AND = [...(where.AND || []), { id: { notIn: exclude_ids } }];
  }
  const [count, sample] = await Promise.all([
    db.vendor.count({ where }),
    db.vendor.findMany({
      where, take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, business_name: true, contact_name: true, categories: true, phone: true, email: true },
    }),
  ]);
  return { count, sample };
});

registerFn('sendVendorCampaign', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const brand = await getBrandName();
  const { category, channel, subject, message_template, exclude_ids, campaign_label } = body as any;
  if (!message_template) throw new Error('message_template required');
  const where: any = {
    marketing_consent: true,
    marketing_unsubscribed_at: null,
    status: 'active',
  };
  if (category && category !== 'all') where.AND = [{ categories: { array_contains: category } as any }];
  if (Array.isArray(exclude_ids) && exclude_ids.length) {
    where.AND = [...(where.AND || []), { id: { notIn: exclude_ids } }];
  }
  const useEmail = channel === 'email';
  const recipients = await db.vendor.findMany({ where, take: 500 });
  let ok = 0, fail = 0;
  const failures: any[] = [];
  for (const v of recipients) {
    try {
      const rendered = String(message_template)
        .replace(/\{business\}/g, v.business_name || '')
        .replace(/\{contact\}/g, v.contact_name || v.business_name || 'שותף יקר');
      let out: any;
      if (useEmail) {
        if (!v.email) { fail++; failures.push({ id: v.id, reason: 'no_email' }); continue; }
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;padding:20px;max-width:600px;margin:auto;background:#FAF5E8;border-radius:12px"><h2 style="color:#A04A2E">${brand} 🌿 · שותפים</h2><pre style="white-space:pre-wrap;font-family:inherit">${rendered.replace(/[<>]/g, '')}</pre></div>`;
        out = await sendEmail({ to: v.email, subject: subject || `עדכון מ${brand}`, html });
        await db.vendorContact.create({ data: { vendor_id: v.id, kind: 'email_out', subject: subject || null, body: rendered, resend_id: out?.id || null, created_by: 'campaign' } }).catch(() => {});
      } else {
        const phone = v.whatsapp || v.phone;
        if (!phone) { fail++; failures.push({ id: v.id, reason: 'no_phone' }); continue; }
        out = await sendWhatsApp(phone, rendered);
        await db.vendorContact.create({ data: { vendor_id: v.id, kind: 'whatsapp_out', body: rendered, twilio_sid: out?.sid || null, created_by: 'campaign' } }).catch(() => {});
      }
      if ((out as any)?.skipped) { fail++; failures.push({ id: v.id, reason: (out as any).reason || 'skipped' }); }
      else {
        ok++;
        await db.vendor.update({ where: { id: v.id }, data: { last_marketing_sent_at: new Date() } }).catch(() => {});
      }
    } catch (e: any) {
      fail++; failures.push({ id: v.id, reason: e?.message?.slice(0, 100) });
    }
  }
  return {
    sent: ok, failed: fail, total_matched: recipients.length,
    failure_sample: failures.slice(0, 5),
    cost_breakdown: useEmail
      ? `${recipients.length} × ₪0 (Email — חינם)`
      : `${recipients.length} × ₪0.13 (WhatsApp Marketing) = ₪${(recipients.length * 0.13).toFixed(2)}`,
    label: campaign_label || category || 'all',
  };
});

// ============================================================================
// CUSTOMER CLUB — public signup + profile completion + unsubscribe
// ============================================================================
// Flow:
//   /ClubJoin (public page)   → clubJoin            — new member signup
//   /ClubUpdate?cid=<id>      → clubGetProfile      — which fields are missing
//                             → clubUpdateProfile   — fill them in
//                             → clubUnsubscribe     — opt out of marketing
// The cid is the Customer cuid — unguessable, acts as a personal token in
// the links we send ({update_link} placeholder in campaign templates).

const CLUB_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toMmdd = (d: string | null | undefined) =>
  d && CLUB_DATE_RE.test(d) ? d.slice(5) : null;

registerFn('clubJoin', async ({ body }) => {
  const { name, phone, city, birthday, anniversary, email, marketing_consent } = body as any;
  const cleanPhone = String(phone || '').replace(/[^\d]/g, '');
  if (!name || cleanPhone.length < 9) throw new Error('שם וטלפון תקין הם שדות חובה');
  if (!city || !String(city).trim()) throw new Error('עיר היא שדה חובה');
  const data: any = {
    name: String(name).trim().slice(0, 80),
    city: String(city).trim().slice(0, 60),
  };
  if (email) data.email = String(email).trim().slice(0, 120);
  const bMmdd = toMmdd(birthday);
  const aMmdd = toMmdd(anniversary);
  if (bMmdd) data.birthday_mmdd = bMmdd;
  if (aMmdd) { data.anniversary_mmdd = aMmdd; data.anniversary_label = 'יום נישואין'; }
  if (marketing_consent) { data.marketing_consent = true; data.marketing_consent_at = new Date(); }

  const existing = await db.customer.findFirst({ where: { phone: cleanPhone } });
  let customer;
  if (existing) {
    // Never null-out fields the customer already has; only fill/refresh.
    const patch: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) patch[k] = v;
    }
    customer = await db.customer.update({ where: { id: existing.id }, data: patch });
  } else {
    customer = await db.customer.create({
      data: { phone: cleanPhone, visit_count: 0, loyalty_tier: 'regular', ...data },
    });
  }
  return { ok: true, cid: customer.id, existing: !!existing };
}, { public: true });

registerFn('clubGetProfile', async ({ body }) => {
  const { cid } = body as any;
  if (!cid) throw new Error('cid required');
  const c = await db.customer.findUnique({ where: { id: String(cid) } });
  if (!c) throw new Error('not_found');
  // Return only what the update page needs — not the full record.
  return {
    first_name: (c.name || '').split(' ')[0] || '',
    has_birthday: !!(c as any).birthday_mmdd,
    has_anniversary: !!(c as any).anniversary_mmdd,
    has_city: !!(c as any).city,
    has_email: !!(c as any).email,
    unsubscribed: !!(c as any).marketing_unsubscribed_at,
    visit_count: c.visit_count || 0,
  };
}, { public: true });

registerFn('clubUpdateProfile', async ({ body }) => {
  const { cid, birthday, anniversary, city, email } = body as any;
  if (!cid) throw new Error('cid required');
  const c = await db.customer.findUnique({ where: { id: String(cid) } });
  if (!c) throw new Error('not_found');
  const patch: any = {};
  const bMmdd = toMmdd(birthday);
  const aMmdd = toMmdd(anniversary);
  if (bMmdd) patch.birthday_mmdd = bMmdd;
  if (aMmdd) { patch.anniversary_mmdd = aMmdd; patch.anniversary_label = 'יום נישואין'; }
  if (city && String(city).trim()) patch.city = String(city).trim().slice(0, 60);
  if (email && String(email).trim()) patch.email = String(email).trim().slice(0, 120);
  if (!Object.keys(patch).length) return { ok: true, updated: false };
  await db.customer.update({ where: { id: c.id }, data: patch });
  return { ok: true, updated: true };
}, { public: true });

registerFn('clubUnsubscribe', async ({ body }) => {
  const { cid } = body as any;
  if (!cid) throw new Error('cid required');
  const c = await db.customer.findUnique({ where: { id: String(cid) } });
  if (!c) throw new Error('not_found');
  await db.customer.update({
    where: { id: c.id },
    data: { marketing_consent: false, marketing_unsubscribed_at: new Date() },
  });
  return { ok: true };
}, { public: true });

// Quick customer search for the manual-recipient picker in MarketingCampaigns.
// Matches name OR phone (contains, case-insensitive), returns top 20.
registerFn('searchCustomers', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const q = String((body as any)?.q || '').trim();
  if (q.length < 2) return { results: [] };
  const digits = q.replace(/[^\d]/g, '');
  const or: any[] = [{ name: { contains: q, mode: 'insensitive' } }];
  if (digits.length >= 3) or.push({ phone: { contains: digits } });
  const results = await db.customer.findMany({
    where: { OR: or },
    take: 20,
    orderBy: [{ last_visit: { sort: 'desc', nulls: 'last' } }],
    select: {
      id: true, name: true, phone: true, email: true,
      visit_count: true, loyalty_tier: true, last_visit: true,
      marketing_consent: true, marketing_unsubscribed_at: true,
    },
  });
  return { results };
});

// Server-side paginated customer list for /CustomerClub — replaces the old
// load-everything-in-batches approach that crawled with 19K customers.
// Returns one page + total count; search hits the DB, not the browser.
registerFn('clubListCustomers', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin' && !(user as any)?.managed_department) throw new Error('admin only');
  const { q, page, page_size, satisfaction, missing_only } = (body as any) || {};
  const take = Math.min(Math.max(Number(page_size) || 50, 10), 200);
  const skip = Math.max(Number(page) || 0, 0) * take;
  const where: any = {};
  const query = String(q || '').trim();
  if (query.length >= 2) {
    const digits = query.replace(/[^\d]/g, '');
    const or: any[] = [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ];
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    where.OR = or;
  }
  if (satisfaction && satisfaction !== 'all') where.satisfaction_status = satisfaction;
  // Customers missing club-profile fields — for the "fill your details" drive
  if (missing_only) {
    where.AND = [...(where.AND || []), { OR: [{ birthday_mmdd: null }, { city: null }] }];
    if (where.OR) { where.AND.push({ OR: where.OR }); delete where.OR; }
  }
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      take,
      skip,
      orderBy: [{ last_visit: { sort: 'desc', nulls: 'last' } }],
      select: {
        id: true, name: true, phone: true, email: true, city: true,
        birthday: true, birthday_mmdd: true, anniversary_mmdd: true, anniversary_label: true,
        visit_count: true, total_visits: true, total_spent: true,
        coin_balance: true, loyalty_tier: true, satisfaction_status: true, notes: true,
        last_visit: true, marketing_consent: true, marketing_unsubscribed_at: true,
        createdAt: true, created_date: true,
      },
    }),
  ]);
  return { total, rows, page: Math.max(Number(page) || 0, 0), page_size: take };
});

// Preview: count + 5 sample customers matching the segment.
// exclude_ids: customers the owner explicitly removed from this send.
registerFn('previewCustomerSegment', async ({ body }) => {
  const { segment, custom_filter, exclude_ids } = body as any;
  let where = buildSegmentWhere(segment || 'all_consented', custom_filter);
  if (Array.isArray(exclude_ids) && exclude_ids.length > 0) {
    where = { AND: [where, { id: { notIn: exclude_ids } }] };
  }
  // Also count how many of these the 24h throttle will skip at send time —
  // shown in the preview so the owner isn't surprised by a smaller send.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [count, throttledOut, sample] = await Promise.all([
    db.customer.count({ where }),
    segment === 'manual'
      ? Promise.resolve(0) // manual mode bypasses the throttle
      : db.customer.count({ where: { AND: [where, { last_marketing_sent_at: { gte: cutoff } }] } }),
    db.customer.findMany({
      where,
      take: 5,
      orderBy: [{ last_visit: { sort: 'desc', nulls: 'last' } }],
      select: { id: true, name: true, phone: true, visit_count: true, coin_balance: true, loyalty_tier: true, last_visit: true, birthday_mmdd: true },
    }),
  ]);
  return { count, throttled_out: throttledOut, sample };
});

// Twilio WhatsApp pricing (ILS, approx — updated 2026-06).
// 'marketing' conversation (template-initiated): ~₪0.13 / message to Israel
// 'utility' conversation: ~₪0.025 / message
// 'service' (24h customer-initiated window): free up to 1000/month
function estimateCampaignCostIls(recipientCount: number, channel: string): number {
  if (channel === 'sms') return recipientCount * 0.10;  // ~₪0.10 per SMS in Israel
  // WhatsApp marketing default
  return Number((recipientCount * 0.13).toFixed(2));
}

// Bulk send. Respects:
//  - marketing_consent gate (built into segment where)
//  - 24-hour throttle (no customer gets 2+ messages in a day)
//  - records every attempt to CampaignSend + per-recipient CampaignRecipient
//  - supports media_url (image attached to message)
//  - includes Twilio status callback URL so we get delivery/read receipts
registerFn('sendCustomerCampaign', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const brand = await getBrandName();
  const { segment, message_template, channel, campaign_key, campaign_label, custom_filter, media_url, exclude_ids } = body as any;
  if (!message_template) throw new Error('message_template required');
  if (!segment) throw new Error('segment required');
  const where = buildSegmentWhere(segment, custom_filter);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const baseAnd: any[] = [
    where,
    // Owner-excluded customers (hand-removed in the campaign UI)
    ...(Array.isArray(exclude_ids) && exclude_ids.length > 0
      ? [{ id: { notIn: exclude_ids } }]
      : []),
  ];
  // 24h throttle protects against accidental double-sends on bulk segments.
  // MANUAL mode bypasses it — the owner hand-picked these exact people, so
  // their intent is explicit. (This bit the owner: picked 1 customer, send
  // reported success with 0 recipients because of an earlier test message.)
  const isManualSegment = segment === 'manual';
  // AND-combine: segments like missing_details carry their own OR — a plain
  // spread would let the throttle OR overwrite it and blast the whole list.
  const finalWhere: any = isManualSegment
    ? { AND: baseAnd }
    : {
        AND: [
          ...baseAnd,
          { OR: [{ last_marketing_sent_at: null }, { last_marketing_sent_at: { lt: cutoff } }] },
        ],
      };
  // Count how many the throttle removed so the UI can say so honestly.
  const matchedBeforeThrottle = await db.customer.count({ where: { AND: baseAnd } });
  const recipients = await db.customer.findMany({ where: finalWhere, take: 500 });
  const skippedThrottled = Math.max(matchedBeforeThrottle - recipients.length, 0);
  const useWa = channel === 'whatsapp' || !channel;
  const useEmail = channel === 'email';
  const channelStr = useEmail ? 'email' : useWa ? 'whatsapp' : 'sms';
  const estimatedCost = useEmail ? 0 : estimateCampaignCostIls(recipients.length, channelStr);

  // Create the parent CampaignSend row FIRST so child rows can reference it.
  let parentSend: any = null;
  try {
    parentSend = await db.campaignSend.create({
      data: {
        campaign_key: campaign_key || segment,
        campaign_label: campaign_label || null,
        segment_key: segment,
        segment_filter: custom_filter || undefined,
        channel: channelStr,
        message_template,
        media_url: media_url || null,
        recipient_count: recipients.length,
        success_count: 0,
        failure_count: 0,
        estimated_cost_ils: estimatedCost,
        sent_by: (user as any)?.email || null,
      },
    });
  } catch (e: any) {
    console.warn('[sendCustomerCampaign] parent log failed:', e?.message);
  }

  const successes: string[] = [];
  const failures: Array<{ phone: string; reason: string }> = [];
  const statusCallback = `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/api/twilio/campaign-status`;

  for (const c of recipients) {
    // Pre-create the recipient row so the status webhook has somewhere to write
    let recipient: any = null;
    if (parentSend) {
      try {
        recipient = await db.campaignRecipient.create({
          data: {
            campaign_send_id: parentSend.id,
            customer_id: c.id,
            phone: c.phone,
            customer_name: c.name || null,
            status: 'queued',
          },
        });
      } catch (e) { /* ignore — still try to send */ }
    }
    try {
      const rendered = renderTemplate(message_template, c as any, brand);
      let out: any;
      if (useEmail) {
        // Email channel requires an email address (not all customers have one).
        if (!(c as any).email) {
          out = { skipped: true, reason: 'no_email' };
        } else {
          const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;padding:20px;max-width:600px;margin:auto;background:#FAF5E8;border-radius:12px"><h2 style="color:#A04A2E">${brand} 🌿</h2><pre style="white-space:pre-wrap;font-family:inherit">${rendered.replace(/[<>]/g, '')}</pre>${media_url ? `<img src="${media_url}" style="max-width:100%;margin-top:16px;border-radius:8px"/>` : ''}</div>`;
          out = await sendEmail({ to: (c as any).email, subject: campaign_label || `הודעה ממסעדת ${brand}`, html });
        }
      } else if (useWa) {
        out = await sendWhatsApp(c.phone, rendered, {
          mediaUrl: media_url,
          statusCallback,
          recipientId: recipient?.id,
        });
      } else {
        out = await sendSms(c.phone, rendered);
      }
      if ((out as any)?.skipped) {
        failures.push({ phone: c.phone, reason: (out as any).reason || 'skipped' });
        if (recipient) await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'failed', failed_at: new Date(), failure_reason: (out as any).reason || 'skipped' },
        }).catch(() => {});
      } else {
        successes.push(c.id);
        await db.customer.update({ where: { id: c.id }, data: { last_marketing_sent_at: new Date() } }).catch(() => {});
        if (recipient && (out as any)?.sid) {
          await db.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'sent', twilio_sid: (out as any).sid },
          }).catch(() => {});
        }
      }
    } catch (e: any) {
      const reason = e?.message?.slice(0, 100) || 'unknown';
      failures.push({ phone: c.phone, reason });
      if (recipient) await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'failed', failed_at: new Date(), failure_reason: reason },
      }).catch(() => {});
    }
  }
  // Update parent row with final counts
  if (parentSend) {
    await db.campaignSend.update({
      where: { id: parentSend.id },
      data: {
        success_count: successes.length,
        failure_count: failures.length,
        failure_reasons: failures.slice(0, 20).length ? failures.slice(0, 20) : undefined,
      },
    }).catch(() => {});
  }
  return {
    campaign_send_id: parentSend?.id,
    sent: successes.length,
    failed: failures.length,
    skipped: 0,
    skipped_throttled: skippedThrottled,
    total_matched: recipients.length,
    estimated_cost_ils: estimatedCost,
    cost_breakdown: useEmail
      ? `${recipients.length} × ₪0 (Email — חינם) = ₪0`
      : useWa
      ? `${recipients.length} × ₪0.13 (WhatsApp Marketing) = ₪${estimatedCost}`
      : `${recipients.length} × ₪0.10 (SMS) = ₪${estimatedCost}`,
    failure_sample: failures.slice(0, 5),
  };
});

// ============================================================================
// SAVED SEGMENTS — owner-defined custom filters for re-use
// ============================================================================
// Bulk-grant marketing consent to manually-added customers.
// Used when owner imports/adds customers offline and wants them included in
// campaigns. Only updates customers without an existing consent record,
// so this is safe to re-run.
registerFn('bulkGrantMarketingConsent', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { scope } = body as any;  // 'all' | 'no_consent_only' (default no_consent_only)
  const where: any = { phone: { not: '' } };
  if (scope !== 'all') where.marketing_consent = false;
  // Don't auto-re-consent customers who explicitly unsubscribed
  where.marketing_unsubscribed_at = null;
  const result = await db.customer.updateMany({
    where,
    data: { marketing_consent: true, marketing_consent_at: new Date() },
  });
  return { updated: result.count };
});

registerFn('listSavedSegments', async () => {
  const rows = await db.savedSegment.findMany({ orderBy: { use_count: 'desc' }, take: 50 });
  return { rows };
});

registerFn('createSavedSegment', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { name, description, segment_key, custom_filter, default_template, default_channel } = body as any;
  if (!name || !segment_key) throw new Error('name + segment_key required');
  const saved = await db.savedSegment.create({
    data: {
      name, description: description || null, segment_key,
      custom_filter: custom_filter || undefined,
      default_template: default_template || null,
      default_channel: default_channel || 'whatsapp',
      created_by: (user as any)?.email || null,
    },
  });
  return { saved };
});

registerFn('deleteSavedSegment', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { id } = body as any;
  if (!id) throw new Error('id required');
  await db.savedSegment.delete({ where: { id } });
  return { ok: true };
});

registerFn('incrementSavedSegmentUse', async ({ body }) => {
  const { id } = body as any;
  if (!id) return { ok: false };
  await db.savedSegment.update({
    where: { id },
    data: { use_count: { increment: 1 }, last_used_at: new Date() },
  }).catch(() => {});
  return { ok: true };
});

// ============================================================================
// REFERRAL PROGRAM — each customer gets a unique code that brings rewards
// ============================================================================
function generateReferralCode(name?: string): string {
  const namePart = (name || 'GUEST').replace(/[^A-Zא-ת]/gi, '').slice(0, 6).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${namePart}-${random}`;
}

registerFn('createReferralCode', async ({ body }) => {
  const { customer_id, customer_phone, reward_referrer_amount, reward_referee_amount } = body as any;
  let customer: any = null;
  if (customer_id) customer = await db.customer.findUnique({ where: { id: customer_id } });
  else if (customer_phone) customer = await db.customer.findFirst({ where: { phone: String(customer_phone).replace(/[^\d]/g, '') } });
  if (!customer) throw new Error('customer not found');
  // One active code per customer
  const existing = await db.referralCode.findFirst({ where: { customer_id: customer.id, is_active: true } });
  if (existing) return { code: existing, existing: true };
  const code = generateReferralCode(customer.name || undefined);
  const created = await db.referralCode.create({
    data: {
      code, customer_id: customer.id, customer_phone: customer.phone, customer_name: customer.name,
      reward_referrer_amount: reward_referrer_amount || 50,
      reward_referee_amount: reward_referee_amount || 50,
    },
  });
  return { code: created, existing: false };
});

registerFn('useReferralCode', async ({ body }) => {
  const { code, used_by_phone, used_by_name, reservation_id } = body as any;
  if (!code || !used_by_phone) throw new Error('code + phone required');
  const ref = await db.referralCode.findUnique({ where: { code: String(code).toUpperCase() } });
  if (!ref || !ref.is_active) throw new Error('invalid_code');
  // Can't refer yourself
  const cleanPhone = String(used_by_phone).replace(/[^\d]/g, '');
  if (ref.customer_phone === cleanPhone) throw new Error('cannot_refer_self');
  // Already used by this phone?
  const prior = await db.referralUse.findFirst({ where: { referral_code: code, used_by_phone: cleanPhone } });
  if (prior) return { use: prior, existing: true };
  const use = await db.referralUse.create({
    data: { referral_code: String(code).toUpperCase(), used_by_phone: cleanPhone, used_by_name: used_by_name || null, reservation_id: reservation_id || null },
  });
  await db.referralCode.update({ where: { id: ref.id }, data: { total_uses: { increment: 1 } } }).catch(() => {});
  return { use, referral: ref };
});

registerFn('getReferralCodeForCustomer', async ({ body }) => {
  const { customer_id, customer_phone } = body as any;
  let customer: any = null;
  if (customer_id) customer = await db.customer.findUnique({ where: { id: customer_id } });
  else if (customer_phone) customer = await db.customer.findFirst({ where: { phone: String(customer_phone).replace(/[^\d]/g, '') } });
  if (!customer) return { code: null };
  const ref = await db.referralCode.findFirst({ where: { customer_id: customer.id, is_active: true } });
  if (!ref) return { code: null };
  // Pull recent uses
  const uses = await db.referralUse.findMany({ where: { referral_code: ref.code }, orderBy: { createdAt: 'desc' }, take: 20 });
  return { code: ref, uses };
});

// ============================================================================
// HOLIDAY TEMPLATE LIBRARY — pre-made Hebrew greetings for major dates
// ============================================================================
registerFn('listHolidayTemplates', async () => {
  // Templates use {brand}/{name} placeholders — rendered when the owner
  // sends the campaign so each tenant substitutes their own restaurant name.
  const brand = await getBrandName();
  const templates = [
    { key: 'rosh_hashana', emoji: '🍎🍯', label: 'ראש השנה',
      template: `שנה טובה ומתוקה, {name}! 🍎🍯\nשתהיה לך שנה של בריאות, אושר ושפע — ועוד הרבה ארוחות טובות אצלנו 🌿\n${brand}` },
    { key: 'yom_kippur', emoji: '🕊️', label: 'יום כיפור',
      template: `גמר חתימה טובה, {name} 🕊️\nשתחתם בספר החיים, הבריאות והאושר 🌿\n— צוות ${brand}` },
    { key: 'sukkot', emoji: '🌿', label: 'סוכות',
      template: 'חג סוכות שמח, {name}! 🌿\nרוצה להזמין שולחן בסוכה אצלנו? נשמח לארח 🍂' },
    { key: 'hanukkah', emoji: '🕎', label: 'חנוכה',
      template: 'חג אורים שמח, {name}! 🕎\nבחנוכה, הסופגנייה החמה אצלנו על חשבון הבית — בוא להאיר את החג איתנו 🌿' },
    { key: 'tu_bishvat', emoji: '🌳', label: 'ט"ו בשבט',
      template: 'חג ט"ו בשבט שמח, {name}! 🌳\nתפריט מיוחד של פירות יבשים ותבלינים מחכה לך 🌿' },
    { key: 'purim', emoji: '🎭', label: 'פורים',
      template: 'פורים שמח, {name}! 🎭\nבוא להתחפש לאוכל טוב — מנה מיוחדת אצלנו לכבוד החג 🌿' },
    { key: 'pesach', emoji: '🍷', label: 'פסח',
      template: 'חג פסח שמח, {name}! 🍷\nאחרי הסדר — בוא לחזור לטעמים שאוהבים. מתפריט מיוחד לפסח 🌿' },
    { key: 'yom_atzmaut', emoji: '🇮🇱', label: 'יום העצמאות',
      template: 'יום עצמאות שמח, {name}! 🇮🇱\nחוגגים יחד את ישראל — ערב עצמאות אצלנו עם מוזיקה ומנגל מיוחד 🌿' },
    { key: 'lag_baomer', emoji: '🔥', label: 'ל"ג בעומר',
      template: 'ל"ג בעומר שמח, {name}! 🔥\nבא לעבור לארוחה אמיתית אחרי המדורה? פתוחים עד מאוחר 🌿' },
    { key: 'shavuot', emoji: '🥛', label: 'שבועות',
      template: 'חג שבועות שמח, {name}! 🥛\nמנות חלביות מיוחדות לחג — בוא לטעום 🌿' },
    { key: 'valentine', emoji: '❤️', label: 'ולנטיין',
      template: 'יום ולנטיין שמח, {name}! ❤️\nערב רומנטי לזוגות — קבל בקבוק יין במתנה כשמגיעים זוגות.\nהזמן שולחן 🌿' },
    { key: 'mother_day', emoji: '💐', label: 'יום האם',
      template: 'יום אם שמח, {name}! 💐\nתפנק את האמא הכי טובה — הזמן שולחן ויש מתנה לאמא במקום 🌿' },
    { key: 'father_day', emoji: '👔', label: 'יום האב',
      template: `יום האב שמח, {name}! 👔\nתפנק את אבא — סטייק מיוחד לחג, על חשבון הבית עם כל מנה ראשונה.\n${brand} 🌿` },
  ];
  return { templates };
});
// Returns the parent CampaignSend + all CampaignRecipient rows.
registerFn('getCampaignDetails', async ({ body }) => {
  const { campaign_send_id } = body as any;
  if (!campaign_send_id) throw new Error('campaign_send_id required');
  const send = await db.campaignSend.findUnique({ where: { id: campaign_send_id } });
  if (!send) throw new Error('not found');
  const recipients = await db.campaignRecipient.findMany({
    where: { campaign_send_id },
    orderBy: { created_at: 'asc' },
    take: 500,
  });
  // Pull reservations for converted recipients to show what they ordered
  const convertedIds = recipients.filter((r: any) => r.converted_reservation_id).map((r: any) => r.converted_reservation_id as string);
  const convertedReservations = convertedIds.length > 0
    ? await db.reservation.findMany({ where: { id: { in: convertedIds } } })
    : [];
  return { send, recipients, conversions: convertedReservations };
});

// Recent campaign history — last 50 sends, newest first
registerFn('getCampaignHistory', async ({ body }) => {
  const limit = Math.min(Number((body as any)?.limit) || 50, 200);
  const rows = await db.campaignSend.findMany({
    orderBy: { sent_at: 'desc' },
    take: limit,
  });
  return { rows };
});

// Update a customer's birthday — used by the admin UI + by reservation form
registerFn('setCustomerBirthday', async ({ body }) => {
  const { customer_id, phone, mmdd } = body as any;
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) throw new Error('mmdd must be "MM-DD"');
  let c: any = null;
  if (customer_id) c = await db.customer.findUnique({ where: { id: customer_id } });
  else if (phone) c = await db.customer.findFirst({ where: { phone: String(phone).replace(/[^\d]/g, '') } });
  if (!c) throw new Error('customer not found');
  await db.customer.update({ where: { id: c.id }, data: { birthday_mmdd: mmdd } });
  return { ok: true, customer_id: c.id };
});

// Update a customer's anniversary (wedding / first-visit / etc.)
registerFn('setCustomerAnniversary', async ({ body }) => {
  const { customer_id, phone, mmdd, label } = body as any;
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) throw new Error('mmdd must be "MM-DD"');
  let c: any = null;
  if (customer_id) c = await db.customer.findUnique({ where: { id: customer_id } });
  else if (phone) c = await db.customer.findFirst({ where: { phone: String(phone).replace(/[^\d]/g, '') } });
  if (!c) throw new Error('customer not found');
  await db.customer.update({
    where: { id: c.id },
    data: { anniversary_mmdd: mmdd, ...(label ? { anniversary_label: String(label).slice(0, 80) } : {}) },
  });
  return { ok: true, customer_id: c.id };
});

registerFn('sendDeliveryMessage', async ({ body }) => {
  const { channel, recipients, message, phone } = body as any;
  // Accept both the bulk form ({channel, recipients:[{phone}], message}) used by
  // delivery/recruitment, and a single {phone, message}.
  const list = Array.isArray(recipients) ? recipients : phone ? [{ phone }] : [];
  if (!list.length) throw new Error('no recipients');
  if (!message) throw new Error('message required');
  const results: any[] = [];
  for (const r of list) {
    const p = r?.phone;
    if (!p) { results.push({ phone: p, status: 'skipped', reason: 'no phone' }); continue; }
    try {
      const out = channel === 'whatsapp' ? await sendWhatsApp(p, message) : await sendSms(p, message);
      results.push({ phone: p, status: (out as any)?.skipped ? 'skipped' : 'sent', sid: (out as any)?.sid });
    } catch (e: any) {
      results.push({ phone: p, status: 'failed', error: e?.message });
    }
  }
  return { results };
});

/* ----- Pushover (admin notifications) ----- */

const pushoverEvent = (
  name: string,
  buildMessage: (data: any) => { title: string; message: string } | null,
) => {
  registerFn(name, async ({ body }) => {
    const { event, data } = body as any;
    if (event?.type && event.type !== 'create' && event.type !== 'update') {
      return { ok: true, skipped: 'wrong_event_type' };
    }
    const msg = buildMessage(data ?? body);
    if (!msg) return { ok: true };
    return pushoverToAdmins(msg.title, msg.message);
  });
};

pushoverEvent('pushoverOnShiftStart', (d) => ({
  title: '🟢 כניסה למשמרת',
  message: `${d.employee_name} נכנס למשמרת\nתאריך: ${d.date ?? ''}`,
}));
pushoverEvent('pushoverOnShiftEnd', (d) => ({
  title: '🔴 סיום משמרת',
  message: `${d.employee_name} סיים משמרת`,
}));
pushoverEvent('pushoverOnShiftEndReport', (d) => ({
  title: '📝 דוח סוף משמרת',
  message: `דוח חדש מ-${d.employee_name ?? ''}`,
}));
pushoverEvent('pushoverOnShiftSwap', (d) => ({
  title: '🔄 בקשת החלפת משמרת',
  message: JSON.stringify(d).slice(0, 200),
}));
pushoverEvent('pushoverOnIncident', (d) => ({
  title: '🚨 תקרית חדשה',
  message: `${d.title ?? ''}\n${d.description ?? ''}`,
}));
pushoverEvent('pushoverOnLeaveRequest', (d) => ({
  title: '🏖️ בקשת חופשה',
  message: `${d.employee_name ?? ''}`,
}));
pushoverEvent('pushoverOnLeaveUpdate', (d) => ({
  title: '🏖️ עדכון חופשה',
  message: `${d.status ?? ''}`,
}));
pushoverEvent('pushoverOnAvailability', (d) => ({
  title: '📅 זמינות עודכנה',
  message: `${d.employee_name ?? ''}`,
}));
pushoverEvent('pushoverOnBriefPublished', () => ({
  title: '📢 תדריך פורסם',
  message: 'תדריך חדש זמין',
}));
pushoverEvent('pushoverOnChecklistComplete', (d) => ({
  title: '✅ צ׳קליסט הושלם',
  message: `${d.checklist_name ?? ''}`,
}));
pushoverEvent('pushoverOnNewCandidate', (d) => ({
  title: '👤 מועמד חדש',
  message: `${d.name ?? ''} - ${d.position ?? ''}`,
}));
pushoverEvent('pushoverOnCandidateAbandoned', (d) => ({
  title: '⚠️ מועמד נטש',
  message: `${d.name ?? ''}`,
}));
pushoverEvent('pushoverOnMenuTrainingComplete', (d) => ({
  title: '🎓 הכשרת תפריט הושלמה',
  message: `${d.employee_name ?? ''}`,
}));
pushoverEvent('pushoverOnTipLocked', (d) => ({
  title: '💰 טיפים נעולים',
  message: `יום ${d.date ?? ''}`,
}));

registerFn('sendPushoverNotification', async ({ body }) => {
  const { user_key, title, message, priority } = body as any;
  return pushover(user_key, title, message, priority);
});

registerFn('sendPushoverOnDeliveryStatus', async ({ body }) => {
  const { user_key, status, order_id } = body as any;
  return pushover(user_key ?? '', '🛵 עדכון משלוח', `הזמנה ${order_id}: ${status}`);
});

// Free web push to a queue customer's browser/PWA (saved on the QueueEntry).
registerFn('sendQueuePush', async ({ body }) => {
  const { entryId, title, body: text, message } = body as any;
  if (!process.env.VAPID_PUBLIC_KEY) return { skipped: true, reason: 'VAPID not configured' };
  if (!entryId) throw new Error('entryId required');
  const entry = await db.queueEntry.findUnique({ where: { id: entryId } });
  if (!entry?.push_subscription) return { skipped: true, reason: 'no subscription' };
  const payload = JSON.stringify({ title: title || '⏰ התור שלך', body: text || message || '' });
  try {
    await webpush.sendNotification(entry.push_subscription as any, payload);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}, { public: true });

/* ----- Telegram ----- */

registerFn('sendDeliveryToTelegram', async ({ body }) => {
  const { phone, address } = body as any;
  return sendTelegramMessage(`/${address}${phone ? '&' + phone : ''}`);
});

registerFn('sendDeliveryViaTelegramClient', async ({ body }) => {
  const { phone, address } = body as any;
  if (!address) throw new Error('address required');
  // The original posted from a personal Telegram (MTProto) account via a
  // session token; here we send the same formatted delivery command to the
  // group through the bot, which works without per-user session setup.
  return sendTelegramMessage(`/${address}${phone ? '&' + phone : ''}`);
});

/* ----- AI / Gemini ----- */

// ── AI Assistant knowledge files (replaces Drive pipeline) ──────────────────
// Owner uploads files via the UI → MinIO. askGemini lazily uploads each
// active file to Gemini's Files API and refreshes the URI whenever it goes
// stale (48h server-side TTL).

function assertAiFilesAdmin(user: any) {
  const role = user?.role;
  if (role !== 'admin' && role !== 'manager' && role !== 'owner') {
    throw new Error('אין הרשאה לנהל קבצי AI');
  }
}

const AI_FILE_MAX_MB = 50;
const GEMINI_FILE_REFRESH_MS = 47 * 60 * 60 * 1000; // refresh before the 48h expiry

// Upload a buffer to Gemini's Files API and return the file_uri (or null on
// failure). Shared between the lazy refresh path and the Drive migration.
async function uploadBufferToGemini(buf: ArrayBuffer | Buffer, mime: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Header-Content-Length': String((buf as Buffer).byteLength ?? (buf as ArrayBuffer).byteLength),
        'X-Goog-Upload-Header-Content-Type': mime,
      },
      body: buf as any,
    },
  );
  const d: any = await r.json().catch(() => null);
  return d?.file?.uri || null;
}

// Pull file bytes back from MinIO given a file_url. Handles every shape we've
// ever produced: /api/files/<key>, full URLs, http://minio:9000/bucket/<key>,
// etc. — falls back to using everything after the LAST '/files/' segment.
function extractMinioKey(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const noQuery = fileUrl.split('?')[0];
  // Every storage URL we've ever generated puts the MinIO key after one of
  // these prefixes — try each in order. /storage/ is the legacy public URL
  // (https://topalena.com/storage/<key>), /files/ is the current internal
  // streamer (/api/files/<key>), /<bucket>/ is the raw MinIO/S3 form.
  const prefixes = ['/storage/', '/files/'];
  for (const p of prefixes) {
    const idx = noQuery.lastIndexOf(p);
    if (idx >= 0) return noQuery.slice(idx + p.length);
  }
  const bucket = process.env.S3_BUCKET ?? 'top-alena';
  const bIdx = noQuery.indexOf(`/${bucket}/`);
  if (bIdx >= 0) return noQuery.slice(bIdx + bucket.length + 2);
  return null;
}

async function fetchMinioBuffer(fileUrl: string): Promise<Buffer | null> {
  try {
    const key = extractMinioKey(fileUrl);
    if (!key) return null;
    const { minio } = await import('../lib/storage.js');
    const bucket = process.env.S3_BUCKET ?? 'top-alena';
    const stream = await minio.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } catch (e) {
    return null;
  }
}

// List active + inactive files for admin UI (admin/manager/owner only).
registerFn('listAiAssistantFiles', async ({ user }) => {
  assertAiFilesAdmin(user);
  try {
    return await db.aiAssistantFile.findMany({ orderBy: { created_date: 'desc' } });
  } catch (e: any) {
    if (/does not exist|Unknown arg/i.test(String(e?.message))) return [];
    throw e;
  }
});

// Save metadata after frontend uploads via base44.integrations.Core.UploadFile.
registerFn('createAiAssistantFile', async ({ body, user }) => {
  assertAiFilesAdmin(user);
  const { file_name, mime_type, file_url, file_size, description } = body as any;
  if (!file_name || !mime_type || !file_url) throw new Error('file_name, mime_type, file_url required');
  return await db.aiAssistantFile.create({
    data: {
      file_name,
      mime_type,
      file_url,
      file_size: file_size ? Number(file_size) : null,
      description: description || null,
      is_active: true,
      source: 'manual',
      created_by: (user as any)?.id ?? null,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    },
  });
});

registerFn('updateAiAssistantFile', async ({ body, user }) => {
  assertAiFilesAdmin(user);
  const { id, ...data } = body as any;
  if (!id) throw new Error('id required');
  return await db.aiAssistantFile.update({
    where: { id },
    data: { ...data, updated_date: new Date().toISOString() },
  });
});

registerFn('deleteAiAssistantFile', async ({ body, user }) => {
  assertAiFilesAdmin(user);
  const { id } = body as any;
  if (!id) throw new Error('id required');
  await db.aiAssistantFile.delete({ where: { id } });
  return { ok: true };
});

// One-time migration: pull every file from the Drive folder, push to MinIO,
// create matching AiAssistantFile rows. Safe to run multiple times — skips
// files whose name already exists.
registerFn('migrateDriveToAiAssistantFiles', async ({ user }) => {
  assertAiFilesAdmin(user);
  const folderId = process.env.DRIVE_FOLDER_ID || '19gPH0jJT8BdbzYvx-sSiFXRhWqo-z_bA';
  const token = await driveAccessToken();
  const mimeTypes = [
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown', 'text/html',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  ];
  const files = await listDriveFiles(folderId, token, mimeTypes);
  const { uploadStreamToS3 } = await import('../lib/storage.js');
  const { Readable } = await import('node:stream');

  const results: any[] = [];
  for (const file of files) {
    try {
      const existing = await db.aiAssistantFile.findFirst({ where: { file_name: file.name } });
      if (existing) { results.push({ file: file.name, status: 'skipped (already exists)' }); continue; }

      const buf = await downloadDriveFile(file.id, token);
      const stream = Readable.from(Buffer.from(buf));
      const { url } = await uploadStreamToS3(file.name, file.mimeType, stream);

      await db.aiAssistantFile.create({
        data: {
          file_name: file.name,
          mime_type: file.mimeType,
          file_url: url,
          file_size: (buf as Buffer).byteLength,
          is_active: true,
          source: 'drive_migration',
          created_by: (user as any)?.id ?? null,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
      });
      results.push({ file: file.name, status: 'migrated' });
    } catch (e: any) {
      results.push({ file: file.name, status: 'error', error: e?.message });
    }
  }
  return { migrated: results.filter((r: any) => r.status === 'migrated').length, skipped: results.filter((r: any) => r.status === 'skipped (already exists)').length, errors: results.filter((r: any) => r.status === 'error').length, details: results };
});

// ── askGemini ────────────────────────────────────────────────────────────────
// Dvir AI chat. Reads active AiAssistantFile rows (the new pipeline) AND falls
// back to GeminiFileCache (Drive era) for files that haven't been migrated.
// Lazily re-uploads each file to Gemini's Files API when the cached URI is
// older than 47h.
registerFn('askGemini', async ({ body }) => {
  const { message, history, systemPrompt, prompt } = body as any;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const userMessage = message ?? prompt ?? '';

  const supported = new Set([
    'application/pdf', 'text/plain', 'text/html', 'text/csv', 'text/markdown',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'audio/mpeg', 'audio/wav',
  ]);

  // Primary source: AiAssistantFile (new pipeline, lazy auto-refresh).
  let aiFiles: any[] = [];
  try {
    aiFiles = await db.aiAssistantFile.findMany({ where: { is_active: true } });
  } catch (e: any) {
    if (!/does not exist|Unknown arg/i.test(String(e?.message))) throw e;
  }
  const now = Date.now();
  const fileParts: any[] = [];
  for (const f of aiFiles) {
    if (!supported.has(f.mime_type)) continue;
    const cachedAt = f.gemini_uploaded_at ? new Date(f.gemini_uploaded_at).getTime() : 0;
    const fresh = f.gemini_file_uri && now - cachedAt < GEMINI_FILE_REFRESH_MS;
    let uri = fresh ? f.gemini_file_uri : null;
    if (!uri) {
      const buf = await fetchMinioBuffer(f.file_url);
      if (buf) {
        uri = await uploadBufferToGemini(buf, f.mime_type);
        if (uri) {
          await db.aiAssistantFile.update({
            where: { id: f.id },
            data: { gemini_file_uri: uri, gemini_uploaded_at: new Date().toISOString(), updated_date: new Date().toISOString() },
          });
        }
      }
    }
    if (uri) fileParts.push({ file_data: { mime_type: f.mime_type, file_uri: uri } });
  }

  // Fallback (until everyone's migrated): files still only in GeminiFileCache.
  // Skip names already covered by aiFiles to avoid duplicates.
  try {
    const seenNames = new Set(aiFiles.map(f => f.file_name));
    const cached: any[] = await db.geminiFileCache.findMany();
    for (const f of cached) {
      if (!f.gemini_file_uri || !supported.has(f.mime_type)) continue;
      if (seenNames.has(f.file_name)) continue;
      fileParts.push({ file_data: { mime_type: f.mime_type, file_uri: f.gemini_file_uri } });
    }
  } catch { /* ignore — table may not exist */ }

  const contents: any[] = [];
  if (Array.isArray(history)) {
    for (const m of history) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
  }
  contents.push({ role: 'user', parts: [...fileParts, { text: userMessage }] });

  // Gemini 2.5-flash uses "thinking tokens" by default — for chat workloads
  // with large system prompts (menu PDFs etc.) the thinking phase can consume
  // the entire maxOutputTokens budget and leave 0 tokens for the actual
  // textual reply (finishReason: MAX_TOKENS, empty content). Disable thinking
  // for the conversational assistant and give a healthy budget.
  const reqBody: any = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (systemPrompt) reqBody.system_instruction = { parts: [{ text: systemPrompt }] };

  const callGemini = async (body: any) => {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    const d: any = await r.json();
    return { ok: r.ok, status: r.status, data: d };
  };

  let res = await callGemini(reqBody);

  // Files in GeminiFileCache expire after 48h on Gemini's side. When that
  // happens, every chat call returns 403 PERMISSION_DENIED for the missing
  // file URI. Purge the stale cache and retry once WITHOUT file parts so the
  // chat keeps working — the cache will be re-populated next time someone
  // runs the sync function (resyncGeminiFiles / Drive sync).
  if (!res.ok && /permission to access the File|File .* may not exist|PERMISSION_DENIED/i.test(JSON.stringify(res.data?.error || ''))) {
    try { await db.geminiFileCache.deleteMany({}); } catch { /* ignore */ }
    const retryBody = {
      ...reqBody,
      contents: [...contents.slice(0, -1), { role: 'user', parts: [{ text: userMessage }] }],
    };
    res = await callGemini(retryBody);
  }

  if (!res.ok) throw new Error(res.data?.error?.message || 'Gemini API error');
  const reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!reply) {
    const finish = res.data.candidates?.[0]?.finishReason || 'UNKNOWN';
    throw new Error(`Gemini returned empty reply (finishReason: ${finish})`);
  }
  return { reply };
});

registerFn('aiAnalyzeIncident', async ({ body }) => {
  const { incident_id } = body as any;
  const incident = await db.incident.findUnique({ where: { id: incident_id } });
  if (!incident) throw new Error('incident_not_found');

  const prompt = `אתה יועץ תפעולי למסעדות. נתח תקרית ותן המלצות מניעה.
כותרת: ${incident.title}
תיאור: ${incident.description}
קטגוריה: ${incident.category}
חומרה: ${incident.severity}
תגובת לקוח: ${incident.customer_reaction || 'לא צוין'}
פתרון שניתן: ${incident.solution_provided || 'לא צוין'}`;

  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        root_cause: { type: 'string' },
        immediate_action: { type: 'string' },
        prevention_plan: { type: 'string' },
        team_training_needed: { type: 'string' },
        priority: { type: 'string' },
        estimated_impact: { type: 'string' },
      },
    },
  });

  await db.incident.update({
    where: { id: incident_id },
    data: {
      prevention_measures: `${result.root_cause}\n\nמניעה: ${result.prevention_plan}`,
    },
  });
  return { success: true, analysis: result };
});

registerFn('aiAnalyzeShiftReport', async ({ body }) => {
  const { report_id, report: reportArg } = body as any;
  let report = reportArg;
  if (!report && report_id) report = await db.shiftEndReport.findUnique({ where: { id: report_id } });
  if (!report) throw new Error('Report not found');

  const prompt = `אתה מנהל מסעדה מנוסה. נתח את דוח סיום המשמרת הבא וספק תובנות:

תאריך: ${report.shift_date} | משמרת: ${report.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
מנהל: ${report.manager_name}
סועדים: ${report.total_covers || 0} | הכנסות: ₪${report.total_revenue || 0}
אשראי: ₪${report.total_credit_card || 0} | מזומן: ₪${report.total_cash || 0}
טיפים: ₪${report.total_credit_card_tips || 0} | טיפ לשעה: ₪${report.tip_per_hour_waiter || 0}
משלוחים: ${report.total_deliveries || 0} | שווי: ₪${report.total_deliveries_amount || 0}
ממוצע לסועד: ₪${report.avg_spend_dine_in || 0}
ביטולים: ${report.canceled_items_count || 0} פריטים (₪${report.canceled_items_value || 0})
הפרש קופה: ₪${report.cash_difference || 0}
ביצועי צוות: ${JSON.stringify(report.staff_performance || [])}
אירועים מרכזיים: ${(report.key_incidents || []).join?.(', ') || ''}
פידבק לקוחות: ${report.customer_feedback || 'לא צוין'}

ספק ניתוח ב-JSON עם השדות: overall_assessment, revenue_analysis, top_issue, staff_highlights, recommendations (מערך), forecast_next_shift, score (מספר).`;

  return invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        overall_assessment: { type: 'string' },
        revenue_analysis: { type: 'string' },
        top_issue: { type: 'string' },
        staff_highlights: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        forecast_next_shift: { type: 'string' },
        score: { type: 'number' },
      },
    },
  });
});

registerFn('aiDailySummary', async ({ body }) => {
  const { date } = body as any;
  const today = date ?? new Date().toISOString().slice(0, 10);
  // incident_date is stored as an ISO string; match by date prefix.
  const incidents = await db.incident.findMany({ where: { incident_date: { startsWith: today } } });
  return invokeLLM({
    prompt: `סכם את היום ${today}. תקריות: ${JSON.stringify(incidents)}`,
  });
});

registerFn('aiGenerateBriefing', async ({ body }) => {
  const ctx = await businessContextBlock();
  const brand = await getBrandName();
  const raw: any = await invokeLLM({
    prompt: `${ctx}הכן תדריך יומי לצוות המסעדה בהתאם לפרופיל העסק למעלה. אל תמציא פרטים שלא בפרופיל.\n\n⚠️ חשוב מאוד: אסור להשתמש במילה "עלינא" או בשם מסעדה אחר בפלט. השם היחיד למסעדה הוא: "${brand}". השתמש רק בשם זה או במילה "המסעדה".\n\nנתוני היום: ${JSON.stringify(body)}`,
    responseSchema: {
      type: 'object',
      // `lines`, NOT `items`: a Gemini schema property named `items` collides
      // with the JSON-Schema keyword and returns empty (A/B-proven 2026-07-05).
      properties: { headline: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } },
    },
    _ctx: { fn_name: 'aiGenerateBriefing' },
  });
  const clean = (s: string) => (typeof s === 'string' ? s.replaceAll('עלינא', brand) : s);
  const rawItems = Array.isArray(raw?.lines) ? raw.lines : (Array.isArray(raw?.items) ? raw.items : []);
  return {
    headline: clean(raw?.headline),
    items: rawItems.map(clean),
  };
});

registerFn('aiScoreCandidate', async ({ body }) => {
  const { candidate_id } = body as any;
  const candidate = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!candidate) throw new Error('candidate_not_found');
  const result: any = await invokeLLM({
    prompt: `דרג את המועמד הבא 0-100 ותסביר.\n${JSON.stringify(candidate)}`,
    responseSchema: {
      type: 'object',
      properties: { score: { type: 'number' }, reason: { type: 'string' } },
    },
  });
  await db.jobCandidate.update({
    where: { id: candidate_id },
    data: { ai_score: result.score, ai_reason: result.reason },
  });
  return result;
});

/* ----- Coins / Gamification ----- */

const awardCoins = async (employee_id: string, amount: number, reason: string) => {
  if (!employee_id || !amount) return { skipped: true };
  const emp = await db.employee.findUnique({ where: { id: employee_id } });
  if (!emp) throw new Error('employee_not_found');
  await db.employee.update({
    where: { id: employee_id },
    data: { coin_balance: (emp.coin_balance ?? 0) + amount },
  });
  await db.coinTransaction.create({
    data: {
      employee_id,
      employee_name: emp.full_name ?? emp.name ?? '',
      amount,
      reason,
      type_: 'earned',
    },
  });
  return { ok: true, coinsAwarded: amount };
};

// Faithful port of the original Base44 awardAvailabilityCoins. Takes
// employee_name straight from the request (so a missing Employee row never
// crashes the whole submit) and sets trigger + status exactly as Base44 did.
// The Employee.coin_balance update is kept as a non-fatal side effect so the
// UI badge stays in sync.
registerFn('awardAvailabilityCoins', async ({ body }) => {
  const b = body as any;
  const { employee_id, employee_name, availableShifts, coinsToAward } = b;
  if (!employee_id || !employee_name) {
    return { success: false, error: 'Missing required fields' };
  }
  const coins = coinsToAward || (availableShifts ? availableShifts * 5 : 0);
  if (coins <= 0) return { success: true, coinsAwarded: 0 };
  try {
    await db.coinTransaction.create({
      data: {
        employee_id,
        employee_name,
        amount: coins,
        reason: `הגשת סידור זמינות - ${availableShifts} משמרות פנויות`,
        type_: 'earned',
        trigger: 'availability_submitted',
        status: 'approved',
      },
    });
  } catch (e: any) {
    console.error('[availabilityCoins] CoinTransaction.create failed:', e?.message);
    return { success: false, error: 'transaction_failed', detail: e?.message };
  }
  // Keep Employee.coin_balance cached on the row (best-effort).
  try {
    await db.employee.update({
      where: { id: employee_id },
      data: { coin_balance: { increment: coins } },
    });
  } catch (e: any) {
    console.warn('[availabilityCoins] employee.coin_balance update skipped:', e?.message);
  }
  return { success: true, coinsAwarded: coins };
});
registerFn('awardBriefingCoins', async ({ body }) =>
  awardCoins((body as any).employee_id, (body as any).amount ?? 3, 'briefing_read'),
);
registerFn('awardShiftSwapCoins', async ({ body }) =>
  awardCoins((body as any).employee_id, (body as any).amount ?? 10, 'shift_swap_helped'),
);

/* ----- URL shortener (is.gd) ----- */

registerFn('shortenUrl', async ({ body }) => {
  const { url } = body as any;
  if (!url) throw new Error('url required');
  try {
    const res = await fetch(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
      { headers: { Accept: 'text/plain' } },
    );
    const text = (await res.text()).trim();
    if (text.startsWith('http') && !text.includes('Error')) return { shortUrl: text };
  } catch {
    /* fall through */
  }
  return { shortUrl: url };
});

/* ----- ElevenLabs TTS ----- */

const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
registerFn('elevenLabsTts', async ({ body }) => {
  const { text } = body as any;
  if (!text) throw new Error('text required');
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const clean = text.replace(/[*_#`~]/g, '').replace(/\n+/g, ' ').trim().slice(0, 2500);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: clean, model_id: 'eleven_monolingual_v1' }),
  });
  if (!res.ok) throw new Error(`elevenlabs_${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { audio_base64: buf.toString('base64') };
});

/* ----- Instagram ----- */

async function igAccessToken() {
  const tok = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!tok) throw new Error('INSTAGRAM_ACCESS_TOKEN not set');
  return tok;
}

registerFn('generateInstagramPost', async ({ body }) => {
  const { topic, tone } = body as any;
  return invokeLLM({
    prompt: `כתוב פוסט אינסטגרם בעברית על "${topic}". סגנון: ${tone ?? 'חברי ומזמין'}.
החזר JSON עם caption (טקסט הפוסט, כולל אמוג'ים והאשטגים) ו-image_prompt (תיאור באנגלית ליצירת תמונה).`,
    responseSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string' },
        image_prompt: { type: 'string' },
      },
    },
  });
});

registerFn('publishInstagramPost', async ({ body }) => {
  const { image_url, caption, scheduled_date } = body as any;
  if (!image_url || !caption) throw new Error('image_url and caption required');
  const accessToken = await igAccessToken();

  const meRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
  );
  const me: any = await meRes.json();
  if (!me.id) throw new Error(`ig_me_failed: ${JSON.stringify(me)}`);

  const containerPayload: any = { image_url, caption, access_token: accessToken };
  if (scheduled_date) {
    containerPayload.scheduled_publish_time = Math.floor(new Date(scheduled_date).getTime() / 1000);
  }
  const containerRes = await fetch(`https://graph.instagram.com/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerPayload),
  });
  const container: any = await containerRes.json();
  if (!container.id) throw new Error(`ig_container_failed: ${JSON.stringify(container)}`);

  if (scheduled_date) {
    return { success: true, post_id: container.id, username: me.username, scheduled: true, scheduled_date };
  }
  const publishRes = await fetch(`https://graph.instagram.com/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
  });
  const published: any = await publishRes.json();
  if (!published.id) throw new Error(`ig_publish_failed: ${JSON.stringify(published)}`);
  return { success: true, post_id: published.id, username: me.username, scheduled: false };
});

/* ----- Customer helpers ----- */

registerFn('getAnonymousCustomerHistory', async ({ body }) => {
  const { phone } = body as any;
  if (!phone) throw new Error('Missing phone');

  const entries = await db.queueEntry.findMany({
    where: { phone: phone.trim() },
    orderBy: { timestamp_register: 'desc' },
    take: 1000,
  });

  if (entries.length === 0) {
    return { isNewCustomer: true, visitCount: 0, totalCredits: 0, previousEntriesCount: 0 };
  }

  const visitCount = entries.length;
  const seatedCount = entries.filter((e: any) => e.status === 'seated').length;
  const abandonedCount = entries.filter((e: any) => e.status === 'abandoned').length;
  const lastEntry = entries[0];
  const totalCredits = lastEntry.time_credits_earned || 0;
  const previousTreat = entries.find((e: any) => e.selected_treat_id);

  return {
    isNewCustomer: false,
    visitCount,
    seatedCount,
    abandonedCount,
    totalCredits,
    previousTreat: previousTreat
      ? { treatId: previousTreat.selected_treat_id, timestamp: previousTreat.timestamp_register }
      : null,
    lastVisit: lastEntry.timestamp_register,
  };
}, { public: true });

registerFn('syncQueueToCustomer', async ({ body }) => {
  const { phone, name } = body as any;
  if (!phone) throw new Error('phone required');
  const existing = await db.customer.findFirst({ where: { phone } });
  if (existing) {
    return db.customer.update({
      where: { id: existing.id },
      data: {
        visit_count: (existing.visit_count ?? 0) + 1,
        last_visit: new Date().toISOString(),
        name: existing.name ?? name,
      },
    });
  }
  return db.customer.create({
    data: { phone, name, visit_count: 1, last_visit: new Date().toISOString() },
  });
});

registerFn('importPhoneNumbers', async ({ body }) => {
  const { phones } = body as any;
  if (!Array.isArray(phones)) throw new Error('phones array required');
  let created = 0;
  for (const p of phones) {
    const phone = typeof p === 'string' ? p : p?.phone;
    const name = typeof p === 'object' ? p?.name : undefined;
    if (!phone) continue;
    const exists = await db.customer.findFirst({ where: { phone } });
    if (!exists) {
      await db.customer.create({ data: { phone, name } });
      created++;
    }
  }
  return { created, total: phones.length };
});

/* ----- Gemini admin ----- */

registerFn('listGeminiModels', async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  if (!res.ok) throw new Error(`gemini_${res.status}`);
  return res.json();
});

// Sync the team's Google Drive folder into Gemini's File API and cache the
// resulting file URIs in GeminiFileCache (used by askGemini). Run on demand
// (admin) or from a daily cron. Requires GOOGLE_SERVICE_ACCOUNT_JSON and the
// Drive folder shared with the service-account email.
registerFn('refreshGeminiFiles', async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const folderId = process.env.DRIVE_FOLDER_ID || '19gPH0jJT8BdbzYvx-sSiFXRhWqo-z_bA';

  const token = await driveAccessToken();
  const mimeTypes = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];
  const files = await listDriveFiles(folderId, token, mimeTypes);
  const results: any[] = [];

  for (const file of files) {
    try {
      const buf = await downloadDriveFile(file.id, token);
      const up = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': file.mimeType,
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Header-Content-Length': String(buf.byteLength),
            'X-Goog-Upload-Header-Content-Type': file.mimeType,
          },
          body: buf,
        },
      );
      const upData: any = await up.json();
      const uri = upData.file?.uri;
      if (!uri) { results.push({ file: file.name, status: 'error', detail: upData }); continue; }

      const existing = await db.geminiFileCache.findFirst({ where: { drive_file_id: file.id } });
      const data = {
        gemini_file_uri: uri,
        mime_type: file.mimeType,
        last_uploaded: new Date().toISOString(),
      };
      if (existing) {
        await db.geminiFileCache.update({ where: { id: existing.id }, data });
      } else {
        await db.geminiFileCache.create({ data: { drive_file_id: file.id, file_name: file.name, ...data } });
      }
      results.push({ file: file.name, status: 'ok' });
    } catch (e: any) {
      results.push({ file: file.name, status: 'error', detail: e?.message });
    }
  }
  return { success: true, count: results.length, files: results };
});

/* ----- Game seeding (admin-only conveniences) ----- */

registerFn('seedGameQuestions', async ({ body }) => {
  const { questions } = body as any;
  if (!Array.isArray(questions)) throw new Error('questions array required');
  for (const q of questions) await db.gameQuestion.create({ data: q });
  return { created: questions.length };
});
registerFn('seedAdditionalGameQuestions', async ({ body }) => {
  const { questions } = body as any;
  if (!Array.isArray(questions)) throw new Error('questions array required');
  for (const q of questions) await db.gameQuestion.create({ data: q });
  return { created: questions.length };
});

/* ----- Treats / Newsletter / Drive (lighter stubs) ----- */

registerFn('getTreats', async () => {
  const treats = await db.timeTreat.findMany({ where: { is_active: true } });
  return { treats };
}, { public: true });

registerFn('selectTreat', async ({ body }) => {
  const { entryId, treatId, treatCost } = body as any;
  if (!entryId || !treatId || treatCost === undefined) throw new Error('Missing parameters');

  const entry = await db.queueEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error('Entry not found');

  const currentCredits = entry.time_credits_earned || 0;
  if (currentCredits < treatCost) throw new Error('Not enough credits');

  const remainingCredits = currentCredits - treatCost;
  await db.queueEntry.update({
    where: { id: entryId },
    data: {
      selected_treat_id: treatId,
      time_credits_spent: (entry.time_credits_spent || 0) + treatCost,
      time_credits_earned: remainingCredits,
    },
  });
  return { success: true, remainingCredits };
}, { public: true });

registerFn('sendWeeklyNewsletter', async ({ body }) => {
  const { to, subject, html } = body as any;
  return sendEmail({ to, subject: subject ?? 'TOP APOLLO - עדכון שבועי', html });
});

registerFn('updateProximityResponse', async ({ body }) => {
  const { entryId, response } = body as any;
  if (!entryId || !response) throw new Error('Missing entryId or response');
  const data: any = { proximity_response: response };
  if (response === 'no') {
    data.status = 'abandoned';
    data.timestamp_end = new Date().toISOString();
  }
  await db.queueEntry.update({ where: { id: entryId }, data });
  return { success: true };
}, { public: true });

/* ----- Restroom cleaning checks (staff-facing) ----- */

const todayStr = () => new Date().toISOString().slice(0, 10);

// Save the caller's Web Push subscription onto their Employee record so the
// hourly restroom reminder can reach them.
registerFn('enableStaffPush', async ({ body, user }) => {
  if (!user?.email) throw new Error('auth required');
  const { subscription } = body as any;
  if (!subscription) throw new Error('subscription required');
  const emp = await db.employee.findFirst({ where: { email: user.email } });
  if (!emp) throw new Error('employee_not_found');
  await db.employee.update({ where: { id: emp.id }, data: { push_subscription: subscription } });
  return { success: true };
});

// Record a restroom check (optional photo) by the logged-in employee.
registerFn('recordRestroomCheck', async ({ body, user }) => {
  const { photo_url, notes } = body as any;
  let emp: any = null;
  if (user?.email) emp = await db.employee.findFirst({ where: { email: user.email } });
  const check = await db.restroomCheck.create({
    data: {
      checked_by_id: emp?.id ?? null,
      checked_by_name: emp?.full_name ?? user?.email ?? 'צוות',
      checked_at: new Date().toISOString(),
      photo_url: photo_url ?? null,
      notes: notes ?? null,
      shift_date: todayStr(),
    },
  });
  return { check };
});

// Today's checks + whether the current round hour is already covered.
registerFn('getRestroomStatus', async () => {
  const checks = await db.restroomCheck.findMany({
    where: { shift_date: todayStr() },
    orderBy: { checked_at: 'desc' },
    take: 50,
  });
  const hourKey = new Date().toISOString().slice(0, 13); // yyyy-MM-ddTHH
  const currentHourCovered = checks.some((c: any) => (c.checked_at || '').slice(0, 13) === hourKey);
  return { checks, currentHourCovered };
});

registerFn('getRestroomSettings', async () => {
  const s = await db.restroomSettings.findFirst();
  return { settings: s ?? { enabled: true, target_positions: [] } };
});

registerFn('saveRestroomSettings', async ({ body }) => {
  const { enabled, target_positions } = body as any;
  const existing = await db.restroomSettings.findFirst();
  const data = {
    enabled: enabled ?? true,
    target_positions: Array.isArray(target_positions) ? target_positions : [],
  };
  const settings = existing
    ? await db.restroomSettings.update({ where: { id: existing.id }, data })
    : await db.restroomSettings.create({ data });
  return { settings };
});

// Hourly reminder: push to on-shift staff whose role/position is targeted.
// Called by the cron route (secret-guarded), not by end users.
export async function sendRestroomReminder() {
  const settings = await db.restroomSettings.findFirst();
  if (settings && settings.enabled === false) return { skipped: 'disabled' };
  const targets: string[] = Array.isArray(settings?.target_positions) ? settings.target_positions : [];

  const today = todayStr();
  const active = await db.shiftTracking.findMany({
    where: { status: 'active', date: { startsWith: today } },
  });
  if (!active.length) return { skipped: 'no_one_on_shift' };

  const ids = [...new Set(active.map((a: any) => a.employee_id).filter(Boolean))];
  const employees = await db.employee.findMany({ where: { id: { in: ids } } });

  const matches = (e: any) => {
    if (!targets.length) return true; // empty target ⇒ everyone on shift
    // positions are objects like { position_name } (or sometimes strings)
    const posNames: string[] = (Array.isArray(e.positions) ? e.positions : [])
      .map((p: any) => (typeof p === 'string' ? p : p?.position_name || p?.name))
      .filter(Boolean);
    return targets.includes(e.role) || posNames.some((p) => targets.includes(p));
  };

  const recipients = employees.filter((e: any) => matches(e) && e.push_subscription);
  if (!recipients.length) return { skipped: 'no_targeted_recipients', onShift: employees.length };

  const payload = JSON.stringify({
    title: '🚽 בדיקת שירותים',
    body: 'הגיעה השעה לבדוק את השירותים. סמנו בדיקה באפליקציה (אפשר עם תמונה).',
    url: '/RestroomCleaning',
  });

  let sent = 0;
  for (const e of recipients) {
    try {
      await webpush.sendNotification(e.push_subscription as any, payload);
      sent++;
    } catch (err: any) {
      // 404/410 ⇒ stale subscription; clear it so we stop trying.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.employee.update({ where: { id: e.id }, data: { push_subscription: null } }).catch(() => {});
      }
    }
  }
  return { sent, targeted: recipients.length };
}

/* ----- Google Drive image picker (Instagram) — uses the service account ----- */

// List image files + subfolders inside a Drive folder the service account can see.
registerFn('getDriveImages', async ({ body }) => {
  const folderId = (body as any)?.folder_id || 'root';
  const token = await driveAccessToken();

  const imgUrl =
    `https://www.googleapis.com/drive/v3/files?` +
    `q=${encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed=false`)}` +
    `&fields=${encodeURIComponent('files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,modifiedTime)')}` +
    `&pageSize=50&orderBy=modifiedTime desc`;
  const imgRes = await fetch(imgUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!imgRes.ok) throw new Error(`drive_images_${imgRes.status}: ${await imgRes.text()}`);
  const imgData: any = await imgRes.json();

  const folderUrl =
    `https://www.googleapis.com/drive/v3/files?` +
    `q=${encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}` +
    `&fields=${encodeURIComponent('files(id,name)')}&pageSize=20`;
  const folderRes = await fetch(folderUrl, { headers: { Authorization: `Bearer ${token}` } });
  const folderData: any = folderRes.ok ? await folderRes.json() : { files: [] };

  return { images: imgData.files || [], folders: folderData.files || [] };
});

// Download a Drive image and re-host it in our own storage; return the public URL.
registerFn('getDriveImageUrl', async ({ body }) => {
  const fileId = (body as any)?.file_id;
  if (!fileId) throw new Error('file_id required');
  const token = await driveAccessToken();
  const buf = await downloadDriveFile(fileId, token);
  const { url } = await uploadStreamToS3(`${fileId}.jpg`, 'image/jpeg', Readable.from(buf));
  return { url };
});

/* ----- Public reservation flow (no auth; never returns other customers' PII) ----- */

const RES_MAX_PER_SLOT = 36;
// Table holding duration per Dvir's policy:
//   2-5  guests → 120 min
//   6-10 guests → 135 min (2:15)
//  11-12 guests → 150 min (2:30)
//  13+   guests → not a public reservation — must go through EventsInquiry
const seatingDuration = (size: number) =>
  size >= 11 ? 150 : size >= 6 ? 135 : 120;
const PUBLIC_RESERVATION_MAX_PARTY = 12;
const toMin = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

// Public: restaurant reservation settings (config only — not PII).
registerFn('getReservationSettings', async () => {
  const s = await db.reservationSettings.findFirst();
  return s ?? null;
}, { public: true });

// Public: check capacity + find an available table. Returns aggregate counts
// and a single available table number — never any customer details.
// Reservation.date is a DateTime column — Prisma can't parse "2026-06-07" alone.
// Normalize a YYYY-MM-DD string into [startOfDay, nextDay) UTC Date pair so
// we can query for "any reservation on that calendar day" even if it was
// stored with a time component.
function dayRange(dateInput: string | Date) {
  const dateStr = typeof dateInput === 'string'
    ? dateInput.slice(0, 10)
    : new Date(dateInput).toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, next, dateStr };
}

// === Deposit policy ===================================================
// Pure rule engine — given (date, time, party_size, is_event), returns
// { required, amount_ils, reason, free_cancel_until_iso }. Owner edits the
// rules via /DepositSettings; this function reads them and applies.
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
async function computeDepositRequirement(params: {
  date: string; time: string; party_size: number; is_event?: boolean;
}) {
  const { date, time, party_size, is_event } = params;
  const settings: any = await (prisma as any).depositSettings.findFirst({ where: { singleton: true } }).catch(() => null);
  if (!settings || !settings.enabled) {
    return { required: false, amount_ils: 0, reason: 'מערכת פיקדון לא פעילה', free_cancel_until_iso: null };
  }
  const sz = Number(party_size) || 0;
  const eventFlag = !!is_event || sz >= 13;
  // Determine day-of-week from date.
  let dayName = 'sunday';
  try {
    const d = new Date(`${date}T12:00:00.000Z`);
    dayName = DAY_NAMES[d.getUTCDay()];
  } catch {}
  const weekendDays: string[] = Array.isArray(settings.required_weekend_days) && settings.required_weekend_days.length
    ? settings.required_weekend_days
    : ['thursday', 'friday', 'saturday'];
  const midweekMin: number = settings.required_midweek_min_party_size ?? 6;
  const smallThreshold: number = settings.small_party_threshold ?? 6;
  // Required logic
  let required = false;
  let reason = '';
  if (eventFlag) {
    required = true;
    reason = `אירוע (${sz}+ סועדים) — פיקדון נדרש בכל יום`;
  } else if (weekendDays.includes(dayName)) {
    required = true;
    reason = `הזמנה בסוף שבוע (${dayName}) — פיקדון נדרש`;
  } else if (sz >= midweekMin) {
    required = true;
    reason = `הזמנה אמצ"ש של ${sz} סועדים (סף ${midweekMin}) — פיקדון נדרש`;
  } else {
    return { required: false, amount_ils: 0, reason: 'לא נדרש פיקדון לתרחיש זה', free_cancel_until_iso: null };
  }
  // Amount
  let amount_ils = 0;
  if (eventFlag) {
    // 20% of event value — owner-defined per-event estimate; use ₪220 × guests as the default contract value.
    const pctValue = settings.event_pct ?? 20;
    const eventValue = sz * 220;
    amount_ils = Math.round((eventValue * pctValue) / 100);
  } else {
    const perGuest = settings.amount_per_guest_ils ?? 30;
    amount_ils = sz * perGuest;
  }
  // Free-cancel window
  const cancelHours = eventFlag
    ? (settings.free_cancel_hours_event ?? 24)
    : sz > smallThreshold
      ? (settings.free_cancel_hours_large ?? 6)
      : (settings.free_cancel_hours_small ?? 3);
  let free_cancel_until_iso: string | null = null;
  try {
    const [hh, mm] = String(time).split(':').map((s) => parseInt(s, 10));
    const reservationStart = new Date(`${date}T${String(hh).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00+03:00`);
    free_cancel_until_iso = new Date(reservationStart.getTime() - cancelHours * 3600 * 1000).toISOString();
  } catch {}
  return { required, amount_ils, reason, free_cancel_until_iso, cancel_hours: cancelHours };
}

// Public: check if a given reservation slot requires a deposit (for showing in the booking form).
registerFn('getDepositRequirement', async ({ body }) => {
  const b = (body || {}) as any;
  return await computeDepositRequirement({
    date: String(b.date || ''),
    time: String(b.time || ''),
    party_size: Number(b.party_size) || 0,
    is_event: !!b.is_event,
  });
}, { public: true });

// Admin: read DepositSettings, or seed with sensible defaults if missing.
registerFn('getDepositSettings', async () => {
  let settings: any = await (prisma as any).depositSettings.findFirst({ where: { singleton: true } }).catch(() => null);
  if (!settings) {
    settings = await (prisma as any).depositSettings.create({
      data: {
        singleton: true,
        required_weekend_days: ['thursday', 'friday', 'saturday'],
        required_midweek_min_party_size: 6,
        amount_per_guest_ils: 30,
        event_pct: 20,
        free_cancel_hours_small: 3,
        free_cancel_hours_large: 6,
        free_cancel_hours_event: 24,
        small_party_threshold: 6,
        enabled: false,
      },
    });
  }
  return settings;
});

registerFn('updateDepositSettings', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const allowed = [
    'required_weekend_days', 'required_midweek_min_party_size',
    'amount_per_guest_ils', 'event_pct',
    'free_cancel_hours_small', 'free_cancel_hours_large', 'free_cancel_hours_event',
    'small_party_threshold', 'provider', 'enabled',
  ];
  const data: any = {};
  for (const k of allowed) if ((body as any)?.[k] !== undefined) data[k] = (body as any)[k];
  let settings: any = await (prisma as any).depositSettings.findFirst({ where: { singleton: true } }).catch(() => null);
  if (!settings) {
    settings = await (prisma as any).depositSettings.create({ data: { singleton: true, ...data } });
  } else {
    settings = await (prisma as any).depositSettings.update({ where: { id: settings.id }, data });
  }
  return settings;
});

// Hostess: manually capture (charge no-show) or release (refund/cancel) a deposit hold.
// PROVIDER-SPECIFIC WIRING goes here once we know which gateway (MAX Online / Tranzila / PayPlus).
// For now these only update DB state and log; real provider call is a TODO.
registerFn('captureDeposit', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const { reservation_id } = body as any;
  const r: any = await (prisma as any).reservation.findUnique({ where: { id: String(reservation_id) } });
  if (!r) throw new Error('not_found');
  if (r.deposit_status !== 'authorized') return { success: false, reason: 'not_authorized', currentStatus: r.deposit_status };
  // TODO: call provider API to capture
  await (prisma as any).reservation.update({
    where: { id: r.id },
    data: { deposit_status: 'captured', deposit_charged_at: new Date(), deposit_charge_amount: r.deposit_amount },
  });
  return { success: true, captured_ils: r.deposit_amount };
});

registerFn('releaseDeposit', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const { reservation_id } = body as any;
  const r: any = await (prisma as any).reservation.findUnique({ where: { id: String(reservation_id) } });
  if (!r) throw new Error('not_found');
  if (r.deposit_status !== 'authorized') return { success: false, reason: 'not_authorized', currentStatus: r.deposit_status };
  // TODO: call provider API to release
  await (prisma as any).reservation.update({
    where: { id: r.id },
    data: { deposit_status: 'released', deposit_released_at: new Date() },
  });
  return { success: true };
});

registerFn('searchReservationTable', async ({ body }) => {
  const { date, time, party_size } = body as any;
  if (!date || !time || !party_size) throw new Error('date, time, party_size required');
  const size = parseInt(party_size);
  if (size > PUBLIC_RESERVATION_MAX_PARTY) {
    return { canAccommodate: false, reason: 'too_large_use_events', currentCapacity: 0, availableCapacity: 0, table: null };
  }
  const startMin = toMin(time);
  const endMin = startMin + seatingDuration(size);

  const { start: dayStart, next: dayNext } = dayRange(date);
  const reservations = await db.reservation.findMany({
    where: { date: { gte: dayStart, lt: dayNext } },
  });
  const active = (r: any) => r.status !== 'cancelled' && r.status !== 'no_show';

  // Capacity within the 15-min slot
  const slotCount = reservations
    .filter((r: any) => active(r) && r.time && toMin(r.time) >= startMin && toMin(r.time) < startMin + 15)
    .reduce((sum: number, r: any) => sum + (r.party_size || 0), 0);
  const canAccommodate = slotCount + size <= RES_MAX_PER_SLOT;

  let table: any = null;
  if (canAccommodate) {
    const layout = await db.seatingLayout.findFirst();
    const tables: any[] = layout?.tables ?? [];
    const activeSessions = await db.tableSession.findMany({ where: { status: 'active' } });
    const occupied = new Set(activeSessions.map((s: any) => s.table_number));

    const free = tables.filter((t: any) => {
      if (occupied.has(t.table_number)) return false;
      const conflicts = reservations.filter((r: any) => {
        if (!active(r) || !r.assigned_table || !r.time) return false;
        const at = Array.isArray(r.assigned_table) ? r.assigned_table : [r.assigned_table];
        if (!at.includes(t.table_number)) return false;
        const rs = toMin(r.time);
        const re = rs + seatingDuration(r.party_size || 2);
        return startMin < re && endMin > rs;
      });
      return conflicts.length === 0;
    });
    // 1) Owner-saved priority list (singles AND combos for this exact party size).
    //    Try them top-to-bottom; first one whose ALL tables are free wins.
    const combos: any[] = Array.isArray((layout as any)?.combos)
      ? (layout!.combos as any[]).filter((c) => Number(c.party_size) === size)
      : [];
    combos.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    const freeSet = new Set(free.map((t: any) => String(t.table_number)));
    for (const c of combos) {
      const tableIds: string[] = Array.isArray(c.tables) ? c.tables.map(String) : [];
      if (tableIds.length === 0) continue;
      if (tableIds.every((id) => freeSet.has(id))) {
        table = { table_number: tableIds[0], table_numbers: tableIds };
        break;
      }
    }
    // 2) Fallback — if owner didn't rank anything (or all ranked options taken), take any single table whose capacity fits.
    if (!table) {
      const fit = free.find((t: any) => t.min_capacity <= size && t.max_capacity >= size);
      if (fit) table = { table_number: fit.table_number, table_numbers: [fit.table_number] };
    }
  }

  return {
    canAccommodate,
    currentCapacity: slotCount,
    availableCapacity: Math.max(0, RES_MAX_PER_SLOT - slotCount),
    table,
  };
}, { public: true });

// Public: create a reservation. Re-validates server-side, upserts the customer
// by phone, returns only a confirmation id.
// Forward-compat: add source columns to existing Reservation tables
let reservationSourceCols = false;
async function ensureReservationSourceCols() {
  if (reservationSourceCols) return;
  for (const col of ['source', 'campaign', 'medium', 'landing_url', 'referrer', 'hostess_flag', 'tracking_token', 'customer_email', 'cancellation_reason']) {
    await (prisma as any).$executeRawUnsafe(
      `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`
    ).catch(() => {});
  }
  // Timestamp + integer columns
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);`
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_charged_at" TIMESTAMP(3);`
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_charge_amount" INTEGER;`
  ).catch(() => {});
  // Unique index for tracking_token (best-effort)
  await (prisma as any).$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_tracking_token_uq" ON "Reservation"("tracking_token") WHERE "tracking_token" IS NOT NULL;`
  ).catch(() => {});
  // Standby waitlist columns (added 2026-06)
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "is_standby" BOOLEAN NOT NULL DEFAULT FALSE;`
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "standby_requested_time" TEXT;`
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "standby_promoted_at" TIMESTAMP(3);`
  ).catch(() => {});
  // T+24h survey ping (added 2026-06)
  await (prisma as any).$executeRawUnsafe(
    `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "survey_sent_at" TIMESTAMP(3);`
  ).catch(() => {});
  reservationSourceCols = true;
}

// 28-char URL-safe random token for customer-facing reservation links.
function makeTrackingToken() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 28; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Normalize a UTM source or referrer hostname into one of our known channels.
function classifyReservationSource(opts: { utm_source?: string; referrer?: string; landing_url?: string }) {
  const u = (opts.utm_source || '').toLowerCase().trim();
  if (u) {
    if (/(instagram|ig)/.test(u)) return 'instagram';
    if (/tiktok/.test(u)) return 'tiktok';
    if (/(facebook|fb|meta)/.test(u)) return 'facebook';
    if (/(google|adwords|gads)/.test(u)) return 'google';
    if (/whats?app|wa\b/.test(u)) return 'whatsapp';
    if (/(qr|menu)/.test(u)) return 'qr';
    if (/(sms|text)/.test(u)) return 'sms';
    if (/email/.test(u)) return 'email';
    return u;  // unknown but explicit — preserve as-is
  }
  const r = (opts.referrer || '').toLowerCase();
  if (r.includes('instagram.com')) return 'instagram';
  if (r.includes('tiktok.com'))    return 'tiktok';
  if (r.includes('facebook.com'))  return 'facebook';
  if (r.includes('google.'))       return 'google';
  if (r.includes('whatsapp.com') || r.includes('wa.me')) return 'whatsapp';
  // Internal short-link → QR-printed: came from /r alias on our own domain
  if (r.includes('topalena.com') && opts.landing_url?.includes('/r')) return 'qr';
  if (!r) return 'direct';
  return 'other';
}

registerFn('createPublicReservation', async ({ body }) => {
  await ensureReservationSourceCols();
  const brand = await getBrandName();
  const {
    customer_name, customer_phone, date, time, party_size,
    special_requests, special_occasion,
    utm_source, utm_campaign, utm_medium, landing_url, referrer,
  } = body as any;
  if (!customer_name || !customer_phone || !date || !time || !party_size) {
    throw new Error('missing_required_fields');
  }
  // Time-in-past guard: reservation must be at least 15 minutes from now (Israel time).
  // DST-safe: read current IL wall-clock via Intl.DateTimeFormat instead of hardcoded +3 (which is wrong in winter UTC+2).
  try {
    const dateStr = String(date).slice(0, 10);
    const [hh, mm] = String(time).split(':').map((s) => parseInt(s, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) throw new Error('invalid_time_format');
    // Get the current wall clock in Asia/Jerusalem as 'YYYY-MM-DD HH:MM'.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const ilNowDateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const ilNowMin = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    const targetMin = hh * 60 + mm;
    // Build sortable signatures: same date → compare minutes; different date → compare strings
    const sameDay = dateStr === ilNowDateStr;
    const isPast = sameDay
      ? targetMin - ilNowMin < 15
      : dateStr < ilNowDateStr;
    if (isPast) {
      throw Object.assign(new Error('זמן ההזמנה כבר עבר. בחר שעה לפחות 15 דקות קדימה.'), { code: 'time_in_past' });
    }
  } catch (e: any) {
    if (e?.code === 'time_in_past') throw e;
    // For format errors, let the regular flow handle it (don't block on parse).
  }
  const size = parseInt(party_size);
  if (size > PUBLIC_RESERVATION_MAX_PARTY) {
    return { success: false, reason: 'too_large_use_events' };
  }
  const source = classifyReservationSource({ utm_source, referrer, landing_url });

  const acceptStandby = Boolean((body as any)?.accept_standby);

  // Re-find a table server-side (don't trust client).
  const avail: any = await (functionHandlers['searchReservationTable'] as any)({
    body: { date, time, party_size: size }, user: null, req: undefined,
  });

  // Slot full path.
  // If the guest opted into the standby waitlist, create a standby reservation
  // (no assigned_table) — restaurant will call back if a real table opens.
  // Otherwise return alternative slots so the page can offer them.
  if (!avail.canAccommodate || !avail.table) {
    if (acceptStandby) {
      // Pass through to standby creation below.
    } else {
      const alternatives = await findNearbyAvailableSlots(date, time, size);
      return { success: false, reason: 'no_availability', alternatives };
    }
  }

  // Mark this as standby if we got here from the slot-full + accept_standby branch.
  const isStandby = !(avail.canAccommodate && avail.table);

  const endMin = toMin(time) + seatingDuration(size);
  const end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

  const { start: bookingDate } = dayRange(date);
  const tracking_token = makeTrackingToken();
  const customer_email = (body as any)?.customer_email
    ? String((body as any).customer_email).slice(0, 200).trim() : null;
  const marketing_consent = !!(body as any)?.marketing_consent;
  // Compute deposit requirement (does NOT block booking yet — provider integration tomorrow).
  const depositInfo = await computeDepositRequirement({
    date, time, party_size: size, is_event: false,
  }).catch(() => ({ required: false, amount_ils: 0 }));
  const reservation = await db.reservation.create({
    data: {
      customer_name: String(customer_name).trim(),
      customer_phone: String(customer_phone).trim(),
      date: bookingDate, time,
      party_size: size,
      // Standby reservations sit in 'pending' until promoted; confirmed
      // ones are real bookings with an assigned table.
      status: isStandby ? 'pending' : 'confirmed',
      is_standby: isStandby,
      standby_requested_time: isStandby ? time : null,
      special_requests: special_requests || null,
      special_occasion: special_occasion || null,
      reservation_end_time: end_time,
      assigned_table: isStandby ? null : (Array.isArray(avail.table?.table_numbers) ? avail.table.table_numbers : [avail.table.table_number]),
      source,
      campaign: utm_campaign ? String(utm_campaign).slice(0, 80) : null,
      medium: utm_medium ? String(utm_medium).slice(0, 40) : null,
      landing_url: landing_url ? String(landing_url).slice(0, 500) : null,
      referrer: referrer ? String(referrer).slice(0, 500) : null,
      tracking_token,
      customer_email,
      deposit_required: !!depositInfo.required,
      deposit_amount: depositInfo.required ? depositInfo.amount_ils : null,
      deposit_status: depositInfo.required ? 'pending' : null,
      marketing_consent,
      marketing_consent_at: marketing_consent ? new Date() : null,
    } as any,
  });
  fireTriggers('Reservation', 'created', reservation).catch(() => {});

  // Customer-facing confirmation messages
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
  const trackUrl = `${baseUrl}/ReservationView?token=${tracking_token}`;
  const dateStr = bookingDate.toISOString().slice(0, 10).split('-').reverse().join('/');
  // Cancellation copy from deposit settings (e.g. 'ביטול חופשי עד 3 שעות לפני').
  const cancelHours: number | undefined = (depositInfo as any)?.cancel_hours;
  const cancelLine = cancelHours
    ? `ביטול חופשי עד ${cancelHours} שעות לפני ההזמנה`
    : `אפשר לבטל ללא חיוב עד שעתיים לפני המועד`;
  const restaurantPhone = process.env.RESTAURANT_PHONE || '03-6228055 שלוחה 3';
  const smsBody = isStandby
    ? [
        `שלום ${customer_name} 👋`,
        ``,
        `נרשמת לרשימת המתנה ב${brand} 🟡`,
        `📅 ${dateStr} בשעה ${time} (השעה שביקשת)`,
        `👥 ${size} סועדים`,
        ``,
        `השולחן מלא ברגע זה — אם יתפנה מקום נצור איתך קשר מיד.`,
        `אין הזמנה מאושרת עד שנחזור אליך.`,
        ``,
        `📋 לבדיקת סטטוס: ${trackUrl}`,
      ].join('\n')
    : [
        `שלום ${customer_name} 👋`,
        ``,
        `ההזמנה שלך ב${brand} אושרה ✅`,
        `📅 ${dateStr} בשעה ${time}`,
        `👥 ${size} סועדים`,
        `📍 רוטשילד 104, ראשון לציון`,
        ``,
        `🅿️ חניה`,
        `חניון מול מרכז בן גוריון (חינם מ-17:00 ובסופ"ש)`,
        ``,
        `⏰ ביטול`,
        cancelLine,
        ``,
        `💬 שינויים / שאלות?`,
        `${restaurantPhone} (במסעדה)`,
        ``,
        `נשמח לראותכם ✨`,
        `צוות ${brand}`,
        ``,
        `📋 צפיה בהזמנה: ${trackUrl}`,
      ].join('\n');
  // SMS
  sendSms(String(customer_phone).trim(), smsBody).catch((e) =>
    console.warn('[reservation] sms failed', e?.message)
  );
  // WhatsApp — use the approved template (booking_confirmation_he, SID HX42...).
  // Business-initiated requires a Meta-approved template; passing variables that
  // match the {{1}}..{{6}} placeholders in the template body.
  const waTemplateSid = process.env.TWILIO_WA_TEMPLATE_SID || 'HX42bd4ae96abaa7312aeeae1af997c3da';
  if (!isStandby) {
    sendWhatsAppTemplate(
      String(customer_phone).trim(),
      waTemplateSid,
      {
        '1': customer_name,
        '2': dateStr,
        '3': time,
        '4': String(size),
        '5': trackUrl,
        '6': cancelLine,
      },
    ).catch((e) => {
      console.warn('[reservation] whatsapp template failed, falling back to free-form', e?.message);
      // Fallback to free-form (only works if customer pinged us in last 24h; otherwise quietly skipped)
      sendWhatsApp(String(customer_phone).trim(), smsBody).catch(() => {});
    });
  } else {
    // Standby has no approved template yet — try free-form as best-effort.
    sendWhatsApp(String(customer_phone).trim(), smsBody).catch((e) =>
      console.warn('[reservation] whatsapp standby failed', e?.message)
    );
  }
  // Email — best-effort if address provided
  if (customer_email) {
    const html = `
      <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;padding:24px;background:#fafafa;border-radius:12px;color:#1f1b17">
        <p style="font-size:18px;margin:0 0 4px">שלום ${customer_name} 👋</p>
        <p style="margin:0 0 24px;color:#a04a2e;font-size:20px;font-weight:bold">ההזמנה שלך ב${brand} אושרה ✅</p>

        <div style="background:#fff;border:1px solid #e5d9c4;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:4px 0">📅 <b>${dateStr}</b> בשעה <b>${time}</b></p>
          <p style="margin:4px 0">👥 <b>${size} סועדים</b></p>
          <p style="margin:4px 0">📍 רוטשילד 104, ראשון לציון</p>
        </div>

        <p style="margin:16px 0 4px;font-weight:bold">🅿️ חניה</p>
        <p style="margin:0 0 16px">חניון מול מרכז בן גוריון (חינם מ-17:00 ובסופ"ש)</p>

        <p style="margin:16px 0 4px;font-weight:bold">⏰ ביטול</p>
        <p style="margin:0 0 16px">${cancelLine}</p>

        <p style="margin:16px 0 4px;font-weight:bold">💬 שינויים / שאלות?</p>
        <p style="margin:0 0 16px">${restaurantPhone} (במסעדה)</p>

        <p style="margin:24px 0 12px;text-align:center;color:#a04a2e;font-size:16px">נשמח לראותכם ✨</p>
        <p style="margin:0 0 16px;text-align:center;color:#666">צוות ${brand}</p>

        <p style="margin:24px 0 0;text-align:center">
          <a href="${trackUrl}" style="background:#a04a2e;color:#F4ECD8;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">📋 צפיה / ביטול הזמנה</a>
        </p>
      </div>
    `;
    sendEmail({
      to: customer_email,
      subject: `אישור הזמנה - ${dateStr} בשעה ${time} - ${brand}`,
      html,
    }).catch((e) => console.warn('[reservation] email failed', e?.message));
  }

  // Upsert the customer club record by phone.
  // Marketing consent: only SET it (never CLEAR) — once a customer opted in,
  // only an explicit unsubscribe should turn it off.
  try {
    const phone = String(customer_phone).trim();
    const existing = await db.customer.findFirst({ where: { phone } });
    // Extract MM-DD from occasion_date if guest declared birthday/anniversary
    // celebration. Stored on Customer so future marketing campaigns can match.
    const occasionDate: string | null = (body as any).occasion_date || null;
    const occasionMmdd = occasionDate && /^\d{4}-\d{2}-\d{2}$/.test(occasionDate)
      ? occasionDate.slice(5)
      : null;
    const isBirthday = (body as any).special_occasion === 'birthday' && occasionMmdd;
    const isAnniversary = (body as any).special_occasion === 'anniversary' && occasionMmdd;

    if (existing) {
      const updateData: any = {
        last_visit: bookingDate,
        visit_count: (existing.visit_count ?? 0) + 1,
        name: existing.name ?? customer_name,
      };
      // If the customer just opted in AND wasn't opted in before → record it.
      if (marketing_consent && !(existing as any).marketing_consent) {
        updateData.marketing_consent = true;
        updateData.marketing_consent_at = new Date();
      }
      // Only set birthday/anniversary if we got one AND the customer doesn't
      // already have one (don't overwrite owner-set dates from CustomerClub).
      if (isBirthday && !(existing as any).birthday_mmdd) updateData.birthday_mmdd = occasionMmdd;
      if (isAnniversary && !(existing as any).anniversary_mmdd) {
        updateData.anniversary_mmdd = occasionMmdd;
        updateData.anniversary_label = 'יום נישואין';
      }
      await db.customer.update({ where: { id: existing.id }, data: updateData });

      // CAMPAIGN ATTRIBUTION — if this customer received a campaign in the
      // last 7 days and the recipient row isn't yet linked to a reservation,
      // link this reservation. Powers the 'who converted' analytics.
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
        const recentRecipient = await db.campaignRecipient.findFirst({
          where: {
            customer_id: existing.id,
            converted_reservation_id: null,
            status: { in: ['sent', 'delivered', 'read'] },
            created_at: { gte: sevenDaysAgo },
          },
          orderBy: { created_at: 'desc' },
        });
        if (recentRecipient && reservation?.id) {
          await db.campaignRecipient.update({
            where: { id: recentRecipient.id },
            data: { converted_reservation_id: reservation.id, converted_at: new Date() },
          });
          await db.campaignSend.update({
            where: { id: recentRecipient.campaign_send_id },
            data: { converted_count: { increment: 1 } },
          }).catch(() => {});
        }
      } catch (e: any) {
        console.warn('[attribution] failed:', e?.message);
      }
    } else {
      await db.customer.create({ data: {
        phone, name: customer_name, visit_count: 1, last_visit: bookingDate,
        marketing_consent,
        marketing_consent_at: marketing_consent ? new Date() : null,
        ...(isBirthday ? { birthday_mmdd: occasionMmdd } : {}),
        ...(isAnniversary ? { anniversary_mmdd: occasionMmdd, anniversary_label: 'יום נישואין' } : {}),
      } as any });
    }
  } catch (e) {
    console.warn('[createPublicReservation] customer upsert failed', e);
  }

  return {
    success: true,
    reservation_id: reservation.id,
    table_number: isStandby ? null : avail.table.table_number,
    is_standby: isStandby,
  };
}, { public: true });

// Search for open reservation slots near a requested time on the same day.
// Used when the chosen slot is full so the page can offer alternatives
// without making the user click around to find them.
async function findNearbyAvailableSlots(
  dateInput: string,
  time: string,
  partySize: number,
): Promise<Array<{ time: string; offset_min: number }>> {
  const base = toMin(time);
  // Look at ±15, ±30, ±45, ±60 minutes (rounded to 15-min grid).
  const offsets = [-60, -45, -30, -15, 15, 30, 45, 60];
  const candidates: Array<{ time: string; offset_min: number }> = [];
  for (const off of offsets) {
    const m = base + off;
    if (m < 0 || m > 23 * 60 + 45) continue;
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const t = `${hh}:${mm}`;
    try {
      const r: any = await (functionHandlers['searchReservationTable'] as any)({
        body: { date: dateInput, time: t, party_size: partySize }, user: null, req: undefined,
      });
      if (r?.canAccommodate && r?.table) {
        candidates.push({ time: t, offset_min: off });
        if (candidates.length >= 3) break; // 3 is enough — keep page calm
      }
    } catch { /* swallow per-slot errors */ }
  }
  // Sort by closeness to requested time
  return candidates.sort((a, b) => Math.abs(a.offset_min) - Math.abs(b.offset_min));
}

// Admin: promote a standby reservation to a real confirmed reservation.
// Looks for an open table at the requested time (or accepts a new time),
// flips is_standby off, assigns a table, and pings the customer.
registerFn('promoteStandbyReservation', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const brand = await getBrandName();
  const { reservation_id, new_time } = body as any;
  if (!reservation_id) throw new Error('reservation_id required');
  const r: any = await db.reservation.findUnique({ where: { id: String(reservation_id) } });
  if (!r) throw new Error('not_found');
  if (!r.is_standby) return { success: false, reason: 'not_a_standby' };

  const timeToUse: string = new_time && /^\d{2}:\d{2}$/.test(String(new_time)) ? String(new_time) : r.time;
  const dateInput = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);

  const avail: any = await (functionHandlers['searchReservationTable'] as any)({
    body: { date: dateInput, time: timeToUse, party_size: r.party_size }, user: null, req: undefined,
  });
  if (!avail?.canAccommodate || !avail?.table) {
    return { success: false, reason: 'still_full' };
  }

  const updated = await db.reservation.update({
    where: { id: r.id },
    data: {
      is_standby: false,
      status: 'confirmed',
      time: timeToUse,
      assigned_table: Array.isArray(avail.table?.table_numbers) ? avail.table.table_numbers : [avail.table.table_number],
      standby_promoted_at: new Date(),
    } as any,
  });

  // Notify the customer
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
  const trackUrl = `${baseUrl}/ReservationView?token=${r.tracking_token}`;
  const dateStr = (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0, 10).split('-').reverse().join('/');
  const msg = [
    `שלום ${r.customer_name}!`,
    `שולחן התפנה ב-${brand} 🎉`,
    `📅 ${dateStr} · 🕐 ${timeToUse}`,
    `👥 ${r.party_size} סועדים`,
    `📍 רוטשילד 104, ראשון לציון`,
    ``,
    `ההזמנה שלך אושרה. נשמח לראותך!`,
    `🔗 ${trackUrl}`,
  ].join('\n');
  if (r.customer_phone) {
    sendSms(String(r.customer_phone), msg).catch(() => {});
    sendWhatsApp(String(r.customer_phone), msg).catch(() => {});
  }
  return { success: true, reservation: updated };
});

// Admin: list standby reservations (queue view).
registerFn('listStandbyReservations', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const { start } = dayRange(new Date());
  return await db.reservation.findMany({
    where: { is_standby: true, status: { not: 'cancelled' }, date: { gte: start } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, customer_name: true, customer_phone: true,
      date: true, time: true, party_size: true,
      special_occasion: true, special_requests: true,
      standby_requested_time: true, createdAt: true,
    } as any,
  });
});

// ── User role / department manager (admin only) ──────────────────────────────
// Set a user's system role and/or managed_department by email. If the User row
// doesn't exist yet (the employee hasn't logged in for the first time), create
// a stub so the values stick when they do log in.
registerFn('setUserRoleAndDepartment', async ({ body, user }) => {
  if ((user as any)?.role !== 'admin') throw new Error('admin only');
  const { email, role, managed_department } = body as any;
  if (!email) throw new Error('email required');
  const normalizedEmail = String(email).toLowerCase();

  const data: any = {};
  if (role !== undefined) data.role = role;
  if (managed_department !== undefined) data.managed_department = managed_department || null;
  if (!Object.keys(data).length) throw new Error('nothing to update');

  // Tolerate the schema not being pushed yet (CLAUDE.md §4.7) — strip the new
  // field and retry once.
  const tryUpdate = async (payload: any) => {
    try {
      return await db.user.update({ where: { email: normalizedEmail }, data: payload });
    } catch (e: any) {
      if (/Record to update not found|RecordNotFound|NotFound/i.test(String(e?.message))) {
        return await db.user.create({
          data: { email: normalizedEmail, role: payload.role || 'user', ...(payload.managed_department !== undefined ? { managed_department: payload.managed_department } : {}) },
        });
      }
      throw e;
    }
  };

  try {
    return await tryUpdate(data);
  } catch (e: any) {
    if (/unknown (arg|column)|managed_department/i.test(String(e?.message))) {
      const { managed_department: _drop, ...without } = data;
      if (Object.keys(without).length) return await tryUpdate(without);
      throw new Error('managed_department column not yet available — wait ~1 minute and retry');
    }
    throw e;
  }
});

// ── Popup system ─────────────────────────────────────────────────────────────

// Admin/manager/owner only — anything else throws.
function assertPopupAdmin(user: any) {
  const role = user?.role;
  if (role !== 'admin' && role !== 'manager' && role !== 'owner') {
    throw new Error('אין הרשאה לנהל פופ-אפים');
  }
}

// Returns all popups the current user should see right now.
// The frontend handles "seen" filtering by passing viewed popup IDs.
registerFn('getActivePopups', async ({ user }) => {
  if (!user) return [];
  const now = new Date();
  const nowISO = now.toISOString();
  const dayOfWeek = now.getDay(); // 0=Sun
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // The Popup table may not exist yet immediately after a deploy that adds it,
  // before `prisma db push` has run inside the container. Fail silently so the
  // app keeps working — the next poll (60s later) will succeed.
  let all: any[];
  try {
    if (!db.popup) return [];
    all = await db.popup.findMany({
      where: { is_active: true },
      include: { views: { where: { user_id: user.id as string } } },
    });
  } catch (e: any) {
    if (/does not exist|relation .* does not exist|Unknown arg|Cannot read properties of undefined/i.test(String(e?.message))) {
      return [];
    }
    throw e;
  }

  const result: any[] = [];
  for (const popup of all) {
    // Schedule filter
    const { schedule_type, scheduled_at, daily_time, weekly_day, weekly_time } = popup;
    if (schedule_type === 'once') {
      if (!scheduled_at) continue;
      const target = new Date(scheduled_at);
      // Show within a 24h window after the scheduled time
      if (now < target || now.getTime() - target.getTime() > 86400_000) continue;
    } else if (schedule_type === 'daily') {
      if (!daily_time || timeStr < daily_time || timeStr > addMinutes(daily_time, 59)) continue;
    } else if (schedule_type === 'weekly') {
      if (weekly_day !== dayOfWeek) continue;
      if (!weekly_time || timeStr < weekly_time || timeStr > addMinutes(weekly_time, 59)) continue;
    }
    // "immediate" passes through

    // Audience filter
    const { target_audience, target_roles, target_user_ids, target_page } = popup;
    if (target_audience === 'roles' && target_roles) {
      const roles: string[] = JSON.parse(target_roles);
      if (!roles.includes((user as any).role)) continue;
    } else if (target_audience === 'users' && target_user_ids) {
      const ids: string[] = JSON.parse(target_user_ids);
      if (!ids.includes(user.id as string)) continue;
    }
    // "page" filtering is done client-side (server doesn't know current route)

    // Seen-behavior filter
    const view = popup.views[0];
    if (view) {
      if (popup.seen_behavior === 'once') continue;
      if (popup.seen_behavior === 'snooze' && view.snoozed_until && nowISO < view.snoozed_until) continue;
    }

    const { views, ...rest } = popup;
    result.push({ ...rest, _viewed: !!view });
  }

  // Runtime brand substitution — popups seeded from Alena's schema still
  // reference 'עלינא' in title/message. Replace at read time.
  if (result.length) {
    const pbrand = await getBrandName();
    for (const p of result) {
      if (p.title) p.title = String(p.title).replaceAll('עלינא', pbrand);
      if (p.message) p.message = String(p.message).replaceAll('עלינא', pbrand);
    }
  }

  return result;
});

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Mark a popup as viewed / snoozed for the current user.
registerFn('dismissPopup', async ({ body, user }) => {
  const { popup_id, snooze_minutes } = body as any;
  if (!popup_id) throw new Error('popup_id required');

  const snooze_until = snooze_minutes
    ? new Date(Date.now() + snooze_minutes * 60_000).toISOString()
    : null;

  const uid = (user as any)?.id as string;
  if (!uid) throw new Error('not authenticated');
  await db.popupView.upsert({
    where: { popup_id_user_id: { popup_id, user_id: uid } },
    create: { popup_id, user_id: uid, viewed_at: new Date().toISOString(), snoozed_until: snooze_until },
    update: { viewed_at: new Date().toISOString(), snoozed_until: snooze_until },
  });

  return { ok: true };
});

// Admin: create popup
registerFn('createPopup', async ({ body, user }) => {
  assertPopupAdmin(user);
  const data = body as any;
  const popup = await db.popup.create({
    data: {
      ...data,
      created_by: (user as any)?.id ?? null,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    },
  });
  return popup;
});

// Admin: update popup
registerFn('updatePopup', async ({ body, user }) => {
  assertPopupAdmin(user);
  const { id, ...data } = body as any;
  if (!id) throw new Error('id required');
  const popup = await db.popup.update({
    where: { id },
    data: { ...data, updated_date: new Date().toISOString() },
  });
  return popup;
});

// Admin: delete popup
registerFn('deletePopup', async ({ body, user }) => {
  assertPopupAdmin(user);
  const { id } = body as any;
  if (!id) throw new Error('id required');
  await db.popup.delete({ where: { id } });
  return { ok: true };
});

// Admin: list all popups with view counts
registerFn('listPopups', async ({ user }) => {
  assertPopupAdmin(user);
  const popups = await db.popup.findMany({
    orderBy: { created_date: 'desc' },
    include: { _count: { select: { views: true } } },
  });
  return popups;
});

// ── Alina CEO Agent ecosystem (Phase A: infrastructure) ─────────────────────
// See memory/project_alina_ceo_agent.md for the locked decisions.

function assertCeoAdmin(user: any) {
  const role = user?.role;
  if (role !== 'admin' && role !== 'owner') {
    throw new Error('No permission for CEO Agent management');
  }
}

const AGENT_TREE: Array<{ name: string; display_name: string; role: string; parent: string | null }> = [
  { name: 'CEO',              display_name: 'מנכל הסוכן',          role: 'executive',     parent: null },
  { name: 'CFO',              display_name: 'סוכן CFO',            role: 'executive',     parent: 'CEO' },
  { name: 'CRISIS',           display_name: 'סוכן חירום',           role: 'executive',     parent: 'CEO' },

  { name: 'VP_MARKETING',     display_name: 'VP שיווק',            role: 'vp',            parent: 'CEO' },
  { name: 'DESIGNER',         display_name: 'מעצב',                role: 'campaign_crew', parent: 'VP_MARKETING' },
  { name: 'CREATIVE',         display_name: 'קופירייטר',           role: 'campaign_crew', parent: 'VP_MARKETING' },
  { name: 'AUDIENCE_ROUTER',  display_name: 'נתב קהלים',           role: 'campaign_crew', parent: 'VP_MARKETING' },
  { name: 'CAMPAIGN_BUILDER', display_name: 'בונה קמפיינים',       role: 'campaign_crew', parent: 'VP_MARKETING' },
  { name: 'OPTIMIZER',        display_name: 'מאופטם קמפיינים',     role: 'campaign_crew', parent: 'VP_MARKETING' },
  { name: 'CONTENT_CALENDAR', display_name: 'יומן תוכן',           role: 'support',       parent: 'VP_MARKETING' },
  { name: 'INFLUENCERS',      display_name: 'אינפלואנסרים',        role: 'support',       parent: 'VP_MARKETING' },
  { name: 'COMMUNITY',        display_name: 'קהילה',               role: 'support',       parent: 'VP_MARKETING' },
  { name: 'SEO_GBP',          display_name: 'SEO ו-Google Business', role: 'support',     parent: 'VP_MARKETING' },
  { name: 'CUSTOMER_CLUB',    display_name: 'מועדון לקוחות',       role: 'support',       parent: 'VP_MARKETING' },
  { name: 'SALES_CLOSER_EVENTS', display_name: 'סוגר אירועים',     role: 'support',       parent: 'VP_MARKETING' },
  { name: 'PR_REPUTATION',    display_name: 'יחסי ציבור ומוניטין', role: 'support',       parent: 'VP_MARKETING' },
  { name: 'TREND_SCANNER',    display_name: 'סורק טרנדים',         role: 'support',       parent: 'VP_MARKETING' },
  { name: 'INSIGHTS',         display_name: 'תובנות שיווק',        role: 'support',       parent: 'VP_MARKETING' },

  { name: 'VP_OPERATIONS',    display_name: 'VP תפעול',            role: 'vp',            parent: 'CEO' },
  { name: 'INVENTORY',        display_name: 'מלאי',                role: 'operations',    parent: 'VP_OPERATIONS' },
  { name: 'KITCHEN',          display_name: 'מטבח',                role: 'operations',    parent: 'VP_OPERATIONS' },
  { name: 'SUPPLIERS',        display_name: 'ספקים',               role: 'operations',    parent: 'VP_OPERATIONS' },
  { name: 'SCHEDULING',       display_name: 'סידור עבודה',         role: 'operations',    parent: 'VP_OPERATIONS' },
  { name: 'GUEST_OPS',        display_name: 'חוויית אורח',         role: 'operations',    parent: 'VP_OPERATIONS' },
  { name: 'POS_HEALTH',       display_name: 'תקינות קופה (Beecom)', role: 'operations',   parent: 'VP_OPERATIONS' },
];

// One-time seed: ensures every agent in AGENT_TREE exists. Idempotent.
registerFn('seedDefaultAgents', async ({ user }) => {
  assertCeoAdmin(user);
  const existing = await db.agent.findMany();
  const byName = new Map(existing.map((a: any) => [a.name, a]));
  let created = 0;

  for (const a of AGENT_TREE) {
    if (byName.has(a.name)) continue;
    const row = await db.agent.create({
      data: {
        name: a.name,
        display_name: a.display_name,
        role: a.role,
        is_active: true,
        spend_cap_monthly: 0,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      },
    });
    byName.set(a.name, row);
    created++;
  }
  for (const a of AGENT_TREE) {
    if (!a.parent) continue;
    const me: any = byName.get(a.name);
    const parent: any = byName.get(a.parent);
    if (!me || !parent || me.parent_agent_id === parent.id) continue;
    await db.agent.update({ where: { id: me.id }, data: { parent_agent_id: parent.id } });
  }
  return { ok: true, total: AGENT_TREE.length, created };
});

// Generic agent runner. Calls Gemini if system_prompt is set; otherwise
// records a Phase-A stub run. Always creates an inbox item.
registerFn('runAgent', async ({ body, user }) => {
  assertCeoAdmin(user);
  const { agent_id, input, trigger, campaign_unit_id } = body as any;
  const agent = await db.agent.findUnique({ where: { id: agent_id } });
  if (!agent) throw new Error('agent_not_found');
  if (!agent.is_active) throw new Error('agent_inactive');

  const startedAt = new Date();
  const run = await db.agentRun.create({
    data: {
      agent_id: agent.id,
      trigger: trigger || 'manual',
      triggered_by: (user as any)?.id ?? null,
      input: input ? JSON.stringify(input) : null,
      status: 'running',
      started_at: startedAt.toISOString(),
      campaign_unit_id: campaign_unit_id || null,
    },
  });

  let output = '';
  let status = 'completed';
  let error: string | null = null;
  let cost = 0;

  try {
    if (agent.system_prompt && agent.system_prompt.trim()) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not set');
      // Runtime brand substitution — 23 CEO agents seeded from Alena's schema
      // still have 'עלינא' baked into their system_prompt. Replace at call
      // time with the current tenant's brand, and prepend business_context so
      // every agent output speaks the tenant's business identity.
      const agentBrand = await getBrandName();
      const agentBpBlock = await businessContextBlock();
      const finalPrompt = agentBpBlock + String(agent.system_prompt)
        .replaceAll('{brand}', agentBrand)
        .replaceAll('עלינא', agentBrand);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: finalPrompt }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(input || {}) }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      );
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.error?.message || 'gemini failed');
      output = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const u = d.usageMetadata || {};
      cost = ((u.promptTokenCount || 0) * 0.075 + (u.candidatesTokenCount || 0) * 0.30) / 1_000_000;
    } else {
      output = `(Phase A) ${agent.display_name} ran without a system_prompt. Will be filled in Phase B.`;
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message || String(e);
  }

  const finishedAt = new Date();
  await db.agentRun.update({
    where: { id: run.id },
    data: {
      status,
      output,
      error,
      cost_usd: cost,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      finished_at: finishedAt.toISOString(),
    },
  });

  await db.agentInboxItem.create({
    data: {
      agent_run_id: run.id,
      agent_name: agent.name,
      type: status === 'failed' ? 'alert' : 'result',
      priority: status === 'failed' ? 'high' : 'normal',
      title: `${agent.display_name}: ${trigger || 'manual'}`,
      body: error ? `❌ Error:\n${error}` : output.slice(0, 4000),
      requires_action: false,
      status: 'open',
      created_date: new Date().toISOString(),
    },
  });

  return { ok: status !== 'failed', run_id: run.id, output, error };
});

registerFn('listAgentInbox', async ({ body, user }) => {
  assertCeoAdmin(user);
  const { status, type, agent_name, limit } = (body || {}) as any;
  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (agent_name) where.agent_name = agent_name;
  return await db.agentInboxItem.findMany({
    where,
    orderBy: { created_date: 'desc' },
    take: Math.min(parseInt(String(limit || 100)) || 100, 500),
  });
});

// Execute a single approved action. Each `kind` is a small, well-scoped
// capability that the owner explicitly approves before it runs. The set is
// deliberately tiny in Phase B and will grow as more agents need it.
async function executeApprovedAction(payload: any, item: any, user: any) {
  const kind = payload?.kind;
  const args = payload?.args || {};
  switch (kind) {
    case 'delegate_run': {
      // Run another agent with the given input
      const target = await db.agent.findFirst({ where: { name: args.agent_name } });
      if (!target) throw new Error(`agent not found: ${args.agent_name}`);
      const handler = functionHandlers['runAgent'];
      if (!handler) throw new Error('runAgent handler missing');
      return await handler({ body: { agent_id: target.id, input: args.input, trigger: 'delegation', campaign_unit_id: args.campaign_unit_id }, user, req: null as any });
    }
    case 'pushover_owner': {
      await pushoverToAdmins(args.title || 'התראת סוכן', String(args.message || '').slice(0, 1024));
      return { ok: true, kind };
    }
    case 'update_agent': {
      if (!args.name) throw new Error('args.name required');
      const a = await db.agent.findFirst({ where: { name: args.name } });
      if (!a) throw new Error(`agent not found: ${args.name}`);
      const { name: _drop, ...patch } = args;
      return await db.agent.update({ where: { id: a.id }, data: { ...patch, updated_date: new Date().toISOString() } });
    }
    case 'update_campaign_unit': {
      if (!args.name) throw new Error('args.name required');
      const u = await db.campaignUnit.findFirst({ where: { name: args.name } });
      if (!u) throw new Error(`campaign unit not found: ${args.name}`);
      const { name: _drop, ...patch } = args;
      return await db.campaignUnit.update({ where: { id: u.id }, data: { ...patch, updated_date: new Date().toISOString() } });
    }
    default:
      throw new Error(`unknown action kind: ${kind || '(none)'}`);
  }
}

registerFn('actOnInboxItem', async ({ body, user }) => {
  assertCeoAdmin(user);
  const { id, action } = body as any;
  if (!id || !action) throw new Error('id and action required');
  if (!['approved', 'rejected', 'dismissed'].includes(action)) throw new Error('invalid_action');

  const item = await db.agentInboxItem.findUnique({ where: { id } });
  if (!item) throw new Error('item_not_found');
  if (item.status !== 'open') throw new Error('item_already_acted');

  let executionResult: any = null;
  let executionError: string | null = null;
  // Only execute the payload when the owner approves and the item carries one
  if (action === 'approved' && item.payload && item.requires_action) {
    try {
      const payload = JSON.parse(item.payload);
      executionResult = await executeApprovedAction(payload, item, user);
    } catch (e: any) {
      executionError = e?.message || String(e);
    }
  }

  const updated = await db.agentInboxItem.update({
    where: { id },
    data: {
      status: action,
      acted_by: (user as any)?.id ?? null,
      acted_at: new Date().toISOString(),
    },
  });

  // Log the execution as an inbox item too, so the owner sees the result
  if (executionResult || executionError) {
    await db.agentInboxItem.create({
      data: {
        agent_run_id: item.agent_run_id,
        agent_name: item.agent_name,
        type: executionError ? 'alert' : 'result',
        priority: executionError ? 'high' : 'normal',
        title: executionError ? `❌ ביצוע נכשל: ${item.title}` : `✅ בוצע: ${item.title}`,
        body: executionError ? executionError : `הפעולה בוצעה בהצלחה.\n${typeof executionResult === 'object' ? '```json\n' + JSON.stringify(executionResult, null, 2).slice(0, 1500) + '\n```' : String(executionResult).slice(0, 1500)}`,
        created_date: new Date().toISOString(),
      },
    });
  }

  return { item: updated, executed: !!executionResult, error: executionError };
});

registerFn('listAgents', async ({ user }) => {
  assertCeoAdmin(user);
  return await db.agent.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { runs: true } } },
  });
});

registerFn('updateAgent', async ({ body, user }) => {
  assertCeoAdmin(user);
  const { id, ...data } = body as any;
  if (!id) throw new Error('id required');
  return await db.agent.update({
    where: { id },
    data: { ...data, updated_date: new Date().toISOString() },
  });
});

// Pulls a snapshot of today's operational data for the CEO brief.
async function buildCeoBriefContext() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  const [
    reservationsToday,
    reservationsNext7,
    shiftReportYesterday,
    openIncidents,
    upcomingInterviews,
    activeMarketingTasks,
    lowInventory,
  ] = await Promise.all([
    safe(db.reservation.findMany({ where: { date: today } }), []),
    safe(db.reservation.findMany({ where: { date: { gte: today, lte: next7 } } }), []),
    safe(db.shiftEndReport.findMany({ where: { date: yesterday } }), []),
    safe(db.incident.findMany({ where: { status: { in: ['open', 'in_progress'] } as any } }), []),
    safe(db.interview.findMany({ where: { scheduled_date: { gte: today, lte: next7 }, status: 'scheduled' } }), []),
    safe(db.marketingTask.findMany({ where: { status: { in: ['pending', 'in_progress'] } as any } }), []),
    safe(db.inventoryItem.findMany({ where: { current_quantity: { lt: 5 } as any } }), []),
  ]);

  return {
    date: today,
    yesterday,
    reservations_today_count: reservationsToday.length,
    reservations_today_people: reservationsToday.reduce((s: number, r: any) => s + (r.party_size || 0), 0),
    reservations_next_7_count: reservationsNext7.length,
    yesterday_revenue: shiftReportYesterday.reduce((s: number, r: any) => s + (r.total_revenue || 0), 0),
    yesterday_tips: shiftReportYesterday.reduce((s: number, r: any) => s + (r.total_tips || 0), 0),
    open_incidents_count: openIncidents.length,
    open_incidents_top: openIncidents.slice(0, 3).map((i: any) => ({ title: i.title, severity: i.severity })),
    upcoming_interviews_count: upcomingInterviews.length,
    upcoming_interviews_next_3: upcomingInterviews.slice(0, 3).map((i: any) => ({
      name: i.candidate_name, date: i.scheduled_date, time: i.scheduled_time,
    })),
    active_marketing_tasks_count: activeMarketingTasks.length,
    low_inventory_items: lowInventory.slice(0, 5).map((i: any) => ({ name: i.item_name, qty: i.current_quantity })),
  };
}

const CEO_BRIEF_PROMPT_TEMPLATE = `You are the autonomous CEO of "{brand}", a restaurant.

You will receive a JSON snapshot of today's operational state. Write a SHORT, ACTIONABLE daily brief in HEBREW for the owner (Dvir).

Structure the brief as:
🌅 פתיחה — מה הכי חשוב היום בשורה אחת
📊 מצב נוכחי — הזמנות, הכנסות אתמול, טיפים (מספרים קצרים)
🚨 התראות — אם יש תקריות פתוחות / מלאי נמוך / ראיונות קרובים — תציין במפורש
🎯 המלצה אחת — פעולה אחת קונקרטית שכדאי שיעשה היום (לא יותר!)

חוקים:
- עברית בלבד. ישיר, ענייני, בלי משפטים מנופחים.
- אל תמציא מספרים. אם שדה ריק/0 — תכתוב "אין נתונים" או דלג.
- מקסימום 12 שורות סך הכל.
- אם המצב שקט — תגיד "יום שקט, אין דרישה לפעולה".`;

registerFn('runCeoDailyBrief', async ({ body }) => {
  const trigger = (body as any)?.trigger || 'cron_morning';
  const ceo = await db.agent.findUnique({ where: { name: 'CEO' } });
  if (!ceo) return { ok: false, error: 'CEO agent not seeded yet' };
  if (!ceo.is_active) return { ok: false, error: 'CEO agent is disabled' };

  const start = new Date();
  const run = await db.agentRun.create({
    data: {
      agent_id: ceo.id,
      trigger,
      input: null,
      status: 'running',
      started_at: start.toISOString(),
    },
  });

  let body_text = '';
  let priority = 'normal';
  let status = 'completed';
  let error: string | null = null;
  let cost = 0;

  try {
    const context = await buildCeoBriefContext();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const triggerHebrew = trigger === 'cron_morning' ? 'בוקר (09:00)'
      : trigger === 'cron_afternoon' ? 'אחר הצהריים (17:00)'
      : 'סוף יום (00:00)';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: (await businessContextBlock()) + renderBrand(CEO_BRIEF_PROMPT_TEMPLATE, await getBrandName()) }] },
          contents: [{ role: 'user', parts: [{ text: `Window: ${triggerHebrew}\nData:\n${JSON.stringify(context, null, 2)}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );
    const d: any = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'gemini failed');
    body_text = d.candidates?.[0]?.content?.parts?.[0]?.text || '(אין תשובה מ-Gemini)';
    const u = d.usageMetadata || {};
    cost = ((u.promptTokenCount || 0) * 0.075 + (u.candidatesTokenCount || 0) * 0.30) / 1_000_000;

    // Mark high priority if there are open incidents OR low inventory
    if (context.open_incidents_count > 0 || context.low_inventory_items.length > 0) priority = 'high';
  } catch (e: any) {
    status = 'failed';
    error = e?.message || String(e);
    body_text = `❌ שגיאה בהפקת התדריך: ${error}`;
  }

  const finishedAt = new Date();
  await db.agentRun.update({
    where: { id: run.id },
    data: {
      status,
      output: body_text,
      error,
      cost_usd: cost,
      duration_ms: finishedAt.getTime() - start.getTime(),
      finished_at: finishedAt.toISOString(),
    },
  });

  await db.agentInboxItem.create({
    data: {
      agent_run_id: run.id,
      agent_name: 'CEO',
      type: 'brief',
      priority,
      title: `תדריך CEO · ${trigger === 'cron_morning' ? 'בוקר' : trigger === 'cron_afternoon' ? 'אחר הצהריים' : 'סוף יום'}`,
      body: body_text,
      created_date: new Date().toISOString(),
    },
  });
  return { ok: status !== 'failed', run_id: run.id, body: body_text };
}, { public: true });

/* ----- Events private inquiry AI agent (public, separate from recruitment) ----- */

/**
 * Events-only Pushover dispatcher. Bypasses the admin↔employee email-match
 * requirement of pushoverToAdmins (which silently sent to zero recipients
 * when emails didn't match exactly) — here we send to every Employee with
 * a pushover_user_key, plus every User with role='admin' that has a
 * matching employee row. Logs results so we can see what happened.
 */
// pushoverEventsOwners now imported from lib/pushover (moved so triggers
// can use it too without a circular import).

// Public diagnostics dump — call this from anywhere to see exactly what's wrong
// without needing auth. Returns infrastructure state + recent records.
registerFn('eventsDiagnostics', async ({ body }) => {
  const tokenPresent = !!(process.env.PUSHOVER_APP_TOKEN || process.env.PUSHOVER_API_TOKEN);
  const empsWithKey = await (prisma as any).employee.findMany({ where: { pushover_user_key: { not: null } } });
  const totalLeads = await (prisma as any).eventLead.count();
  // cuid ids are time-sortable; we use them as fallback because created_date was being left null.
  const recentLeads = await (prisma as any).eventLead.findMany({ orderBy: { id: 'desc' }, take: 5 });
  const totalBookings = await (prisma as any).eventBooking.count();
  const recentBookings = await (prisma as any).eventBooking.findMany({ orderBy: { id: 'desc' }, take: 5 });
  // Optional: inspect a specific lead by id
  const focusLeadId = (body as any)?.lead_id;
  let focusLead: any = null;
  if (focusLeadId) focusLead = await (prisma as any).eventLead.findUnique({ where: { id: focusLeadId } });
  return {
    pushover_infra: {
      token_in_env: tokenPresent,
      employees_with_pushover_key: empsWithKey.length,
      employee_emails: empsWithKey.map((e: any) => e.email),
    },
    leads: {
      total: totalLeads,
      last_5: recentLeads.map((l: any) => ({
        id: l.id, name: l.contact_name, phone: l.contact_phone,
        date: l.event_date, guests: l.guest_count, score: l.score, status: l.status,
        has_ai_summary: !!l.ai_summary, created: l.created_date,
        notes_marker: String(l.notes || '').slice(0, 80),
      })),
    },
    bookings: {
      total: totalBookings,
      last_5: recentBookings.map((b: any) => ({
        id: b.id, name: b.customer_name, phone: b.customer_phone,
        date: b.event_date, time: b.event_time, guests: b.guest_count,
        menu: (b.selected_menu as any)?.name, total: b.total_ils,
        status: b.status, approval: b.approval_status, payment: b.payment_status,
        created: b.created_date,
      })),
    },
    focus_lead: focusLead ? {
      id: focusLead.id,
      name: focusLead.contact_name,
      phone: focusLead.contact_phone,
      date: focusLead.event_date,
      type: focusLead.event_type,
      guests: focusLead.guest_count,
      hours: focusLead.hours_window,
      budget: focusLead.budget_per_person,
      score: focusLead.score,
      status: focusLead.status,
      source: focusLead.source,
      ai_summary: focusLead.ai_summary,
      notes: focusLead.notes,
      log_len: Array.isArray(focusLead.conversation_log) ? focusLead.conversation_log.length : 0,
    } : null,
  };
}, { public: true });

// Public Pushover test fire — proves the pipe end-to-end without auth.
registerFn('firePushoverTest', async () => {
  const result = await pushoverEventsOwners(
    '🔔 בדיקה ידנית של Pushover',
    `אם קיבלת — הצינור עובד.\nשעון: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
  );
  return result;
}, { public: true });

// Diagnostic: call this to verify the Pushover pipe is alive. Returns the count of
// employees with pushover_user_key, whether the env token is present, and how many
// devices got the test message.
registerFn('testEventsPushover', async () => {
  const tokenPresent = !!(process.env.PUSHOVER_APP_TOKEN || process.env.PUSHOVER_API_TOKEN);
  const emps = await (prisma as any).employee.findMany({ where: { pushover_user_key: { not: null } } });
  const result = await pushoverEventsOwners(
    '🔔 בדיקת התראות אירועים',
    `אם קיבלת הודעה זו — Pushover לאירועים עובד תקין.\nנשלח בתאריך: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
  );
  return {
    pushover_token_in_env: tokenPresent,
    employees_with_pushover_key: emps.length,
    employee_emails_with_key: emps.map((e: any) => e.email),
    dispatch_result: result,
  };
});

const EVENTS_SYSTEM_PROMPT_TEMPLATE = `את דנה — מנהלת האירועים הפרטיים של מסעדת '{brand}'. את מדברת בעברית טבעית, חמה וקצרה. תפקידך: לאסוף מידע ראשוני בלבד ולהעביר לבעלים. את לא סוגרת עסקה, לא מצטטת מחירים, לא מאשרת תאריך.

פתח רק אם זו ההודעה הראשונה (אין שיחה קודמת):
"היי 🌿 אני דנה, מנהלת האירועים של {brand}. שמחה שחשבתם עלינו! יש לי כמה שאלות קצרות לאסוף ממך פרטים, ואז המנהל של המסעדה יחזור אליך אישית עם הצעה מותאמת. מתחילים?"

שאלי אחת בכל פעם — 4 שדות בלבד:
1. שם מלא + טלפון.
2. תאריך + שעה מדויקת. אם הלקוח עונה רק בחלון ("צהריים") — בקשי פעם אחת שעה ספציפית. אם עדיין אין — רשמי את החלון.
3. **מיקום + סוג אירוע יחד**: אצלנו במסעדה או חוץ (איפה)? ומה סוג האירוע (יום הולדת/חברה/חינה/וכו')?
4. כמות אנשים בערך.

⚠️ **אסור** לשאול על ילדים, אלרגיות, אוכל מיוחד, תקציב. אם הלקוח מציין מעצמו — תרשמי.

ברגע שיש 4 השדות:
1. "מצוין, תודה רבה {שם}! אז אני מסכמת:" — המערכת תוסיף סיכום מובנה. **אל תפרטי שדות בעצמך**.
2. "הפרטים נכונים? תאשר/י ואני שולחת למנהל". complete=false.
3. **תור הבא**: כשהלקוח מאשר ("כן"/"מאשר"/"נכון") — המערכת תכתוב את תשובת הסיום, את רק מחזירה complete=true.
**אסור** להגיד "העברתי / נדבר בקרוב / יחזור אליך" לפני שהלקוח אישר.

חוקים קריטיים:
- לעולם אל תצטטי מחיר.
- לעולם אל תאשרי תאריך.
- לעולם אל תציעי תפריטים/חבילות/הנחות.
- אם נשאלת "כמה זה עולה?" / "התאריך פנוי?" / "מה כלול?" — עני: "אני אעביר לדביר והוא יחזור אליך אישית תוך כמה שעות עם הצעה מותאמת וכל התשובות 🙏" והמשיכי לשאלה הבאה.

החזרי תמיד JSON בלבד עם:
- reply (string) - התשובה שלך
- collected (object) - { contact_name, contact_phone, event_date, event_time, hours_window, location, location_details, guest_count, event_type, special_requests }
- complete (boolean) - true ברגע שיש 4 שדות החובה (שם+טלפון, תאריך, מיקום+סוג, כמות) — אל תחכי לאישור הלקוח
- escalation (boolean) - true רק לקצוות (200+ אנשים, מדיה, חו"ל)
- score (number) - 50 תמיד`;

registerFn('chatEventsInquiry', async ({ body }) => {
  const { history, message, source, lead_id, booking_id: incoming_booking_id, language: languageRaw } = body as any;
  const leadSource = typeof source === 'string' && source.trim()
    ? source.trim().slice(0, 40).toLowerCase()
    : 'web_chat';
  // Fetch the prior lead state up-front so we can MERGE collected fields
  // across turns. Without this, every Gemini reply that omits a previously-
  // captured field nulls it out and the final summary card loses data.
  const priorLead: any = lead_id
    ? await db.eventLead.findUnique({ where: { id: lead_id } }).catch(() => null)
    : null;
  const language = (() => {
    const allowed = ['Hebrew', 'English', 'Russian'];
    const raw = typeof languageRaw === 'string' ? languageRaw.trim() : '';
    return allowed.includes(raw) ? raw : 'Hebrew';
  })();

  // Load live Sales Kit
  let kit = await db.eventSalesKit.findFirst({ where: { singleton: true } });
  if (!kit) {
    kit = await db.eventSalesKit.create({
      data: { singleton: true, menus: [], upsells: [], terms: {}, system_prompt: DEFAULT_EVENTS_PROMPT, payment_mode: 'stub', deposit_pct: 20, max_discount_pct: 5, short_notice_allowed: true, max_advance_months: 6 },
    });
  }
  const brandNameEv = await getBrandName();
  const bpBlockEv = await businessContextBlock();
  const rawPrompt = (kit.system_prompt && kit.system_prompt.trim()) || DEFAULT_EVENTS_PROMPT;
  // Runtime brand swap — legacy stored prompts had hardcoded 'עלינא' /
  // 'עלנא' baked in; replace them with the tenant's actual brand so the
  // events agent doesn't greet Miha customers as Alena.
  const systemPrompt = bpBlockEv
    + rawPrompt
        .replaceAll('{brand}', brandNameEv)
        .replaceAll('עלינא', brandNameEv)
        .replaceAll('עלנא', brandNameEv);

  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];
  const transcript = turns.map((t) => `${t.role === 'assistant' ? 'עוזר' : 'לקוח'}: ${t.content}`).join('\n');
  const newPart = message ? `\nלקוח: ${message}` : '';

  // Date context the LLM needs to translate Hebrew relative dates ("מחרתיים", "מחר בערב") into ISO.
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const todayISO = `${tzNow.getFullYear()}-${String(tzNow.getMonth() + 1).padStart(2, '0')}-${String(tzNow.getDate()).padStart(2, '0')}`;
  const tomorrowISO = (() => { const d = new Date(tzNow.getTime() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const dayAfterISO = (() => { const d = new Date(tzNow.getTime() + 2 * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const todayDay = HE_DAYS[tzNow.getDay()];

  const dateContext =
    `\n--- DATE CONTEXT (תמיד השתמש בזה לחישוב תאריכים יחסיים) ---\n` +
    `TODAY: ${todayISO} (יום ${todayDay})\n` +
    `מחר: ${tomorrowISO}\n` +
    `מחרתיים: ${dayAfterISO}\n` +
    `כשאתה מקבל תאריך יחסי מהלקוח (היום/מחר/מחרתיים/בעוד שבוע/יום רביעי הבא) — תמיד חשב לפי TODAY והחזר ב-collected.event_date_iso בפורמט YYYY-MM-DD, וגם ציין את שם היום בעברית בתוך reply (למשל: "יום רביעי, ${dayAfterISO}"). לעולם אל תניח שמשהו "מחרתיים" הוא תאריך אחר.\n` +
    `--- סוף DATE CONTEXT ---\n`;

  const kitContext =
    `\n--- SALES KIT (מקור האמת לכל מחיר/תפריט/תנאי — אל תמציא כלום מחוץ לזה) ---\n` +
    `MENUS: ${JSON.stringify(kit.menus || [], null, 0)}\n` +
    `UPSELLS: ${JSON.stringify(kit.upsells || [], null, 0)}\n` +
    `TERMS: ${JSON.stringify(kit.terms || {}, null, 0)}\n` +
    `DEPOSIT_PCT: ${kit.deposit_pct ?? 20}\n` +
    `MAX_DISCOUNT_PCT: ${kit.max_discount_pct ?? 5}\n` +
    `SHORT_NOTICE_ALLOWED: ${kit.short_notice_allowed ? 'YES' : 'NO'}\n` +
    `MAX_ADVANCE_MONTHS: ${kit.max_advance_months ?? 6}\n` +
    `--- סוף SALES KIT ---\n`;

  const closingInstructions =
    `\n--- חוקי שיחה (קריטיים — חובה) ---\n` +
    `0. **complete=true רק במקרים מאוד ספציפיים**: (א) הלקוח אמר במפורש "כן, סגור, מאשר/ת" על מחיר סופי שהצעת. (ב) הלקוח אמר במפורש "לא, תודה, לא מתאים". בכל שאר המקרים — **complete=false תמיד**. אסור לך לסיים שיחה רק כי הצגת חבילה ושאלת "מה דעתך?". זה אמצע שיחה!\n` +
    `1. **כשאתה שואל את הלקוח שאלה** (גם אם זה "מה דעתך?" או "האם להתקדם?"), חובה complete=false ו-stage='quoting' או 'collecting'. אתה ממתין לתשובה — לא סוגר.\n` +
    `2. לעולם אל תכתוב "תודה רבה! ליצור איתכם קשר אם זה מתאים לפורמט" באמצע שיחה. ביטוי כזה רק אם הלקוח אמר במפורש לא.\n` +
    `3. **אסור להזכיר תשלום אונליין / לינק / Stripe / כרטיס אשראי בצ׳אט.** התשלום מתבצע בשיחה טלפונית עם המנהל, לא בצ׳אט. כשאתה סוגר עסקה — אומר "המנהל ייצור איתכם קשר תוך כמה שעות לאישור סופי ולתיאום תשלום". זהו. בלי לינק. בלי "אני שולחת תשלום".\n` +
    `4. ברגע שהלקוח אמר "כן/סגור/מאשר" על מחיר סופי → **חובה** stage='send_payment' ו-complete=true בתשובה זו. הסוכן מסכם בקצרה את ההזמנה (תאריך, שעה, אורחים, חבילה, סכום) ומבטיח שהמנהל יתקשר.\n` +
    `5. **שדות חובה ב-collected כשאתה סוגר**: contact_name, contact_phone, event_date_iso (YYYY-MM-DD), event_time (HH:MM), guest_count, hours_window, selected_menu_name, total_ils. בלי השדות האלה לא נוצרת הזמנה.\n` +
    `6. **שאלת שעה חובה**: לפני שאתה סוגר — חובה לקבל שעת התחלה ספציפית (למשל "19:30"). אם לא צוין, שאל: "באיזו שעה תרצו שהאירוע יתחיל?"\n` +
    `7. **הודע על משך השולחן**: כשאתה מסכם את ההזמנה לפני הסכמה, ציין במפורש כמה זמן השולחן/המקום עומד לרשות הלקוחות. ברירת מחדל: 3 שעות מהשעה שביקשו (אלא אם TERMS מגדיר אחרת).\n` +
    `8. **אפסיילים**: אם יש UPSELLS ב-SALES KIT, הצע אותם בעדינות אחרי שהלקוח בחר חבילה — לא להפציץ. לדוגמה: "האם תרצו להוסיף בר פתוח (תוספת 50 ש"ח לסועד)?". אם הלקוח לא מתעניין — תמשיך.\n` +
    `9. נסה תמיד לסגור עד הסוף — אל תוותר כי "התקציב גבוה". הצע חלופות. אגרסיביות חיובית: כל פעם שלקוח מסכים על משהו (חבילה/תאריך) — תקדם לשלב הבא מיד.\n` +
    `10. ההזמנה תמיד מותנת באישור סופי של מנהל המסעדה. ציין את זה כשאתה סוגר: "ההזמנה מותנת באישור סופי של מנהל המסעדה לאחר שיחה איתכם".\n`;

  const langDirective = language === 'Hebrew'
    ? ''
    : `\n\n--- LANGUAGE DIRECTIVE ---\nThe customer is communicating in ${language}. The "reply" field MUST be written in ${language}, even if the rest of the prompt is in Hebrew. Be warm, natural, and use idiomatic ${language}. Field extraction (booking data, ai_summary, etc) should stay in Hebrew so the manager can read it.`;
  const prompt = `${systemPrompt}${dateContext}${kitContext}${closingInstructions}${langDirective}\n--- שיחה עד כה ---\n${transcript || '(אין עדיין הודעות — זו תחילת השיחה)'}${newPart}\n\nהחזר JSON בלבד.`;

  let result: any;
  let llmError: any = null;
  try {
    result = await invokeLLM({
      prompt,
      responseSchema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          collected: { type: 'object' },
          stage: { type: 'string' },
          complete: { type: 'boolean' },
          escalation: { type: 'boolean' },
          score: { type: 'number' },
        },
        required: ['reply'],
      },
    });
  } catch (e: any) {
    llmError = e;
    console.error('[chatEventsInquiry] LLM failed after retries:', e?.message);
    // Fallback: keep the conversation alive instead of "Load failed".
    // The user sees a graceful Hebrew message, the owner gets an immediate alert,
    // and we still persist the customer's message + any extractable fields.
    result = {
      reply: 'רגע אחד, בודקת את הפרטים — אני שולחת הודעה במקביל למנהל המסעדה והוא יחזור אליכם בקרוב 🌿\nתוכלו לכתוב לי גם את השם והטלפון שלכם כדי שאוכל לוודא שנחזור אליכם?',
      collected: {},
      stage: 'collecting',
      complete: false,
      score: 30,
    };
  }

  const cRaw = result?.collected || {};

  // Normalize the freeform `collected` object — the LLM keeps inventing field names
  // (event_date / date / booking_date / event_iso, guest_count / guests / num_guests, etc.)
  // so we map every plausible alias to the canonical name before any logic touches it.
  const pickFirst = (...keys: string[]) => {
    for (const k of keys) {
      const v = cRaw?.[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  const c: any = {
    contact_name: pickFirst('contact_name', 'name', 'customer_name', 'full_name', 'first_name'),
    contact_phone: pickFirst('contact_phone', 'phone', 'mobile', 'tel', 'phone_number'),
    event_date: pickFirst('event_date', 'date', 'booking_date'),
    event_date_iso: pickFirst('event_date_iso', 'date_iso', 'iso_date', 'event_date'),
    event_time: pickFirst('event_time', 'time', 'start_time', 'time_of_day'),
    event_type: pickFirst('event_type', 'type', 'occasion'),
    guest_count: pickFirst('guest_count', 'guests', 'num_guests', 'people_count', 'attendees', 'pax'),
    budget_per_person: pickFirst('budget_per_person', 'budget', 'price_per_person', 'budget_pp'),
    hours_window: pickFirst('hours_window', 'window', 'time_window', 'shift'),
    selected_menu_id: pickFirst('selected_menu_id', 'menu_id', 'package_id'),
    selected_menu_name: pickFirst('selected_menu_name', 'menu_name', 'menu', 'package', 'package_name'),
    selected_dishes: pickFirst('selected_dishes', 'dishes', 'items'),
    selected_upsells: pickFirst('selected_upsells', 'upsells', 'add_ons', 'addons', 'extras'),
    subtotal_ils: pickFirst('subtotal_ils', 'subtotal'),
    discount_pct_requested: pickFirst('discount_pct_requested', 'discount', 'discount_pct'),
    total_ils: pickFirst('total_ils', 'total', 'amount', 'final_price', 'price'),
  };
  if (typeof c.guest_count === 'string') c.guest_count = parseInt(c.guest_count.replace(/\D/g, '')) || undefined;
  if (typeof c.total_ils === 'string') c.total_ils = parseInt(c.total_ils.replace(/[^\d]/g, '')) || undefined;
  if (typeof c.budget_per_person === 'string') c.budget_per_person = parseInt(c.budget_per_person.replace(/\D/g, '')) || undefined;

  // Server-side closure logic with both directions:
  // (a) Guard against premature closure: if the assistant ended with a question and the customer
  //     hasn't explicitly said close, treat complete as false so the frontend keeps chat open.
  // (b) FORCE closure: if the customer explicitly said close ("כן סגור", "אני מאשר", "סגור עליי",
  //     "קיבלתי", "מצוין", etc.) AND we have minimum identifying info, we mark complete=true even
  //     if the LLM kept stalling — the customer's words are the source of truth.
  const replyRaw = String(result?.reply || '');
  const endsWithQuestion = /[?؟]\s*$/.test(replyRaw.trim()) || /[?؟]\s*$/m.test(replyRaw.trim().split('\n').pop() || '');
  const customerLastTurn = String(message || '').trim();
  // Wide positive-close detection: any of these tokens appearing ANYWHERE in the customer's reply
  // counts as "agreement to close" — provided the prior agent turn was asking for confirmation.
  // Word boundaries are crude in Hebrew (no \b for non-Latin), so we look for whole-word matches
  // bracketed by start/end of string or whitespace/punctuation.
  const closeTokens = [
    'סגור','סוגר','סוגרת','סוגרים','סגרנו',
    'מאשר','מאשרת','מסכים','מסכימה','חותם','חותמת','אישור','מאשרים',
    'אשמח','נשמח','אשמחה',
    'מעולה','מושלם','נהדר','בטוח','יאללה','אוקי','אוקיי','בוא','בואו','נסגור','נסגרת',
    'deal','confirmed','confirm','yes','sure','great','okay','ok',
  ];
  const tokenRe = new RegExp('(^|[\\s,.!?:;])(' + closeTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')([\\s,.!?:;]|$)', 'i');
  // "כן" alone is also a close if the agent's previous turn was a close-confirmation question.
  const customerSaidYes = /^\s*כן\b/i.test(customerLastTurn) || /(^|\s)כן(\s|$|[.,!?])/i.test(customerLastTurn);
  // Look at the PRIOR agent turn — that's the message the customer is now responding to.
  // (Looking only at replyRaw, i.e. the LLM's reply on THIS turn, was a bug: it always
  // includes the closing phrases we just generated, which made every customer reply
  // look like a confirmation.)
  const priorAgentTurn = (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t: any = turns[i];
      if (t?.role === 'assistant' || t?.role === 'model') return String(t.content || '');
    }
    return '';
  })();
  const agentAskedToClose = /(לסגור|לסגירה|להתקדם|נסגור|סוגרים|נמשיך|לאישור|נכונים|תאשר|תאשרי|תאשרו|לאשר|אשלח\s+(?:את\s+הפרטים|למנהל))/.test(priorAgentTurn);
  const customerExplicitClose = tokenRe.test(customerLastTurn) || (customerSaidYes && agentAskedToClose);

  // Server-side fallback extraction. CRITICAL: scan only the CUSTOMER's messages,
  // not the agent's — otherwise the extractor picks up the agent introducing itself
  // ("אני העוזרת הדיגיטלית של עלינא") and saves "העוזרת" as the customer's name.
  const customerTurns = turns.filter((t: any) => t.role !== 'assistant').map((t: any) => t.content);
  const customerText = [...customerTurns, message || ''].join(' ');
  const fullText = [...turns.map((t: any) => t.content), message || ''].join(' '); // used only for phone/date/guests (where it doesn't matter)
  if (!c.contact_phone) {
    const phoneMatch = fullText.match(/0\s?5\d[\s-]?\d{3}[\s-]?\d{4}/);
    if (phoneMatch) c.contact_phone = phoneMatch[0].replace(/[\s-]/g, '');
  }
  if (!c.guest_count) {
    // Broader patterns: 'ל-30 איש', '30 אורחים', 'כ-30 איש', 'בערך 30 איש', '30 נפש'
    const guestsMatch = fullText.match(/(?:ל-?\s*|כ-?\s*|בערך\s*|סביבות\s*|בסביבות\s*|\s|^)(\d{1,3})\s*(?:איש|אורחים|סועדים|נפש|אנשים|מוזמנים)/);
    if (guestsMatch) c.guest_count = parseInt(guestsMatch[1]);
  }
  // === DATE EXTRACTION ===
  // The customer's CURRENT message wins over whatever Gemini returned. Gemini
  // hallucinates dates surprisingly often (e.g. "מחר" → 2026-07-25), and a
  // simple `if (!c.event_date)` guard let those bad values stick forever.
  // We now extract from the last customer message FIRST and override c.event_date.
  const lastCustomerMsg = String(message || '').trim();
  const HE_MONTHS: Record<string, number> = {
    'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
    'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
  };
  const extractDateFrom = (txt: string): string | null => {
    if (!txt) return null;
    // 1. ISO (YYYY-MM-DD)
    const iso = txt.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    // 2. Hebrew "<day> ב<month>" → 2026
    const he = txt.match(/(\d{1,2})\s*ב(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/);
    if (he) {
      const d = parseInt(he[1]); const m = HE_MONTHS[he[2]];
      return `${tzNow.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // 3. DD.M.YYYY / DD/MM/YY / DD-MM (with optional year)
    const dm = txt.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
    if (dm) {
      const d = parseInt(dm[1]); const m = parseInt(dm[2]);
      let y = dm[3] ? parseInt(dm[3]) : tzNow.getFullYear();
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    // 4. Relative-date words — bounded by whitespace/punctuation to avoid false hits.
    if (/(^|[\s,.!?])מחרתיים([\s,.!?]|$)/.test(txt)) return dayAfterISO;
    if (/(^|[\s,.!?])מחר([\s,.!?]|$)/.test(txt)) return tomorrowISO;
    if (/(^|[\s,.!?])(היום|הערב)([\s,.!?]|$)/.test(txt)) return todayISO;
    return null;
  };
  // Customer's last message takes precedence over Gemini.
  const dateFromLastMsg = extractDateFrom(lastCustomerMsg);
  if (dateFromLastMsg) {
    c.event_date_iso = dateFromLastMsg;
    c.event_date = dateFromLastMsg;
  } else if (!c.event_date && !c.event_date_iso) {
    // Fallback: scan ALL customer turns (not just last) for any date signal.
    const dateFromHistory = extractDateFrom(customerText) || extractDateFrom(fullText);
    if (dateFromHistory) {
      c.event_date_iso = dateFromHistory;
      c.event_date = dateFromHistory;
    }
  }
  // === TIME EXTRACTION ===
  // Same principle as date: customer's CURRENT message wins over historical values.
  // Otherwise after "השעה לא נכונה, 4 בצהריים" the old 20:00 from a prior turn stuck.
  const extractTimeFrom = (txt: string): string | null => {
    if (!txt) return null;
    const explicit = txt.match(/(?:בשעה|ב-?\s*)(\d{1,2}[:.]\d{2})/) || txt.match(/\b(\d{1,2}[:.]\d{2})\b/);
    if (explicit) return explicit[1].replace('.', ':');
    // "N בצהריים/בערב/בלילה/בבוקר"
    const periodMatch = txt.match(/(\d{1,2})\s*ב?(בוקר|צהריים|צהרים|אחה"?צ|אחר[\s-]?הצהריים|ערב|לילה)/);
    if (periodMatch) {
      let h = parseInt(periodMatch[1]);
      const period = periodMatch[2];
      if (/בוקר/.test(period)) { /* keep as-is */ }
      else if (/צהריים|צהרים/.test(period)) { if (h >= 1 && h <= 6) h += 12; }
      else if (/אחה|אחר/.test(period))      { if (h >= 1 && h <= 7) h += 12; }
      else if (/ערב/.test(period))           { if (h >= 1 && h <= 11) h += 12; }
      else if (/לילה/.test(period))          { if (h >= 8 && h <= 11) h += 12; if (h === 12) h = 0; }
      if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
    }
    if (/בערב|בלילה/.test(txt)) return '20:00';
    if (/בצהריים|בצהרים/.test(txt)) return '13:00';
    if (/בבוקר/.test(txt)) return '10:00';
    return null;
  };
  const timeFromLastMsg = extractTimeFrom(lastCustomerMsg);
  if (timeFromLastMsg) {
    c.event_time = timeFromLastMsg;
  } else if (!c.event_time) {
    c.event_time = extractTimeFrom(customerText) || undefined;
  }
  // Event type fallback — scan customer text for occasion keywords.
  if (!c.event_type) {
    const EVENT_TYPES: [RegExp, string][] = [
      [/בר[\s-]?מצוו?ה/, 'בר מצווה'],
      [/בת[\s-]?מצוו?ה/, 'בת מצווה'],
      [/יום[\s-]?הולדת/, 'יום הולדת'],
      [/חתונה|חתונת/, 'חתונה'],
      [/אירוס[יםן]/, 'אירוסים'],
      [/חינה|חינא/, 'חינה'],
      [/ברית[\s-]?מילה|ברית|בריתה/, 'ברית'],
      [/יום[\s-]?נישוא?ין/, 'יום נישואין'],
      [/רווקות|רווקים/, 'מסיבת רווקות'],
      [/פרישה/, 'פרישה'],
      [/ערב[\s-]?צוות|אירוע[\s-]?חברה|מסיבת[\s-]?חברה/, 'אירוע חברה'],
      [/מפגש[\s-]?משפחתי|ערב[\s-]?משפחתי|ארוחה[\s-]?משפחתית/, 'מפגש משפחתי'],
    ];
    for (const [re, label] of EVENT_TYPES) {
      if (re.test(customerText)) { c.event_type = label; break; }
    }
  }
  // === LOCATION EXTRACTION ===
  // Two independent signals, both can override prior junk:
  //  (A) The customer said something like "אצלנו במסעדה"/"אצלכם"/"במסעדה" → restaurant.
  //      Or "אצלי בבית"/"אירוע חוץ"/"אצלי" → external (but DON'T fill location_details
  //      with the phrase "אצלי בבית" — that's not an address).
  //  (B) Any known Israeli city in the customer text → that's the address.
  // Previously we treated the whole post-question reply as the location_details, which
  // grabbed garbage like "אצלי בבית חינה" and then nothing could override it later.
  const customerForLoc = customerText + ' ' + lastCustomerMsg;
  // (A) High-level location type
  if (/(אצלכם|במסעדה|אצלנו(?!\s+בבית)|במקום\s+שלכם|אצל\s+עלינא)/i.test(customerForLoc)) {
    c.location = 'restaurant';
  } else if (/(אצלי\s+בבית|אצל[נינ]?ו\s+בבית|בבית\s+שלי|בבית\s+שלנו|בגינה\s+שלי|בגינת\s+הבית|אירוע\s+חוץ|אצלי(?!\s+במסעדה))/i.test(customerForLoc)) {
    if (c.location !== 'restaurant') c.location = 'external';
  }
  // (B) City detection — independent of (A). Override prior location_details if it
  //     looks like junk (contains 'אצל' / 'בבית' / 'אירוע' or is empty).
  const CITY_RE = /(קריי?ת[\s-]?גת|קריי?ת[\s-]?שמונה|קריי?ת[\s-]?אונו|קריי?ת[\s-]?ביאליק|קריי?ת[\s-]?ים|קריי?ת[\s-]?מוצקין|קריי?ת[\s-]?מלאכי|קריי?ת[\s-]?עקרון|קריי?ת[\s-]?טבעון|קריית[\s-]?ארבע|קצרין|רמת[\s-]?גן|תל[\s-]?אביב|ירושלים|חיפה|באר[\s-]?שבע|נתניה|הרצליה|ראשון[\s-]?לציון|רחובות|רעננה|כפר[\s-]?סבא|מודיעין|פתח[\s-]?תקו?ה|חולון|בת[\s-]?ים|אשדוד|אשקלון|הוד[\s-]?השרון|רמת[\s-]?השרון|זכרון[\s-]?יעקב|קיסריה|אילת|טבריה|צפת|נצרת|בית[\s-]?שמש|עפולה|לוד|רמלה|דימונה|ערד|מצפה[\s-]?רמון|ראש[\s-]?פינה|מירון|בנימינה|פרדס[\s-]?חנה|מטולה|כרמיאל|מעלות|כפר[\s-]?ורדים|יקנעם|רכסים|מגדל[\s-]?העמק|נצרת[\s-]?עילית|נוף[\s-]?הגליל|כפר[\s-]?תבור|פוריה|אריאל|אלפי[\s-]?מנשה|מעלה[\s-]?אדומים|גבעתיים|אור[\s-]?יהודה|יבנה|גדרה|אופקים|נתיבות|שדרות|רהט|טייבה|אום[\s-]?אל[\s-]?פחם|נהריה|עכו|כרמל|טירת[\s-]?כרמל|נשר|עתלית|זכרון|בנימינה|חדרה|אור[\s-]?עקיבא|פרדסיה|תל[\s-]?מונד|אבן[\s-]?יהודה)/;
  const cityHit = customerForLoc.match(CITY_RE);
  if (cityHit) {
    if (!c.location) c.location = 'external';
    const detailsLooksLikeJunk = !c.location_details ||
      /אצל|בבית|אירוע\s+חוץ|external/i.test(String(c.location_details || ''));
    if (detailsLooksLikeJunk) c.location_details = cityHit[1];
  }
  // (C) Fallback: prior bot asked for location AND none of the above caught it.
  if (!c.location && !c.location_details) {
    const lastBotAskedLocation = /אצלנו|במקום\s+אחר|איפה\s+(תרצו|רוצים|תהיה|יהיה|זה)|מיקום|איזה\s+עיר/i.test(priorAgentTurn || '');
    if (lastBotAskedLocation && lastCustomerMsg && lastCustomerMsg.length < 80 && !/^\d+$/.test(lastCustomerMsg)) {
      c.location = 'external';
      // Only store the message as details if it looks like an address (no "אצל"/"בבית" junk).
      if (!/אצל|בבית|אירוע\s+חוץ/i.test(lastCustomerMsg)) c.location_details = lastCustomerMsg;
    }
  }
  // Correction detection — if the customer says "לא נכון / טעות / השעה לא / בעצם", clear the
  // matching field from priorLead so the freshly-extracted value (from THIS turn's text) wins.
  const correctionSignals = /(לא\s+נכון|טעו?ת|טעית|בעצם|תקני|תיקון|השעה\s+לא|התאריך\s+לא|לא\s+כתבת|לא\s+אמרתי)/i;
  if (correctionSignals.test(customerLastTurn)) {
    if (/שעה|בשעה|בערב|בבוקר|בצהריים|אחה|בלילה|\d{1,2}[:.]\d{2}|\d{1,2}\s*ב[בצא]/.test(customerLastTurn)) {
      (priorLead as any).event_time = null;
    }
    if (/תאריך|מחר|היום|מחרתיים|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|\d{1,2}[\/.\-]\d{1,2}/.test(customerLastTurn)) {
      (priorLead as any).event_date = null;
    }
    if (/מיקום|אצלכם|אצלנו|בקצרין|בעיר|בעיירה|בקיבוץ/.test(customerLastTurn)) {
      (priorLead as any).location = null; (priorLead as any).location_details = null;
    }
    if (/יום\s*הולדת|חתונה|בר[\s-]?מצוו?ה|בת[\s-]?מצוו?ה|חינה|אירוסים|ברית/.test(customerLastTurn)) {
      (priorLead as any).event_type = null;
    }
  }
  // STRONG name fallback: if the prior bot turn asked "מה השם?", the customer's next short
  // text reply IS the name — overrides whatever Gemini guessed. This fixes the case where the
  // customer wrote "דבירוש" but Gemini stored "חתי" or other hallucinated names.
  const BANNED_NAMES = ['העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'];
  const botAskedName = /(מה\s+ה?שם|השם\s+(?:המלא|שלך|שלכם|הפרטי)|איך\s+קוראים\s+לך|תגיד[יה]?\s+(?:לי\s+את\s+)?ה?שם)/i.test(priorAgentTurn || '');
  if (botAskedName) {
    const lastMsg = String(message || '').trim();
    // Accept Hebrew-letter words, length 2-20, no digits, no obvious phone, no banned tokens.
    const cleaned = lastMsg.replace(/[.,!?]/g, '').trim();
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 30 && /^[א-ת][א-ת\s'"-]*$/.test(cleaned) && !BANNED_NAMES.some((b) => cleaned.includes(b))) {
      c.contact_name = cleaned;
    }
  }
  if (!c.contact_name) {
    const nameMatch = customerText.match(/(?:אני|שמי|השם שלי|קוראים לי)\s+([א-ת]{2,15})/);
    if (nameMatch && !BANNED_NAMES.includes(nameMatch[1])) c.contact_name = nameMatch[1];
  }
  // Always sanitize: if c.contact_name slipped in as a banned agent self-reference, drop it.
  if (c.contact_name && BANNED_NAMES.some((b) => String(c.contact_name).includes(b))) {
    c.contact_name = null;
  }

  // ── Aggregate collected across turns ───────────────────────────────────
  // Each LLM turn returns only what *that* turn captured — earlier values get
  // dropped. We merge the freshly-collected fields on top of the prior lead
  // state so the final summary always reflects every field gathered, not just
  // what the last turn happened to repeat. Also coerces guest_count from a
  // numeric string into a number — Gemini frequently returns "42".
  const _coerceNum = (v: any) => typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
  const merged: any = {
    contact_name: c.contact_name || priorLead?.contact_name || null,
    contact_phone: c.contact_phone || priorLead?.contact_phone || null,
    event_date: c.event_date || c.event_date_iso || priorLead?.event_date || null,
    event_time: c.event_time || (priorLead as any)?.event_time || null,
    hours_window: c.hours_window || (priorLead as any)?.hours_window || null,
    location: c.location || (priorLead as any)?.location || null,
    location_details: c.location_details || (priorLead as any)?.location_details || null,
    guest_count: _coerceNum(c.guest_count) ?? priorLead?.guest_count ?? null,
    event_type: c.event_type || priorLead?.event_type || null,
    special_requests: c.special_requests || (priorLead as any)?.special_requests || null,
  };

  // Fallback: if Gemini omitted guest_count this turn but the customer's
  // last message is just a 1-999 number AND we already have prior info
  // (so the number isn't standing in for a date offset), trust it as
  // guest_count. Gemini drops fields surprisingly often on long Hebrew
  // prompts — this was the reason the summary card refused to render.
  if (!merged.guest_count) {
    const lastMsg = customerLastTurn.trim();
    if (/^\d{1,3}$/.test(lastMsg)) {
      const n = Number(lastMsg);
      if (n > 0 && n < 1000 && (merged.event_date || merged.contact_phone)) {
        merged.guest_count = n;
      }
    }
  }
  // Phone fallback — extract 9-10 digit Israeli mobile from the last
  // customer message if Gemini missed it.
  if (!merged.contact_phone) {
    const digits = customerLastTurn.replace(/[^\d]/g, '');
    if (/^0?5\d{8}$/.test(digits) || /^972\d{8,9}$/.test(digits)) {
      merged.contact_phone = digits;
    }
  }

  // Overwrite c with merged so downstream code (summary, leadData) uses
  // the aggregated state without re-plumbing every reference.
  Object.assign(c, merged);

  // Summary card fires whenever Dana asks for confirmation AND there's
  // ANY collected data — not just when all 4 fields are present. Fields
  // that ARE present render; missing ones are omitted from the card,
  // so the worst case is a small card vs no card at all.
  const hasMinInfo = !!(merged.event_date) && !!merged.guest_count && !!merged.contact_phone;
  const hasAnyInfo = !!merged.contact_phone || !!merged.contact_name || !!merged.event_date || !!merged.guest_count;
  // "Engaged" = the visitor actually typed at least one real message (not
  // just the empty opening turn the page fires on mount). We persist a lead
  // once engaged — even before any contact info — so ABANDONED conversations
  // are captured for funnel analysis ("where did people drop off?"). Pure
  // page-load / bot hits (no user message ever) still create nothing.
  const userEngaged =
    !!customerLastTurn ||
    turns.some((t: any) => t.role !== 'assistant' && String(t?.content || '').trim().length > 0);

  // ── Confirmation-driven close ──────────────────────────────────────────
  // Dana's flow has two stages: (A) she asks 'הפרטים נכונים? תאשר/י',
  // (B) customer confirms → we mark complete + push to manager.
  // We do NOT auto-close on the goodbye phrase any more — that fired before
  // the customer had a chance to verify the summary.
  const replyText = String(result?.reply || '');
  const agentAskingConfirmation = /הפרטים\s+נכונים|תאשר[\?י]?|תאשרו|לאשר\s+(?:ואני|ושאלח|ושלח)|אז\s+אני\s+מסכמת/i.test(replyText);
  // Confirmation close: customer said yes/confirm AFTER prior agent turn asked confirmation.
  const confirmationClose = customerExplicitClose && hasMinInfo && agentAskedToClose;

  // Diagnostic — these show up in server logs so we can see why a close did or didn't fire.
  console.log('[chatEventsInquiry]', JSON.stringify({
    msg: customerLastTurn.slice(0, 60),
    llm_complete: result?.complete,
    llm_stage: result?.stage,
    customerExplicitClose,
    customerSaidYes,
    agentAskedToClose,
    agentAskingConfirmation,
    hasMinInfo,
    hasAnyInfo,
    has_date: !!(c.event_date || c.event_date_iso),
    has_guests: !!c.guest_count,
    has_phone: !!c.contact_phone,
  }));
  // Force close when customer says yes AND we have enough info to call them back. This is the
  // critical anti-stall guard — the LLM tends to keep asking confirmations forever otherwise.
  const forcedClose = confirmationClose;
  const effectiveComplete = forcedClose || (!!result?.complete && (!endsWithQuestion || customerExplicitClose));

  const fullLog = [
    ...turns,
    ...(message ? [{ role: 'user', content: message, timestamp: new Date().toISOString() }] : []),
    { role: 'assistant', content: result?.reply || '', timestamp: new Date().toISOString() },
  ];

  // Persist/upsert the EventLead row
  const score = effectiveComplete && typeof result?.score === 'number' ? Math.round(result.score) : null;
  const status = !effectiveComplete ? 'new' : score === null ? 'new' : score >= 60 ? 'qualified' : score < 30 ? 'cold' : 'warm';
  // ── Encode extra fields (event_time, location, location_details, special_requests)
  // and the manager callback workflow (callback_at, callback_notes) as a JSON suffix
  // inside the existing `notes` column — we used to write them as their own columns
  // but the prisma-db-push at boot was failing on Supabase, so the client expected
  // columns that didn't exist and every findMany blew up. JSON-in-notes is uglier
  // but bulletproof against schema drift.
  const META_MARK = '---META---';
  const prevMeta: any = (() => {
    try {
      const raw = (priorLead as any)?.notes || '';
      const i = raw.indexOf(META_MARK);
      if (i < 0) return {};
      return JSON.parse(raw.slice(i + META_MARK.length).trim()) || {};
    } catch { return {}; }
  })();
  const newMeta = {
    ...prevMeta,
    ...(c.event_time ? { event_time: c.event_time } : {}),
    ...(c.location ? { location: c.location } : {}),
    ...(c.location_details ? { location_details: c.location_details } : {}),
    ...(c.special_requests ? { special_requests: c.special_requests } : {}),
  };
  // Existing notes markers (dana_summary_sent:, intent_alerted:, escalation_alerted:)
  // live BEFORE the META block — preserve them verbatim.
  const priorNotesHead = (() => {
    const raw = (priorLead as any)?.notes || '';
    const i = raw.indexOf(META_MARK);
    return i < 0 ? raw : raw.slice(0, i).trimEnd();
  })();
  const notesWithMeta = `${priorNotesHead}${priorNotesHead ? '\n' : ''}${META_MARK}\n${JSON.stringify(newMeta)}`;

  // Lead pipeline status — repurposes the existing `status` column for the manager
  // workflow. Values: 'new' (collecting) → 'pending' (Dana finished, awaiting call)
  // → 'contacted' / 'quoted' / 'won' / 'lost'. The legacy quality labels
  // (qualified/warm/cold) are still emitted by the scoring code above but get
  // overridden to 'pending' on the close turn so the manager inbox finds it.
  let effectiveStatus = status;
  if (effectiveComplete && c.contact_phone) {
    const priorStatus = (priorLead as any)?.status;
    // Don't downgrade leads the manager already advanced.
    const PIPELINE_ADVANCED = ['contacted', 'quoted', 'won', 'lost'];
    effectiveStatus = PIPELINE_ADVANCED.includes(priorStatus) ? priorStatus : 'pending';
  }

  const leadData: any = {
    contact_name: c.contact_name || null,
    contact_phone: c.contact_phone ? String(c.contact_phone) : null,
    event_date: c.event_date || null,
    event_type: c.event_type || null,
    guest_count: typeof c.guest_count === 'number' ? c.guest_count : null,
    budget_per_person: typeof c.budget_per_person === 'number' ? c.budget_per_person : null,
    hours_window: c.hours_window || null,
    conversation_log: fullLog as any,
    status: effectiveStatus, score,
    source: leadSource,
    notes: notesWithMeta,
  };
  let currentLeadId: string | null = lead_id || null;
  let currentLead: any = null;
  const nowIso = new Date().toISOString();
  try {
    if (currentLeadId) {
      currentLead = await db.eventLead.update({ where: { id: currentLeadId }, data: { ...leadData, updated_date: nowIso } });
    } else if (userEngaged) {
      // Create once the visitor actually typed a real message — this keeps
      // ABANDONED conversations (engaged, no contact info) for funnel
      // analysis, while the empty opening turn the page fires on mount
      // (bots, crawlers, tyre-kickers who never type) still creates nothing.
      // That empty-turn behaviour is what minted 119 junk 'ללא שם' rows
      // on 2026-07-05. No user message yet → return no lead_id; the first
      // real message creates the row with the full conversation log.
      currentLead = await db.eventLead.create({ data: { ...leadData, created_date: nowIso, updated_date: nowIso } });
      currentLeadId = currentLead.id;
    }
  } catch (e: any) { console.error('[eventLead.upsert]', e?.message); }

  // If the LLM crashed mid-conversation, alert the owner IMMEDIATELY (don't wait 10 min)
  // and include the customer's last message + extracted fields so they can call back.
  if (llmError && currentLead) {
    try {
      const tail = [
        '🚨 שיחת AI אירועים נתקעה — התקשר ללקוח עכשיו',
        `👤 ${currentLead.contact_name || 'ללא שם'} · ${currentLead.contact_phone || 'אין טלפון עדיין'}`,
        currentLead.event_date ? `📅 ${currentLead.event_date}` : null,
        currentLead.guest_count ? `👥 ${currentLead.guest_count} אורחים` : null,
        c.event_time ? `⏰ ${c.event_time}` : null,
        '',
        `💬 הודעה אחרונה של הלקוח:`,
        `"${(message || '').slice(0, 200) || '(ריק)'}"`,
        '',
        `⚠️ סיבה: ${String(llmError?.message || llmError).slice(0, 120)}`,
        `📥 מקור: ${currentLead.source || 'web_chat'}`,
      ].filter(Boolean).join('\n');
      pushoverEventsOwners('🚨 AI נפל — ליד באוויר', tail).catch(() => {});
    } catch { /* ignore */ }
  }

  // Cheap dedicated name-extraction pass on EVERY turn where we have a phone but no name yet.
  // Runs once per lead (until name is captured) so /EventsPrivate shows the customer name
  // the moment they introduce themselves — not only after the deal closes.
  // PERF: dispatched as a background side-effect so the extra Gemini round-trip (~1-3s)
  // never blocks the user-facing reply. The close-time AI extraction pass is the
  // authoritative one; this is a "nice-to-have" earlier update of /EventsPrivate.
  if (currentLead && currentLead.contact_phone && !currentLead.contact_name) {
    const customerOnly = turns.filter((t: any) => t.role !== 'assistant').map((t: any) => t.content).concat([message || '']).join('\n');
    if (customerOnly.trim().length > 5) {
      const leadIdForBg = currentLead.id;
      void (async () => {
        try {
          const nameRes: any = await invokeLLM({
            prompt:
              `חלץ את השם הפרטי של הלקוח מתוך הודעותיו (לא של הסוכן). הלקוח עשוי לכתוב 'אני X' / 'שמי X' / 'קוראים לי X' / 'X מדבר/ת' / 'X' בלבד. אם לא הוצג שם — החזר null. **לעולם אל תחזיר**: 'העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'.\n\n--- הודעות הלקוח ---\n${customerOnly.slice(-1500)}\n--- סוף ---\n\nהחזר JSON בלבד.`,
            responseSchema: { type: 'object', properties: { name: { type: 'string' } } },
          });
          const BANNED = ['העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'];
          const nm = String(nameRes?.name || '').trim();
          if (nm && nm.length >= 2 && nm.length <= 30 && !BANNED.some((b) => nm.includes(b))) {
            await db.eventLead.update({ where: { id: leadIdForBg }, data: { contact_name: nm } }).catch(() => {});
          }
        } catch (e: any) { console.warn('[name-extract bg] failed', e?.message); }
      })();
    }
  }

  // Fire a Pushover the FIRST time we capture real intent (phone or guest_count) on this lead.
  // One alert per lead — tracked via a marker inside notes so we don't need a new column.
  try {
    if (currentLead && currentLead.contact_phone && !String(currentLead.notes || '').includes('intent_alerted:')) {
      const lines = [
        '✨ ליד אירוע חדש פעיל — שיחה בעיצומה',
        `👤 ${currentLead.contact_name || 'ללא שם'} · ${currentLead.contact_phone}`,
        currentLead.event_date ? `📅 ${currentLead.event_date}` : null,
        currentLead.event_type ? `🎉 ${currentLead.event_type}` : null,
        currentLead.guest_count ? `👥 ${currentLead.guest_count} אורחים` : null,
        currentLead.budget_per_person ? `💰 ₪${currentLead.budget_per_person}/סועד` : null,
        `📥 מקור: ${currentLead.source || 'web_chat'}`,
      ].filter(Boolean).join('\n');
      pushoverEventsOwners('✨ ליד אירוע חדש — שיחה פעילה', lines).catch(() => {});
      // Also surface in the dedicated WhatsApp inbox / admin feed if available
      // (best-effort; we don't await it on the user reply path).
    }
  } catch { /* non-fatal */ }

  // === Dana flow: rich SUMMARY pushover when the agent finishes gathering
  // info (complete=true), even with no booking/pricing. The legacy flow only
  // pushed on booking creation — the new info-only persona never reaches
  // that branch, so without this block the owner would miss closed leads.
  try {
    if (effectiveComplete && currentLead && !String(currentLead.notes || '').includes('dana_summary_sent:')) {
      const cc: any = c || {};
      const summaryLines = [
        '🎯 ליד אירוע — אסיפת מידע הושלמה',
        '',
        `👤 ${cc.contact_name || currentLead.contact_name || 'ללא שם'}`,
        `📞 ${cc.contact_phone || currentLead.contact_phone || '-'}`,
        '',
        cc.event_date ? `📅 ${cc.event_date}${cc.event_time ? ' ' + cc.event_time : ''}` : null,
        cc.hours_window ? `🕒 חלון: ${cc.hours_window}` : null,
        cc.location ? `📍 מיקום: ${cc.location === 'restaurant' ? 'במסעדה' : (cc.location_details || cc.location)}` : null,
        typeof cc.guest_count === 'number' ? `👥 ${cc.guest_count}${cc.kids_count ? ` (כולל ${cc.kids_count} ילדים)` : ''} אורחים` : null,
        cc.event_type ? `🎉 ${cc.event_type}` : null,
        cc.special_requests ? `⚠️ דרישות: ${cc.special_requests}` : null,
        '',
        '📥 התקשר ללקוח — לא הוצע מחיר בצ\'אט.',
      ].filter(Boolean).join('\n');
      pushoverEventsOwners('🎯 ליד אירוע — מוכן לחזרה', summaryLines).catch(() => {});
      db.eventLead.update({
        where: { id: currentLead.id },
        data: { notes: `${currentLead.notes || ''}${currentLead.notes ? ' | ' : ''}dana_summary_sent:${new Date().toISOString()}` },
      }).catch(() => {});
    }
  } catch { /* non-fatal — owner can still see lead in /EventsPrivate */ }

  // Pad — keeps the matching try/catch counts the same.
  try {
    if (false) {
      // PERF: don't block the user-facing reply on this housekeeping write.
      db.eventLead.update({
        where: { id: currentLead.id },
        data: { notes: `${currentLead.notes || ''}${currentLead.notes ? ' | ' : ''}intent_alerted:${new Date().toISOString()}` },
      }).catch(() => {});
    }
  } catch { /* ignore */ }

  // ── ESCALATION PUSH — buffet / venue rental / any case the agent flags
  // for manual manager handling. Includes a full conversation summary so
  // owner has everything they need to call the customer back.
  try {
    const stageStr = String(result?.stage || '').toLowerCase();
    const isEscalated = result?.escalation === true || stageStr === 'escalated';
    if (isEscalated && currentLead && !String(currentLead.notes || '').includes('escalation_alerted:')) {
      // Build conversation transcript (last 15 turns max)
      const tail = fullLog.slice(-15).map((t: any) => {
        const who = t.role === 'assistant' ? '🤖' : '👤';
        const text = String(t.content || '').replace(/\s+/g, ' ').slice(0, 200);
        return `${who} ${text}`;
      }).join('\n');
      const c = currentLead;
      const summary = [
        '🚨 אירוע דורש את המנהל — לא נסגר אוטומטית',
        `👤 ${c.contact_name || 'ללא שם'} · ${c.contact_phone || '-'}`,
        c.event_date ? `📅 ${c.event_date}${c.event_time ? ` בשעה ${c.event_time}` : ''}` : null,
        c.event_type ? `🎉 סוג: ${c.event_type}` : null,
        c.guest_count ? `👥 ${c.guest_count} אורחים${c.kids_count ? ` (${c.kids_count} ילדים)` : ''}` : null,
        c.budget_per_person ? `💰 תקציב: ₪${c.budget_per_person}/סועד` : null,
        c.notes ? `📝 ${c.notes}` : null,
        '',
        '💬 שיחה:',
        tail,
      ].filter(Boolean).join('\n');
      pushoverEventsOwners('🚨 אירוע להסלמה — מחכה לבדיקה', summary).catch(() => {});
      db.eventLead.update({
        where: { id: currentLead.id },
        data: {
          status: 'escalated',
          notes: `${currentLead.notes || ''}${currentLead.notes ? ' | ' : ''}escalation_alerted:${new Date().toISOString()}`,
        },
      }).catch(() => {});
    }
  } catch { /* ignore */ }

  // Lower threshold for creating a draft booking — the moment we have a date + guest_count + the
  // agent is past the qualification stage, we have enough to push the customer to checkout. Missing
  // total_ils gets a sensible placeholder (guest_count × 250 ₪) so the stub flow always completes.
  let booking_id: string | null = incoming_booking_id || null;
  let payment_url: string | null = null;
  const stage = String(result?.stage || '').toLowerCase();
  // Detect "agent thinks we should send a payment link" from MULTIPLE signals so we never
  // miss a closing turn just because the LLM picked an off-script stage label.
  // (replyText declared earlier for the farewell-close detection — reuse it.)
  const looksLikeSendingPaymentInReply =
    /(שולח[א-ת]?|מעביר[א-ת]?|הנה|מקבל)[\s\S]{0,40}(לינק|קישור|תשלום|פיקדון|מאובטח)/i.test(replyText) ||
    /(תשלום\s*הפיקדון|payment\s*link)/i.test(replyText);
  const stageSignal = /(send_payment|agreed|completed|closing|closed|final|ready_to_pay|payment)/i.test(stage);
  // Booking creation is now MUCH more permissive: as long as we have a phone (so the owner
  // can call back) AND any agreement signal, we create a booking. Date/guests fall back to
  // sane placeholders (tomorrow / 20 guests) and the owner fills in the real values during
  // the manual callback. This is intentional — a partial booking the owner can recover from
  // beats a "perfect" zero-booking-ever flow that drops every conversation.
  const anyAgreementSignal = stageSignal || effectiveComplete || looksLikeSendingPaymentInReply || customerExplicitClose;
  // Dana flow is info-only — never auto-create an EventBooking with placeholder
  // pricing. The legacy 'wantsPayment' branch below would default guests=20 and
  // price = guests×250 = ₪5000, then print that fake amount to the customer.
  // Owner asked: no quote in chat, ever. Disabled until/unless we re-enable the
  // sales agent. (To revert, restore the original expression below.)
  const wantsPayment = false; // legacy: anyAgreementSignal && !!c.contact_phone;
  // Dana's closing line — fires when the customer confirmed the summary.
  // Personal & warm, ends in an olive leaf to keep the brand voice.
  let finalReply = forcedClose
    ? `מעולה! 🌿 שלחתי למנהל את כל הפרטים. הוא יחזור אליך אישית תוך כמה שעות. נדבר בקרוב!`
    : (result?.reply || 'מצטערת, אירעה תקלה. תוכלו לנסות שוב?');

  // === DANA SUMMARY (info-only flow) ==========================================
  // Appended on the AGENT-ASKING-CONFIRMATION turn — i.e. when Dana says
  // 'הפרטים נכונים? תאשר/י' and we have the 4 required fields. The customer
  // sees the structured summary AS PART of Dana's confirmation request, so
  // they can verify it before saying 'כן'. Then on the next turn, when they
  // confirm, we fire the actual close (confirmationClose above) and a clean
  // Dana goodbye replaces the reply entirely.
  // (Bugfix: previously gated by !effectiveComplete, but Gemini occasionally
  // sets complete=true on the same turn it asks for confirmation — which
  // suppressed the summary card and left the customer asked to confirm with
  // nothing to verify against.)
  if (agentAskingConfirmation && hasAnyInfo && !forcedClose) {
    // Coerce guest count from string OR number — the LLM sometimes returns "56"
    const rawGuests = c.guest_count;
    const guests = typeof rawGuests === 'number'
      ? rawGuests
      : (typeof rawGuests === 'string' && /^\d+$/.test(rawGuests.trim()) ? Number(rawGuests.trim()) : null);

    const dateTxt = c.event_date ? String(c.event_date) : null;
    // Prefer explicit time (HH:MM), then hours_window label, then nothing —
    // do NOT invent a time. If neither, the summary just shows the date.
    const timeTxt = (typeof c.event_time === 'string' && /^\d{1,2}:\d{2}/.test(c.event_time))
      ? c.event_time
      : (c.hours_window ? c.hours_window : null);

    const locationTxt = (() => {
      if (c.location === 'restaurant' || /במסעדה|אצלכם|אצלנו/.test(String(c.location || ''))) return 'במסעדה (עלינא)';
      const details = String(c.location_details || c.location || '').trim();
      if (details && details !== 'external') return `אירוע חוץ — ${details}`;
      if (c.location === 'external') return 'אירוע חוץ';
      return null;
    })();

    const summaryLines = [
      '',
      '📋 סיכום ההזמנה:',
      `👤 ${c.contact_name || currentLead?.contact_name || '—'}`,
      `📞 ${c.contact_phone || currentLead?.contact_phone || '—'}`,
      dateTxt
        ? `📅 ${dateTxt}${timeTxt ? ' · ' + timeTxt : ''}`
        : null,
      guests ? `👥 ${guests} אורחים` : null,
      locationTxt ? `📍 ${locationTxt}` : null,
      c.event_type ? `🎉 סוג אירוע: ${c.event_type}` : null,
      '',
      '✅ הפרטים נכונים? תאשר/י ואני שולחת למנהל המסעדה — הוא יחזור אליך אישית עם הצעת מחיר ולתאם תאריך 🌿',
    ].filter(Boolean).join('\n');
    finalReply = `${finalReply}\n${summaryLines}`;
  }
  if (wantsPayment) {
    const guests = Number(c.guest_count) || 20; // placeholder so booking always saves
    const totalFromLLM = typeof c.total_ils === 'number' ? Math.round(c.total_ils) : null;
    const total = totalFromLLM ?? (guests * 250); // placeholder pricing if LLM didn't compute
    const depositPct = kit.deposit_pct ?? 20;
    const deposit = Math.round((total * depositPct) / 100);
    // Prefer ISO date. Fallbacks: event_date string if ISO-shaped, or tomorrow (manager will confirm).
    const isoLike = /^\d{4}-\d{2}-\d{2}$/;
    const llmIso = typeof c.event_date_iso === 'string' && isoLike.test(c.event_date_iso.slice(0, 10)) ? c.event_date_iso.slice(0, 10) : null;
    const llmRaw = typeof c.event_date === 'string' && isoLike.test(c.event_date.slice(0, 10)) ? c.event_date.slice(0, 10) : null;
    const fallbackIso = (() => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const eventDateStr = llmIso || llmRaw || fallbackIso;
    const shortNotice = eventDateStr <= new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    const bookingData: any = {
      lead_id: currentLeadId,
      customer_name: c.contact_name || null,
      customer_phone: c.contact_phone ? String(c.contact_phone) : null,
      event_date: eventDateStr,
      event_time: c.event_time || null,
      guest_count: guests,
      hours_window: c.hours_window || null,
      selected_menu: c.selected_menu_name ? { id: c.selected_menu_id, name: c.selected_menu_name } : null,
      selected_dishes: Array.isArray(c.selected_dishes) ? c.selected_dishes : [],
      selected_upsells: Array.isArray(c.selected_upsells) ? c.selected_upsells : [],
      subtotal_ils: typeof c.subtotal_ils === 'number' ? Math.round(c.subtotal_ils) : null,
      discount_pct: typeof c.discount_pct_requested === 'number' ? Math.min(c.discount_pct_requested, kit.max_discount_pct ?? 5) : 0,
      total_ils: total,
      deposit_amount_ils: deposit,
      payment_status: 'pending',
      status: 'pending_payment',
      approval_status: 'none',
      short_notice: shortNotice,
      source: leadSource,
    };

    // Owner asked to drop online payment for now — manager calls and charges manually.
    bookingData.status = 'pending_manager_callback';
    bookingData.payment_status = 'manual_pending';

    try {
      let booking: any = null;
      let bookingPrev: any = null;
      if (booking_id) {
        bookingPrev = await db.eventBooking.findUnique({ where: { id: booking_id } }).catch(() => null);
        booking = await db.eventBooking.update({ where: { id: booking_id }, data: { ...bookingData, updated_date: nowIso } });
        fireTriggers('EventBooking', 'updated', booking, bookingPrev).catch(() => {});
      } else {
        booking = await db.eventBooking.create({ data: { ...bookingData, created_date: nowIso, updated_date: nowIso } });
        fireTriggers('EventBooking', 'created', booking).catch(() => {});
      }
      booking_id = booking.id;
      // No payment URL — chat closes with a "manager will call" promise. Frontend hides any leftover CTA.
      payment_url = null;

      // Append a clean closing line so the customer always sees the final summary in the chat
      // regardless of what the LLM phrased on its own.
      const summaryLines = [
        '',
        '📋 סיכום ההזמנה:',
        `📅 ${booking.event_date}${booking.event_time ? ` בשעה ${booking.event_time}` : ''}`,
        `👥 ${booking.guest_count} אורחים`,
        booking.selected_menu ? `🍽 חבילה: ${(booking.selected_menu as any).name || '-'}` : null,
        `💰 סכום משוער: ₪${total}`,
        '',
        '📞 מנהל המסעדה ייצור איתכם קשר בהקדם לאישור סופי ולתיאום התשלום. ההזמנה מותנית באישור המנהל.',
      ].filter(Boolean).join('\n');
      finalReply = `${finalReply}${summaryLines.startsWith('\n') ? '' : '\n'}${summaryLines}`;

      // Final extraction pass (mirrors what chatJobApplication does for candidates):
      // re-read the FULL transcript with a strict schema to pull out the customer's name
      // and any fields the per-turn LLM missed. The transcript is truth; the per-turn
      // collected object is often lossy. Also generates the AI summary in the same call
      // to save a round-trip. Best-effort, won't block on failure.
      let aiSummary = '';
      let extractedName: string | null = null;
      let extractedTotal: number | null = null;
      let extractedMenuName: string | null = null;
      try {
        const transcriptForSummary = fullLog
          .map((m: any) => `${m.role === 'assistant' ? 'סוכן' : 'לקוח'}: ${m.content}`)
          .join('\n')
          .slice(-6000);
        const extractRes: any = await invokeLLM({
          prompt:
            `אתה מנתח שיחת מכירה בעברית למנהל מסעדה. החזר אך ורק JSON עם השדות הבאים, חלץ אותם מתוך התמלול:\n` +
            `- customer_name (string או null): שם פרטי של הלקוח כפי שהוא הציג את עצמו. **חשוב**: לעולם אל תחזיר 'העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'בוט' — אלה השמות של הסוכן הדיגיטלי. אם הלקוח לא נתן שם — null.\n` +
            `- selected_menu_name (string או null): שם החבילה / התפריט שהלקוח בחר (אם בחר).\n` +
            `- total_ils (integer או null): הסכום הסופי שהוסכם בש"ח.\n` +
            `- summary (string): 2-3 משפטים על השיחה — מה הלקוח רצה, הטון שלו (התלהבות/היסוס/רגישות למחיר), דרישות מיוחדות, מה דחוף לדעת לפני שיחת הטלפון. אל תחזור על נתונים מבניים.\n\n` +
            `--- תמלול ---\n${transcriptForSummary}\n--- סוף ---\n\nהחזר JSON בלבד.`,
          responseSchema: {
            type: 'object',
            properties: {
              customer_name: { type: 'string' },
              selected_menu_name: { type: 'string' },
              total_ils: { type: 'integer' },
              summary: { type: 'string' },
            },
          },
        });
        aiSummary = String(extractRes?.summary || '').trim();
        const BANNED = ['העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'];
        const nm = String(extractRes?.customer_name || '').trim();
        if (nm && !BANNED.some((b) => nm.includes(b))) extractedName = nm;
        if (extractRes?.selected_menu_name) extractedMenuName = String(extractRes.selected_menu_name).trim();
        if (typeof extractRes?.total_ils === 'number') extractedTotal = Math.round(extractRes.total_ils);
      } catch (e: any) {
        console.warn('[ai_extract] failed', e?.message);
      }

      // Persist the extracted info on both the booking and the lead so /EventsPrivate can show it.
      try {
        const bookingUpdate: any = {};
        if (aiSummary) bookingUpdate.notes = aiSummary;
        if (extractedName) bookingUpdate.customer_name = extractedName;
        if (extractedMenuName && !(booking.selected_menu as any)?.name) bookingUpdate.selected_menu = { name: extractedMenuName };
        if (extractedTotal && (!booking.total_ils || booking.total_ils !== extractedTotal)) {
          bookingUpdate.total_ils = extractedTotal;
          const depositPctNow = kit.deposit_pct ?? 20;
          bookingUpdate.deposit_amount_ils = Math.round((extractedTotal * depositPctNow) / 100);
        }
        if (Object.keys(bookingUpdate).length > 0) {
          await db.eventBooking.update({ where: { id: booking.id }, data: bookingUpdate }).catch(() => {});
          // Reload booking so the Pushover sees the corrected values
          const refreshed = await db.eventBooking.findUnique({ where: { id: booking.id } }).catch(() => null);
          if (refreshed) booking = refreshed;
        }
        if (aiSummary || extractedName) {
          const leadUpdate: any = {};
          if (aiSummary) leadUpdate.ai_summary = aiSummary;
          if (extractedName) leadUpdate.contact_name = extractedName;
          if (currentLeadId) {
            await db.eventLead.update({ where: { id: currentLeadId }, data: leadUpdate }).catch(() => {});
          }
        }
      } catch { /* ignore */ }

      // FULL Pushover to the manager — everything they need to call the customer back, with the AI summary.
      try {
        const menuName = (booking.selected_menu as any)?.name || '-';
        const upsellsList = Array.isArray(booking.selected_upsells) && booking.selected_upsells.length
          ? booking.selected_upsells.map((u: any) => `${u.name}${u.price ? ` (₪${u.price})` : ''}`).join(', ')
          : '—';
        const lines = [
          '🎯 ליד אירוע סגר — צריך להתקשר ולגבות',
          '',
          `👤 ${booking.customer_name || 'ללא שם'}`,
          `📞 ${booking.customer_phone || '-'}`,
          '',
          `📅 ${booking.event_date}${booking.event_time ? ` בשעה ${booking.event_time}` : ''}`,
          booking.hours_window ? `🕒 חלון שעות: ${booking.hours_window}` : null,
          `👥 ${booking.guest_count} אורחים`,
          `🍽 חבילה: ${menuName}`,
          `✨ אפסיילים: ${upsellsList}`,
          `💰 סה"כ משוער: ₪${total}`,
          shortNotice ? '⚡ Short-notice (עד 48h) — דחוף' : null,
          `📥 מקור: ${booking.source || '-'}`,
          aiSummary ? `\n🧠 סיכום שיחה:\n${aiSummary}` : null,
          '',
          '🔗 לאישור ב-/EventsPrivate',
        ].filter(Boolean).join('\n');
        pushoverEventsOwners('🎯 אירוע נסגר — התקשר ללקוח', lines).catch(() => {});
      } catch { /* ignore */ }
    } catch (e: any) {
      console.error('[eventBooking.create]', e?.message);
    }
  }

  // Show explicit confirm/decline buttons in the chat UI whenever the agent has put a number
  // in front of the customer — far more reliable than asking them to type "סגור". A click
  // sends a deterministic message that our close-detection always recognizes.
  const showConfirmButtons = !booking_id && !effectiveComplete && (
    stageSignal ||
    /(stage|שלב)\s*['":\s]*(agreed|quoting|send_payment|negotiation)/i.test(JSON.stringify(result || {})) ||
    /(₪|ש["״]?ח|סה["״]?כ|מחיר|לסועד|לסוכם|סגור\?)/.test(replyRaw)
  );

  return {
    reply: finalReply,
    complete: effectiveComplete,
    stage: result?.stage || null,
    rejected: false, // never auto-reject — frontend keeps chat open until customer pays or explicitly leaves
    lead_id: currentLeadId,
    booking_id,
    payment_url,
    score,
    show_confirm_buttons: showConfirmButtons,
  };
}, { public: true });

// AUTH — admin pulls all event leads for the dashboard.
// Order by id desc since cuid is time-sortable and many legacy rows have created_date=null
// (which would sort first/last unpredictably and hide the newest leads).
// =================== AGENT #1 — Weekly schedule builder ===================
// Multi-step flow over Sun→Mon→Tue: open submissions, remind stragglers,
// then on Tue 16:00 build a draft schedule with the LLM + insights, and
// send the owner a WhatsApp with a link to approve/edit.

// "Next week" = the Sun-Sat that starts on the NEXT Sunday from today (IL).
function getNextWeekDates(): string[] {
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const ilDayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(new Date());
  const ilDay = dayMap[ilDayName] ?? 0;
  const daysUntilNextSunday = ilDay === 0 ? 7 : 7 - ilDay;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysUntilNextSunday + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// For WhatsApp reminders — we need a phone to actually message them.
async function getActiveEmployeesForScheduling(): Promise<any[]> {
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, full_name, phone, role, department, positions, status
    FROM "Employee"
    WHERE status = 'active' AND phone IS NOT NULL AND phone <> ''
  `;
  return rows;
}

// For the schedule BUILDER — phone is irrelevant. Anyone who's active can be
// slotted into a shift; missing phone just means we can't send them a WA
// reminder about it. Historically this used the phone-required helper above,
// which silently dropped 7/9 waiters who had submitted availability but had
// no phone on file, leaving the LLM to schedule only 2 people.
async function getSchedulableEmployees(): Promise<any[]> {
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, full_name, phone, role, department, positions, status
    FROM "Employee"
    WHERE status = 'active'
  `;
  return rows;
}

async function getSubmittedEmployeeIdsForWeek(weekDates: string[]): Promise<Set<string>> {
  if (weekDates.length === 0) return new Set();
  const start = new Date(weekDates[0] + 'T00:00:00.000Z');
  const end = new Date(weekDates[weekDates.length - 1] + 'T23:59:59.999Z');
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT DISTINCT employee_id FROM "EmployeeAvailability"
    WHERE date >= ${start} AND date <= ${end}
  `;
  return new Set(rows.map((r) => r.employee_id).filter(Boolean));
}

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://topalena.com';

// Cron: Sun 10:00 IL. Sends every active employee a WhatsApp to fill the form.
export async function runWeeklyScheduleOpen() {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  if (il.weekday !== 'Sun' || parseInt(il.hour, 10) !== 10) return { skipped: true, reason: 'wrong window', il };
  const employees = await getActiveEmployeesForScheduling();
  const weekDates = getNextWeekDates();
  const formatHe = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const link = `${APP_BASE_URL}/AvailabilityForm`;
  let sent = 0;
  for (const emp of employees) {
    const msg = `*היי ${emp.full_name}* 👋\n\nהסידור לשבוע הבא (${formatHe(weekDates[0])}-${formatHe(weekDates[6])}) נפתח להגשת זמינות.\n\nהיכנס/י לאפליקציה ומלא/י:\n${link}\n\nסגירה: יום שלישי 16:00.`;
    try { await sendWhatsApp(emp.phone, msg); sent++; } catch (e: any) { console.warn('[weekly-open] failed', emp.phone, e?.message); }
  }
  return { ok: true, sent, total: employees.length };
}

// Cron: Mon 10:00 IL. Reminder to those who haven't submitted yet.
export async function runWeeklyScheduleReminder(opts: { force?: boolean } = {}) {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  if (!opts.force && (il.weekday !== 'Mon' || parseInt(il.hour, 10) !== 10)) return { skipped: true, reason: 'wrong window', il };
  const weekDates = getNextWeekDates();
  const submitted = await getSubmittedEmployeeIdsForWeek(weekDates);
  const employees = await getActiveEmployeesForScheduling();
  const missing = employees.filter((e) => !submitted.has(e.id));
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const link = `${APP_BASE_URL}/AvailabilityForm`;
  let sent = 0;
  for (const emp of missing) {
    const msg = `⏰ *תזכורת — ${emp.full_name}*\n\nעוד לא הגשת זמינות לשבוע הבא. סגירה מחר (שלישי) ב-16:00.\n\n${link}`;
    try { await sendWhatsApp(emp.phone, msg); sent++; } catch (e: any) { console.warn('[weekly-rem1] failed', emp.phone, e?.message); }
  }
  return { ok: true, sent, missing_count: missing.length };
}

// Cron: Tue 14:00 IL. Last reminder, 2h before deadline.
export async function runWeeklyScheduleFinalReminder() {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  if (il.weekday !== 'Tue' || parseInt(il.hour, 10) !== 14) return { skipped: true, reason: 'wrong window', il };
  const weekDates = getNextWeekDates();
  const submitted = await getSubmittedEmployeeIdsForWeek(weekDates);
  const employees = await getActiveEmployeesForScheduling();
  const missing = employees.filter((e) => !submitted.has(e.id));
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const link = `${APP_BASE_URL}/AvailabilityForm`;
  let sent = 0;
  for (const emp of missing) {
    const msg = `🚨 *תזכורת אחרונה — ${emp.full_name}*\n\nנשארו ~2 שעות לסגירה (16:00 היום). אם לא תגיש — לא נוכל לשבץ אותך השבוע.\n\n${link}`;
    try { await sendWhatsApp(emp.phone, msg); sent++; } catch (e: any) { console.warn('[weekly-rem2] failed', emp.phone, e?.message); }
  }
  return { ok: true, sent, missing_count: missing.length };
}

// Cron: Tue 16:00 IL. Notify owner of missing; build draft schedule; send insights.
// Turn a placement list into WorkShift rows. If `division` is set, we PRESERVE
// staff from the OTHER division on that shift (so building פלור never wipes
// existing מטבח assignments). Existing same-division staff on the shift are
// replaced; the row is upserted per (date, shift_type).
async function persistScheduleAssignments(
  assignments: any[],
  _weekDates: string[],
  division?: 'floor' | 'kitchen' | null,
) {
  // Collect new placements bucketed by (date, shift_type).
  const byDayShift: Record<string, any[]> = {};
  for (const a of assignments) {
    const key = `${a.date}__${a.shift_type}`;
    (byDayShift[key] = byDayShift[key] || []).push({
      employee_id: a.employee_id, employee_name: a.employee_name, position: a.position,
      start_time: a.shift_type === 'lunch' ? '10:00' : '17:00',
      end_time: a.shift_type === 'lunch' ? '17:00' : '01:00',
      status: 'scheduled', manual_entry: false,
    });
  }

  let createdShifts = 0;
  for (const key of Object.keys(byDayShift)) {
    const [date, shift_type] = key.split('__');
    const dateObj = new Date(date + 'T00:00:00.000Z');

    // Find any existing WorkShift row for this slot so we can keep the OTHER
    // division's staff around when we rewrite this one.
    const existingRow: any = await (prisma as any).workShift.findFirst({
      where: { date: dateObj, shift_type },
    });
    let keptStaff: any[] = [];
    if (existingRow && Array.isArray(existingRow.assigned_staff) && division) {
      const otherDiv = division === 'floor' ? 'kitchen' : 'floor';
      keptStaff = existingRow.assigned_staff.filter((s: any) => {
        const d = positionDivision(s?.position || '');
        return d === otherDiv; // keep only the other division's rows
      });
    }
    const merged = [...keptStaff, ...byDayShift[key]];

    if (existingRow) {
      await (prisma as any).workShift.update({
        where: { id: existingRow.id },
        data: { assigned_staff: merged },
      });
    } else {
      await (prisma as any).workShift.create({
        data: {
          date: dateObj,
          shift_type,
          start_time: shift_type === 'lunch' ? '10:00' : '17:00',
          end_time: shift_type === 'lunch' ? '17:00' : '01:00',
          assigned_staff: merged,
        },
      });
    }
    createdShifts++;
  }
  return { createdShifts, assignmentCount: assignments.length };
}

// Human-readable summary of what changes if the admin approves the new plan.
// Groups by (date, shift_type) → lists removed / added employees per slot.
function buildScheduleDiff(existing: any[], newAssignments: any[]) {
  const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const SHIFT_LABEL: Record<string, string> = { lunch: 'צהריים', dinner: 'ערב' };
  const oldBySlot: Record<string, Set<string>> = {};
  for (const w of existing) {
    const d = String(w.date_str || '').slice(0, 10);
    const key = `${d}__${w.shift_type}`;
    const set = oldBySlot[key] = oldBySlot[key] || new Set<string>();
    const staff = Array.isArray(w.assigned_staff) ? w.assigned_staff : [];
    for (const s of staff) {
      const name = s?.employee_name || s?.name;
      if (name) set.add(String(name));
    }
  }
  const newBySlot: Record<string, Set<string>> = {};
  for (const a of newAssignments) {
    const key = `${a.date}__${a.shift_type}`;
    const set = newBySlot[key] = newBySlot[key] || new Set<string>();
    if (a.employee_name) set.add(String(a.employee_name));
  }
  const allKeys = [...new Set([...Object.keys(oldBySlot), ...Object.keys(newBySlot)])].sort();
  const totalsOld = Object.values(oldBySlot).reduce((n, s) => n + s.size, 0);
  const totalsNew = Object.values(newBySlot).reduce((n, s) => n + s.size, 0);
  const perSlot: string[] = [];
  for (const key of allKeys) {
    const [date, shift] = key.split('__');
    const oldSet = oldBySlot[key] || new Set<string>();
    const newSet = newBySlot[key] || new Set<string>();
    const removed = [...oldSet].filter((n) => !newSet.has(n));
    const added = [...newSet].filter((n) => !oldSet.has(n));
    if (!removed.length && !added.length) continue;
    const dayIdx = new Date(date + 'T12:00:00Z').getUTCDay();
    const label = `${HE_DAYS[dayIdx]} ${date.slice(8)}.${date.slice(5, 7)} ${SHIFT_LABEL[shift] || shift}`;
    const parts: string[] = [];
    if (removed.length) parts.push(`יוצאים: ${removed.join(', ')}`);
    if (added.length) parts.push(`נכנסים: ${added.join(', ')}`);
    perSlot.push(`• ${label}: ${parts.join(' | ')}`);
  }
  return {
    total_old: totalsOld,
    total_new: totalsNew,
    changes_count: perSlot.length,
    lines: perSlot.slice(0, 15), // cap so WhatsApp message stays readable
    truncated: perSlot.length > 15,
  };
}

// Which positions belong to each division. The scheduler filters submissions
// so building "פלור" never touches or displaces kitchen assignments and vice
// versa. Match by substring so misspellings/aliases still land in the right
// bucket ("מלצר", "מלצרית", "מלצר בכיר" all → פלור).
const FLOOR_POSITIONS = ['מלצר','ברמן','מארחת','פלור','קופה','ראנר','בלתם','משמרת'];
const KITCHEN_POSITIONS = ['טבח','חומוס','שטיפה','מטבח','קונדיטור','סושי'];
function positionDivision(name: string): 'floor' | 'kitchen' | null {
  const n = String(name || '').trim();
  if (!n) return null;
  if (FLOOR_POSITIONS.some((p) => n.includes(p))) return 'floor';
  if (KITCHEN_POSITIONS.some((p) => n.includes(p))) return 'kitchen';
  return null;
}

export async function runWeeklyScheduleBuild(opts: {
  force?: boolean;
  replaceExisting?: boolean;
  applyPlan?: { assignments: any[]; insights: string[] };
  division?: 'floor' | 'kitchen';
} = {}) {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  if (!opts.force && (il.weekday !== 'Tue' || parseInt(il.hour, 10) !== 16)) return { skipped: true, reason: 'wrong window', il };

  const weekDates = getNextWeekDates();
  const start = new Date(weekDates[0] + 'T00:00:00.000Z');
  const end = new Date(weekDates[weekDates.length - 1] + 'T23:59:59.999Z');

  // Fast path — caller already has a placement plan they confirmed to apply.
  // When a division is scoped, we do NOT wipe the whole week — persist merges
  // the new placements with the other division's existing staff.
  if (opts.applyPlan) {
    if (!opts.division) {
      await (prisma as any).$executeRaw`
        DELETE FROM "WorkShift" WHERE date >= ${start} AND date <= ${end}
      `;
    }
    const { createdShifts, assignmentCount } = await persistScheduleAssignments(
      opts.applyPlan.assignments, weekDates, opts.division || null,
    );
    return {
      ok: true,
      createdShifts,
      assignmentCount,
      insights: opts.applyPlan.insights,
      missing: [],
      replaced: true,
    };
  }

  // Pull ALL availability records with a wide window, then filter by
  // matching the DATE part (yyyy-mm-dd) against weekDates[] — mirrors what
  // the /AvailabilityRequests page does client-side. This avoids TZ off-by-
  // one bugs where date >= UTC-midnight silently misses records stored as
  // Israel-local-midnight (2026-07-04T21:00Z on the wire).
  const targetDateSet = new Set(weekDates);
  const rawAvailability: any[] = await (prisma as any).$queryRaw`
    SELECT employee_id, employee_name, date::text AS date_str, availability_type, shift_preference, positions
    FROM "EmployeeAvailability"
    WHERE date >= NOW() - INTERVAL '30 days' AND date <= NOW() + INTERVAL '30 days'
  `;
  const submissions: any[] = rawAvailability.filter((r: any) =>
    targetDateSet.has(String(r.date_str || '').slice(0, 10)),
  );
  // Use the phone-less variant here — anyone active can be slotted, even if
  // we can't WhatsApp them about it. The reminder cron still filters on phone
  // because a reminder without a phone is pointless.
  const employees = await getSchedulableEmployees();
  const submitted = new Set(submissions.map((r) => r.employee_id).filter(Boolean));
  const missing = employees.filter((e) => !submitted.has(e.id));

  // Diagnostic: how many EmployeeAvailability records exist in DB at all?
  // Users sometimes submit for a different week than what the builder is
  // targeting; the previous 'success/0' response hid that gap.
  if (submissions.length === 0) {
    const allRecent: any[] = await (prisma as any).$queryRaw`
      SELECT date::text AS date_str, employee_name FROM "EmployeeAvailability"
      WHERE date >= NOW() - INTERVAL '60 days' AND date <= NOW() + INTERVAL '60 days'
      ORDER BY date DESC LIMIT 30
    `;
    const insights: string[] = [];
    if (allRecent.length === 0) {
      insights.push(
        `אין אף רשומת זמינות ב-DB (חיפוש ב-60 יום סביב היום).`,
        `שלח לצוות תזכורת דרך העוזר: "שלח תזכורת זמינות".`,
      );
    } else {
      const uniqueDates = [...new Set(allRecent.map((r: any) => r.date_str.slice(0, 10)))].sort();
      const minDate = uniqueDates[0];
      const maxDate = uniqueDates[uniqueDates.length - 1];
      insights.push(
        `⚠️ יש ${allRecent.length} זמינויות במערכת — אבל כולן לתאריכים אחרים.`,
        `הבנייה מכוונת ל-${weekDates[0]} עד ${weekDates[6]} (השבוע הבא).`,
        `הזמינויות שהוגשו הן ל-${minDate} עד ${maxDate}.`,
        `אם רוצים לבנות סידור לשבוע אחר — תגיד לי מתי (לדוגמה: "בנה סידור לשבוע 22.07").`,
      );
    }
    return {
      createdShifts: 0,
      assignmentCount: 0,
      insights,
      missing: missing.map((m) => m.full_name),
      no_availability: true,
      target_week: `${weekDates[0]} — ${weekDates[6]}`,
    };
  }

  // Recent-shifts count (last 4 weeks per employee) — informs target hours.
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400 * 1000);
  const recent: any[] = await (prisma as any).$queryRaw`
    SELECT date::text AS date_str, assigned_staff FROM "WorkShift" WHERE date >= ${fourWeeksAgo}
  `;
  const shiftCounts: Record<string, number> = {};
  for (const ws of recent) {
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staff) {
      if (a?.employee_id) shiftCounts[a.employee_id] = (shiftCounts[a.employee_id] || 0) + 1;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  Deterministic direct placement — NO LLM.
  //  Rule the owner asked for (2026-07-01):
  //    "כל מי שהגיש זמינות ליום מסוים — שיבצו אותו לאותה משמרת. תפקיד =
  //     מה שהגיש, ברירת מחדל 'מלצר'. זהו. בלי סינונים."
  //  Semantics:
  //    - availability_type === 'available' → placed on both lunch AND dinner
  //      (unless shift_preference narrows to one).
  //    - availability_type === 'partial' → placed only on the preferred shift.
  //    - availability_type === 'unavailable' → skipped.
  //    - position = first EmployeeAvailability.positions entry, else first
  //      Employee.positions entry, else 'מלצר'.
  //    - Friday/Saturday get dinner only (matches restaurant hours).
  // ────────────────────────────────────────────────────────────────────
  const empByIdForBuild: Record<string, any> = {};
  for (const e of employees) empByIdForBuild[e.id] = e;

  const directAssignments: any[] = [];
  const seenSlot = new Set<string>(); // dedupe: emp × date × shift
  const SAT_INDEX = 6; // Saturday only — dinner-only. Friday allows both.
  const div = opts.division || null; // null = both divisions, else 'floor'/'kitchen'

  for (const sub of submissions) {
    const type = String(sub.availability_type || '').toLowerCase();
    if (type === 'unavailable') continue;

    const emp = empByIdForBuild[sub.employee_id];
    if (!emp) continue; // employee filtered out (inactive/terminated)

    const dateStr = String(sub.date_str || '').slice(0, 10);
    if (!dateStr) continue;
    const dayIdx = new Date(dateStr + 'T12:00:00Z').getUTCDay();

    // Position: submission's first position → employee's first → default מלצר
    const subPositions = Array.isArray(sub.positions) ? sub.positions : [];
    const empPositions = Array.isArray(emp.positions) ? emp.positions : [];
    const pickName = (p: any) => (typeof p === 'string' ? p : (p?.position_name || p?.name || ''));
    const position = (subPositions.map(pickName).find(Boolean))
      || (empPositions.map(pickName).find(Boolean))
      || 'מלצר';

    // Division filter — if the caller asked for one division only, skip
    // submissions whose position lives on the other side of the house.
    // Unmapped positions (unknown role) fall through when div is null; when
    // a division is set we default them to floor to avoid silent drops.
    if (div) {
      const empDiv = positionDivision(position) || 'floor';
      if (empDiv !== div) continue;
    }

    // Which shifts today: partial = only the preferred one, available = both.
    const pref = String(sub.shift_preference || '').toLowerCase();
    let shiftsToday: string[];
    if (type === 'partial') {
      shiftsToday = pref === 'lunch' || pref === 'dinner' ? [pref] : ['dinner'];
    } else if (pref === 'lunch') shiftsToday = ['lunch'];
    else if (pref === 'dinner') shiftsToday = ['dinner'];
    else shiftsToday = ['lunch', 'dinner']; // 'both' or blank

    // Saturday = dinner only. Friday keeps both lunch + dinner.
    if (dayIdx === SAT_INDEX) shiftsToday = shiftsToday.filter((s) => s === 'dinner');
    if (shiftsToday.length === 0) shiftsToday = ['dinner']; // fallback for Sat if pref=lunch

    for (const shift of shiftsToday) {
      const key = `${emp.id}__${dateStr}__${shift}`;
      if (seenSlot.has(key)) continue;
      seenSlot.add(key);
      directAssignments.push({
        date: dateStr,
        shift_type: shift,
        employee_id: emp.id,
        employee_name: emp.full_name,
        position,
      });
    }
  }

  // Simple insights — count missing role coverage across the week.
  const insightsForOwner: string[] = [];
  const posByShift: Record<string, Record<string, number>> = {};
  for (const a of directAssignments) {
    const key = `${a.date}__${a.shift_type}`;
    posByShift[key] = posByShift[key] || {};
    posByShift[key][a.position] = (posByShift[key][a.position] || 0) + 1;
  }
  const submitterNames = new Set<string>();
  for (const s of submissions) if (s.employee_name) submitterNames.add(String(s.employee_name));
  insightsForOwner.push(`שיבוץ ישיר: ${submitterNames.size} עובדים שהגישו זמינות שובצו במשמרות שלהם.`);
  if (missing.length) {
    insightsForOwner.push(`לא הגישו זמינות: ${missing.map((m) => m.full_name).join(', ')}.`);
  }

  // Legacy path built the same shape (assignments + insights) via an LLM
  // and threaded them through the overwrite guard. Skip the LLM entirely
  // and reuse the guard machinery below with our deterministic result.
  const _skipLLMSummary = { assignments: directAssignments, insights: insightsForOwner };

  const empSummary = employees.map((e) => {
    const myAvail = submissions.filter((s) => s.employee_id === e.id);
    const defaultPositions = (e.positions || []).map((p: any) => p?.position_name || p).filter(Boolean);
    // Aggregate all distinct positions across their availability rows this week.
    const availPositions = new Set<string>();
    for (const s of myAvail) {
      const arr = Array.isArray(s.positions) ? s.positions : [];
      for (const p of arr) {
        const name = typeof p === 'string' ? p : (p?.position_name || p?.name || '');
        if (name) availPositions.add(String(name));
      }
    }
    const effectivePositions = availPositions.size > 0 ? [...availPositions] : defaultPositions;
    return {
      id: e.id,
      name: e.full_name,
      submitted: submitted.has(e.id),
      positions: effectivePositions,
      department: e.department || null,
      avg_shifts_per_week: Math.round((shiftCounts[e.id] || 0) / 4),
      availability: myAvail.map((s) => ({
        date: s.date_str.slice(0, 10),
        type: s.availability_type,
        shift: s.shift_preference,
        positions: Array.isArray(s.positions)
          ? s.positions.map((p: any) => typeof p === 'string' ? p : (p?.position_name || p?.name || '')).filter(Boolean)
          : [],
      })),
    };
  });

  // Load active user-defined constraints — get injected into the prompt so
  // the LLM knows about them, then the post-build validator double-checks.
  await ensureSchedulingRulesTable().catch(() => { /* first-run soft */ });
  const activeRules: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT description FROM "SchedulingRule" WHERE active = true ORDER BY "createdAt" ASC`,
  ).catch(() => []);
  const rulesBlock = activeRules.length
    ? `\n*חוקים מותאמים אישית של המנהל (חובה לכבד):*\n${activeRules.map((r: any, i: number) => `${i + 6}. ${r.description}`).join('\n')}\n`
    : '';

  const prompt = `אתה אחראי משמרות במסעדה. בנה טיוטת סידור עבודה לשבוע ${weekDates[0]} עד ${weekDates[6]}.

⚠️ *עקרון חשוב:* עדיף סידור *חלקי* (למשל רק פלור בלי מטבח) עם תובנות ברורות מה חסר, מאשר לא לשבץ אף אחד. תמיד שבץ את מה שאתה יכול.

חוקים:
1. כל יום יש 2 משמרות: lunch (~10:00-17:00) ו-dinner (~17:00-01:00). שישי + שבת = רק dinner.
2. כמות אידיאלית פר משמרת: 2 מלצרים, 1 ברמן, 1 מארחת, 2 טבחים, 1 שטיפה. **אם חסרים תפקידים — שבץ מה שאתה יכול ותכתוב ב-insights איפה חסר.**
3. אל תשבץ עובד פעמיים באותו יום (lunch+dinner = OK רק אם הוא מילא both).
4. עובד שמסומן 'unavailable' באותו יום — אל תשבץ. עובד שמסומן 'partial' — שבץ רק לפי shift_preference. עובד שמסומן 'available' או 'preferred' — זמין להשיבוץ באותה משמרת.
5. **חובה לפזר בהוגנות בין כל העובדים שהגישו זמינות.** אל תדחוס את כל המשמרות ל-2-3 עובדים ותשאיר אחרים ריקים. שאף ל-3-5 משמרות לכל עובד שהגיש. אם avg_shifts_per_week הוא 0, זה עובד חדש — התייחס אליו כרגיל (4 משמרות ממוצע). avg_shifts_per_week הוא רק *רמז* לוותיקים, לא תקרה קשיחה.
5a. **אל תשאיר עובד שהגיש זמינות בלי אף משמרת.** אם הגיש = חייב לקבל לפחות משמרת אחת (אלא אם כל הימים שלו unavailable).
6. **חובה:** אם לא שיבצת עובד ל-shift מסוים, כתוב ב-insights *בדיוק* איזה תפקיד חסר באיזה יום ומשמרת. דוגמה: "חסר טבח כל השבוע — אף טבח לא הגיש זמינות". דוגמה נוספת: "חסר ברמן בשבת ערב — יוסי היחיד ברמן מסומן unavailable שבת".
7. **חובה:** אם החזרת assignments ריק, insights חייב להסביר למה במפורש.${rulesBlock}

קלט (עובדים + זמינויות):
${JSON.stringify(empSummary, null, 2)}

החזר *רק JSON*:
{
  "assignments": [
    { "date": "YYYY-MM-DD", "shift_type": "lunch|dinner", "employee_id": "...", "employee_name": "...", "position": "מלצר|ברמן|מארחת|טבח|שטיפה" }
  ],
  "insights": [
    "טקסט תובנה (לדוגמה: 'חסר מלצר ברביעי בערב — רק 1 זמין, צריך 2', 'יותם עומס יתר — 8 משמרות במקום 5 הרגילות')"
  ]
}`;

  // Owner ask (2026-07-01): skip the LLM — use the deterministic direct
  // placement we built above. The `prompt` / empSummary / activeRules lines
  // still run so the JSON payload is available for debugging & for the LLM-
  // based path we may re-enable via a config flag later.
  void prompt; // referenced so tooling doesn't flag as unused
  const assignments: any[] = _skipLLMSummary.assignments;
  const insights: string[] = _skipLLMSummary.insights;

  // Overwrite guard — check for existing WorkShift rows for this week AFTER
  // the LLM has produced a plan. If we found any and the caller didn't
  // explicitly opt into replacing, return a diff summary so the admin can
  // decide "החלף" vs "בטל" with full information (not just a count).
  const existingRaw: any[] = await (prisma as any).$queryRaw`
    SELECT date::text AS date_str, shift_type, assigned_staff FROM "WorkShift"
    WHERE date >= ${start} AND date <= ${end}
  `;
  // When a division is scoped, only count same-division existing rows for
  // the overwrite prompt — the other division isn't being touched.
  const existing: any[] = opts.division
    ? existingRaw.map((w: any) => ({
        ...w,
        assigned_staff: (Array.isArray(w.assigned_staff) ? w.assigned_staff : [])
          .filter((s: any) => (positionDivision(s?.position || '') || 'floor') === opts.division),
      })).filter((w: any) => w.assigned_staff.length > 0)
    : existingRaw;
  if (existing.length && !opts.replaceExisting) {
    // Sanity — if the LLM returned 0 or shrank by >50% vs the existing draft,
    // it's almost certainly a build failure, not the manager's real intent.
    // NEVER offer to overwrite in that case — return an explanatory reply.
    const existingCount = existing.reduce((n, w) =>
      n + (Array.isArray(w.assigned_staff) ? w.assigned_staff.length : 0), 0);
    if (assignments.length === 0) {
      return {
        ok: false,
        empty_plan: true,
        target_week: `${weekDates[0]} — ${weekDates[6]}`,
        existing_count: existing.length,
        existing_assignments: existingCount,
        insights,
        reason: 'LLM החזיר תוכנית ריקה — הסידור הקיים לא נגע.',
      };
    }
    if (assignments.length < existingCount / 2) {
      return {
        ok: false,
        plan_too_small: true,
        target_week: `${weekDates[0]} — ${weekDates[6]}`,
        existing_assignments: existingCount,
        new_assignments: assignments.length,
        insights,
        reason: `הסידור החדש (${assignments.length} שיבוצים) קטן משמעותית מהקיים (${existingCount}). לא מציע החלפה כדי לא לאבד את הישן.`,
      };
    }
    const diff = buildScheduleDiff(existing, assignments);
    return {
      needs_confirmation: true,
      existing_count: existing.length,
      existing_assignments: existingCount,
      target_week: `${weekDates[0]} — ${weekDates[6]}`,
      week_start: weekDates[0],
      diff,
      plan: { assignments, insights },
    };
  }
  if (existing.length && opts.replaceExisting && !opts.division) {
    // Full-week replace only when no division scope — otherwise persist
    // merges same-division rows and preserves the other division.
    await (prisma as any).$executeRaw`
      DELETE FROM "WorkShift" WHERE date >= ${start} AND date <= ${end}
    `;
  }

  const { createdShifts } = await persistScheduleAssignments(assignments, weekDates, opts.division || null);

  // Notify owner via WhatsApp
  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (adminNumbers.length) {
    const { sendWhatsApp } = await import('../lib/twilio.js');
    const missingNames = missing.map((m) => m.full_name).join(', ') || 'אף אחד';
    const insightLines = insights.length ? insights.map((i) => `• ${i}`).join('\n') : '• הסידור מאוזן, לא נמצאו חוסרים';
    const msg = `📋 *סידור שבוע ${weekDates[0].slice(8)}.${weekDates[0].slice(5, 7)}-${weekDates[6].slice(8)}.${weekDates[6].slice(5, 7)} מוכן*\n\n` +
      `✅ ${createdShifts} משמרות נבנו (${assignments.length} שיבוצים)\n\n` +
      `⚠️ *לא הגישו זמינות:* ${missingNames}\n\n` +
      `💡 *תובנות:*\n${insightLines}\n\n` +
      `🔗 לאישור / עריכה:\n${APP_BASE_URL}/WorkScheduling`;
    for (const p of adminNumbers) {
      try { await sendWhatsApp(p, msg); } catch (e: any) { console.warn('[weekly-build] notify failed', e?.message); }
    }
  }

  return { ok: true, createdShifts, assignmentCount: assignments.length, insights, missing: missing.map((m) => m.full_name) };
}

// =================== AGENT #11 — Invoice Classifier ===================
// Daily 10:00 IL. Scans yesterday's invoices, compares each supplier's total
// to its 90-day average. WhatsApps the admin a summary listing anomalies
// (>150% of avg = SPIKE, <50% = DROP). Silent if nothing unusual.
export async function runInvoiceClassifier() {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date());
  if (parseInt(il, 10) !== 10) return { skipped: true, hour: il };
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const newInvoices: any[] = await (prisma as any).invoice.findMany({
    where: { createdAt: { gte: since } }, take: 200,
  });
  if (!newInvoices.length) return { ok: true, no_new: true };
  const ninetyAgo = new Date(Date.now() - 90 * 86400 * 1000);
  const supplierIds = [...new Set(newInvoices.map((i) => i.supplier_id).filter(Boolean))];
  const history: any[] = await (prisma as any).invoice.findMany({
    where: { supplier_id: { in: supplierIds }, createdAt: { gte: ninetyAgo, lt: since } },
    take: 1000,
  });
  const avgBySupplier: Record<string, number> = {};
  const countBySupplier: Record<string, number> = {};
  for (const h of history) {
    avgBySupplier[h.supplier_id] = (avgBySupplier[h.supplier_id] || 0) + (h.total_amount || 0);
    countBySupplier[h.supplier_id] = (countBySupplier[h.supplier_id] || 0) + 1;
  }
  for (const sid of Object.keys(avgBySupplier)) avgBySupplier[sid] /= (countBySupplier[sid] || 1);

  const anomalies: string[] = [];
  for (const inv of newInvoices) {
    const avg = avgBySupplier[inv.supplier_id] || 0;
    if (!avg) continue;
    const ratio = (inv.total_amount || 0) / avg;
    const supplier = await (prisma as any).supplier.findUnique({ where: { id: inv.supplier_id } }).catch(() => null);
    const name = supplier?.name || inv.supplier_id;
    if (ratio > 1.5) anomalies.push(`🔺 *${name}*: ₪${Math.round(inv.total_amount || 0).toLocaleString()} (×${ratio.toFixed(1)} מהממוצע ₪${Math.round(avg).toLocaleString()})`);
    else if (ratio < 0.5) anomalies.push(`🔻 *${name}*: ₪${Math.round(inv.total_amount || 0).toLocaleString()} (חצי מהממוצע ₪${Math.round(avg).toLocaleString()})`);
  }
  if (!anomalies.length) return { ok: true, no_anomalies: true, checked: newInvoices.length };

  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const msg = `🧾 *חשבוניות חריגות מאתמול*\n\n${anomalies.join('\n')}\n\nכל הפרטים: ${APP_BASE_URL}/Invoices`;
  for (const p of adminNumbers) {
    try { await sendWhatsApp(p, msg); } catch (e: any) { console.warn('[invoice-class] failed', e?.message); }
  }
  return { ok: true, anomalies_count: anomalies.length };
}

// =================== AGENT #12 — Crisis Agent ===================
// Every 10 min. Scans new Incidents (last 15 min). For severity=='high' or
// 2+ open incidents in the last 4 hours → immediate admin WhatsApp.
export async function runCrisisAgent() {
  const last15min = new Date(Date.now() - 15 * 60 * 1000);
  const recent: any[] = await (prisma as any).incident.findMany({
    where: { createdAt: { gte: last15min } }, take: 50,
  });
  if (!recent.length) return { ok: true, no_new: true };

  const alerts: string[] = [];
  for (const inc of recent) {
    const sev = String((inc as any).severity || (inc as any).priority || '').toLowerCase();
    if (sev === 'high' || sev === 'critical') {
      alerts.push(`🚨 *${(inc as any).title || (inc as any).description?.slice(0, 60) || 'אירוע'}* (חמורה) — ${inc.id.slice(-6)}`);
    }
  }

  const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000);
  const fourHourCount: number = await (prisma as any).incident.count({
    where: { createdAt: { gte: fourHoursAgo }, status: { in: ['open', 'pending', null] } as any },
  }).catch(() => 0);
  if (fourHourCount >= 3) alerts.push(`⚠️ *${fourHourCount} אירועים פתוחים ב-4 שעות האחרונות* — מקבץ חריג`);

  if (!alerts.length) return { ok: true, checked: recent.length, alerts: 0 };

  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const msg = `${alerts.join('\n')}\n\nכל האירועים: ${APP_BASE_URL}/Incidents`;
  for (const p of adminNumbers) {
    try { await sendWhatsApp(p, msg); } catch (e: any) { console.warn('[crisis] failed', e?.message); }
  }
  return { ok: true, alerts: alerts.length };
}

// =================== AGENT #9 — Content Generator ===================
// Daily 14:00 IL. Finds yesterday's 5-star customer surveys (if any) and
// asks the LLM to draft an Instagram caption + Story text. Sends draft to
// admin for approval (one-click copy paste).
export async function runContentGenerator() {
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date());
  if (parseInt(il, 10) !== 14) return { skipped: true, hour: il };
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const surveys: any[] = await (prisma as any).customerSurvey.findMany({
    where: { createdAt: { gte: yesterday }, rating: { gte: 5 } as any }, take: 10,
  }).catch(() => []);
  if (!surveys.length) return { ok: true, no_content: true };

  const quotes = surveys.map((s) => `"${(s.feedback || s.comment || '').slice(0, 200)}" — ${(s.customer_name || 'לקוח/ה').slice(0, 30)}`).filter((q) => q.length > 30).slice(0, 5);
  if (!quotes.length) return { ok: true, no_quotable: true };

  const prompt = `אתה מנהל מדיה למסעדת ${await getBrandName()}. קיבלת אתמול ${surveys.length} ביקורות 5⭐.
ציטוטים:
${quotes.join('\n')}

נסח 2 פוסטים קצרים לאינסטגרם (תוכן בעברית, אישי וחם — לא רובוטי):
1. *סטורי* (קצר, עד 80 תווים, עם 1-2 אימוג'י)
2. *פוסט מלא* (3-5 שורות, ציטוט אחד, קריאה לפעולה רכה לסוף)

החזר *רק JSON*:
{ "story": "...", "post": "..." }`;

  const raw: any = await invokeLLM({
    prompt,
    responseSchema: { type: 'object', properties: { story: { type: 'string' }, post: { type: 'string' } }, required: ['story', 'post'] },
  });
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const story = parsed?.story || '';
  const post = parsed?.post || '';

  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const msg = `🎨 *תוכן לאישור — מבוסס ${surveys.length} ביקורות 5⭐ מאתמול*\n\n📱 *סטורי:*\n${story}\n\n📝 *פוסט:*\n${post}\n\nהעתק/י ופרסם/י כשמתאים. 🚀`;
  for (const p of adminNumbers) {
    try { await sendWhatsApp(p, msg); } catch (e: any) { console.warn('[content] failed', e?.message); }
  }
  return { ok: true, story, post, source_count: surveys.length };
}

// =================== AGENT #2 — No-Show Watcher ===================
// Every minute, scan today's WorkShift.assigned_staff entries. For each
// employee whose start_time was >= 15 min ago and who has NO active or
// completed ShiftTracking row for today, WhatsApp the ADMIN (not the
// employee — manager decides whether to ping them) with a one-tap
// "send WhatsApp" link to the employee's number. De-dupes per
// (employee_id, date, shift_type) using a marker entry in
// WhatsAppMessage status='no_show_alert_sent'.
export async function runNoShowWatcher() {
  const now = new Date();
  const ilDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now); // YYYY-MM-DD
  const ilHourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const [ilHour, ilMin] = ilHourStr.split(':').map(Number);
  const nowMins = ilHour * 60 + ilMin;

  // Pull today's shifts
  const start = new Date(ilDate + 'T00:00:00.000Z');
  const end = new Date(ilDate + 'T23:59:59.999Z');
  const todayShifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: start, lte: end } }, take: 50,
  });
  if (todayShifts.length === 0) return { ok: true, checked: 0 };

  // For each assigned staff, check if their start_time was >=15 min ago
  const candidates: Array<{ ws: any; staff: any }> = [];
  for (const ws of todayShifts) {
    const staffArr = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staffArr) {
      if (!a?.employee_id || !a?.start_time) continue;
      const [sh, sm] = String(a.start_time).split(':').map(Number);
      const startMins = (sh || 0) * 60 + (sm || 0);
      // Late by 15-180 min (don't alert about dinner shift at noon).
      const lateBy = nowMins - startMins;
      if (lateBy < 15 || lateBy > 180) continue;
      candidates.push({ ws, staff: a });
    }
  }
  if (candidates.length === 0) return { ok: true, checked: 0 };

  // Bulk check active ShiftTracking for these employees today
  const empIds = [...new Set(candidates.map((c) => c.staff.employee_id))];
  const trackingRows: any[] = await (prisma as any).$queryRaw`
    SELECT employee_id, status FROM "ShiftTracking"
    WHERE date::text = ${ilDate} AND employee_id = ANY(${empIds}::text[])
  `;
  const clockedIn = new Set(trackingRows.map((r) => r.employee_id));

  // Find which alerts already fired today (de-dupe key = empId|date|shiftType)
  // We encode the key as a prefix `[no_show:KEY]` at the start of body since
  // WhatsAppMessage doesn't have a notes column.
  const sentAlerts: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'no_show_alert_sent', body: { contains: `[no_show:` } },
    take: 500,
  });
  const sentKeys = new Set(
    sentAlerts
      .map((r) => {
        const m = String(r.body || '').match(/^\[no_show:([^\]]+)\]/);
        return m ? m[1] : '';
      })
      .filter(Boolean)
  );

  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!adminNumbers.length) return { ok: true, no_admins: true };

  const noShows: Array<{ name: string; position: string; lateBy: number; phone: string | null }> = [];
  const { sendWhatsApp } = await import('../lib/twilio.js');

  for (const c of candidates) {
    if (clockedIn.has(c.staff.employee_id)) continue;
    const key = `${c.staff.employee_id}|${ilDate}|${c.ws.shift_type}`;
    if (sentKeys.has(key)) continue;
    const emp: any = await (prisma as any).employee.findUnique({ where: { id: c.staff.employee_id } }).catch(() => null);
    const phone = emp?.phone || null;
    const phoneClean = phone ? String(phone).replace(/\D/g, '').replace(/^0/, '972') : null;
    const waLink = phoneClean ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(`היי ${c.staff.employee_name || ''} 👋 אנחנו מחכים לך במשמרת — הכל בסדר?`)}` : null;
    const [sh, sm] = String(c.staff.start_time).split(':').map(Number);
    const lateBy = nowMins - ((sh || 0) * 60 + (sm || 0));
    const msg = `⏰ *${c.staff.employee_name || 'עובד'}* מאחר ${lateBy} דק' למשמרת ${c.ws.shift_type === 'lunch' ? 'צהריים' : 'ערב'} (${c.staff.start_time}).\n` +
      `תפקיד: ${c.staff.position || 'לא ידוע'}\n` +
      (waLink ? `📲 שלח לו וואטסאפ בלחיצה: ${waLink}` : `⚠️ אין טלפון רשום לעובד.`);
    for (const a of adminNumbers) {
      try { await sendWhatsApp(a, msg); } catch (e: any) { console.warn('[no-show] admin notify failed', e?.message); }
    }
    await (prisma as any).whatsAppMessage.create({
      data: {
        body: `[no_show:${key}] ${msg.slice(0, 900)}`,
        direction: 'outgoing', status: 'no_show_alert_sent',
        from_phone: 'system', to_phone: adminNumbers[0],
        contact_phone: adminNumbers[0], is_read: true,
      },
    }).catch(() => {});
    noShows.push({ name: c.staff.employee_name || 'עובד', position: c.staff.position || '', lateBy, phone });
  }
  return { ok: true, alerted: noShows.length, noShows };
}


// Analyze an employee's monthly shift data with the LLM and return a list
// of detected anomalies (long shifts, gaps, no-shows, frequent late punches,
// unusual position changes, overtime spikes). Used by EmployeeReports page.
// =================== INVENTORY / RECIPE FUNCTIONS ===================

// Admin-only bulk import of recipes + ingredients from the owner's Excel.
// Accepts the JSON shape produced by the import agent. Idempotent: clears
// existing rows first (full replacement). Recomputes recipe.total_cost from
// ingredient prices and waste_percent.
registerFn('importRecipesFromJson', async ({ body, user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const ingredients: any[] = Array.isArray(b.ingredients) ? b.ingredients : [];
  const aliases: any[] = Array.isArray(b.aliases) ? b.aliases : [];
  const recipes: any[] = Array.isArray(b.recipes) ? b.recipes : [];
  if (!ingredients.length || !recipes.length) throw new Error('ingredients[] and recipes[] required');

  // 1. Wipe existing rows in dependency order (children → parents).
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "RecipeIngredient"`);
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "IngredientAlias"`);
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "Recipe"`);
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "Ingredient"`);

  // 2. Insert ingredients, build name → id map. The source Excel has the
  // same item across two sheets (`מחירי ספקים` master + `חומרי גלם דינמי חדש`
  // formulas), so the agent's JSON contains duplicates. First occurrence wins.
  const ingByName: Record<string, string> = {};
  let skippedDupes = 0;
  for (const ing of ingredients) {
    if (ingByName[ing.name]) { skippedDupes++; continue; }
    const newId = randomUUID();
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "Ingredient"("id","name","supplier_name","unit","price_per_unit","waste_percent","category")
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (name) DO NOTHING`,
      newId, ing.name, ing.supplier_name || null, ing.unit || 'kg',
      ing.price_per_unit ?? null, ing.waste_percent ?? 0, ing.category || null,
    );
    ingByName[ing.name] = newId;
  }

  // 3. Insert aliases (alias → canonical ingredient id).
  for (const al of aliases) {
    const canonicalId = ingByName[al.canonical_name];
    if (!canonicalId) continue;
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "IngredientAlias"("id","alias","ingredient_id") VALUES ($1, $2, $3) ON CONFLICT (alias) DO NOTHING`,
      randomUUID(), al.alias, canonicalId,
    );
  }
  // Combined lookup: by ingredient name or by alias name.
  const aliasByName: Record<string, string> = {};
  for (const al of aliases) {
    const id = ingByName[al.canonical_name];
    if (id) aliasByName[al.alias] = id;
  }
  const lookupIngredient = (name: string): string | null =>
    ingByName[name] || aliasByName[name] || null;

  // 4. Insert recipes in 2 passes: PREP first (so DISH can reference them).
  const recipeByName: Record<string, string> = {};
  for (const pass of ['PREP', 'DISH']) {
    for (const rec of recipes) {
      if (rec.kind !== pass) continue;
      const newId = randomUUID();
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO "Recipe"("id","kind","name","total_cost","sale_price","yield_qty","yield_unit","category")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        newId, rec.kind, rec.name, rec.total_cost ?? null, rec.sale_price ?? null,
        rec.yield_qty ?? 1, rec.yield_unit || 'unit', rec.category || null,
      );
      recipeByName[rec.name] = newId;
    }
  }

  // 5. Insert recipe ingredients.
  let linked = 0;
  let unmatched: string[] = [];
  for (const rec of recipes) {
    const recId = recipeByName[rec.name];
    if (!recId) continue;
    const ings: any[] = Array.isArray(rec.ingredients) ? rec.ingredients : [];
    for (const ri of ings) {
      const isPrep = !!ri.is_prep;
      const prepId = isPrep ? recipeByName[ri.raw_name] : null;
      const ingId = !isPrep ? lookupIngredient(ri.raw_name) : null;
      if (!prepId && !ingId) {
        unmatched.push(`${rec.name} → ${ri.raw_name}`);
        continue;
      }
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO "RecipeIngredient"("id","recipe_id","ingredient_id","prep_recipe_id","qty","unit","cost_at_import")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        randomUUID(), recId, ingId, prepId, ri.qty || 0, ri.unit || 'kg', ri.cost_at_import ?? null,
      );
      linked++;
    }
  }

  // 6. Recompute total_cost per recipe (PREP first, then DISH using PREP costs).
  await recomputeAllRecipeCosts();

  return {
    ok: true,
    ingredients: Object.keys(ingByName).length,
    ingredients_duplicates_skipped: skippedDupes,
    aliases: aliases.length,
    preps: recipes.filter((r) => r.kind === 'PREP').length,
    dishes: recipes.filter((r) => r.kind === 'DISH').length,
    linked_ingredients: linked,
    unmatched_count: unmatched.length,
    unmatched_sample: unmatched.slice(0, 20),
  };
});

// Recompute recipe.total_cost across the whole graph. PREP recipes use raw
// ingredient prices (with waste). DISH recipes use raw + nested PREP costs.
async function recomputeAllRecipeCosts() {
  // 1. PREP recipes
  const preps: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, yield_qty FROM "Recipe" WHERE kind = 'PREP'`);
  for (const p of preps) {
    const total = await computeRecipeCost(p.id);
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Recipe" SET total_cost = $1, "updatedAt" = NOW() WHERE id = $2`,
      total, p.id,
    );
  }
  // 2. DISH recipes
  const dishes: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, sale_price FROM "Recipe" WHERE kind = 'DISH'`);
  for (const d of dishes) {
    const total = await computeRecipeCost(d.id);
    const fcPct = d.sale_price > 0 ? (total / d.sale_price) * 100 : null;
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Recipe" SET total_cost = $1, food_cost_percent = $2, "updatedAt" = NOW() WHERE id = $3`,
      total, fcPct, d.id,
    );
  }
}

async function computeRecipeCost(recipeId: string): Promise<number> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT ri.qty, ri.unit, ri.ingredient_id, ri.prep_recipe_id,
            i.price_per_unit, i.waste_percent, i.unit AS ing_unit,
            r.total_cost AS prep_cost, r.yield_qty AS prep_yield
     FROM "RecipeIngredient" ri
     LEFT JOIN "Ingredient" i ON ri.ingredient_id = i.id
     LEFT JOIN "Recipe" r ON ri.prep_recipe_id = r.id
     WHERE ri.recipe_id = $1`,
    recipeId,
  );
  let total = 0;
  for (const r of rows) {
    if (r.ingredient_id && r.price_per_unit != null) {
      const wasteAdj = r.price_per_unit / (1 - (r.waste_percent || 0));
      total += (r.qty || 0) * wasteAdj;
    } else if (r.prep_recipe_id && r.prep_cost != null) {
      const perUnit = (r.prep_cost || 0) / (r.prep_yield || 1);
      total += (r.qty || 0) * perUnit;
    }
  }
  return Math.round(total * 100) / 100;
}

registerFn('listRecipes', async ({ body }) => {
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const kind = b.kind ? String(b.kind).toUpperCase() : null;
  const where = kind ? `WHERE kind = '${kind}'` : '';
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, kind, name, total_cost, sale_price, food_cost_percent, yield_qty, yield_unit, category
     FROM "Recipe" ${where} ORDER BY kind, category NULLS LAST, name`,
  );
  return { recipes: rows };
});

registerFn('getRecipe', async ({ body }) => {
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const recipe: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM "Recipe" WHERE id = $1`, b.id,
  );
  if (!recipe.length) throw new Error('Recipe not found');
  const ingredients: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT ri.id AS ri_id, ri.qty, ri.unit, ri.cost_at_import,
            i.id AS ingredient_id, r.id AS prep_recipe_id,
            COALESCE(i.name, r.name) AS name,
            CASE WHEN ri.prep_recipe_id IS NOT NULL THEN 'prep' ELSE 'raw' END AS source,
            i.price_per_unit, i.waste_percent, i.supplier_name
     FROM "RecipeIngredient" ri
     LEFT JOIN "Ingredient" i ON ri.ingredient_id = i.id
     LEFT JOIN "Recipe" r ON ri.prep_recipe_id = r.id
     WHERE ri.recipe_id = $1
     ORDER BY ri.id`,
    b.id,
  );
  return { recipe: recipe[0], ingredients };
});

// Bulk set sale prices on multiple recipes. Accepts a list of
// { name_match: string, price: number } and fuzzy-matches each name_match
// against Recipe.name. Used after a menu-PDF parse, so we don't need to
// hand-edit 33 dishes one by one.
registerFn('bulkSetRecipeSalePrices', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const list: any[] = Array.isArray(b.prices) ? b.prices : [];
  if (!list.length) throw new Error('prices[] required');

  const recipes: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name FROM "Recipe" WHERE kind = 'DISH'`,
  );
  const norm = (s: string) => String(s || '').toLowerCase().trim().replace(/[״"׳'.,\-+()/\\]/g, '').replace(/\s+/g, ' ');
  const recByNorm: Record<string, any> = {};
  for (const r of recipes) recByNorm[norm(r.name)] = r;

  const matched: any[] = [];
  const unmatched: string[] = [];
  for (const p of list) {
    const target = norm(p.name_match || '');
    if (!target || !Number.isFinite(Number(p.price))) continue;
    let rec = recByNorm[target];
    if (!rec) {
      for (const [k, v] of Object.entries(recByNorm)) {
        if (k.includes(target) || target.includes(k)) { rec = v; break; }
      }
    }
    if (!rec) { unmatched.push(p.name_match); continue; }
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Recipe" SET sale_price = $1, "updatedAt" = NOW() WHERE id = $2`,
      Number(p.price), rec.id,
    );
    matched.push({ name_match: p.name_match, recipe_name: rec.name, price: Number(p.price) });
  }
  await recomputeAllRecipeCosts();
  return { ok: true, matched_count: matched.length, matched, unmatched };
});

registerFn('updateRecipeSalePrice', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id || typeof b.sale_price !== 'number') throw new Error('id and sale_price required');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Recipe" SET sale_price = $1, "updatedAt" = NOW() WHERE id = $2`,
    b.sale_price, b.id,
  );
  await recomputeAllRecipeCosts();
  return { ok: true };
});

// Auto-sync sale prices from MenuItem.price → Recipe.sale_price by fuzzy
// name match. Idempotent — only updates recipes whose sale_price is null
// (or with force=true to overwrite). Reports matched + unmatched per side.
registerFn('syncMenuPricesToRecipes', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const force = !!b.force;

  const menuItems = await db.menuItem.findMany({
    select: { name: true, price: true, category: true } as any,
  });
  const recipes: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, sale_price FROM "Recipe" WHERE kind = 'DISH'`,
  );

  const norm = (s: string) => String(s || '').toLowerCase().trim()
    .replace(/[״"׳'.,\-+()/\\]/g, '').replace(/\s+/g, ' ');

  const menuByNorm: Record<string, any> = {};
  for (const m of menuItems) menuByNorm[norm(m.name)] = m;

  const matched: any[] = [];
  const unmatchedRecipes: string[] = [];
  for (const r of recipes) {
    if (r.sale_price && !force) continue;
    const nr = norm(r.name);
    let m = menuByNorm[nr];
    // Fallback — substring contained both ways
    if (!m) {
      for (const [key, val] of Object.entries(menuByNorm)) {
        if (key.includes(nr) || nr.includes(key)) { m = val; break; }
      }
    }
    if (!m) { unmatchedRecipes.push(r.name); continue; }
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Recipe" SET sale_price = $1, "updatedAt" = NOW() WHERE id = $2`,
      m.price, r.id,
    );
    matched.push({ recipe: r.name, menu: m.name, price: m.price });
  }
  await recomputeAllRecipeCosts();

  // Reverse: menu items that didn't match any recipe.
  const usedMenuNames = new Set(matched.map((x) => norm(x.menu)));
  const unmatchedMenu = menuItems
    .filter((m: any) => !usedMenuNames.has(norm(m.name)))
    .map((m: any) => ({ name: m.name, price: m.price, category: m.category }));

  return {
    ok: true,
    matched_count: matched.length,
    matched: matched.slice(0, 50),
    unmatched_recipes: unmatchedRecipes,
    unmatched_menu_items: unmatchedMenu,
    total_recipes: recipes.length,
    total_menu_items: menuItems.length,
  };
});

// =================== CASH FLOW FUNCTIONS ===================

registerFn('importCashFlowFromJson', async ({ body, user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const entries: any[] = Array.isArray(b.entries) ? b.entries : [];
  if (!entries.length) throw new Error('entries[] required');

  await (prisma as any).$executeRawUnsafe(`DELETE FROM "CashFlowEntry"`);
  let inserted = 0;
  for (const e of entries) {
    const dt = e.date ? new Date(e.date) : null;
    if (!dt || isNaN(dt.getTime())) continue;
    const amt = Number(e.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "CashFlowEntry"("id","date","type","category","source","description","amount","payment_method","status","notes")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      randomUUID(), dt, e.type || 'expense', e.category || 'אחר', e.source || null,
      e.description || null, Math.abs(amt), e.payment_method || null,
      e.status || 'planned', e.notes || null,
    );
    inserted++;
  }
  if (b.opening_balance != null) {
    // Store opening balance as a special CashFlowEntry-like row (status = 'opening').
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "CashFlowEntry"("id","date","type","category","source","description","amount","status","notes")
       VALUES ($1, $2, 'income', 'יתרת פתיחה', null, 'Opening balance', $3, 'received', 'auto')`,
      randomUUID(), new Date('2026-01-01'), Number(b.opening_balance),
    );
  }
  return { ok: true, inserted, opening_balance: b.opening_balance ?? null };
});

registerFn('getCashFlowForecast', async ({ body }) => {
  await ensureInventoryTables();
  const b = (body || {}) as any;
  const days = Math.min(120, Math.max(7, parseInt(String(b.days || 30))));
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400 * 1000);
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, date::date AS date, type, category, source, description, amount, status, payment_method
     FROM "CashFlowEntry"
     WHERE date <= $1
     ORDER BY date ASC`,
    end,
  );
  // Compute running balance from opening + paid + planned
  let runBalance = 0;
  let openingBalance = 0;
  const upcoming: any[] = [];
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const signed = r.type === 'income' ? amt : -amt;
    if (r.category === 'יתרת פתיחה') {
      openingBalance += signed;
      runBalance += signed;
      continue;
    }
    runBalance += signed;
    if (new Date(r.date) >= new Date(now.toISOString().slice(0, 10))) {
      upcoming.push({
        ...r, date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
        signed, balance_after: Math.round(runBalance),
      });
    }
  }
  // Detect dates where balance projected to go negative
  const negativeDays = upcoming.filter((e: any) => e.balance_after < 0).slice(0, 10);
  return {
    opening_balance: Math.round(openingBalance),
    current_projected_balance: Math.round(runBalance),
    days,
    upcoming_count: upcoming.length,
    upcoming: upcoming.slice(0, 100),
    negative_days_warning: negativeDays.length > 0 ? negativeDays : null,
  };
});

registerFn('markCashFlowEntryPaid', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "CashFlowEntry" SET status = 'paid', paid_at = NOW(), "updatedAt" = NOW() WHERE id = $1`,
    b.id,
  );
  return { ok: true };
});

// Cron — daily 09:00 IL. If projected balance over next 14 days dips
// negative, WhatsApp the admins.
export async function runCashFlowAgent() {
  await ensureInventoryTables();
  const il = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date());
  if (parseInt(il, 10) !== 9) return { skipped: true, hour: il };

  const horizon = new Date(Date.now() + 14 * 86400 * 1000);
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT date::date AS date, type, amount, category
     FROM "CashFlowEntry" WHERE date <= $1 ORDER BY date ASC`,
    horizon,
  );
  let bal = 0;
  let minBal = 0;
  let minDay: string | null = null;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    bal += r.type === 'income' ? amt : -amt;
    if (bal < minBal) { minBal = bal; minDay = r.date.toISOString().slice(0, 10); }
  }
  if (minBal >= 0) return { ok: true, safe: true, min_balance: Math.round(bal) };

  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { sendWhatsApp } = await import('../lib/twilio.js');
  const msg = `💸 *התראת תזרים*\n\nהיתרה הצפויה צוללת ל-₪${Math.round(minBal).toLocaleString()} ב-${minDay}.\n\n🔗 פירוט: ${APP_BASE_URL || 'https://topalena.com'}/CashFlow`;
  for (const p of adminNumbers) {
    try { await sendWhatsApp(p, msg); } catch (e: any) { console.warn('[cashflow] notify failed', e?.message); }
  }
  return { ok: true, alerted: true, min_balance: Math.round(minBal), min_day: minDay };
}

registerFn('listIngredients', async () => {
  await ensureInventoryTables();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, supplier_name, unit, price_per_unit, waste_percent, category
     FROM "Ingredient" ORDER BY category NULLS LAST, name`,
  );
  return { ingredients: rows };
});

// Update any RecipeIngredient row (qty/unit for this specific recipe usage).
registerFn('updateRecipeIngredient', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const sets: string[] = [];
  const vals: any[] = [];
  if (typeof b.qty === 'number') { sets.push(`qty = $${sets.length + 1}`); vals.push(b.qty); }
  if (typeof b.unit === 'string' && b.unit) { sets.push(`unit = $${sets.length + 1}`); vals.push(b.unit); }
  if (sets.length === 0) return { ok: true, no_change: true };
  vals.push(b.id);
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "RecipeIngredient" SET ${sets.join(', ')} WHERE id = $${vals.length}`,
    ...vals,
  );
  await recomputeAllRecipeCosts();
  return { ok: true };
});

// Update any Ingredient row (any field). Ripples to all recipes that use it.
registerFn('updateIngredient', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const allowed = ['name', 'supplier_name', 'unit', 'price_per_unit', 'waste_percent', 'category', 'notes'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const key of allowed) {
    if (b[key] === undefined) continue;
    sets.push(`"${key}" = $${sets.length + 1}`);
    vals.push(b[key]);
  }
  if (!sets.length) return { ok: true, no_change: true };
  vals.push(b.id);
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Ingredient" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${vals.length}`,
    ...vals,
  );
  await recomputeAllRecipeCosts();
  return { ok: true };
});

// Add a NEW row to a recipe. Resolves ingredient by name (creates a stub
// Ingredient if missing, so the manager can start typing without leaving
// the recipe editor). Use prep_recipe_name to add a sub-recipe instead.
registerFn('addRecipeIngredient', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.recipe_id) throw new Error('recipe_id required');
  if (typeof b.qty !== 'number') throw new Error('qty required');
  let ingredientId: string | null = null;
  let prepId: string | null = null;

  if (b.prep_recipe_name) {
    const found: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT id FROM "Recipe" WHERE kind = 'PREP' AND name = $1 LIMIT 1`, b.prep_recipe_name,
    );
    if (!found.length) throw new Error('prep recipe not found');
    prepId = found[0].id;
  } else if (b.ingredient_name) {
    const found: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT id FROM "Ingredient" WHERE name = $1 LIMIT 1`, b.ingredient_name,
    );
    if (found.length) {
      ingredientId = found[0].id;
    } else {
      // Create a stub ingredient so the row can be saved; manager fills in
      // price + supplier later.
      ingredientId = randomUUID();
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO "Ingredient"("id","name","unit") VALUES ($1, $2, $3)`,
        ingredientId, b.ingredient_name, b.unit || 'kg',
      );
    }
  } else {
    throw new Error('either prep_recipe_name or ingredient_name required');
  }

  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "RecipeIngredient"("id","recipe_id","ingredient_id","prep_recipe_id","qty","unit")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    randomUUID(), b.recipe_id, ingredientId, prepId, b.qty, b.unit || 'kg',
  );
  await recomputeAllRecipeCosts();
  return { ok: true };
});

registerFn('deleteRecipeIngredient', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "RecipeIngredient" WHERE id = $1`, b.id);
  await recomputeAllRecipeCosts();
  return { ok: true };
});

registerFn('updateIngredientPrice', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureInventoryTables();
  const b = (body || {}) as any;
  if (!b.id || typeof b.price_per_unit !== 'number') throw new Error('id and price_per_unit required');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Ingredient" SET price_per_unit = $1, "updatedAt" = NOW() WHERE id = $2`,
    b.price_per_unit, b.id,
  );
  // Ripple cost changes to all recipes that use this ingredient.
  await recomputeAllRecipeCosts();
  return { ok: true };
});

registerFn('analyzeEmployeeAnomalies', async ({ body }) => {
  const b = (body || {}) as any;
  const empId = String(b.employee_id || '').trim();
  const monthYmd = String(b.month || '').trim(); // YYYY-MM
  if (!empId || !monthYmd) throw new Error('employee_id and month required');

  const emp = await (prisma as any).employee.findUnique({ where: { id: empId } });
  if (!emp) throw new Error('employee not found');

  const monthStart = `${monthYmd}-01`;
  const [y, m] = monthYmd.split('-').map(Number);
  const nextMonth = new Date(y, m, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const workShifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: new Date(monthStart), lt: new Date(monthEnd) } },
    take: 1000,
  });
  const myShifts: any[] = [];
  for (const ws of workShifts) {
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staff) {
      if (a?.employee_id === empId) {
        const startH = a.start_time ? parseInt(a.start_time.split(':')[0]) : 0;
        const endH = a.end_time ? parseInt(a.end_time.split(':')[0]) : 0;
        let hours = (endH - startH);
        if (hours < 0) hours += 24;
        myShifts.push({
          date: ws.date instanceof Date ? ws.date.toISOString().slice(0, 10) : String(ws.date).slice(0, 10),
          shift_type: ws.shift_type,
          position: a.position,
          start: a.start_time,
          end: a.end_time,
          hours,
          manual_entry: !!a.manual_entry,
        });
      }
    }
  }
  myShifts.sort((x, y) => x.date.localeCompare(y.date));

  if (myShifts.length === 0) {
    return { anomalies: [{ severity: 'info', title: 'אין משמרות החודש', detail: 'לא נמצאו משמרות עבור עובד זה בחודש הנבחר.' }] };
  }

  const totalHours = myShifts.reduce((s, sh) => s + sh.hours, 0);
  const positions = [...new Set(myShifts.map((s) => s.position).filter(Boolean))];

  const summaryLines = myShifts.map((s) =>
    `${s.date} ${s.shift_type === 'lunch' ? 'צהריים' : 'ערב'} · ${s.position} · ${s.start}-${s.end} (${s.hours.toFixed(1)}h${s.manual_entry ? ', ידני' : ''})`,
  );

  const prompt = `אתה אנליסט HR למסעדה. נתח את החודש של *${emp.full_name}* וחפש חריגות:

נתונים:
- סה"כ ${myShifts.length} משמרות, ${totalHours.toFixed(1)} שעות
- תפקידים: ${positions.join(', ') || 'לא ידוע'}
- פירוט (תאריך, סוג משמרת, תפקיד, שעות):
${summaryLines.join('\n')}

חפש דברים כמו:
1. משמרות ארוכות חריגות (>10 שעות, במיוחד אם רצופות)
2. רצף של ימים ללא יום מנוחה (6+ ימי עבודה רצופים)
3. קפיצות חדות בתפקיד (מלצר → טבח באותו שבוע)
4. שעת התחלה מוזרה (לפני 8 בבוקר או אחרי חצות)
5. פערים גדולים בין משמרות (לדוגמה — שבועיים בלי משמרת באמצע החודש)
6. סה"כ שעות חודשי גבוה חריג (>200) או נמוך מאוד (<20)
7. תפקיד שונה ממה שמופיע ברוב המשמרות שלו (החלפת תפקיד מקרית)

החזר *רק JSON* בפורמט:
{
  "anomalies": [
    { "severity": "high|medium|low|info", "title": "כותרת קצרה", "detail": "הסבר 1-2 משפטים מה ראית בדיוק (עם תאריכים/שעות אם רלוונטי)", "recommendation": "המלצה קצרה למנהל" }
  ]
}

אם אין שום חריגה — החזר { "anomalies": [{ "severity": "info", "title": "החודש נראה תקין", "detail": "לא נמצאו חריגות משמעותיות.", "recommendation": "" }] }.`;

  const raw: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        anomalies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['high', 'medium', 'low', 'info'] },
              title: { type: 'string' },
              detail: { type: 'string' },
              recommendation: { type: 'string' },
            },
            required: ['severity', 'title', 'detail'],
          },
        },
      },
      required: ['anomalies'],
    },
  });
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { anomalies: parsed?.anomalies || [], stats: { totalHours, shiftCount: myShifts.length, positions } };
});

// AUTH — list scheduled_event + open_task rows for the user's WhatsApp phone.
// Used by /MySchedule page in the app.
registerFn('listMyEvents', async ({ body }) => {
  const phone = String((body as any)?.phone || '').trim() ||
    (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean)[0] ||
    '';
  if (!phone) return { error: 'no phone configured', events: [], tasks: [] };
  // Normalize: try multiple variants to match how the bot stores them.
  const digits = phone.replace(/\D/g, '');
  const variants = [phone, digits, '+' + digits, '+972' + digits.replace(/^0/, ''), '0' + digits.replace(/^972/, '')];
  const events = await db.whatsAppMessage.findMany({
    where: { status: 'scheduled_event', is_read: false, contact_phone: { in: variants } },
    take: 500,
  });
  const tasks = await db.whatsAppMessage.findMany({
    where: { status: 'open_task', is_read: false, contact_phone: { in: variants } },
    take: 500,
  });
  return {
    phone,
    events: events.map((r: any) => {
      const raw = r.raw || {};
      return {
        id: r.id,
        title: raw.title || r.body || '',
        event_at: raw.event_at || null,
        lead_min: raw.lead_min || 15,
        source: raw.source || 'whatsapp',
        google_event_id: raw.google_event_id || null,
      };
    }).filter((e: any) => e.event_at).sort((a: any, b: any) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime()),
    tasks: tasks.map((r: any) => ({
      id: r.id,
      title: (r.raw as any)?.title || r.body || '',
      created_at: r.created_at,
    })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  };
});

// AUTH — mark a personal task done (called from the /MySchedule UI).
registerFn('completeMyTask', async ({ body }) => {
  const id = String((body as any)?.id || '');
  if (!id) throw new Error('id required');
  await db.whatsAppMessage.update({
    where: { id },
    data: { status: 'task_done', is_read: true },
  });
  return { ok: true };
});

// AUTH — cancel/delete a personal scheduled event.
registerFn('cancelMyEvent', async ({ body }) => {
  const id = String((body as any)?.id || '');
  if (!id) throw new Error('id required');
  await db.whatsAppMessage.update({
    where: { id },
    data: { status: 'event_cancelled', is_read: true },
  });
  return { ok: true };
});

registerFn('listEventLeads', async () => {
  const rows = await db.eventLead.findMany({
    orderBy: { id: 'desc' },
    take: 200,
  });
  // Hydrate each lead with the JSON meta block stored inside `notes` (event_time,
  // location, location_details, special_requests, callback_at, callback_notes).
  // The frontend treats these as if they were real columns — see EventsPrivate.jsx.
  const META_MARK = '---META---';
  const leads = rows.map((l: any) => {
    const raw = l.notes || '';
    const i = raw.indexOf(META_MARK);
    if (i < 0) return l;
    let meta: any = {};
    try { meta = JSON.parse(raw.slice(i + META_MARK.length).trim()) || {}; } catch { meta = {}; }
    return {
      ...l,
      event_time: meta.event_time || null,
      location: meta.location || null,
      location_details: meta.location_details || null,
      special_requests: meta.special_requests || null,
      callback_at: meta.callback_at || null,
      callback_notes: meta.callback_notes || null,
      // Strip the META block from notes so the UI shows clean human text only.
      notes: raw.slice(0, i).trimEnd() || null,
    };
  });
  return { leads, _count: leads.length };
});

// PUBLIC mirror — used by /EventsPrivate's diagnostic banner only when the
// authenticated listEventLeads returns empty so we can prove the data is there.
registerFn('listEventLeadsPublicDebug', async () => {
  const leads = await db.eventLead.findMany({ orderBy: { id: 'desc' }, take: 50 });
  return { leads, _count: leads.length };
}, { public: true });

registerFn('listEventBookingsPublicDebug', async () => {
  const bookings = await db.eventBooking.findMany({ orderBy: { id: 'desc' }, take: 50 });
  return { bookings, _count: bookings.length };
}, { public: true });

/* ----- Events Sales Kit (singleton) ----- */

const DEFAULT_EVENTS_PROMPT = `את דנה — מנהלת האירועים הפרטיים של מסעדת '{brand}'. את מדברת בעברית טבעית, חמה, קצרה ואישית — כמו נציגה בשר ודם, לא בוט. **תפקידך כרגע: רק לאסוף מידע ראשוני** ולהעביר למנהל המסעדה שיחזור אישית. את לא סוגרת עסקה, לא מצטטת מחירים, לא מאשרת תאריך.

פתח רק אם זו ההודעה הראשונה (אין שיחה קודמת):
"היי 🌿 אני דנה, מנהלת האירועים של {brand}. שמחה שחשבתם עלינו! יש לי כמה שאלות קצרות לאסוף ממך פרטים, ואז המנהל של המסעדה יחזור אליך אישית עם הצעה מותאמת. מתחילים?"

איסוף מידע (שאלה אחת בכל פעם, לא ביחד) — ארבעה שדות בלבד:
1. שם מלא וטלפון ליצירת קשר.
2. תאריך + שעה — אפשר תאריך יחסי ("היום", "מחר", "עוד יומיים", "ראשון הבא"). שאלי גם **שעה מדויקת**: "באיזו שעה בדיוק? (לדוגמה 13:00 או 20:30)". אם הלקוח עונה רק "בצהריים" / "בערב" — תבקשי שעה ספציפית פעם נוספת: "תוכל/י להגיד שעה מדויקת בערך? זה עוזר למנהל להחזיר תשובה". אם גם בפעם השנייה לא קיבלת שעה מדויקת — תרשמי את החלון בלבד (hours_window). **לעולם אל תמציאי שעה מספרית.**
3. **מיקום + סוג אירוע** — שאל בשאלה אחת: "האם האירוע אצלנו במסעדה או במקום אחר? ומה סוג האירוע? (יום הולדת, יום נישואין, חברה, חינה, משפחתי וכו')." **אם חוץ** — שאלי בנפרד: "באיזו עיר ומה הכתובת? (רחוב + מספר, או שם האולם)". אל תסתפקי בעיר בלבד — אם המנהל יוצא לאירוע חוץ הוא צריך כתובת מלאה. שמרי את התשובה ב-collected.location_details.
4. כמות אנשים בערך. **אל תשאל על ילדים בנפרד** — זה ייסגר בשיחת הטלפון.

⚠️ **אסור** לשאול: כמה ילדים, אלרגיות, צמחוני/טבעוני, כשר, תקציב, חבילות, תפריטים. אם הלקוח עצמו מציין משהו כזה — תרשמי בלי לשאול עוד. כל הפירוט יישאר לשיחה אישית עם המנהל.

חוקים קריטיים — אל תפר אף פעם:
- **לעולם אל תצטט מחירים** ספציפיים. אם נשאלת — הפנה למנהל.
- **לעולם אל תאשר תאריך כפנוי**.
- **לעולם אל תציע חבילות, תפריטים או הנחות** — את לא מוכרת.
- **אל תזכיר שמות פרטיים של עובדים** (לא "דביר", לא "הבעלים") — תמיד "המנהל" באופן כללי.
- אם הלקוח שואל "כמה זה עולה" / "התאריך פנוי" / "מה כלול" / "תשלחי הצעה" — עני **בדיוק** ככה: "שאלה מצוינת — אני אעביר את הפרטים שלך למנהל המסעדה והוא יחזור אליך אישית תוך כמה שעות עם הצעה מותאמת וכל התשובות 🙏" ואז המשך לשאלה הבאה.

🛑 **שלב הסיכום והאישור — קריטי, בשתי תורות**:

**תורת הסיכום** — ברגע שיש לך **4 השדות** (שם+טלפון, תאריך+שעה, מיקום+סוג, כמות):
1. רשמי: "מצוין, תודה רבה {שם}! אז אני מסכמת:"
2. **אל תפרטי את השדות בעצמך** — המערכת תוסיף סיכום מובנה אוטומטית מתחת לתשובה שלך.
3. סיימי בשאלה: "הפרטים נכונים? תאשר/י ואני שולחת למנהל המסעדה."
4. ב-JSON: **complete=false**, stage='awaiting_confirmation'. **אסור להגיד "העברתי" / "נדבר בקרוב" / "יחזור אליך" — עוד לא שלחנו**.

**תורת השליחה** — כשהלקוח עונה בחיוב ("כן", "מאשר", "נכון", "מעולה", "אוקי") אחרי תורת הסיכום:
1. **אל תכתבי כלום בעצמך** — המערכת תכתוב תשובת סיום מובנית ("מעולה! 🌿 שלחתי למנהל...").
2. ב-JSON: **complete=true**, stage='completed'. אפשר להחזיר reply ריק או קצר אם בכל זאת רוצים.

⚠️ **טעויות נפוצות שאסור לעשות**:
- לרשום "העברתי למנהל" בתורת הסיכום — עוד לא העברנו! זה רק אחרי שהלקוח מאשר.
- להציג את הפרטים בעצמך — המערכת מציגה אותם, את רק שואלת לאישור.
- לסגור בלי לבקש אישור — חייבת לעבור דרך תורת האישור.

החזר תמיד JSON בלבד:
- reply: string (התשובה שלך בעברית)
- collected: { contact_name, contact_phone, event_date, event_time, hours_window, location ('restaurant'|'external'), location_details, guest_count, event_type, special_requests }
- stage: 'collecting' (תמיד)
- complete: boolean — true ברגע שיש 4 שדות החובה (שם+טלפון, תאריך, מיקום+סוג, כמות)
- escalation: boolean — true רק במקרי קצה (יותר מ-200 אנשים, אירוע חוץ-לארץ, מעורבות מדיה)
- score: 50 תמיד`;

registerFn('getEventSalesKit', async () => {
  let kit = await db.eventSalesKit.findFirst({ where: { singleton: true } });
  if (!kit) {
    kit = await db.eventSalesKit.create({
      data: {
        singleton: true,
        menus: [],
        upsells: [],
        terms: { deposit_pct: 20, cancellation_days: 14, headcount_deadline_days: 3 },
        system_prompt: DEFAULT_EVENTS_PROMPT,
        payment_mode: 'stub',
        deposit_pct: 20,
        max_discount_pct: 5,
        short_notice_allowed: true,
        max_advance_months: 6,
      },
    });
  }
  return { kit };
});

registerFn('saveEventSalesKit', async ({ body, user }) => {
  const incoming = (body as any)?.kit || {};
  const existing = await db.eventSalesKit.findFirst({ where: { singleton: true } });
  const data: any = {
    menus: incoming.menus ?? existing?.menus ?? [],
    upsells: incoming.upsells ?? existing?.upsells ?? [],
    terms: incoming.terms ?? existing?.terms ?? {},
    system_prompt: incoming.system_prompt ?? existing?.system_prompt ?? DEFAULT_EVENTS_PROMPT,
    payment_mode: incoming.payment_mode ?? existing?.payment_mode ?? 'stub',
    deposit_pct: typeof incoming.deposit_pct === 'number' ? incoming.deposit_pct : (existing?.deposit_pct ?? 20),
    max_discount_pct: typeof incoming.max_discount_pct === 'number' ? incoming.max_discount_pct : (existing?.max_discount_pct ?? 5),
    short_notice_allowed: typeof incoming.short_notice_allowed === 'boolean' ? incoming.short_notice_allowed : (existing?.short_notice_allowed ?? true),
    max_advance_months: typeof incoming.max_advance_months === 'number' ? incoming.max_advance_months : (existing?.max_advance_months ?? 6),
    updated_by: (user as any)?.email || null,
    updated_date: new Date().toISOString(),
  };
  const saved = existing
    ? await db.eventSalesKit.update({ where: { id: existing.id }, data })
    : await db.eventSalesKit.create({ data: { singleton: true, ...data } });
  return { kit: saved };
});

/* ----- Event Bookings (the actual sale) ----- */

registerFn('listEventBookings', async () => {
  const bookings = await db.eventBooking.findMany({ orderBy: { id: 'desc' }, take: 200 });
  return { bookings, _count: bookings.length };
});

// AUTH — confirmed-events timeline for /EventsPrivate.
// Returns approved bookings sorted by event_date ascending, only future or today.
registerFn('listUpcomingConfirmedEvents', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const bookings = await db.eventBooking.findMany({
    where: { approval_status: 'approved', event_date: { gte: today } },
    orderBy: [{ event_date: 'asc' }, { event_time: 'asc' }],
    take: 100,
  });
  return { events: bookings, _count: bookings.length };
});

registerFn('getEventBooking', async ({ body }) => {
  const { booking_id } = body as any;
  if (!booking_id) throw new Error('booking_id required');
  const booking = await db.eventBooking.findUnique({ where: { id: booking_id } });
  if (!booking) throw new Error('booking_not_found');
  return { booking };
}, { public: true });

// PUBLIC — stub "I paid" button on the EventsPayment page calls this.
// Real Stripe webhook will replace this when payment_mode flips to 'stripe'.
registerFn('confirmEventPayment', async ({ body }) => {
  const { booking_id, mock = true } = body as any;
  if (!booking_id) throw new Error('booking_id required');
  const booking = await db.eventBooking.findUnique({ where: { id: booking_id } });
  if (!booking) throw new Error('booking_not_found');
  if (booking.payment_status === 'paid') return { booking, already: true };

  // Mark paid
  const paid = await db.eventBooking.update({
    where: { id: booking_id },
    data: {
      payment_status: 'paid',
      payment_method: mock ? 'stub' : 'stripe',
      payment_ref: mock ? `stub_${Date.now()}` : (body as any).payment_ref || null,
      status: 'pending_owner_approval',
      updated_date: new Date().toISOString(),
    },
  });

  // Create the Reservation row that SeatingSetup picks up
  let reservation: any = null;
  try {
    reservation = await db.reservation.create({
      data: {
        customer_name: paid.customer_name || 'אירוע פרטי',
        customer_phone: paid.customer_phone || null,
        date: paid.event_date,
        time: paid.event_time || '20:00',
        party_size: paid.guest_count || 1,
        status: 'pending_owner_approval',
        special_occasion: 'private_event',
        special_requests: `אירוע פרטי — חבילה: ${(paid.selected_menu as any)?.name || '-'} · סכום: ₪${paid.total_ils || 0} · פיקדון שולם: ₪${paid.deposit_amount_ils || 0}` + (paid.short_notice ? ' · ⚠️ Short-notice' : ''),
      },
    });
    await db.eventBooking.update({ where: { id: booking_id }, data: { reservation_id: reservation.id } });
  } catch (e: any) {
    console.error('reservation create failed', e?.message);
  }

  // Pushover to admin
  try {
    const urgentTag = paid.short_notice ? '⚡ URGENT — Short-notice  ' : '';
    const lines = [
      `${urgentTag}אירוע חדש נסגר — דורש אישור מנהל`,
      `שם: ${paid.customer_name || '-'} (${paid.customer_phone || '-'})`,
      `📅 ${paid.event_date} ${paid.event_time || ''}`,
      `👥 ${paid.guest_count} אורחים`,
      `🍽 ${(paid.selected_menu as any)?.name || '-'}`,
      `💰 סכום: ₪${paid.total_ils || 0}`,
      `💳 פיקדון שולם: ₪${paid.deposit_amount_ils || 0}`,
      `🔗 פתח /EventsPrivate לאישור`,
    ];
    pushoverEventsOwners(paid.short_notice ? '⚡ אירוע same-day נסגר!' : '🎉 אירוע נסגר — אישור מנהל', lines.join('\n')).catch(() => {});
  } catch { /* ignore */ }

  return { booking: paid, reservation };
}, { public: true });

registerFn('approveEventBooking', async ({ body, user }) => {
  const { booking_id, notes } = body as any;
  if (!booking_id) throw new Error('booking_id required');
  const booking = await db.eventBooking.findUnique({ where: { id: booking_id } });
  if (!booking) throw new Error('booking_not_found');

  // Manual-callback flow: the Reservation is created only here, when the manager has actually
  // called the customer and confirmed the deal. This is what "blocks" the table in SeatingSetup.
  let reservationId = booking.reservation_id || null;
  if (!reservationId) {
    try {
      const reservation = await db.reservation.create({
        data: {
          customer_name: booking.customer_name || 'אירוע פרטי',
          customer_phone: booking.customer_phone || null,
          date: booking.event_date,
          time: booking.event_time || '20:00',
          party_size: booking.guest_count || 1,
          status: 'confirmed',
          special_occasion: 'private_event',
          special_requests: `אירוע פרטי — חבילה: ${(booking.selected_menu as any)?.name || '-'} · סכום: ₪${booking.total_ils || 0}` + (booking.short_notice ? ' · ⚡ Short-notice' : ''),
        },
      });
      reservationId = reservation.id;
    } catch (e: any) {
      console.error('approve→reservation create failed', e?.message);
    }
  } else {
    await db.reservation.update({ where: { id: reservationId }, data: { status: 'confirmed' } }).catch(() => {});
  }

  const updated = await db.eventBooking.update({
    where: { id: booking_id },
    data: {
      approval_status: 'approved',
      status: 'confirmed',
      payment_status: 'manual_charged',
      reservation_id: reservationId,
      approval_notes: notes || null,
      updated_date: new Date().toISOString(),
    },
  });
  return { booking: updated };
});

// AUTH — owner deletes a lead (and any related booking) from the dashboard.
registerFn('deleteEventLead', async ({ body }) => {
  const { lead_id } = body as any;
  if (!lead_id) throw new Error('lead_id required');
  // Cascade-ish: drop any booking referencing this lead, then the lead.
  await db.eventBooking.deleteMany({ where: { lead_id } }).catch(() => {});
  await db.eventLead.delete({ where: { id: lead_id } });
  return { ok: true };
});

// AUTH — bulk-delete pure page-load NOISE: leads with no contact info AND
// zero real user messages (only the empty opening turn + Dana's greeting).
// These are the rows the page used to mint on every visit/bot hit. An
// ABANDONED conversation — someone who actually typed but left without
// giving details — is NOT deleted; those are kept for funnel analysis.
registerFn('purgeEmptyEventLeads', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  // Candidates: no contact info at all. Then filter in JS by conversation.
  const candidates: any[] = await db.eventLead.findMany({
    where: {
      AND: [
        { OR: [{ contact_phone: null }, { contact_phone: '' }] },
        { OR: [{ contact_name: null }, { contact_name: '' }] },
        { OR: [{ event_date: null }, { event_date: '' }] },
        { guest_count: null },
      ],
    },
    select: { id: true, conversation_log: true },
  });
  const realUserTurns = (log: any): number => {
    let arr = log;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return 0; } }
    if (!Array.isArray(arr)) return 0;
    return arr.filter((t: any) => t && t.role !== 'assistant' && String(t.content || '').trim().length > 0).length;
  };
  const noiseIds = candidates.filter((c) => realUserTurns(c.conversation_log) === 0).map((c) => c.id);
  if (!noiseIds.length) return { ok: true, deleted: 0, kept_abandoned: candidates.length };
  await db.eventBooking.deleteMany({ where: { lead_id: { in: noiseIds } } }).catch(() => {});
  const res = await db.eventLead.deleteMany({ where: { id: { in: noiseIds } } });
  return { ok: true, deleted: res?.count ?? noiseIds.length, kept_abandoned: candidates.length - noiseIds.length };
});

// AUTH — set the manager's callback stage on a lead.
// Stages: 'pending' (default after Dana closes), 'contacted' (manager called),
// 'quoted' (price/contract sent), 'won' (signed), 'lost' (declined / not relevant).
// Encoded directly in lead.status; callback_at + callback_notes go inside the
// JSON meta block in lead.notes (see chatEventsInquiry comment for the format).
// AUTH — one-shot cleanup: merge duplicate WorkShift rows for the same
// (date, shift_type). The schedule grid uses week.find() in many places, so
// a duplicate row caused different refreshes to pick different shifts and
// the schedule appeared to "change" between page loads. This consolidates
// all assigned_staff into the OLDEST row and deletes the rest.
registerFn('dedupeWorkShifts', async () => {
  const all = await db.workShift.findMany({ orderBy: { id: 'asc' } });
  // Group by ISO-day-string + shift_type
  const groups: Record<string, any[]> = {};
  for (const s of all) {
    const day = s.date instanceof Date
      ? s.date.toISOString().slice(0, 10)
      : String(s.date).slice(0, 10);
    const key = `${day}|${s.shift_type || ''}`;
    (groups[key] = groups[key] || []).push(s);
  }
  let groupsWithDups = 0;
  let merged = 0;
  let deleted = 0;
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    groupsWithDups++;
    const survivor = list[0];
    const losers = list.slice(1);
    // Union assigned_staff by (employee_id|position).
    const seen = new Set<string>();
    const allStaff: any[] = [];
    for (const s of list) {
      for (const a of (s.assigned_staff as any[] | null) || []) {
        const k = `${a.employee_id}|${a.position}`;
        if (seen.has(k)) continue;
        seen.add(k);
        allStaff.push(a);
      }
    }
    // Use the union as the survivor's assigned_staff.
    await db.workShift.update({
      where: { id: survivor.id },
      data: { assigned_staff: allStaff as any },
    });
    merged += allStaff.length;
    for (const l of losers) {
      await db.workShift.delete({ where: { id: l.id } });
      deleted++;
    }
    console.log(`[dedupe] ${key}: kept ${survivor.id.slice(-6)}, deleted ${losers.length} dup(s), merged staff: ${allStaff.length}`);
  }
  return { ok: true, total_shifts: all.length, groups_with_dups: groupsWithDups, merged_staff: merged, deleted };
});

registerFn('setLeadCallbackStage', async ({ body }) => {
  const { lead_id, stage, notes: cbNotes } = body as any;
  if (!lead_id) throw new Error('lead_id required');
  const allowed = ['pending', 'contacted', 'quoted', 'won', 'lost'];
  if (!allowed.includes(stage)) throw new Error(`stage must be one of ${allowed.join(',')}`);

  const META_MARK = '---META---';
  const lead = await db.eventLead.findUnique({ where: { id: lead_id } });
  if (!lead) throw new Error('lead not found');
  const rawNotes = (lead as any).notes || '';
  const i = rawNotes.indexOf(META_MARK);
  let meta: any = {};
  let head = rawNotes;
  if (i >= 0) {
    head = rawNotes.slice(0, i).trimEnd();
    try { meta = JSON.parse(rawNotes.slice(i + META_MARK.length).trim()) || {}; } catch { meta = {}; }
  }
  meta.callback_at = new Date().toISOString();
  if (typeof cbNotes === 'string' && cbNotes.trim()) meta.callback_notes = cbNotes.trim().slice(0, 2000);
  const newNotes = `${head}${head ? '\n' : ''}${META_MARK}\n${JSON.stringify(meta)}`;

  const updated = await db.eventLead.update({
    where: { id: lead_id },
    data: { status: stage, notes: newNotes, updated_date: new Date().toISOString() },
  });
  return { ok: true, lead: updated };
});

// AUTH — bulk delete (cleanup of test leads). Takes an array of ids.
registerFn('deleteEventLeads', async ({ body }) => {
  const ids = (body as any)?.lead_ids;
  if (!Array.isArray(ids) || !ids.length) throw new Error('lead_ids[] required');
  await db.eventBooking.deleteMany({ where: { lead_id: { in: ids } } }).catch(() => {});
  const r = await db.eventLead.deleteMany({ where: { id: { in: ids } } });
  return { deleted: r.count };
});

// AUTH — owner deletes a booking too (rare, mostly for testing).
registerFn('deleteEventBooking', async ({ body }) => {
  const { booking_id } = body as any;
  if (!booking_id) throw new Error('booking_id required');
  await db.eventBooking.delete({ where: { id: booking_id } });
  return { ok: true };
});

registerFn('rejectEventBooking', async ({ body }) => {
  const { booking_id, notes } = body as any;
  if (!booking_id) throw new Error('booking_id required');
  const booking = await db.eventBooking.findUnique({ where: { id: booking_id } });
  if (!booking) throw new Error('booking_not_found');
  // Refund stub: in stub mode we just mark refunded. In stripe mode this is where a real refund call would go.
  const updated = await db.eventBooking.update({
    where: { id: booking_id },
    data: {
      approval_status: 'rejected',
      status: 'rejected',
      approval_notes: notes || null,
      payment_status: booking.payment_method === 'stub' ? 'refunded_stub' : 'refund_pending',
      updated_date: new Date().toISOString(),
    },
  });
  if (booking.reservation_id) {
    await db.reservation.update({ where: { id: booking.reservation_id }, data: { status: 'cancelled' } }).catch(() => {});
  }
  return { booking: updated };
});

// ── Stuck-event-lead scanner ────────────────────────────────────────────────
// Every 10 min, find EventLead rows that engaged (have a conversation_log) but
// got stuck mid-funnel and haven't been pinged yet, and notify the owner so
// they can recover the lead manually before it cools down.
const STUCK_THRESHOLD_MIN = 10;

export async function checkStuckEventLeads() {
  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60 * 1000).toISOString();
    const candidates = await db.eventLead.findMany({
      where: {
        OR: [{ status: 'new' }, { status: 'warm' }],
        updated_date: { lt: cutoff },
      },
      orderBy: { updated_date: 'desc' },
      take: 50,
    });
    for (const lead of candidates) {
      const notes = String(lead.notes || '');
      if (notes.includes('abandoned_alerted:')) continue;
      const log = Array.isArray(lead.conversation_log) ? lead.conversation_log : [];
      if (log.length < 2) continue; // didn't engage past greeting
      // Last 1-2 customer messages — so the owner knows what was said before they bailed.
      const lastCustomerMsgs = (log as any[])
        .filter((t) => t && t.role !== 'assistant')
        .slice(-2)
        .map((t) => String(t.content || '').trim())
        .filter(Boolean);
      const q: any = {};
      // Best-effort extract last-known fields from the row directly
      const summary = [
        '⚠️ ליד אירוע נתקע באמצע — חזור ללקוח',
        `👤 ${lead.contact_name || 'ללא שם'} · ${lead.contact_phone || '-'}`,
        lead.event_date ? `📅 ${lead.event_date}` : null,
        lead.event_type ? `🎉 ${lead.event_type}` : null,
        lead.guest_count ? `👥 ${lead.guest_count} אורחים` : null,
        lead.budget_per_person ? `💰 ₪${lead.budget_per_person}/סועד` : null,
        `📊 ציון: ${lead.score ?? '?'}/100 · סטטוס: ${lead.status || 'new'}`,
        `📥 מקור: ${lead.source || 'web_chat'}`,
        `⏰ עזב לפני ~${STUCK_THRESHOLD_MIN} דק׳ באמצע השיחה`,
        lastCustomerMsgs.length ? `\n💬 הודעות אחרונות של הלקוח:\n${lastCustomerMsgs.map((m) => `"${m.slice(0, 150)}"`).join('\n')}` : null,
      ].filter(Boolean).join('\n');
      try { await pushoverEventsOwners('⚠️ ליד אירוע נטוש', summary); } catch { /* ignore */ }
      try {
        await db.eventLead.update({
          where: { id: lead.id },
          data: { notes: `${notes}${notes ? ' | ' : ''}abandoned_alerted:${new Date().toISOString()}` },
        });
      } catch { /* ignore */ }
    }
  } catch (e: any) {
    console.error('checkStuckEventLeads failed', e?.message);
  }
}

// Returns recommended standalone tables + connected combos that can seat a given party size.
// Used by the events agent / public reservation flow / hostess UI to pick a table without
// re-implementing the matching logic on the client.
registerFn('getTableCombosForPartySize', async ({ body }) => {
  const partySize = Number((body as any)?.party_size || (body as any)?.n || 0);
  const maxComboSize = Math.min(8, Math.max(2, Number((body as any)?.max_combo_size || 4)));
  if (!Number.isFinite(partySize) || partySize < 1) {
    return { error: 'invalid_party_size', singles: [], combos: [] };
  }
  const layout = await db.seatingLayout.findFirst({ orderBy: { updatedAt: 'desc' } });
  const tables: any[] = Array.isArray(layout?.tables) ? (layout!.tables as any[]) : [];
  if (tables.length === 0) return { singles: [], combos: [] };

  const valid = tables.filter((t) => t && t.table_number != null && t.min_capacity != null && t.max_capacity != null);
  const byNum = new Map(valid.map((t) => [String(t.table_number), t]));
  const adj = new Map<string, Set<string>>();
  for (const t of valid) {
    adj.set(String(t.table_number), new Set((Array.isArray(t.combinable_with) ? t.combinable_with : []).map(String)));
  }
  const isConnected = (subset: string[]) => {
    if (subset.length <= 1) return true;
    const inSet = new Set(subset);
    const seen = new Set([subset[0]]);
    const queue = [subset[0]];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) || new Set()) {
        if (inSet.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
    }
    return seen.size === subset.length;
  };

  const singles = valid
    .filter((t) => partySize >= (t.min_capacity || 0) && partySize <= (t.max_capacity || 0))
    .map((t) => String(t.table_number));

  const nums = valid.map((t) => String(t.table_number));
  const combos: Array<{ ids: string[]; sumMin: number; sumMax: number }> = [];
  const seen = new Set<string>();
  const enumerate = (start: number, current: string[], sumMin: number, sumMax: number) => {
    if (current.length >= 2 && partySize >= sumMin && partySize <= sumMax && isConnected(current)) {
      const sorted = [...current].sort();
      const key = sorted.join('-');
      if (!seen.has(key)) {
        seen.add(key);
        combos.push({ ids: sorted, sumMin, sumMax });
      }
    }
    if (current.length >= maxComboSize) return;
    for (let i = start; i < nums.length; i++) {
      const t = byNum.get(nums[i]);
      if (!t) continue;
      current.push(nums[i]);
      enumerate(i + 1, current, sumMin + (t.min_capacity || 0), sumMax + (t.max_capacity || 0));
      current.pop();
    }
  };
  enumerate(0, [], 0, 0);
  combos.sort((a, b) => a.sumMax - b.sumMax || a.ids.length - b.ids.length);
  return { party_size: partySize, singles, combos: combos.slice(0, 12) };
}, { public: true });

// Admin: simulate a stuck lead AND run the scanner once. For diagnostics only.
registerFn('simulateStuckEventLead', async ({ body }) => {
  const lastMsg = (body as any)?.message || 'צילה גילה 16:00';
  const name = (body as any)?.name || 'צילה גילה (סימולציה)';
  const phone = (body as any)?.phone || '0501234567';
  const backdated = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
  const lead = await db.eventLead.create({
    data: {
      contact_name: name,
      contact_phone: phone,
      status: 'new',
      score: 50,
      source: 'diag-claude',
      conversation_log: [
        { role: 'assistant', content: 'היי 🌿 כדי להתקדם — מה השם המלא ובאיזו שעה תרצו שיתחיל?' },
        { role: 'user', content: lastMsg },
      ] as any,
      created_date: backdated,
      updated_date: backdated,
    },
  });
  await checkStuckEventLeads();
  const after = await db.eventLead.findUnique({ where: { id: lead.id } });
  return { ok: true, leadId: lead.id, alerted: String(after?.notes || '').includes('abandoned_alerted:') };
});

if (!(globalThis as any).__stuckEventLeadTimer) {
  (globalThis as any).__stuckEventLeadTimer = setTimeout(function loop() {
    checkStuckEventLeads().finally(() => {
      (globalThis as any).__stuckEventLeadTimer = setTimeout(loop, 10 * 60 * 1000);
    });
  }, 60 * 1000);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ─── WAITER AGENT (Digital head waiter via QR on table) ──────────────────── */
/* ─────────────────────────────────────────────────────────────────────────── */

const WAITER_DEFAULT_PROMPT = `אתה ראש מלצרי "{brand}". עברית חמה, מקצועית, קצרה, בגובה העיניים. מתשובה אחת לשנייה — לא מציפים את הלקוח בטקסט.

יעד: 4-5 מנות לזוג (3-4 חלוקה + 0-2 בצלחת) + אלכוהול תואם + צ׳ייסר + בילד-אפ לקינוח.

חוקי ברזל:
1. רק פריטים מ-MENU (שמות, רכיבים, מחירים). אסור להמציא. אסור פריט שב-OUT_OF_STOCK.
2. אין דגים — אם שואלים, מפנים לירקות גוספר/חלוקה בשרית.
3. אלכוהול: לפני ההמלצה הראשונה — חובה לוודא 18+. ענו לא → קוקטייל ללא אלכוהול בלבד.
4. אלרגיות/כשרות: שואלים בהתחלה, ומכבדים allergens של כל פריט.

תסריט (שאלה אחת בכל הודעה!):
• פתיחה: "ברוכים הבאים ל{brand} 🌿 כמה אתם?"
• "פעם ראשונה אצלנו?"
• "יש אלרגיות / כשרות / גלוטן שצריך לדעת?"
• "אוכלי בשר? איזו רמת פיקנטיות?"
• "מצב רוח: חלוקה במרכז השולחן או כל אחד עיקרית בצלחת?"
• בניית הארוחה: 1-2 סלטים + 2-3 חלוקה (זה הלב) + עיקרית אם בחרו בצלחת. הצג ב-3-4 שורות עם המחירים מ-MENU. "מה דעתכם?"
• אישור אלכוהול 18+ → התאם משקה → הצע צ׳ייסר פתיחה.
• בילד-אפ לקינוח: "תשאירו פינה קטנה בסוף — ה[קינוח מ-MENU] שלנו זה חובה."
• סיכום עם מחירים → "תעלו עם זה למלצר/ית."

החזר JSON אך ורק במבנה:
{
  "reply": "<תשובה קצרה בעברית, 1-4 משפטים, שאלה אחת בלבד אם רלוונטי>",
  "stage": "greeting|profiling|building|alcohol|chaser|dessert_buildup|summary|completed",
  "collected": {
    "party_size": <int|null>,
    "is_first_visit": <bool|null>,
    "dietary_flags": { "allergies": [], "kosher": <bool|null>, "gluten_free": <bool|null> },
    "preferences": { "loves_meat": <bool>, "spice_level": "low|med|high|null", "style": "sharing|individual|null" },
    "age_18_plus_confirmed": <bool|null>,
    "recommended_items": [ { "name": "<from MENU>", "category": "<from MENU>", "price_ils": <int>, "qty": <int> } ],
    "total_ils": <int|null>
  },
  "complete": <true רק אחרי שהלקוח אישר במפורש את הסיכום הסופי>,
  "summary": "<2-3 משפטים: טעמים, רגישויות, מה לא לשכוח>"
}`;

// Public diagnostic: returns kit size + system prompt length so we can see if
// a huge menu / huge prompt is what's making the LLM slow.
registerFn('waiterDiagnostics', async () => {
  const kit = await (prisma as any).waiterKit.findFirst({ where: { singleton: true } });
  if (!kit) return { exists: false };
  const menuJson = JSON.stringify(kit.menu || {});
  const promptLen = String(kit.system_prompt || '').length;
  let menuItemCount = 0;
  try {
    const cats = (kit.menu as any)?.categories || (kit.menu as any)?.evening?.categories || [];
    for (const c of cats) menuItemCount += ((c.items || []).length);
  } catch {}
  return {
    exists: true,
    menu_json_chars: menuJson.length,
    menu_item_count: menuItemCount,
    daily_specials_count: Array.isArray(kit.daily_specials) ? kit.daily_specials.length : 0,
    out_of_stock_count: Array.isArray(kit.out_of_stock) ? kit.out_of_stock.length : 0,
    system_prompt_chars: promptLen,
    estimated_total_input_chars: menuJson.length + promptLen + 1000,
  };
}, { public: true });

registerFn('getWaiterKit', async () => {
  let kit = await (prisma as any).waiterKit.findFirst({ where: { singleton: true } });
  if (!kit) {
    kit = await (prisma as any).waiterKit.create({
      data: {
        singleton: true,
        menu: { categories: [] },
        daily_specials: [],
        out_of_stock: [],
        general_info: {
          kashrut: '', wifi: '', parking: '', hours: '', address: '', faq: [],
        },
        system_prompt: WAITER_DEFAULT_PROMPT,
        updated_date: new Date().toISOString(),
      },
    });
  }
  return { kit };
});

registerFn('saveWaiterKit', async ({ body, user }) => {
  const incoming = (body as any)?.kit || {};
  const existing = await (prisma as any).waiterKit.findFirst({ where: { singleton: true } });
  const data: any = {
    menu: incoming.menu ?? existing?.menu ?? { categories: [] },
    daily_specials: incoming.daily_specials ?? existing?.daily_specials ?? [],
    out_of_stock: incoming.out_of_stock ?? existing?.out_of_stock ?? [],
    general_info: incoming.general_info ?? existing?.general_info ?? {},
    system_prompt: incoming.system_prompt ?? existing?.system_prompt ?? WAITER_DEFAULT_PROMPT,
    updated_by: (user as any)?.email || null,
    updated_date: new Date().toISOString(),
  };
  const saved = existing
    ? await (prisma as any).waiterKit.update({ where: { id: existing.id }, data })
    : await (prisma as any).waiterKit.create({ data: { singleton: true, ...data } });
  return { kit: saved };
});

// PUBLIC — main chat. session_id ties multiple turns together (frontend persists it).
// Clean rebuild of chatWaiter. Mirrors chatEventsInquiry's exact pattern
// (which runs in 5.7s reliably in production). No model override, no maxOutputTokens,
// no timeoutMs, no retry, no compact-menu trickery. Just: load kit → build prompt with
// JSON menu → invokeLLM → save WaiterOrder → return reply. Same signature events uses.
registerFn('chatWaiter', async ({ body }) => {
  const { session_id, table_hint, history, message, language: languageRaw } = body as any;
  if (!session_id) throw new Error('session_id required');
  const language = (() => {
    const allowed = ['Hebrew', 'English', 'Russian'];
    const raw = typeof languageRaw === 'string' ? languageRaw.trim() : '';
    return allowed.includes(raw) ? raw : 'Hebrew';
  })();

  // Load the kit (creates on first call). Same shape as before — no migrations needed.
  let kit = await (prisma as any).waiterKit.findFirst({ where: { singleton: true } });
  if (!kit) {
    kit = await (prisma as any).waiterKit.create({
      data: {
        singleton: true,
        menu: { categories: [] },
        daily_specials: [],
        out_of_stock: [],
        general_info: {},
        system_prompt: WAITER_DEFAULT_PROMPT,
        updated_date: new Date().toISOString(),
      },
    });
  }
  const rawPromptW = (kit.system_prompt && kit.system_prompt.trim()) || WAITER_DEFAULT_PROMPT;
  const bpBlockW = await businessContextBlock();
  const brandNameW = await getBrandName();
  const systemPrompt = bpBlockW
    + renderBrand(rawPromptW, brandNameW)
        .replaceAll('עלינא', brandNameW)
        .replaceAll('עלנא', brandNameW);

  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];
  const transcript = turns.map((t) => `${t.role === 'assistant' ? 'מלצר' : 'לקוח'}: ${t.content}`).join('\n');
  const newPart = message ? `\nלקוח: ${message}` : '';

  // Inject the kit as JSON exactly the way events injects its sales kit — proven fast.
  const kitContext =
    `\n--- MENU (מקור האמת לכל מחיר/פריט — אל תמציא כלום) ---\n` +
    `${JSON.stringify(kit.menu || {}, null, 0)}\n` +
    `--- DAILY_SPECIALS ---\n${JSON.stringify(kit.daily_specials || [], null, 0)}\n` +
    `--- OUT_OF_STOCK ---\n${JSON.stringify(kit.out_of_stock || [], null, 0)}\n` +
    `--- GENERAL_INFO ---\n${JSON.stringify(kit.general_info || {}, null, 0)}\n` +
    `--- TARGET: 4-5 מנות לזוג (3-4 חלוקה + 0-2 בצלחת) ---\n`;

  const langDirective = language === 'Hebrew'
    ? ''
    : `\n\n--- LANGUAGE DIRECTIVE ---\nThe customer is ordering in ${language}. Your "reply" field MUST be written in ${language}, idiomatic and warm. The menu (item names, descriptions) MAY stay in Hebrew — that's expected and normal for a Hebrew restaurant — but explain dishes in ${language} when introducing them. recommended_items field stays as-is (real menu item ids).`;

  const prompt = `${systemPrompt}${kitContext}${langDirective}\n--- שיחה עד כה ---\n${transcript || '(תחילת השיחה — קבל את הלקוח בברכה חמה ושאל כמה הם)'}${newPart}\n\nהחזר JSON בלבד.`;

  // Best-effort LLM call with aggressive resilience:
  //   1. Try Anthropic Claude Haiku (fastest + most reliable). If no API key OR it fails — fallback.
  //   2. Fallback: 4 attempts to Gemini with 18s timeout each. Total worst case ~72s,
  //      safely under Cloudflare's 100s.
  //   3. If EVERYTHING fails — return a graceful canned response instead of throwing.
  //      Customer sees a friendly nudge, NEVER the "סליחה, יש בעיה זמנית" bubble.
  const callOnce = (forceProvider: 'gemini' | 'anthropic', toMs: number) => invokeLLM({
    prompt,
    provider: forceProvider,
    model: forceProvider === 'anthropic' ? 'claude-haiku-4-5' : undefined,
    timeoutMs: toMs,
    maxOutputTokens: 1500,
    responseSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        stage: { type: 'string' },
        collected: { type: 'object' },
        complete: { type: 'boolean' },
        summary: { type: 'string' },
      },
      required: ['reply'],
    },
  });

  let result: any = null;
  const errors: string[] = [];

  // Attempt 1: Anthropic (will throw immediately if no ANTHROPIC_API_KEY → cheap to try)
  try {
    result = await callOnce('anthropic', 25_000);
    if (!result?.reply) { result = null; throw new Error('anthropic_empty'); }
  } catch (e: any) {
    errors.push(`anthropic: ${e?.message}`);
  }

  // Attempts 2-5: Gemini retries with 18s timeout each
  if (!result?.reply) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const r = await callOnce('gemini', 18_000);
        if (r?.reply && String(r.reply).trim().length > 1) {
          result = r;
          break;
        }
        errors.push(`gemini#${attempt}: empty`);
      } catch (e: any) {
        errors.push(`gemini#${attempt}: ${e?.message}`);
      }
    }
  }

  // FINAL FALLBACK: never let the customer see a broken apology. Return a friendly
  // canned reply that keeps the conversation alive. They can resend their last
  // message and the next call will likely succeed.
  if (!result?.reply) {
    console.error('[chatWaiter] ALL attempts failed:', errors.join(' | '));
    const turn = turns.length;
    result = {
      reply: turn === 0
        ? `שלום וברוכים הבאים ל${await getBrandName()} 🌿 רק רגע — אני מתחילה לעבוד, תכתבו לי שוב את ההודעה ואני מיד עונה.`
        : 'רגע אחד 🌿 אני בודקת את התפריט בשבילכם. תכתבו לי שוב את ההודעה ואני מיד עונה.',
      stage: 'collecting',
      collected: {},
      complete: false,
      summary: '',
    };
  }

  const c = result?.collected || {};
  const items = Array.isArray(c.recommended_items) ? c.recommended_items : [];
  const total = typeof c.total_ils === 'number'
    ? Math.round(c.total_ils)
    : items.reduce((s: number, it: any) => s + (Number(it.price_ils) || 0) * (Number(it.qty) || 1), 0);

  const fullLog = [
    ...turns,
    ...(message ? [{ role: 'user', content: message, timestamp: new Date().toISOString() }] : []),
    { role: 'assistant', content: result?.reply || '', timestamp: new Date().toISOString() },
  ];

  const nowIso = new Date().toISOString();
  const orderData: any = {
    session_id,
    table_hint: table_hint || null,
    party_size: typeof c.party_size === 'number' ? c.party_size : null,
    is_first_visit: typeof c.is_first_visit === 'boolean' ? c.is_first_visit : null,
    dietary_flags: c.dietary_flags || null,
    preferences: c.preferences || null,
    recommended_items: items,
    total_ils: total || null,
    conversation_log: fullLog as any,
    ai_summary: result?.summary || null,
    status: result?.complete ? 'closed_to_self' : 'in_progress',
    source: table_hint ? 'qr_table' : 'qr_generic',
  };

  let order: any = null;
  try {
    const existing = await (prisma as any).waiterOrder.findFirst({ where: { session_id } });
    if (existing) {
      order = await (prisma as any).waiterOrder.update({ where: { id: existing.id }, data: { ...orderData, updated_date: nowIso } });
    } else {
      order = await (prisma as any).waiterOrder.create({ data: { ...orderData, created_date: nowIso, updated_date: nowIso } });
    }
  } catch (e: any) { console.error('[waiterOrder.upsert]', e?.message); }

  return {
    reply: result?.reply || 'סליחה, יש תקלה קטנה — תוכלו לנסות שוב?',
    stage: result?.stage || null,
    complete: !!result?.complete,
    order_id: order?.id || null,
    total_ils: total,
    recommended_items: items,
  };
}, { public: true });

// AUTH — accept a PDF (or image) URL and extract a structured Alena menu from it.
// Uses Gemini's file pipeline via invokeLLM(fileUrls=[...]). Returns items grouped
// into the 10 Alena categories so the frontend can merge them straight into kit.menu.
registerFn('extractWaiterMenuFromFile', async ({ body }) => {
  const { url, kind } = body as any; // kind: 'food' | 'drinks' | 'both'
  if (!url) throw new Error('url required');
  const kindLabel = kind === 'drinks'
    ? 'התפריט הוא של משקאות / אלכוהול בלבד.'
    : kind === 'food'
      ? 'התפריט הוא של מנות אוכל בלבד.'
      : 'התפריט עשוי להכיל גם אוכל וגם משקאות.';
  const brandNameEW = await getBrandName();

  const buildPrompt = (priorItems: any[] = []) => {
    const priorSection = priorItems.length
      ? `\n\n# חשוב — סבב חוזר\n` +
        `החזרת כבר את ${priorItems.length} הפריטים הבאים מהקובץ:\n${priorItems.map((p: any) => `- ${p.name} (${p.category_id})`).join('\n')}\n` +
        `**אל תחזיר אותם שוב.** סרוק שוב את הקובץ, ותחזיר רק פריטים שדילגת עליהם בסבב הקודם. סרוק עמוד-עמוד, קטגוריה-קטגוריה. גם פריטים קטנים, גם תוספות, גם וריאנטים. אם באמת חיברת את כולם — החזר items=[].\n`
      : '';
    return (
      `מצורף קובץ תפריט (PDF או תמונה) של מסעדת ${brandNameEW}.\n` +
      priorSection
    );
  };

  const callOnce = async (priorItems: any[] = []) => invokeLLM({
    maxOutputTokens: 32000,
    timeoutMs: 90_000,
    prompt:
      buildPrompt(priorItems) +
      `${kindLabel}\n\n` +
      `# המשימה: חילוץ מקסימליסטי\n` +
      `**חובה לחלץ את כל הפריטים בתפריט — אסור לדלג, אסור לסכם, אסור להוסיף "ועוד..."**.\n` +
      `אם יש 30 מנות בתפריט — תחזיר 30. אם יש 70 — תחזיר 70. עבור על כל עמוד, כל קטגוריה, כל פריט.\n` +
      `סרוק בשיטתיות: עמוד אחד אחרי השני, קטגוריה אחר קטגוריה, מימין לשמאל ומלמעלה למטה.\n` +
      `אם רואים פריט בלי מחיר — עדיין החזר אותו (price_ils=0).\n` +
      `אם רואים פריט שמופיע פעמיים בגדלים שונים — החזר את שני הוואריאנטים בנפרד.\n\n` +
      `# קטגוריות מותרות בלבד (category_id)\n` +
      `- salads (סלטים)\n` +
      `- sharing_veg (מנות חלוקה — ירקות מהגוספר)\n` +
      `- sharing_meat (מנות חלוקה — בשר)\n` +
      `- mains_plate (עיקריות בצלחת — פרגית/קבב/נתחים)\n` +
      `- wine (יין)\n` +
      `- cocktails (קוקטיילים)\n` +
      `- beer (בירה)\n` +
      `- chasers (צ׳ייסרים / שוטים)\n` +
      `- soft_drinks (שתייה קלה / מים)\n` +
      `- desserts (קינוחים)\n` +
      `- other (כל פריט שלא מתאים)\n\n` +
      `# לכל פריט חלץ\n` +
      `- name: השם בדיוק כפי שכתוב (שמור איות ופיסוק; אל תתרגם)\n` +
      `- description: רכיבים / אופן הגשה / גודל מנה — בדיוק כפי שהתפריט מתאר\n` +
      `- price_ils: מחיר ש"ח כמספר שלם (0 אם לא מצוין)\n` +
      `- allergens: מהרשימה הסגורה ["גלוטן","אגוזים","לקטוז","ביצים","סויה","שומשום","סולפיטים"] — רק אם התפריט מציין במפורש\n` +
      `- notes: "פיקנטית" / "מנה גדולה לחלוקה" / "סיגנייצ׳ר" / "צמחוני" / "חדש" / "מומלץ" — רק אם מצוין\n\n` +
      `החזר JSON בלבד — dishes עם כל הפריטים. אסור להחזיר מערך עם פחות פריטים ממה שיש בתפריט.`,
    fileUrls: [url],
    responseSchema: {
      type: 'object',
      properties: {
        // `dishes`, NOT `items` — Gemini empties a property literally named
        // `items` (JSON-Schema keyword collision, A/B-proven 2026-07-05).
        dishes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category_id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              price_ils: { type: 'integer' },
              allergens: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
  });

  // Two-pass extraction: if the first pass returned fewer items than expected, do a second
  // pass with the prior items as 'do not return these again' context. Catches Gemini's
  // tendency to be lazy on long PDFs by giving it an explicit nudge for what was missed.
  const pass1: any = await callOnce([]);
  const items1 = Array.isArray(pass1?.dishes) ? pass1.dishes : (Array.isArray(pass1?.items) ? pass1.items : []);
  let allItems = [...items1];
  if (items1.length > 0 && items1.length < 60) {
    try {
      const pass2: any = await callOnce(items1);
      const items2 = Array.isArray(pass2?.dishes) ? pass2.dishes : (Array.isArray(pass2?.items) ? pass2.items : []);
      // Dedupe by name (case-insensitive) so we don't double-count anything Gemini repeated
      const seen = new Set(items1.map((i: any) => String(i.name || '').toLowerCase().trim()));
      for (const it of items2) {
        const key = String(it?.name || '').toLowerCase().trim();
        if (key && !seen.has(key)) {
          allItems.push(it);
          seen.add(key);
        }
      }
      console.log(`[extractWaiterMenu] pass1=${items1.length} pass2=${items2.length} merged=${allItems.length}`);
    } catch (e: any) {
      console.warn('[extractWaiterMenu] pass2 failed', e?.message);
    }
  }

  return { items: allItems, _pass1: items1.length, _final: allItems.length };
});

registerFn('listWaiterOrders', async () => {
  const orders = await (prisma as any).waiterOrder.findMany({ orderBy: { id: 'desc' }, take: 100 });
  return { orders, _count: orders.length };
});

registerFn('deleteWaiterOrder', async ({ body }) => {
  const { order_id } = body as any;
  if (!order_id) throw new Error('order_id required');
  await (prisma as any).waiterOrder.delete({ where: { id: order_id } });
  return { ok: true };
});

// =====================================================================
// VP MARKETING — 11-agent ecosystem
// All runs are persisted in MarketingAgentRun for history + dashboard.
// LLM-driven agents return real output via Gemini.
// API-dependent agents (Meta Ads, Midjourney, Instagram Graph) return
// status='needs_integration' with the list of secrets required, so the
// owner sees exactly what's missing to flip them live.
// =====================================================================

const ALINA_BRAND_VOICE_TEMPLATE = `אתה כותב בשם המסעדה "{brand}". עברית טבעית בלבד, בלי אימוג'ים מוגזמים. דגש על חוויה וסיפור.`;
async function getAlinaBrandVoice(): Promise<string> {
  return renderBrand(ALINA_BRAND_VOICE_TEMPLATE, await getBrandName());
}
const ALINA_DEFAULT_CITIES = ['Rishon LeZion'];
const ALINA_DEFAULT_LANDING_URL = 'https://topalena.com/EventsInquiry?utm_source=facebook';

// Pita Alena ad account (provided by owner). Token comes from DB (set via UI)
// with env fallback for legacy setups.
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || '1678566132326169';
async function getSecret(key: string): Promise<string | null> {
  try {
    const row = await db.integrationSecret.findFirst({ where: { key } });
    if (row?.value) return row.value;
  } catch {}
  return process.env[key] || null;
}
const META_TOKEN = () => getSecret('META_ADS_ACCESS_TOKEN');

const AGENT_REGISTRY: Record<string, { label: string; needs?: string[] }> = {
  vp_marketing:         { label: 'VP Marketing (מנהל שיווק)' },
  copywriter:           { label: 'Copywriter' },
  storyteller:          { label: 'Storyteller / Newsletter' },
  trend_spotter:        { label: 'Trend-Spotter' },
  menu_engineer:        { label: 'Menu Engineer' },
  conversational:       { label: 'Conversational (DM responder)' },
  visual_designer:      { label: 'Visual Designer' }, // Uses Google Imagen via existing GEMINI_API_KEY — live.
  main_media_buyer:     { label: 'Main Media Buyer' },
  event_campaigns:      { label: 'Event Campaigns' },
  lunch_campaigns:      { label: 'Lunch Campaigns' },
  evening_campaigns:    { label: 'Evening/Delivery Campaigns' },
  optimization_analyst: { label: 'Optimization Analyst' },
};

// Ad-account is hardcoded; only the access token is gated.
const META_AGENTS = new Set(['main_media_buyer', 'event_campaigns', 'lunch_campaigns', 'evening_campaigns', 'optimization_analyst']);

async function runCopywriter(input: any) {
  const { topic, channel = 'instagram', length = 'short', cta } = input || {};
  if (!topic) throw new Error('topic required');
  const result: any = await invokeLLM({
    prompt: `${await getAlinaBrandVoice()}\n\nכתוב 3 וריאציות קופי ל-${channel} בנושא: "${topic}".\nאורך: ${length}. ${cta ? `Call-to-action: ${cta}.` : ''}\nהחזר JSON: { variants: [{ hook, body, hashtags: [..] }, ...] }`,
    responseSchema: {
      type: 'object',
      properties: {
        variants: {
          type: 'array',
          items: { type: 'object', properties: { hook: { type: 'string' }, body: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } } },
        },
      },
    },
  });
  return {
    ...result,
    next_steps: [
      { agent_type: 'visual_designer', reason: 'יש לך 3 וריאציות קופי — צריך תמונה תואמת לכל אחת.', priority: 'high', input: { brief: `תמונה לפוסט בנושא: ${topic}`, style: 'Jerusalem-Chic, smoky, food photography' } },
      { agent_type: 'storyteller', reason: 'אפשר לקחת את הקופי הזה ולהרחיב אותו לסיפור בניוזלטר.', priority: 'low', input: { period: 'week', highlights: topic } },
    ],
  };
}

async function runStoryteller(input: any) {
  const { period = 'week', highlights = '' } = input || {};
  const result: any = await invokeLLM({
    prompt: `${await getAlinaBrandVoice()}\n\nכתוב טיוטה לניוזלטר ${period === 'month' ? 'חודשי' : 'שבועי'} ללקוחות המועדון של ${await getBrandName()}. נקודות בולטות מהשטח: ${highlights || '(אין — בחר זוויות מעניינות בעצמך: מנות עונתיות, סיפורי שף, אירועי החודש)'}.\nהחזר JSON: { subject, intro, sections: [{ heading, body }], closing }`,
    responseSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        intro: { type: 'string' },
        sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, body: { type: 'string' } } } },
        closing: { type: 'string' },
      },
    },
  });
  return {
    ...result,
    next_steps: [
      { agent_type: 'copywriter', reason: 'תזעיר את הניוזלטר לפוסט אינסטגרם קצר.', priority: 'medium', input: { topic: result?.subject || 'ניוזלטר השבוע', channel: 'instagram', length: 'short' } },
      { agent_type: 'visual_designer', reason: 'תמונת כותרת לניוזלטר.', priority: 'low', input: { brief: result?.subject || 'תמונה לניוזלטר', style: 'Jerusalem-Chic, warm light' } },
    ],
  };
}

async function runTrendSpotter(input: any) {
  const { niche = 'restaurant_jerusalem' } = input || {};
  const result: any = await invokeLLM({
    prompt: `${await getAlinaBrandVoice()}\n\nאתה Trend-Spotter. צור 5 זוויות תוכן טרנדיות שמתאימות ל${await getBrandName()} על בסיס דפוסים שראית ב-TikTok/Instagram Reels בקטגוריית ${niche}. לכל זווית — תאר רעיון לסרטון/פוסט ולמה זה ידבר. החזר JSON: { trends: [{ title, hook, why_it_works, suggested_format }] }`,
    responseSchema: {
      type: 'object',
      properties: {
        trends: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, hook: { type: 'string' }, why_it_works: { type: 'string' }, suggested_format: { type: 'string' } } } },
      },
    },
  });
  const firstTrend = result?.trends?.[0];
  return {
    ...result,
    next_steps: firstTrend ? [
      { agent_type: 'copywriter', reason: `הטרנד "${firstTrend.title}" הכי חזק — בוא נכתוב קופי שמיישם אותו.`, priority: 'high', input: { topic: firstTrend.title, channel: 'instagram', length: 'short' } },
      { agent_type: 'visual_designer', reason: `לתת לטרנד תמונה תואמת.`, priority: 'medium', input: { brief: firstTrend.hook || firstTrend.title, style: 'Jerusalem-Chic, smoky' } },
    ] : [],
  };
}

async function runMenuEngineer(input: any) {
  const { sales_data = '' } = input || {};
  if (!sales_data) {
    return { recommendations: [], note: 'הדבק נתוני מכירות (מנה, כמות שנמכרה, מחיר, עלות) כדי לקבל המלצות.' };
  }
  const result: any = await invokeLLM({
    prompt: `אתה Menu Engineer במסעדת ${await getBrandName()}. נתח את נתוני המכירות הבאים וסווג כל מנה לאחת מ-4 קטגוריות BCG: Star (פופולרי+רווחי), Plowhorse (פופולרי+לא רווחי), Puzzle (לא פופולרי+רווחי), Dog (לא פופולרי+לא רווחי). תן המלצה קונקרטית לכל מנה.\n\nנתונים:\n${sales_data}\n\nהחזר JSON: { dishes: [{ name, category, margin_estimate, popularity, recommendation }], summary }`,
    responseSchema: {
      type: 'object',
      properties: {
        // `dishes`, NOT `items` (Gemini keyword collision → empty).
        dishes: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, margin_estimate: { type: 'string' }, popularity: { type: 'string' }, recommendation: { type: 'string' } } } },
        summary: { type: 'string' },
      },
    },
  });
  if (result && !result.items && Array.isArray(result.dishes)) result.items = result.dishes;
  const stars = (result?.items || []).filter((i: any) => i.category === 'Star');
  const topStar = stars[0];
  return {
    ...result,
    next_steps: topStar ? [
      { agent_type: 'copywriter', reason: `"${topStar.name}" היא Star — שווה לדחוף אותה במודעה.`, priority: 'high', input: { topic: `מנת ${topStar.name} — Star של התפריט`, channel: 'instagram', length: 'short' } },
      { agent_type: 'lunch_campaigns', reason: 'בדוק אם אפשר לקדם את המנות הרווחיות בקמפיין צהריים.', priority: 'medium', input: { goal: `דחיפה למנות עם מרג'ין גבוה — במיוחד ${topStar.name}` } },
    ] : [],
  };
}

async function runVisualDesigner(input: any) {
  const { brief, style = 'food photography, smoky, warm light, Jerusalem-Chic, josper fire, shallow depth of field' } = input || {};
  if (!brief) throw new Error('brief required');
  const fullPrompt = `${brief}. Style: ${style}. Hyper-realistic, professional restaurant photography for Alina restaurant in Jerusalem.`;
  const img = await generateImage({ prompt: fullPrompt });
  return {
    prompt_used: fullPrompt,
    image_base64: img.image_base64,
    note: img.image_base64 ? 'תמונה נוצרה דרך Google Imagen' : 'Imagen לא החזיר תמונה — נסה שוב או שנה ניסוח',
    next_steps: img.image_base64 ? [
      { agent_type: 'copywriter', reason: 'יש תמונה — בוא נכתוב לה קופי שמלווה.', priority: 'high', input: { topic: brief, channel: 'instagram', length: 'short' } },
      { agent_type: 'main_media_buyer', reason: 'אחרי שיש תמונה + קופי, אפשר לבדוק איך לשלב במודעה חיה.', priority: 'low', input: { date_preset: 'last_7d', goal: 'איפה לשלב יצירתי חדש' } },
    ] : [],
  };
}

async function metaApi(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const token = await META_TOKEN();
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN not configured');
  const url = `https://graph.facebook.com/v21.0${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${JSON.stringify(data?.error || data)}`);
  return data;
}

async function runMetaAgent(agentKey: string, input: any) {
  const focusMap: Record<string, string> = {
    main_media_buyer: 'אסטרטגיית מדיה כוללת — הקצאת תקציב בין קמפיינים',
    event_campaigns: 'קמפיינים לאירועים פרטיים',
    lunch_campaigns: 'ארוחת צהריים/עסקית',
    evening_campaigns: 'ערב ומשלוחים (Wolt/Tabit, שעות 18-22)',
    optimization_analyst: 'אופטימיזציה רציפה — תקציבים והשבתת מודעות חלשות',
  };
  const focus = focusMap[agentKey] || 'מדיה כללית';

  // Date window — default last 7 days. Override via input.date_preset:
  //   today | yesterday | last_7d | last_14d | last_30d | this_month | last_month | lifetime
  const datePreset = (input?.date_preset && String(input.date_preset)) || 'last_7d';
  const periodLabel: Record<string, string> = {
    today: 'היום',
    yesterday: 'אתמול',
    last_7d: '7 הימים האחרונים',
    last_14d: '14 הימים האחרונים',
    last_30d: '30 הימים האחרונים',
    this_month: 'החודש (מתחילתו)',
    last_month: 'החודש הקודם',
    lifetime: 'כל הזמן (מאז תחילת הקמפיין)',
  };
  const periodHebrew = periodLabel[datePreset] || datePreset;

  const insightFields = 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type';
  const campaigns = await metaApi(
    `/act_${META_AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(${datePreset}){${insightFields}}&limit=50`,
  );

  // Pre-compute ALL metrics deterministically. The LLM may only reference
  // values from this object — it is NOT allowed to do arithmetic or estimate.
  const perCampaign = (campaigns?.data || []).map((c: any) => {
    const ins = c?.insights?.data?.[0] || {};
    const spend = parseFloat(ins.spend || '0');
    const clicks = parseInt(ins.clicks || '0');
    const impressions = parseInt(ins.impressions || '0');
    const ctr = parseFloat(ins.ctr || '0');
    const cpc = parseFloat(ins.cpc || '0');
    const cpm = parseFloat(ins.cpm || '0');
    const reach = parseInt(ins.reach || '0');
    const frequency = parseFloat(ins.frequency || '0');
    const actions = Array.isArray(ins.actions) ? ins.actions : [];
    const costPerActions = Array.isArray(ins.cost_per_action_type) ? ins.cost_per_action_type : [];
    const findAction = (t: string) => parseInt(actions.find((a: any) => a.action_type === t)?.value || '0');
    const findCost = (t: string) => parseFloat(costPerActions.find((a: any) => a.action_type === t)?.value || '0');
    const leads = findAction('lead');
    const link_clicks = findAction('link_click');
    const messaging_conversations = findAction('onsite_conversion.messaging_conversation_started_7d');
    const post_engagements = findAction('post_engagement');
    const cost_per_lead = findCost('lead');
    const cost_per_link_click = findCost('link_click');
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      daily_budget_ils: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
      lifetime_budget_ils: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
      start_time: c.start_time || null,
      stop_time: c.stop_time || null,
      has_insights_data: !!ins.spend,
      spend_ils: spend,
      clicks,
      link_clicks,
      impressions,
      reach,
      frequency,
      ctr_pct: ctr,
      cpc_ils: cpc,
      cpm_ils: cpm,
      leads,
      cost_per_lead_ils: cost_per_lead,
      cost_per_link_click_ils: cost_per_link_click,
      messaging_conversations,
      post_engagements,
    };
  });

  // Deterministic aggregates — LLM uses these, never recomputes.
  const withData = perCampaign.filter((c: any) => c.has_insights_data);
  const totalSpend = perCampaign.reduce((s: number, c: any) => s + c.spend_ils, 0);
  const totalClicks = perCampaign.reduce((s: number, c: any) => s + c.clicks, 0);
  const totalImpressions = perCampaign.reduce((s: number, c: any) => s + c.impressions, 0);
  const totalLeads = perCampaign.reduce((s: number, c: any) => s + c.leads, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const blendedCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const sortedBySpend = [...withData].sort((a, b) => b.spend_ils - a.spend_ils);
  const sortedByCtr = [...withData].filter(c => c.impressions >= 100).sort((a, b) => b.ctr_pct - a.ctr_pct);
  const sortedByCpl = [...withData].filter(c => c.leads > 0).sort((a, b) => a.cost_per_lead_ils - b.cost_per_lead_ils);

  const facts = {
    period: periodHebrew,
    campaign_count: perCampaign.length,
    campaigns_with_data: withData.length,
    totals: {
      spend_ils: Math.round(totalSpend * 100) / 100,
      clicks: totalClicks,
      impressions: totalImpressions,
      leads: totalLeads,
    },
    blended_metrics: {
      avg_ctr_pct: Math.round(avgCtr * 100) / 100,
      cpc_ils: Math.round(blendedCpc * 100) / 100,
      cost_per_lead_ils: Math.round(blendedCpl * 100) / 100,
    },
    highest_spender: sortedBySpend[0] ? { name: sortedBySpend[0].name, spend_ils: sortedBySpend[0].spend_ils } : null,
    best_ctr: sortedByCtr[0] ? { name: sortedByCtr[0].name, ctr_pct: sortedByCtr[0].ctr_pct } : null,
    worst_ctr: sortedByCtr[sortedByCtr.length - 1] && sortedByCtr.length > 1 ? { name: sortedByCtr[sortedByCtr.length - 1].name, ctr_pct: sortedByCtr[sortedByCtr.length - 1].ctr_pct } : null,
    cheapest_lead: sortedByCpl[0] ? { name: sortedByCpl[0].name, cost_per_lead_ils: sortedByCpl[0].cost_per_lead_ils } : null,
    most_expensive_lead: sortedByCpl[sortedByCpl.length - 1] && sortedByCpl.length > 1 ? { name: sortedByCpl[sortedByCpl.length - 1].name, cost_per_lead_ils: sortedByCpl[sortedByCpl.length - 1].cost_per_lead_ils } : null,
  };
  const summary = perCampaign;

  const result: any = await invokeLLM({
    prompt: `אתה אנליסט מדיה דיגיטלית. אתה כותב כמו CFO: יבש, מספרי, ענייני. אסור פיוטיקה, אסור "קדימה/יאללה", אסור מבוא, אסור סיום.

🛑 חוקים קשיחים — הפרה = פסילה:
1. אל תמציא מספרים. כל מספר שתכתוב חייב להיות זהה בדיוק למספר ב-FACTS או PER_CAMPAIGN למטה.
2. אל תמציא שמות קמפיינים. אם תכתוב campaign_name — חייב להיות אחד מהשמות המדויקים ב-PER_CAMPAIGN.
3. אם אין מספיק נתונים לקמפיין מסוים (has_insights_data=false) — אל תכתוב עליו כלום או כתוב "אין מספיק נתונים".
4. אל תחשב אחוזים בעצמך. השתמש אך ורק בערכים מ-FACTS.
5. תקופת הנתונים: **${periodHebrew}**. כל אזכור זמן חייב להיות "${periodHebrew}". לעולם לא "החודש" / "השבוע" אם זה לא תואם.

פוקוס הסוכן: ${focus}.
${input?.goal ? `שאלה ספציפית מהבעלים: "${input.goal}"` : ''}

FACTS (אלה האמת — השתמש אך ורק במספרים האלה):
${JSON.stringify(facts, null, 2)}

PER_CAMPAIGN (נתונים גולמיים לכל קמפיין — שמות קמפיינים חייבים להיות בדיוק כפי שמופיעים בשדה "name"):
${JSON.stringify(summary, null, 2)}

החזר JSON עם:
- "headline": משפט אחד (עד 20 מילים) שמתאר את המצב **לתקופה ${periodHebrew}**, משתמש במספרים מ-FACTS בלבד. דוגמה: "ב-${periodHebrew} הוצאת ${facts.totals.spend_ils}₪ על ${facts.campaign_count} קמפיינים; CTR ממוצע ${facts.blended_metrics.avg_ctr_pct}%."
- "next_steps": מערך של 1-3 פעולות שכדאי לעשות אחרי הניתוח הזה. כל פעולה היא אובייקט עם: agent_type (אחד מ: copywriter / visual_designer / event_campaigns / lunch_campaigns / evening_campaigns / optimization_analyst), reason (משפט שמסביר למה כדאי להפעיל את הסוכן הבא הזה דווקא עכשיו), priority ("high"/"medium"/"low"), input (אובייקט עם פרמטרים שמתאימים לסוכן היעד — למשל ל-copywriter: {topic, channel}, ל-visual_designer: {brief, style}).
- "key_metrics": אובייקט עם total_spend_ils, total_clicks, avg_ctr_pct, top_campaign_name, weakest_campaign_name.
- "actions": מערך של 3-5 פעולות. כל פעולה היא אובייקט עם: campaign_name (השם המדויק מהנתונים), action (טקסט קצר ופעיל כמו "העלה תקציב יומי מ-40₪ ל-60₪" או "כבה את הקמפיין"), why (1-2 משפטי הסבר עם המספרים), priority ("high"/"medium"/"low"), expected_impact (טקסט עם הערכה כמותית כמו "+30% leads בחודש").

מותר אורך כולל של עד 400 מילים בכל הפלט. אל תחזור על מילים. אל תכתוב מבוא או סיום.`,
    responseSchema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        key_metrics: {
          type: 'object',
          properties: {
            total_spend_ils: { type: 'number' },
            total_clicks: { type: 'number' },
            avg_ctr_pct: { type: 'number' },
            top_campaign_name: { type: 'string' },
            weakest_campaign_name: { type: 'string' },
          },
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              campaign_name: { type: 'string' },
              action: { type: 'string' },
              why: { type: 'string' },
              priority: { type: 'string' },
              expected_impact: { type: 'string' },
            },
          },
        },
        next_steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent_type: { type: 'string' },
              reason: { type: 'string' },
              priority: { type: 'string' },
              input: { type: 'object' },
            },
          },
        },
      },
    },
  });

  // Post-validation: drop any LLM action that references a campaign_name
  // not in the actual data. Replace key_metrics with deterministic facts so
  // displayed totals are always authoritative.
  const validNames = new Set(perCampaign.map((c: any) => c.name));
  const cleanedActions = Array.isArray(result?.actions)
    ? result.actions.filter((a: any) => !a?.campaign_name || validNames.has(a.campaign_name))
    : [];
  const droppedActions = Array.isArray(result?.actions) ? result.actions.length - cleanedActions.length : 0;

  // Deterministic next_steps based on metrics — these are added to whatever
  // the LLM suggests, then de-duped + validated against AGENT_REGISTRY.
  const deterministic_steps: any[] = [];
  const wastefulCampaigns = perCampaign.filter((c: any) => c.spend_ils > 50 && c.leads === 0 && c.has_insights_data);
  if (wastefulCampaigns.length > 0) {
    deterministic_steps.push({
      agent_type: 'visual_designer',
      reason: `${wastefulCampaigns.length} קמפיינים הוציאו מעל ₪50 בלי ליד אחד — סימן לרענון יצירתי.`,
      priority: 'high',
      input: { brief: `מודעת ${wastefulCampaigns[0].objective || 'תוכן'} חדשה לקמפיין "${wastefulCampaigns[0].name}", סגנון food photography אש וג'וספר`, style: 'Jerusalem-Chic, smoky' },
    });
  }
  if (facts.blended_metrics.avg_ctr_pct > 0 && facts.blended_metrics.avg_ctr_pct < 1.0) {
    deterministic_steps.push({
      agent_type: 'copywriter',
      reason: `CTR ממוצע ${facts.blended_metrics.avg_ctr_pct}% — מתחת לבנצ'מארק 1.5% של מסעדות. צריך hooks חזקים יותר.`,
      priority: 'high',
      input: { topic: input?.goal || 'מודעה לקמפיין הראשי — הוק חזק', channel: 'instagram', length: 'short' },
    });
  }
  if (facts.campaigns_with_data >= 2 && facts.cheapest_lead && facts.most_expensive_lead) {
    const ratio = (facts.most_expensive_lead?.cost_per_lead_ils || 0) / (facts.cheapest_lead?.cost_per_lead_ils || 1);
    if (ratio > 2) {
      deterministic_steps.push({
        agent_type: 'optimization_analyst',
        reason: `פער של פי ${ratio.toFixed(1)} בעלות ליד בין הקמפיין הכי זול ליקר — שווה אופטימיזציה.`,
        priority: 'medium',
        input: { date_preset: datePreset, goal: 'בדוק אם להעביר תקציב מהיקר לזול' },
      });
    }
  }

  const llmSteps = Array.isArray(result?.next_steps) ? result.next_steps : [];
  const validAgents = new Set(Object.keys(AGENT_REGISTRY));
  const allSteps = [...deterministic_steps, ...llmSteps].filter((s: any) => s?.agent_type && validAgents.has(s.agent_type) && s.agent_type !== agentKey);
  // De-dupe by agent_type — first occurrence wins (deterministic > llm).
  const seenAgents = new Set<string>();
  const cleanedSteps = allSteps.filter((s: any) => {
    if (seenAgents.has(s.agent_type)) return false;
    seenAgents.add(s.agent_type);
    return true;
  }).slice(0, 4);

  return {
    ad_account_id: META_AD_ACCOUNT_ID,
    focus,
    period: periodHebrew,
    date_preset: datePreset,
    campaigns_count: facts.campaign_count,
    campaigns_with_data: facts.campaigns_with_data,
    headline: result?.headline || '',
    key_metrics: {
      total_spend_ils: facts.totals.spend_ils,
      total_clicks: facts.totals.clicks,
      total_leads: facts.totals.leads,
      avg_ctr_pct: facts.blended_metrics.avg_ctr_pct,
      cpc_ils: facts.blended_metrics.cpc_ils,
      cost_per_lead_ils: facts.blended_metrics.cost_per_lead_ils,
      top_campaign_name: facts.highest_spender?.name || null,
      best_ctr_campaign: facts.best_ctr?.name || null,
      cheapest_lead_campaign: facts.cheapest_lead?.name || null,
    },
    actions: cleanedActions,
    dropped_hallucinated_actions: droppedActions,
    next_steps: cleanedSteps,
    facts,
    raw_data: summary,
  };
}

async function runVpMarketing(input: any) {
  const { goal } = input || {};
  if (!goal || !String(goal).trim()) throw new Error('goal required — תאר מה אתה רוצה להשיג');

  // Compact Meta snapshot — full campaign array bloats the prompt and pushes
  // Gemini past its 60s ceiling. We pass totals + the top 3 by spend only.
  let metaSnapshot: any = null;
  if (await META_TOKEN()) {
    try {
      const campaigns = await metaApi(
        `/act_${META_AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective,daily_budget,insights.date_preset(last_7d){spend,clicks,ctr,actions}&limit=25`,
      );
      const data = (campaigns?.data || []).map((c: any) => {
        const ins = c?.insights?.data?.[0] || {};
        const leads = (ins.actions || []).find((a: any) => a.action_type === 'lead')?.value || '0';
        return {
          name: c.name,
          status: c.status,
          spend_7d: Math.round(parseFloat(ins.spend || '0')),
          ctr_pct_7d: Math.round(parseFloat(ins.ctr || '0') * 100) / 100,
          leads_7d: parseInt(leads),
        };
      });
      const totalSpend = data.reduce((s: number, c: any) => s + c.spend_7d, 0);
      const totalLeads = data.reduce((s: number, c: any) => s + c.leads_7d, 0);
      const top3 = [...data].sort((a, b) => b.spend_7d - a.spend_7d).slice(0, 3);
      metaSnapshot = {
        total_spend_last_7d_ils: totalSpend,
        total_leads_last_7d: totalLeads,
        active_campaigns: data.filter((c: any) => c.status === 'ACTIVE').length,
        total_campaigns: data.length,
        top_3_campaigns_by_spend: top3,
      };
    } catch {
      metaSnapshot = { error: 'לא הצלחתי למשוך נתונים מ-Meta — אתכנן בלי קונטקסט קמפיינים.' };
    }
  }

  const agentMenu = Object.entries(AGENT_REGISTRY)
    .filter(([k]) => k !== 'vp_marketing')
    .map(([k, v]) => `- ${k}: ${v.label}`)
    .join('\n');

  const result: any = await invokeLLM({
    timeoutMs: 90_000,
    prompt: `אתה VP Marketing של מסעדת ${await getBrandName()}. הבעלים נתן לך יעד עסקי, ויש לך 11 סוכנים תחת אחריותך. תפקידך: לנתח את היעד, להעריך את המצב הנוכחי, ולבנות תוכנית פעולה ברורה שמחלקת את העבודה בין הסוכנים בסדר הנכון.

יעד מהבעלים: "${goal}"

מצב נוכחי במדיה (7 ימים אחרונים):
${metaSnapshot ? JSON.stringify(metaSnapshot, null, 2) : '(אין חיבור ל-Meta — אתכנן ללא קונטקסט קמפיינים)'}

הסוכנים הזמינים תחת אחריותך:
${agentMenu}

כללים:
1. אסור להמליץ על vp_marketing בתוכנית (לא לקרוא לעצמך).
2. כל צעד חייב להיות agent_type אחד מהרשימה למעלה — מילה במילה.
3. הסבר ב-strategy למה כל סוכן נמצא בתוכנית.
4. עברית עניינית, בלי "קדימה/יאללה". משפטים מספריים ופעולתיים.

החזר JSON עם:
- "goal_understood": איך אתה מבין את היעד (משפט אחד)
- "context_assessed": ניתוח המצב הנוכחי על בסיס נתוני המדיה (2-3 משפטים)
- "strategy": אסטרטגיה כוללת (3-5 משפטים)
- "plan": מערך של 3-6 צעדים ממוספרים, כל אחד עם: step (מספר), agent_type, title (משפט קצר), reason, input (אובייקט פרמטרים לסוכן), depends_on (מספר הצעד שצריך לרוץ קודם, או null)
- "expected_outcome": מה צפוי לקרות אם הבעלים יבצע הכל`,
    responseSchema: {
      type: 'object',
      properties: {
        goal_understood: { type: 'string' },
        context_assessed: { type: 'string' },
        strategy: { type: 'string' },
        plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step: { type: 'number' },
              agent_type: { type: 'string' },
              title: { type: 'string' },
              reason: { type: 'string' },
              input: { type: 'object' },
              depends_on: { type: 'number' },
            },
          },
        },
        expected_outcome: { type: 'string' },
      },
    },
  });

  const validAgents = new Set(Object.keys(AGENT_REGISTRY));
  const cleanedPlan = (Array.isArray(result?.plan) ? result.plan : [])
    .filter((s: any) => s?.agent_type && validAgents.has(s.agent_type) && s.agent_type !== 'vp_marketing');

  const next_steps = cleanedPlan.slice(0, 5).map((s: any) => ({
    agent_type: s.agent_type,
    reason: s.reason || s.title,
    priority: s.step <= 2 ? 'high' : 'medium',
    input: s.input || {},
  }));

  return {
    goal_understood: result?.goal_understood || '',
    context_assessed: result?.context_assessed || '',
    strategy: result?.strategy || '',
    plan: cleanedPlan,
    expected_outcome: result?.expected_outcome || '',
    meta_snapshot: metaSnapshot,
    next_steps,
  };
}

async function runConversational(input: any) {
  const { incoming_message, customer_context = '', channel = 'instagram_dm' } = input || {};
  if (!incoming_message) throw new Error('incoming_message required');
  const result: any = await invokeLLM({
    prompt: `${await getAlinaBrandVoice()}\n\nאתה עונה ל-DM/תגובה ב-${channel}. ענה קצר, חם, ענייני. אם השאלה דורשת מידע שאין לך (זמינות אירוע, מחיר ספציפי), הצע להעביר לבן אדם.\n\nקונטקסט לקוח: ${customer_context || '(לא ידוע)'}\nהודעה נכנסת: "${incoming_message}"\n\nהחזר JSON: { reply, needs_human_handoff: boolean, suggested_tag }`,
    responseSchema: {
      type: 'object',
      properties: { reply: { type: 'string' }, needs_human_handoff: { type: 'boolean' }, suggested_tag: { type: 'string' } },
    },
  });
  return result;
}

let agentRunTableReady = false;
async function ensureAgentRunTable() {
  if (agentRunTableReady) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MarketingAgentRun" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "agent_type" TEXT NOT NULL,
      "title" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "input" JSONB,
      "output" JSONB,
      "needs_integration" JSONB,
      "error" TEXT,
      "ran_at" TIMESTAMP(3),
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  agentRunTableReady = true;
}

registerFn('runMarketingAgent', async ({ body }) => {
  const { agent_type, input } = (body || {}) as any;
  if (!agent_type || !AGENT_REGISTRY[agent_type]) {
    throw new Error(`Unknown agent_type: ${agent_type}`);
  }
  const meta = AGENT_REGISTRY[agent_type];
  await ensureAgentRunTable();

  // Create run record up front so we always have history.
  const run = await db.marketingAgentRun.create({
    data: {
      agent_type,
      title: `${meta.label} — ${new Date().toLocaleString('he-IL')}`,
      status: 'running',
      input: input || {},
      ran_at: new Date(),
    },
  });

  // Meta agents need the access token. If missing, return needs_integration
  // with the exact key — but ad-account ID is already wired so it's not listed.
  if (META_AGENTS.has(agent_type) && !(await META_TOKEN())) {
    const updated = await db.marketingAgentRun.update({
      where: { id: run.id },
      data: {
        status: 'needs_integration',
        needs_integration: ['META_ADS_ACCESS_TOKEN'],
        output: {
          message: `סוכן ${meta.label} מוכן. Ad account "pita alena" (${META_AD_ACCOUNT_ID}) כבר מוגדר. חסר רק META_ADS_ACCESS_TOKEN ב-env.`,
          how_to_get: 'developers.facebook.com → Tools → Graph API Explorer → בחר את האפליקציה והדף, סמן הרשאות ads_read + ads_management, וצור Long-Lived Token (60 יום) או System User Token (לא פג).',
        },
      },
    });
    return { run: updated };
  }

  try {
    let output: any;
    switch (agent_type) {
      case 'vp_marketing':   output = await runVpMarketing(input); break;
      case 'copywriter':     output = await runCopywriter(input); break;
      case 'storyteller':    output = await runStoryteller(input); break;
      case 'trend_spotter':  output = await runTrendSpotter(input); break;
      case 'menu_engineer':  output = await runMenuEngineer(input); break;
      case 'conversational': output = await runConversational(input); break;
      case 'visual_designer': output = await runVisualDesigner(input); break;
      case 'main_media_buyer':
      case 'event_campaigns':
      case 'lunch_campaigns':
      case 'evening_campaigns':
      case 'optimization_analyst':
        output = await runMetaAgent(agent_type, input); break;
      default: throw new Error(`No handler for ${agent_type}`);
    }
    const updated = await db.marketingAgentRun.update({
      where: { id: run.id },
      data: { status: 'completed', output },
    });
    return { run: updated };
  } catch (e: any) {
    const updated = await db.marketingAgentRun.update({
      where: { id: run.id },
      data: { status: 'failed', error: String(e?.message || e) },
    });
    return { run: updated };
  }
});

registerFn('listMarketingAgentRuns', async ({ body }) => {
  const { agent_type, limit = 20 } = (body || {}) as any;
  await ensureAgentRunTable();
  const where: any = {};
  if (agent_type) where.agent_type = agent_type;
  const runs = await db.marketingAgentRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 20, 100),
  });
  return { runs };
});

// Self-heal: prisma db push runs at container start but is silenced — if it
// failed (transient Supabase hiccup, schema race), the table won't exist and
// findFirst will 500. CREATE TABLE IF NOT EXISTS is cheap and idempotent.
let secretsTableReady = false;
async function ensureSecretsTable() {
  if (secretsTableReady) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationSecret" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "note" TEXT,
      "updated_at" TIMESTAMP(3),
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  secretsTableReady = true;
}

registerFn('setIntegrationSecret', async ({ body }) => {
  const { key, value, note } = (body || {}) as any;
  if (!key || !value) throw new Error('key and value required');
  await ensureSecretsTable();
  const existing = await db.integrationSecret.findFirst({ where: { key } });
  if (existing) {
    await db.integrationSecret.update({ where: { id: existing.id }, data: { value, note, updated_at: new Date() } });
  } else {
    await db.integrationSecret.create({ data: { key, value, note, updated_at: new Date() } });
  }
  return { ok: true };
});

registerFn('hasIntegrationSecret', async ({ body }) => {
  const { key } = (body || {}) as any;
  if (!key) throw new Error('key required');
  await ensureSecretsTable();
  const row = await db.integrationSecret.findFirst({ where: { key }, select: { id: true, updated_at: true } });
  return { present: !!row, updated_at: row?.updated_at || null };
});

registerFn('getMarketingAgentsCatalog', async () => {
  return {
    agents: Object.entries(AGENT_REGISTRY).map(([key, v]) => ({
      key,
      label: v.label,
      needs_integration: v.needs || null,
    })),
  };
});

// D4 — consolidated per-tenant integrations catalog. Each entry lists the
// secret keys it needs; the UI shows a green "connected" pill when ALL
// required keys are present. Secret values are never returned — only presence
// and updated_at.
const INTEGRATIONS_CATALOG = [
  {
    key: 'instagram',
    name_he: 'Instagram / Meta',
    description_he: 'חיבור חשבון Instagram Business + Meta Ads לפרסום ולסטטיסטיקות.',
    icon: 'Instagram',
    secret_keys: ['META_ADS_ACCESS_TOKEN'],
    optional_keys: ['META_AD_ACCOUNT_ID', 'IG_BUSINESS_ACCOUNT_ID'],
    help_url: 'https://developers.facebook.com/docs/marketing-api/access',
  },
  {
    key: 'google_business',
    name_he: 'Google Business',
    description_he: 'סנכרון ביקורות של Google לדשבורד. תדביק Place ID.',
    icon: 'MapPin',
    secret_keys: ['GOOGLE_BUSINESS_PLACE_ID'],
    optional_keys: [],
    help_url: 'https://developers.google.com/maps/documentation/places/web-service/place-id',
  },
  {
    key: 'google_drive',
    name_he: 'Google Drive (תמונות פרסום)',
    description_he: 'תיקיית Drive של המסעדה לפילטרים של סוכן השיווק.',
    icon: 'HardDrive',
    secret_keys: ['DRIVE_AD_PHOTOS_FOLDER_ID'],
    optional_keys: [],
    help_url: 'https://support.google.com/drive/answer/2494822',
  },
  {
    key: 'telegram',
    name_he: 'Telegram (אופציונלי)',
    description_he: 'התראות נוספות ב-Telegram — לצד WhatsApp. bot token + chat id.',
    icon: 'Send',
    secret_keys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    optional_keys: [],
    help_url: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
  },
  {
    key: 'pos_beecomm',
    name_he: 'POS — Beecom',
    description_he: 'סנכרון הזמנות + הכנסות ממערכת POS. יש דף נפרד לחיבור.',
    icon: 'CreditCard',
    secret_keys: [], // Beecom uses its own BeecommConfig entity, not IntegrationSecret
    optional_keys: [],
    external_page: 'BeecommIntegration',
    help_url: null,
  },
];

registerFn('listMyIntegrations', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  await ensureSecretsTable();
  const allKeys = INTEGRATIONS_CATALOG.flatMap(i => [...i.secret_keys, ...i.optional_keys]);
  const rows = allKeys.length
    ? await db.integrationSecret.findMany({
        where: { key: { in: allKeys } },
        select: { key: true, updated_at: true },
      })
    : [];
  const presence = new Map(rows.map((r: any) => [r.key, r.updated_at || null]));
  // Beecom uses its own entity — check for a row.
  let beecommConnected = false;
  try {
    const beeRow = await (prisma as any).beecommConfig?.findFirst?.({ select: { id: true } });
    beecommConnected = !!beeRow;
  } catch { /* table might not exist yet — treat as disconnected */ }

  const integrations = INTEGRATIONS_CATALOG.map(def => {
    if (def.key === 'pos_beecomm') {
      return {
        ...def,
        connected: beecommConnected,
        secret_status: [],
      };
    }
    const secret_status = def.secret_keys.map(k => ({
      key: k, present: presence.has(k), updated_at: presence.get(k) || null,
    }));
    const optional_status = def.optional_keys.map(k => ({
      key: k, present: presence.has(k), updated_at: presence.get(k) || null,
    }));
    const connected = secret_status.length > 0 && secret_status.every(s => s.present);
    return { ...def, connected, secret_status, optional_status };
  });
  return { integrations };
});

// D4 — deletes a set of secrets (used by the "disconnect" button).
registerFn('deleteIntegrationSecrets', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureSecretsTable();
  const b = (body || {}) as any;
  const keys: string[] = Array.isArray(b.keys) ? b.keys.map(String) : [];
  if (!keys.length) return { ok: true, deleted: 0 };
  const res = await db.integrationSecret.deleteMany({ where: { key: { in: keys } } });
  return { ok: true, deleted: res.count };
});

// =====================================================================
// Campaign Brief — owner-approved Meta launch pipeline
// =====================================================================

let campaignBriefTableReady = false;
async function ensureCampaignBriefTable() {
  if (campaignBriefTableReady) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CampaignBrief" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "goal_text" TEXT,
      "objective" TEXT NOT NULL,
      "daily_budget_ils" DOUBLE PRECISION NOT NULL,
      "lifetime_budget_ils" DOUBLE PRECISION,
      "start_date" TIMESTAMP(3),
      "end_date" TIMESTAMP(3),
      "audience" JSONB,
      "copy_variants" JSONB,
      "image_url" TEXT,
      "image_base64" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending_approval',
      "reject_reason" TEXT,
      "meta_campaign_id" TEXT,
      "meta_adset_id" TEXT,
      "launch_error" TEXT,
      "launched_at" TIMESTAMP(3),
      "approved_at" TIMESTAMP(3),
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Additive columns for the full ad-creation flow — safe to run repeatedly.
  for (const sql of [
    `ALTER TABLE "CampaignBrief" ADD COLUMN IF NOT EXISTS "landing_url" TEXT`,
    `ALTER TABLE "CampaignBrief" ADD COLUMN IF NOT EXISTS "meta_ad_id" TEXT`,
    `ALTER TABLE "CampaignBrief" ADD COLUMN IF NOT EXISTS "meta_creative_id" TEXT`,
    `ALTER TABLE "CampaignBrief" ADD COLUMN IF NOT EXISTS "meta_image_hash" TEXT`,
  ]) {
    try { await (prisma as any).$executeRawUnsafe(sql); } catch {}
  }
  campaignBriefTableReady = true;
}

// LLM drafts a complete brief from a goal + optional inputs from prior chain.
registerFn('createCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { goal, copy_variants, image_base64, image_url, audience_hint, daily_budget_ils, lifetime_budget_ils, end_date, landing_url } = (body || {}) as any;
  if (!goal) throw new Error('goal required');

  // Generate brief structure via LLM (audience, objective, suggested budget,
  // headline title). Copy + image come from prior chain if provided.
  const draft: any = await invokeLLM({
    prompt: `אתה מתכנן קמפיין פרסום במטא עבור מסעדת ${await getBrandName()}.
יעד עסקי: "${goal}"
${audience_hint ? `הצעת קהל יעד מהבעלים: ${audience_hint}` : ''}

החזר JSON עם:
- "title": שם קמפיין קצר (עד 50 תווים, ללא מירכאות)
- "objective": אחד מהבאים בלבד — OUTCOME_LEADS / OUTCOME_TRAFFIC / OUTCOME_AWARENESS / OUTCOME_ENGAGEMENT
- "audience": אובייקט { age_min (18-65), age_max (18-65), genders (מערך של "male"/"female", או שניהם), geo_locations_cities (מערך באנגלית — ברירת מחדל ["Rishon LeZion"] בלבד; הוסף Ness Ziona / Rehovot / Holon / Bat Yam / Tel Aviv רק אם הקהל באמת רחב יותר. אסור Jerusalem — אין שם סניף.), interests_text (תיאור חופשי של תחומי עניין רלוונטיים) }
- "suggested_daily_budget_ils": תקציב יומי מומלץ בש"ח (מספר)
- "rationale": משפט אחד למה הקהל והתקציב הזה`,
    responseSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        objective: { type: 'string' },
        audience: {
          type: 'object',
          properties: {
            age_min: { type: 'number' },
            age_max: { type: 'number' },
            genders: { type: 'array', items: { type: 'string' } },
            geo_locations_cities: { type: 'array', items: { type: 'string' } },
            interests_text: { type: 'string' },
          },
        },
        suggested_daily_budget_ils: { type: 'number' },
        rationale: { type: 'string' },
      },
    },
  });

  const validObjectives = new Set(['OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION']);
  const objective = validObjectives.has(draft?.objective) ? draft.objective : 'OUTCOME_LEADS';
  const finalDaily = Number(daily_budget_ils) > 0 ? Number(daily_budget_ils) : (Number(draft?.suggested_daily_budget_ils) || 40);

  const brief = await db.campaignBrief.create({
    data: {
      title: (draft?.title || 'קמפיין חדש').slice(0, 80),
      goal_text: goal,
      objective,
      daily_budget_ils: finalDaily,
      lifetime_budget_ils: lifetime_budget_ils ? Number(lifetime_budget_ils) : null,
      end_date: end_date ? new Date(end_date) : null,
      audience: draft?.audience || null,
      copy_variants: Array.isArray(copy_variants) ? copy_variants : null,
      image_base64: image_base64 || null,
      image_url: image_url || null,
      landing_url: landing_url || ALINA_DEFAULT_LANDING_URL,
      status: 'pending_approval',
    },
  });
  return { brief, rationale: draft?.rationale || null };
});

registerFn('listCampaignBriefs', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { status, limit = 30 } = (body || {}) as any;
  const where: any = {};
  if (status) where.status = status;
  const briefs = await db.campaignBrief.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 30, 100) });
  return { briefs };
});

registerFn('updateCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { id, patch } = (body || {}) as any;
  if (!id) throw new Error('id required');
  // Forbid status transitions other than via approve/reject/launch.
  const safePatch: any = { ...(patch || {}) };
  delete safePatch.status;
  delete safePatch.meta_campaign_id;
  delete safePatch.meta_adset_id;
  delete safePatch.launched_at;
  delete safePatch.approved_at;
  const updated = await db.campaignBrief.update({ where: { id }, data: safePatch });
  return { brief: updated };
});

registerFn('approveCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { id } = (body || {}) as any;
  if (!id) throw new Error('id required');
  const updated = await db.campaignBrief.update({
    where: { id },
    data: { status: 'approved', approved_at: new Date() },
  });
  return { brief: updated };
});

registerFn('rejectCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { id, reason } = (body || {}) as any;
  if (!id) throw new Error('id required');
  const updated = await db.campaignBrief.update({
    where: { id },
    data: { status: 'rejected', reject_reason: reason || null },
  });
  return { brief: updated };
});

// Actual launch — creates Campaign + AdSet on Meta in PAUSED status.
// Ad creative is intentionally NOT auto-created so the owner finalizes the
// image+copy attachment manually in Meta Ads Manager. PAUSED status means
// nothing spends until the owner flips it to ACTIVE in Meta's UI.
registerFn('launchCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { id, active } = (body || {}) as any;
  // active=true makes all three entities (Campaign/AdSet/Ad) ACTIVE on
  // creation, so Meta moves them through review and starts spending as
  // soon as review passes (usually <24h). active=false keeps PAUSED.
  const targetStatus = active ? 'ACTIVE' : 'PAUSED';
  if (!id) throw new Error('id required');
  const token = await META_TOKEN();
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN לא מוגדר — הגדר אותו במסך מפתחות API');
  const brief = await db.campaignBrief.findUnique({ where: { id } });
  if (!brief) throw new Error('brief not found');
  if (brief.status !== 'approved') throw new Error(`brief must be approved before launch (current: ${brief.status})`);

  try {
    // 1. Create campaign (PAUSED).
    // Meta requires either CBO (campaign-level budget) with explicit
    // is_adset_budget_sharing_enabled, or no campaign budget at all so AdSets
    // own their budget. We use the latter — daily_budget lives on the AdSet.
    // Campaign objective must agree with what we actually send to the AdSet,
    // so apply the same downgrade rule here before creating the Campaign.
    const campaignObjective = brief.objective === 'OUTCOME_LEADS' ? 'OUTCOME_TRAFFIC' : brief.objective;
    const campaignRes = await metaApi(
      `/act_${META_AD_ACCOUNT_ID}/campaigns`,
      'POST',
      {
        name: brief.title,
        objective: campaignObjective,
        status: targetStatus,
        special_ad_categories: [],
        buying_type: 'AUCTION',
        is_adset_budget_sharing_enabled: false,
      },
    );
    const campaignId = campaignRes?.id;
    if (!campaignId) throw new Error(`Meta did not return campaign id: ${JSON.stringify(campaignRes)}`);

    // 2. Create ad set with audience + budget
    const audience = (brief.audience as any) || {};
    const cityNames = Array.isArray(audience.geo_locations_cities) && audience.geo_locations_cities.length
      ? audience.geo_locations_cities
      : ALINA_DEFAULT_CITIES;
    // Resolve city names → Meta city keys. Meta rejects {name,country} pairs
    // with sub-error 1885097 ('integer expected, NULL'); only {key,radius}
    // is accepted. Hard-code Rishon LeZion (sole branch) + look up extras
    // via /search if the LLM proposed others.
    const KNOWN_CITY_KEYS: Record<string, string> = {
      'Rishon LeZion': '1014800',
      'Jerusalem': '1013481',
      'Tel Aviv': '2421',
    };
    const cityEntries: any[] = [];
    for (const cname of cityNames) {
      let key = KNOWN_CITY_KEYS[cname];
      if (!key) {
        try {
          const search = await metaApi(
            `/search?location_types=["city"]&q=${encodeURIComponent(cname)}&type=adgeolocation&country_code=IL`,
          );
          key = search?.data?.[0]?.key;
        } catch {}
      }
      if (key) cityEntries.push({ key, radius: 25, distance_unit: 'kilometer' });
    }
    if (cityEntries.length === 0) {
      // Last-resort fallback so launch never silently targets nowhere.
      cityEntries.push({ key: '1014800', radius: 25, distance_unit: 'kilometer' });
    }
    // Hard-cast every numeric field. Meta rejects with 1885097 if any
    // integer arrives as null/NaN/string.
    const toInt = (v: any, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : fallback;
    };
    // Advantage Audience is the new Meta default (as of Q2 2026). Required
    // for nearly every AdSet now. When enabled, age_max MUST be 65 — Meta
    // treats lower max ages as a "suggestion" only.
    const targeting: any = {
      age_min: toInt(audience.age_min, 22),
      age_max: 65,
      geo_locations: { cities: cityEntries },
      targeting_automation: { advantage_audience: 1 },
    };
    if (Array.isArray(audience.genders) && audience.genders.length) {
      const g = audience.genders.map((x: string) => (x === 'female' ? 2 : 1));
      // Meta wants targeting.genders only when filtering to one — both genders = omit.
      if (g.length === 1) targeting.genders = g;
    }
    // OUTCOME_LEADS requires a Lead Form (promoted_object). Until forms are
    // configured in this account, downgrade to OUTCOME_TRAFFIC so the launch
    // succeeds and the owner finishes wiring the form in Meta Ads Manager.
    let safeObjective = brief.objective;
    let downgradedFromLeads = false;
    if (safeObjective === 'OUTCOME_LEADS') {
      safeObjective = 'OUTCOME_TRAFFIC';
      downgradedFromLeads = true;
    }
    const optimizationGoal = safeObjective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS'
      : safeObjective === 'OUTCOME_AWARENESS' ? 'REACH'
      : safeObjective === 'OUTCOME_ENGAGEMENT' ? 'POST_ENGAGEMENT'
      : 'LINK_CLICKS';
    // Meta now requires end_time on any daily_budget AdSet (otherwise its
    // internal budget calc gets NULL and rejects with sub-error 1885097).
    // Default: 7 days from now. Owner can change end_date on the brief.
    const endTime = brief.end_date
      ? Math.floor(new Date(brief.end_date).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    const adsetPayload: any = {
      name: `${brief.title} — AdSet`,
      campaign_id: campaignId,
      daily_budget: toInt((brief.daily_budget_ils || 40) * 100, 4000), // minor units
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      end_time: endTime,
      targeting,
      status: targetStatus,
    };
    if (safeObjective === 'OUTCOME_TRAFFIC') adsetPayload.destination_type = 'WEBSITE';
    let adsetRes: any;
    try {
      adsetRes = await metaApi(`/act_${META_AD_ACCOUNT_ID}/adsets`, 'POST', adsetPayload);
    } catch (e: any) {
      // Surface the payload we sent so the next launch attempt can see which
      // field Meta is rejecting. Stored on the brief as launch_error.
      throw new Error(`AdSet creation failed. Payload: ${JSON.stringify(adsetPayload)}. Meta: ${String(e?.message || e)}`);
    }
    const adsetId = adsetRes?.id;

    // ---- 3. Try to build the Ad itself (image + creative + ad).
    // Requires:
    //   (a) The System User is assigned to a Facebook Page with Advertise
    //       permission (Business Manager → Pages → Assign people).
    //   (b) The brief carries an image (base64 or url).
    // If either is missing, we leave the Campaign+AdSet PAUSED so the owner
    // finishes the creative in Meta Ads Manager. No crash.
    let pageId: string | null = null;
    let creativeId: string | null = null;
    let adId: string | null = null;
    let imageHash: string | null = null;
    let creativeWarning: string | null = null;
    try {
      const pages = await metaApi(`/me/accounts?fields=id,name&limit=10`);
      pageId = pages?.data?.[0]?.id || null;
    } catch (e: any) {
      creativeWarning = `Could not list pages (${String(e?.message || e).slice(0, 100)}). Assign the System User to the עלינא Page in Business Manager → Pages → Assign people.`;
    }

    const landingUrl = (brief as any).landing_url || ALINA_DEFAULT_LANDING_URL;
    const firstCopy = Array.isArray(brief.copy_variants) && brief.copy_variants[0] as any;
    const adMessage = firstCopy?.body || firstCopy?.hook || brief.title;
    const adHeadline = (firstCopy?.hook || brief.title || '').slice(0, 40);

    if (pageId && (brief.image_base64 || brief.image_url)) {
      try {
        // 3a. Upload the image to /adimages — returns an image_hash.
        // If we only have a URL (e.g. an Instagram media_url), download it
        // first so /adimages gets bytes either way.
        let bytesB64: string | null = brief.image_base64 || null;
        if (!bytesB64 && brief.image_url) {
          const imgRes = await fetch(brief.image_url);
          if (!imgRes.ok) throw new Error(`failed to fetch image_url (${imgRes.status})`);
          const buf = Buffer.from(await imgRes.arrayBuffer());
          bytesB64 = buf.toString('base64');
        }
        if (bytesB64) {
          const form = new URLSearchParams();
          form.append('bytes', bytesB64);
          const upRes = await fetch(
            `https://graph.facebook.com/v21.0/act_${META_AD_ACCOUNT_ID}/adimages?access_token=${encodeURIComponent(token)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() },
          );
          const upData: any = await upRes.json().catch(() => ({}));
          if (!upRes.ok) throw new Error(`adimages: ${JSON.stringify(upData?.error || upData)}`);
          const imgs = upData?.images || {};
          imageHash = Object.values(imgs)[0] ? (Object.values(imgs)[0] as any).hash : null;
        }

        // 3b. Create the AdCreative.
        const creativePayload: any = {
          name: `${brief.title} — Creative`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              link: landingUrl,
              message: adMessage,
              name: adHeadline,
              ...(imageHash ? { image_hash: imageHash } : {}),
            },
          },
          degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
        };
        const creativeRes = await metaApi(`/act_${META_AD_ACCOUNT_ID}/adcreatives`, 'POST', creativePayload);
        creativeId = creativeRes?.id || null;

        // 3c. Create the Ad. Status follows the launch's targetStatus —
        // ACTIVE means Meta queues it for review and starts spending after
        // approval (~24h); PAUSED keeps it fully off-air.
        if (creativeId) {
          const adRes = await metaApi(`/act_${META_AD_ACCOUNT_ID}/ads`, 'POST', {
            name: `${brief.title} — Ad`,
            adset_id: adsetId,
            creative: { creative_id: creativeId },
            status: targetStatus,
          });
          adId = adRes?.id || null;
        }
      } catch (e: any) {
        creativeWarning = `Creative/Ad creation failed: ${String(e?.message || e).slice(0, 200)}`;
      }
    } else if (!pageId && !creativeWarning) {
      creativeWarning = 'אין דף פייסבוק זמין ל-System User. שייך אותו לדף עלינא ב-Business Manager → Pages → Assign people כדי שמודעות יווצרו אוטומטית.';
    } else if (!brief.image_base64 && !brief.image_url) {
      creativeWarning = 'אין תמונה ב-Brief. הרץ Visual Designer לפני יצירת Brief כדי שהמודעה תיווצר אוטומטית.';
    }

    const updated = await db.campaignBrief.update({
      where: { id },
      data: {
        status: 'launched',
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId || null,
        meta_ad_id: adId,
        meta_creative_id: creativeId,
        meta_image_hash: imageHash,
        launched_at: new Date(),
        launch_error: creativeWarning,
      },
    });
    const statusWord = active ? 'ACTIVE — בבדיקת Meta, יעלה לאוויר אחרי אישור (עד 24 שעות)' : 'PAUSED';
    return {
      brief: updated,
      meta_url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${META_AD_ACCOUNT_ID}&selected_campaign_ids=${campaignId}`,
      message: adId
        ? (downgradedFromLeads
          ? `הקמפיין + AdSet + מודעה נוצרו ב-Meta במצב ${statusWord}. שיניתי OUTCOME_LEADS ל-OUTCOME_TRAFFIC כי טופס לידים עוד לא הוגדר.`
          : `הקמפיין + AdSet + מודעה נוצרו ב-Meta במצב ${statusWord}.`)
        : (creativeWarning || `הקמפיין נוצר במטא במצב ${statusWord}. הוסף קריאייטיב (תמונה+טקסט) ב-Meta Ads Manager.`),
    };
  } catch (e: any) {
    const updated = await db.campaignBrief.update({
      where: { id },
      data: { status: 'launch_failed', launch_error: String(e?.message || e) },
    });
    return { brief: updated, error: String(e?.message || e) };
  }
});

// One-click "approve + launch ACTIVE" used by the review dialog. Owner
// reviews everything (copy, image, landing, audience, budget) and a single
// confirm flips the brief approved+launched and creates the Meta entities
// already in ACTIVE state so Meta moves into review and starts spending.
registerFn('approveAndLaunchCampaignBrief', async ({ body }) => {
  await ensureCampaignBriefTable();
  const { id } = (body || {}) as any;
  if (!id) throw new Error('id required');
  await db.campaignBrief.update({
    where: { id },
    data: { status: 'approved', approved_at: new Date() },
  });
  return (functionHandlers as any).launchCampaignBrief({ body: { id, active: true } });
});

// Pick the best photo for a goal out of a Google Drive folder. Owner stores
// the folder id under IntegrationSecret('DRIVE_AD_PHOTOS_FOLDER_ID') once,
// and any subsequent campaign pipeline reads from there. Service account
// must have at least Viewer access on the folder.
async function pickBestDrivePhoto(goal: string): Promise<{ buffer: Buffer; name: string } | null> {
  const folderId = await getSecret('DRIVE_AD_PHOTOS_FOLDER_ID');
  if (!folderId) return null;
  let token: string;
  try { token = await driveAccessToken(); } catch { return null; }
  const files = await listDriveFiles(folderId, token, [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  ]).catch(() => [] as any[]);
  if (!files.length) return null;
  if (files.length === 1) {
    const buf = await downloadDriveFile(files[0].id, token);
    return { buffer: buf, name: files[0].name };
  }
  const list = files.map((f: any, i: number) => `${i}: ${f.name}`).join('\n');
  let pickedIdx = 0;
  try {
    const result: any = await invokeLLM({
      prompt: `אתה בוחר את התמונה הכי מתאימה למודעת פרסום בפייסבוק/אינסטגרם.\nיעד הקמפיין: "${goal}".\nלהלן ${files.length} שמות קובצי תמונות. החזר JSON: { idx: <מספר 0-${files.length - 1}>, why: "סיבה קצרה" }.\n\n${list}`,
      responseSchema: { type: 'object', properties: { idx: { type: 'number' }, why: { type: 'string' } } },
    });
    const n = Number(result?.idx);
    if (Number.isFinite(n) && n >= 0 && n < files.length) pickedIdx = n;
  } catch {}
  const chosen = files[pickedIdx];
  const buf = await downloadDriveFile(chosen.id, token);
  return { buffer: buf, name: chosen.name };
}

registerFn('getDriveServiceAccountEmail', async () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { configured: false };
  let text = String(raw).trim();
  if (!text.startsWith('{')) {
    try { text = Buffer.from(text, 'base64').toString('utf8'); } catch {}
  }
  try {
    const sa = JSON.parse(text);
    return { configured: true, client_email: sa.client_email || null };
  } catch {
    return { configured: true, client_email: null, error: 'failed_to_parse' };
  }
}, { public: true });

registerFn('listDriveAdPhotos', async () => {
  const folderId = await getSecret('DRIVE_AD_PHOTOS_FOLDER_ID');
  if (!folderId) return { configured: false, files: [] };
  try {
    const token = await driveAccessToken();
    const files = await listDriveFiles(folderId, token, [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    ]);
    return { configured: true, folder_id: folderId, files };
  } catch (e: any) {
    return { configured: true, folder_id: folderId, files: [], error: String(e?.message || e) };
  }
});

// Pull the most recent photos from the FB Page's linked Instagram Business
// account. Returns an array of { id, media_url, permalink, caption, timestamp }.
// Requires the System User token to carry the instagram_basic permission and
// the FB Page to have an IG Business account connected (Page Settings → Linked
// accounts → Instagram).
async function fetchInstagramMedia(limit = 15): Promise<any[]> {
  const token = await META_TOKEN();
  if (!token) return [];
  try {
    const pages = await metaApi(`/me/accounts?fields=id,instagram_business_account&limit=10`);
    const igAccountId = pages?.data?.find((p: any) => p?.instagram_business_account?.id)?.instagram_business_account?.id;
    if (!igAccountId) return [];
    const media = await metaApi(
      `/${igAccountId}/media?fields=id,media_type,media_url,thumbnail_url,permalink,caption,timestamp&limit=${limit}`,
    );
    // Filter to IMAGE / CAROUSEL_ALBUM only — VIDEOs need a thumbnail.
    return (media?.data || []).filter((m: any) => m.media_url && m.media_type !== 'VIDEO');
  } catch {
    return [];
  }
}

registerFn('listInstagramMedia', async ({ body }) => {
  const { limit } = (body || {}) as any;
  const media = await fetchInstagramMedia(Math.min(Number(limit) || 15, 30));
  return { media, count: media.length };
});

// Picks the most relevant IG photo for a given goal — uses an LLM to score
// each photo's caption against the goal, picks the top one.
async function pickBestInstagramPhoto(goal: string): Promise<{ url: string; permalink?: string; caption?: string } | null> {
  const media = await fetchInstagramMedia(15);
  if (!media.length) return null;
  if (media.length === 1) return { url: media[0].media_url, permalink: media[0].permalink, caption: media[0].caption };
  const picks = media.map((m: any, i: number) => ({ idx: i, caption: (m.caption || '').slice(0, 300), permalink: m.permalink }));
  try {
    const result: any = await invokeLLM({
      prompt: `אתה בוחר את התמונה הטובה ביותר למודעת פרסום. היעד: "${goal}".\nלהלן כתוביות של ${picks.length} תמונות אינסטגרם. החזר JSON: { idx: <מספר אינדקס 0-${picks.length - 1} של התמונה הכי מתאימה>, why: "משפט קצר" }.\n\n${picks.map((p) => `${p.idx}: ${p.caption || '(ללא כיתוב)'}`).join('\n')}`,
      responseSchema: { type: 'object', properties: { idx: { type: 'number' }, why: { type: 'string' } } },
    });
    const idx = Number(result?.idx);
    if (Number.isFinite(idx) && idx >= 0 && idx < media.length) {
      const m = media[idx];
      return { url: m.media_url, permalink: m.permalink, caption: m.caption };
    }
  } catch {}
  return { url: media[0].media_url, permalink: media[0].permalink, caption: media[0].caption };
}

// Owner gives a goal once. Pipeline runs Copywriter → (Instagram pick OR
// Visual Designer) → createCampaignBrief, packaging the copy variants +
// image into a Brief that's ready to approve & launch.
registerFn('runFullPipeline', async ({ body }) => {
  await ensureAgentRunTable();
  await ensureCampaignBriefTable();
  const { goal, channel = 'instagram', daily_budget_ils, landing_url, image_source = 'instagram' } = (body || {}) as any;
  if (!goal || !String(goal).trim()) throw new Error('goal required');

  const stages: any = { goal, started_at: new Date().toISOString(), image_source };
  try {
    // 1. Copywriter
    const copyOut: any = await runCopywriter({ topic: goal, channel, length: 'short' });
    stages.copy_variants = Array.isArray(copyOut?.variants) ? copyOut.variants : [];
    await db.marketingAgentRun.create({
      data: { agent_type: 'copywriter', title: `Pipeline: ${goal.slice(0, 40)}`, status: 'completed', input: { topic: goal, channel }, output: copyOut, ran_at: new Date() },
    }).catch(() => {});

    // 2. Image. Priority order:
    //    'drive'     → Google Drive folder (owner-curated, best quality)
    //    'instagram' → linked IG Business account
    //    'ai'        → Imagen
    //    'auto'      → drive → instagram → ai (first non-empty wins)
    let imageBase64: string | null = null;
    let imageUrl: string | null = null;
    let imageOriginNote = '';

    if (image_source === 'drive' || image_source === 'auto') {
      const drivePick = await pickBestDrivePhoto(goal);
      if (drivePick?.buffer) {
        imageBase64 = drivePick.buffer.toString('base64');
        imageOriginNote = `Drive: ${drivePick.name}`;
      }
    }
    if (!imageBase64 && (image_source === 'instagram' || image_source === 'auto')) {
      const igPick = await pickBestInstagramPhoto(goal);
      if (igPick?.url) {
        imageUrl = igPick.url;
        imageOriginNote = `Instagram${igPick.permalink ? ` (${igPick.permalink})` : ''}`;
      }
    }
    if (!imageBase64 && !imageUrl && image_source !== 'instagram_only' && image_source !== 'drive_only') {
      try {
        const visualOut: any = await runVisualDesigner({ brief: goal });
        imageBase64 = visualOut?.image_base64 || null;
        imageOriginNote = imageOriginNote || 'AI (Imagen)';
        await db.marketingAgentRun.create({
          data: { agent_type: 'visual_designer', title: `Pipeline: ${goal.slice(0, 40)}`, status: 'completed', input: { brief: goal }, output: visualOut, ran_at: new Date() },
        }).catch(() => {});
      } catch (e: any) {
        imageOriginNote = `image generation failed: ${String(e?.message || e).slice(0, 100)}`;
      }
    }
    stages.image_base64 = imageBase64;
    stages.image_url = imageUrl;
    stages.image_origin = imageOriginNote;

    // 3. Brief
    const briefRes: any = await (functionHandlers as any).createCampaignBrief({
      body: {
        goal,
        copy_variants: stages.copy_variants,
        image_base64: stages.image_base64,
        image_url: stages.image_url,
        audience_hint: `Pipeline run for: ${goal}`,
        daily_budget_ils,
        landing_url,
      },
    });
    stages.brief = briefRes?.brief || null;
    stages.finished_at = new Date().toISOString();
    return { ok: true, ...stages };
  } catch (e: any) {
    stages.error = String(e?.message || e);
    stages.finished_at = new Date().toISOString();
    return { ok: false, ...stages };
  }
});

/* ----- Shift geofence (clock-in proximity + auto-close on leave) ----- */

function isAdminRole(role: any): boolean {
  return role === 'admin' || role === 'owner' || role === 'manager';
}

// Authed — anyone logged in can read config (frontend uses it to know whether
// to ask for GPS). Per-employee disable flag resolved server-side.
registerFn('getGeofenceConfig', async ({ user }) => {
  const profile = await db.restaurantProfile.findFirst();
  const restaurant_lat = profile?.restaurant_lat ?? null;
  const restaurant_lng = profile?.restaurant_lng ?? null;
  const flagOn = !!profile?.shift_geofence_required;
  const hasLocation = restaurant_lat != null && restaurant_lng != null;

  let my_tracking_disabled = false;
  if (user?.id) {
    const emp = await db.employee.findUnique({ where: { id: user.id } }).catch(() => null);
    my_tracking_disabled = !!emp?.location_tracking_disabled;
  }

  return {
    restaurant_lat,
    restaurant_lng,
    tracking_required: flagOn && hasLocation,
    my_tracking_disabled,
    in_radius_m: GEOFENCE_IN_RADIUS_M,
    out_radius_m: GEOFENCE_OUT_RADIUS_M,
    heartbeat_seconds: HEARTBEAT_INTERVAL_SECONDS,
  };
});

// Admin-only — save restaurant lat/lng on the single RestaurantProfile row.
// Uses raw SQL so we sidestep any unrelated Prisma drift on this table — we
// only need to touch the two columns we own.
registerFn('setRestaurantLocation', async ({ user, body }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const { lat, lng } = body as any;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('lat/lng required as numbers');
  }
  const rows: any[] = await (prisma as any).$queryRaw`SELECT id FROM "RestaurantProfile" LIMIT 1`;
  if (rows && rows.length > 0) {
    await (prisma as any).$executeRaw`
      UPDATE "RestaurantProfile"
      SET restaurant_lat = ${lat}, restaurant_lng = ${lng}, "updatedAt" = NOW()
      WHERE id = ${rows[0].id}
    `;
    return { restaurant_lat: lat, restaurant_lng: lng };
  }
  const newId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  // D-iso: pull the tenant's actual restaurant name from the Tenant table
  // instead of hardcoding 'עלינא'. Falls back to 'המסעדה' on the platform
  // origin container where slug='alena' isn't in Tenant.
  const slug = String(process.env.TENANT_SLUG || 'alena').toLowerCase();
  let seedName = 'המסעדה';
  if (slug === 'alena') {
    seedName = 'עלינא';
  } else {
    try {
      const trows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT restaurant_name FROM "Tenant" WHERE slug = $1 LIMIT 1`,
        slug,
      );
      if (trows.length && trows[0].restaurant_name) seedName = String(trows[0].restaurant_name);
    } catch { /* Tenant table missing — keep fallback */ }
  }
  await (prisma as any).$executeRaw`
    INSERT INTO "RestaurantProfile" (id, restaurant_name, restaurant_lat, restaurant_lng, "createdAt", "updatedAt")
    VALUES (${newId}, ${seedName}, ${lat}, ${lng}, NOW(), NOW())
  `;
  return { restaurant_lat: lat, restaurant_lng: lng };
});

// Admin-only — flip global "shift geofence required" switch.
registerFn('setGlobalLocationTracking', async ({ user, body }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const { enabled } = body as any;
  const rows: any[] = await (prisma as any).$queryRaw`SELECT id FROM "RestaurantProfile" LIMIT 1`;
  if (!rows || rows.length === 0) throw new Error('restaurant profile not set — set location first');
  await (prisma as any).$executeRaw`
    UPDATE "RestaurantProfile"
    SET shift_geofence_required = ${!!enabled}, "updatedAt" = NOW()
    WHERE id = ${rows[0].id}
  `;
  return { shift_geofence_required: !!enabled };
});

// Admin-only — per-employee opt-out.
registerFn('setEmployeeLocationToggle', async ({ user, body }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const { employee_id, disabled } = body as any;
  if (!employee_id) throw new Error('employee_id required');
  await (prisma as any).$executeRaw`
    UPDATE "Employee"
    SET location_tracking_disabled = ${!!disabled}, "updatedAt" = NOW()
    WHERE id = ${employee_id}
  `;
  return { employee_id, location_tracking_disabled: !!disabled };
});

// Authed — gated clock-in. Replaces the frontend's direct ShiftTracking.create
// when the geofence is active; returns the same shape so callers can drop in.
registerFn('clockInWithLocation', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { lat, lng, manager_override } = body as any;

  // Read restaurant profile via raw SQL — sidesteps any Prisma drift on this table.
  const profRows: any[] = await (prisma as any).$queryRaw`
    SELECT restaurant_lat, restaurant_lng, shift_geofence_required
    FROM "RestaurantProfile" LIMIT 1
  `;
  const profile = profRows?.[0] || null;
  const trackingOn =
    !!profile?.shift_geofence_required &&
    profile?.restaurant_lat != null &&
    profile?.restaurant_lng != null;

  // Read this employee's record via raw SQL — match by id OR email. Most
  // users authenticate via Google → User.id and Employee.id are different
  // entities; the only stable cross-reference is email. Without this fallback
  // every clock-in for those users showed the email as the name.
  const userEmail = String((user as any).email || '').toLowerCase();
  const empRows: any[] = await (prisma as any).$queryRaw`
    SELECT id, full_name, location_tracking_disabled, email
    FROM "Employee"
    WHERE id = ${user.id} OR LOWER(email) = ${userEmail}
    LIMIT 1
  `;
  const emp = empRows?.[0] || null;
  const empDisabled = !!emp?.location_tracking_disabled;
  const skipCheck =
    !trackingOn || empDisabled || (manager_override && isAdminRole((user as any)?.role));

  if (!skipCheck) {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      const err: any = new Error('location_required');
      err.code = 'location_required';
      throw err;
    }
    const d = distanceMeters(
      { lat, lng },
      { lat: profile.restaurant_lat as number, lng: profile.restaurant_lng as number },
    );
    if (d > GEOFENCE_IN_RADIUS_M) {
      const err: any = new Error('outside_geofence');
      err.code = 'outside_geofence';
      err.distance_m = Math.round(d);
      err.allowed_m = GEOFENCE_IN_RADIUS_M;
      throw err;
    }
  }

  // Find any active shifts for this employee — could be:
  //   (a) Today's shift → already clocked in, return as already_active
  //   (b) A previous day's shift that was never clocked out → close it
  //       gracefully before creating today's, so the employee doesn't end up
  //       with two "active" shifts at once.
  // Match on BOTH User.id and Employee.id (when emp exists) — they are
  // different entities for Google-auth users, and previous shifts may have
  // been stored under either.
  const lookupIds: string[] = [String(user.id)];
  if (emp?.id && emp.id !== user.id) lookupIds.push(String(emp.id));
  const openRows: any[] = await (prisma as any).$queryRaw`
    SELECT id, shift_start, status, date, last_location_at FROM "ShiftTracking"
    WHERE employee_id = ANY(${lookupIds}::text[]) AND status = 'active'
    ORDER BY shift_start DESC
  `;
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const row of openRows || []) {
    const rowDateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : '';
    if (rowDateStr === todayStr) {
      // Already clocked in today — return existing
      return { shift: row, already_active: true };
    }
    // Stale shift from a previous day — auto-close it
    const startTs = new Date(row.shift_start).getTime();
    const fallbackEnd = row.last_location_at ? new Date(row.last_location_at).getTime() : startTs + 8 * 3600 * 1000;
    const closeAt = new Date(Math.max(startTs + 30 * 60 * 1000, fallbackEnd));
    const totalHours = Math.round(((closeAt.getTime() - startTs) / 3600000) * 10) / 10;
    await (prisma as any).$executeRaw`
      UPDATE "ShiftTracking"
      SET shift_end = ${closeAt},
          status = 'completed',
          total_hours = ${totalHours},
          auto_close_reason = 'auto-closed on next clock-in (previous shift never clocked out)',
          "updatedAt" = NOW()
      WHERE id = ${row.id}
    `;
    console.log('[clockInWithLocation] auto-closed stale shift', { id: row.id, date: rowDateStr, employee_id: user.id, total_hours: totalHours });
  }

  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  // Prefer Employee.full_name (the canonical staff record), then user.full_name
  // (from auth), then email as a last resort. This stops showing emails in the
  // "active employees" widget for Google-authed users whose Employee record
  // is keyed by email.
  const employeeName = emp?.full_name || (user as any).full_name || (user as any).email || 'עובד';
  // Resolve employee_id to the Employee record when one exists by email — so
  // downstream joins (Tips, EmployeeReports, etc) find the right row.
  const resolvedEmployeeId = emp?.id || user.id;
  const newId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const lastLat = typeof lat === 'number' ? lat : null;
  const lastLng = typeof lng === 'number' ? lng : null;
  const lastAt = lastLat !== null ? now : null;

  await (prisma as any).$executeRaw`
    INSERT INTO "ShiftTracking" (
      id, employee_id, employee_name, date, shift_start, status,
      breaks, total_break_minutes, had_meal,
      last_lat, last_lng, last_location_at,
      "createdAt", "updatedAt"
    ) VALUES (
      ${newId}, ${resolvedEmployeeId}, ${employeeName}, ${today}, ${now}, 'active',
      ${'[]'}::jsonb, 0, false,
      ${lastLat}, ${lastLng}, ${lastAt},
      NOW(), NOW()
    )
  `;
  const shift: any = {
    id: newId, employee_id: resolvedEmployeeId, employee_name: employeeName,
    date: today, shift_start: now, status: 'active',
    breaks: [], total_break_minutes: 0, had_meal: false,
    last_lat: lastLat, last_lng: lastLng, last_location_at: lastAt,
  };
  // Fire the ShiftTracking.created trigger manually — this fn bypasses
  // the /api/entities route, so the registry doesn't auto-dispatch. Without
  // this the owner's "⏰ כניסה למשמרת" push never fires.
  fireTriggers('ShiftTracking', 'created', shift).catch((e) =>
    console.warn('[trigger] ShiftTracking.created (manual) failed:', e?.message),
  );
  return { shift, already_active: false };
});

// Read the caller's currently-active (or on-break) shift via raw SQL.
// Bypasses Prisma findMany/findUnique which crash on this table due to
// schema drift — DateTime parse failures and 0x00 byte errors. We need
// this so ShiftClockWidget can detect an open shift after page refresh.
registerFn('getMyActiveShift', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  // CRITICAL: User.id and Employee.id are DIFFERENT entities for Google-auth
  // users — clockInWithLocation stores Employee.id via email match, but the
  // JWT carries User.id. If we query by user.id only, Google users never
  // see their own active shift and the UI shows them as 'not on shift'.
  // → match on EITHER id.
  const userEmail = String((user as any).email || '').toLowerCase();
  const empMatch: any[] = userEmail ? await (prisma as any).$queryRaw`
    SELECT id FROM "Employee" WHERE LOWER(email) = ${userEmail} LIMIT 1
  ` : [];
  const empId = empMatch?.[0]?.id || null;
  const ids: string[] = [String(user.id)];
  if (empId && empId !== user.id) ids.push(String(empId));
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, employee_id, employee_name,
           date::text AS date,
           shift_start, shift_end, status,
           breaks, total_break_minutes, had_meal, meal_details,
           total_hours, effective_hours
    FROM "ShiftTracking"
    WHERE employee_id = ANY(${ids}::text[])
      AND (status = 'active' OR status = 'on_break')
    ORDER BY shift_start DESC
    LIMIT 1
  `;
  return { shift: rows?.[0] || null };
});

// Update a subset of ShiftTracking fields via raw SQL. Same reason as above:
// Prisma update/findUnique crash on this table. Whitelist of writable fields
// keeps us safe; ownership check enforces that only the shift's employee
// (or its owner) can patch. Strings are stripped of 0x00 defensively.
registerFn('patchShiftRaw', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { shift_id, fields } = (body || {}) as { shift_id?: string; fields?: Record<string, unknown> };
  if (!shift_id || !fields || typeof fields !== 'object') {
    throw new Error('shift_id and fields required');
  }
  const own: any[] = await (prisma as any).$queryRaw`
    SELECT employee_id FROM "ShiftTracking" WHERE id = ${shift_id} LIMIT 1
  `;
  if (!own?.[0]) throw new Error('shift_not_found');
  // OWNERSHIP CHECK — User.id and Employee.id are DIFFERENT entities for
  // Google-auth users (clockInWithLocation stores Employee.id via email match,
  // but JWT carries User.id). Match against EITHER. Admins can always patch.
  if (own[0].employee_id !== user.id) {
    const userEmail = String((user as any).email || '').toLowerCase();
    const empMatch: any[] = userEmail ? await (prisma as any).$queryRaw`
      SELECT id FROM "Employee" WHERE LOWER(email) = ${userEmail} LIMIT 1
    ` : [];
    const empId = empMatch?.[0]?.id || null;
    const isAdmin = isAdminRole((user as any)?.role);
    if (!isAdmin && empId !== own[0].employee_id) {
      throw new Error('not your shift');
    }
  }

  const stripNuls = (s: unknown) => (typeof s === 'string' ? s.replace(/\x00/g, '') : s);

  for (const k of Object.keys(fields)) {
    const v = (fields as any)[k];
    if (k === 'status') {
      const s = String(stripNuls(v) ?? '');
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET status = ${s}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'breaks') {
      const json = JSON.stringify(Array.isArray(v) ? v : []);
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET breaks = ${json}::jsonb, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'total_break_minutes') {
      const n = Number(v) || 0;
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET total_break_minutes = ${n}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'had_meal') {
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET had_meal = ${!!v}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'meal_details') {
      const s = String(stripNuls(v) ?? '');
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET meal_details = ${s}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'shift_end') {
      const d = v ? new Date(v as string) : null;
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET shift_end = ${d}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'total_hours') {
      const n = Number(v) || 0;
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET total_hours = ${n}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    } else if (k === 'effective_hours') {
      const n = Number(v) || 0;
      await (prisma as any).$executeRaw`UPDATE "ShiftTracking" SET effective_hours = ${n}, "updatedAt" = NOW() WHERE id = ${shift_id}`;
    }
    // unknown keys silently ignored
  }

  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, employee_id, employee_name,
           date::text AS date,
           shift_start, shift_end, status,
           breaks, total_break_minutes, had_meal, meal_details,
           total_hours, effective_hours
    FROM "ShiftTracking" WHERE id = ${shift_id} LIMIT 1
  `;
  return { shift: rows?.[0] || null };
});

// Admin-only — close a running shift AND sync the employee's row in
// WorkShift.assigned_staff for that date so the סידור עבודה shows the
// real end time, not the stale planned one. Avoids the manager having
// to fix two places.
registerFn('adminCloseEmployeeShift', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const { shift_id, end_iso } = (body || {}) as { shift_id?: string; end_iso?: string };
  if (!shift_id || !end_iso) throw new Error('shift_id and end_iso required');
  const endDate = new Date(end_iso);
  if (Number.isNaN(endDate.getTime())) throw new Error('invalid end_iso');

  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, employee_id, employee_name, shift_start, date::text AS date_str
    FROM "ShiftTracking" WHERE id = ${shift_id} LIMIT 1
  `;
  const tracking = rows?.[0];
  if (!tracking) throw new Error('shift_not_found');

  const startMs = new Date(tracking.shift_start).getTime();
  const endMs = endDate.getTime();
  const totalHours = Math.max(0, (endMs - startMs) / 3600000);

  await (prisma as any).$executeRaw`
    UPDATE "ShiftTracking"
    SET status = 'completed', shift_end = ${endDate},
        total_hours = ${totalHours}, effective_hours = ${totalHours},
        "updatedAt" = NOW()
    WHERE id = ${shift_id}
  `;

  // Sync to WorkShift.assigned_staff for the same date+employee.
  const dateStr = String(tracking.date_str || '').slice(0, 10);
  const workShifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: new Date(dateStr + 'T00:00:00.000Z'), lt: new Date(dateStr + 'T23:59:59.999Z') } },
    take: 50,
  });
  const endHHMM = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
  let synced = 0;
  for (const ws of workShifts) {
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    const idx = staff.findIndex((a: any) => a?.employee_id === tracking.employee_id);
    if (idx < 0) continue;
    const next = [...staff];
    next[idx] = { ...next[idx], end_time: endHHMM };
    await (prisma as any).workShift.update({ where: { id: ws.id }, data: { assigned_staff: next } });
    synced++;
  }

  return { ok: true, end_time: endHHMM, total_hours: totalHours, work_shifts_synced: synced };
});

// Authed — heartbeat from the active shift widget. Debounce: requires
// (a) past warm-up window AND (b) previous reading was also over threshold
// before auto-closing. Kills GPS jitter false positives.
registerFn('shiftHeartbeat', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { shift_id, lat, lng } = body as any;
  if (!shift_id || typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('shift_id, lat, lng required');
  }

  const shift = await db.shiftTracking.findUnique({ where: { id: shift_id } });
  if (!shift) throw new Error('shift_not_found');
  // Same ownership double-check as patchShiftRaw — accept Employee.id (email-resolved) OR User.id.
  if (shift.employee_id !== user.id) {
    const userEmail = String((user as any).email || '').toLowerCase();
    const empMatch: any = userEmail
      ? await db.employee.findFirst({ where: { email: userEmail } }).catch(() => null)
      : null;
    if (empMatch?.id !== shift.employee_id) throw new Error('not your shift');
  }
  if (shift.status !== 'active') return { status: shift.status, closed: true };

  const profile = await db.restaurantProfile.findFirst();
  const trackingOn =
    !!profile?.shift_geofence_required &&
    profile?.restaurant_lat != null &&
    profile?.restaurant_lng != null;
  const emp = await db.employee.findUnique({ where: { id: user.id } }).catch(() => null);
  const empDisabled = !!emp?.location_tracking_disabled;

  const now = new Date();
  const prevLat = shift.last_lat as number | null;
  const prevLng = shift.last_lng as number | null;
  const shiftStartMs = new Date(shift.shift_start).getTime();
  const ageSeconds = (now.getTime() - shiftStartMs) / 1000;

  // === MANUAL CLOSE ONLY (owner directive 7/6/2026) ===
  // The geofence auto-close kept logging out Hila & Aya even when they were
  // mid-shift — likely because their phones reported stale or imprecise GPS
  // (indoor, signal dropped, background tracking off). Owner explicitly asked
  // for clock-out to be MANUAL ONLY. We still record the last location so the
  // admin can see who drifted, but we never auto-end the shift.
  // Re-enable willClose below if/when GPS reliability improves.
  const willClose = false;
  void trackingOn; void empDisabled; void prevLat; void prevLng;

  if (!willClose) {
    await db.shiftTracking.update({
      where: { id: shift_id },
      data: { last_lat: lat, last_lng: lng, last_location_at: now },
    });
    return { closed: false };
  }

  const totalHours = Math.max(
    0,
    (now.getTime() - shiftStartMs) / 3_600_000 - (shift.total_break_minutes || 0) / 60,
  );
  await db.shiftTracking.update({
    where: { id: shift_id },
    data: {
      shift_end: now,
      status: 'auto_closed',
      auto_close_reason: 'left_geofence',
      total_hours: totalHours,
      effective_hours: totalHours,
      last_lat: lat,
      last_lng: lng,
      last_location_at: now,
    },
  });

  const empName = shift.employee_name || emp?.full_name || 'עובד';
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  pushoverToAdmins(
    '🚪 משמרת נסגרה אוטומטית',
    `${empName} התרחק 500m+ מהעסק. נסגרה ב-${hhmm}.`,
  ).catch(() => {});

  return { closed: true, reason: 'left_geofence' };
});

// Authed — "did anything auto-close on me that I haven't seen?"
registerFn('getMyAutoCloseNotice', async ({ user }) => {
  if (!user?.id) return { notice: null };
  const shift = await db.shiftTracking.findFirst({
    where: {
      employee_id: user.id,
      auto_close_reason: 'left_geofence',
      auto_close_seen_at: null,
    },
    orderBy: { shift_end: 'desc' },
  });
  if (!shift) return { notice: null };
  return {
    notice: { shift_id: shift.id, shift_end: shift.shift_end, reason: shift.auto_close_reason },
  };
});

// Authed — mark the banner as dismissed.
registerFn('markAutoCloseNoticeSeen', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { shift_id } = body as any;
  if (!shift_id) throw new Error('shift_id required');
  const shift = await db.shiftTracking.findUnique({ where: { id: shift_id } });
  if (!shift || shift.employee_id !== user.id) throw new Error('not found');
  await db.shiftTracking.update({
    where: { id: shift_id },
    data: { auto_close_seen_at: new Date() },
  });
  return { ok: true };
});

// One-off migration helper — runs idempotent ALTER TABLE statements for the
// shift-geofence columns. Safe to call multiple times. Public so it can be
// triggered with a single curl when `prisma db push` declines to run (e.g.,
// when it detects unrelated drift). Remove after the columns exist.
registerFn('applyShiftGeofenceMigration', async () => {
  // Tables that need the standard Prisma triplet (createdBy/createdAt/updatedAt)
  // because the DB drift means RestaurantProfile etc. were imported from base44
  // without these. Adds them as nullable / defaulted so existing rows stay valid.
  const tripletTables = ['RestaurantProfile', 'Employee', 'ShiftTracking', 'JobCandidate'];
  const tripletStmts = tripletTables.flatMap((t) => [
    `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`,
    `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  ]);
  const statements = [
    ...tripletStmts,
    `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "restaurant_lat" DOUBLE PRECISION`,
    `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "restaurant_lng" DOUBLE PRECISION`,
    `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "shift_geofence_required" BOOLEAN DEFAULT false`,
    `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "location_tracking_disabled" BOOLEAN DEFAULT false`,
    `ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "last_lat" DOUBLE PRECISION`,
    `ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "last_lng" DOUBLE PRECISION`,
    `ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "last_location_at" TIMESTAMP(3)`,
    `ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "auto_close_reason" TEXT`,
    `ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "auto_close_seen_at" TIMESTAMP(3)`,
    `ALTER TABLE "JobCandidate" ADD COLUMN IF NOT EXISTS "transcript" JSONB`,
  ];
  const results: Array<{ stmt: string; ok: boolean; error?: string }> = [];
  for (const stmt of statements) {
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return { results };
}, { public: true });

// Sends one realistic push for every notification template the app has.
// Owner-only. No DB writes — just fires the push templates directly.
registerFn('testEveryPushTemplate', async ({ user }) => {
  if (!user?.email) throw new Error('unauthorized');
  if (String(user.email).toLowerCase() !== 'dvirnifusi@gmail.com') {
    throw new Error('owner_only');
  }
  const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}/${mm}/${yyyy}`;
  const sent: Array<{ kind: string; ok: boolean; error?: string }> = [];
  const fire = async (kind: string, title: string, body: string) => {
    try { await pushoverToAdmins(title, body); sent.push({ kind, ok: true }); }
    catch (e: any) { sent.push({ kind, ok: false, error: String(e?.message || e) }); }
  };
  const fireEvents = async (kind: string, title: string, body: string) => {
    try { await pushoverEventsOwners(title, body); sent.push({ kind, ok: true }); }
    catch (e: any) { sent.push({ kind, ok: false, error: String(e?.message || e) }); }
  };

  // 1. Tip lock — full breakdown (the format you asked for)
  await fire(
    'tip_locked',
    `💰 טיפים ננעלו — צהריים ☀️ ${dateStr} [בדיקה]`,
    [
      `📅 ${dateStr} · צהריים ☀️`,
      `💵 סה"כ נאסף: ${fmt(2400)}`,
      `🍽️ ארוחות עובדים: ${fmt(180)}`,
      `🏃 ניכוי ראנר: ${fmt(240)}`,
      `✨ לחלוקה: ${fmt(1980)}`,
      `⏱️ טיפ לשעה: ${fmt(82)}`,
    ].join('\n'),
  );
  // 2. Incident — full detail
  await fire('incident', '🚨 תקרית חדשה: לקוח התלונן על אוכל קר [בדיקה]',
    [`🔢 INC-2026-0042`,
     `🏷️ קטגוריה: service`,
     `⚠️ חומרה: בינונית 🟡`,
     `📅 ${dateStr} 19:42`,
     `📍 שולחן 15`,
     `👤 דווח ע"י: יהלי דסקלו`,
     `👮 הופנה ל: דביר ניפוסי`,
     `🗣️ תגובת לקוח: ביקש החזר חלקי`,
     `💰 עלות מוערכת: ${fmt(120)}`,
     `📝 סטייק מדיום שהוגש קר. הוחזר למטבח לחימום ולקוח קיבל מנת לוואי על חשבון הבית.`,
     `🔔 דורש מעקב`].join('\n'));
  // 4. Shift end report — full
  await fire('shift_end_report', '📋 דוח סיום משמרת — ערב 🌙 ' + dateStr + ' [בדיקה]',
    [`📅 ${dateStr} · ערב 🌙`,
     `👤 מנהל: דביר ניפוסי`,
     `🕐 17:00-23:30`,
     `💰 הכנסות: ${fmt(8540)}`,
     `💳 אשראי: ${fmt(6820)}`,
     `💵 מזומן: ${fmt(1720)}`,
     `🪙 טיפים באשראי: ${fmt(840)}`,
     `⏱️ טיפ לשעה למלצר: ${fmt(78)}`,
     `👥 סועדים: 62 (ממוצע ${fmt(138)})`,
     `🥡 טייק-אווי: ${fmt(420)}`,
     `❌ ביטולים: 1 (${fmt(85)})`,
     `🎫 הנחות: ${fmt(140)}`,
     `⭐ דירוג כללי: 4/5`,
     `📄 Z: Z-2026-156`].join('\n'));
  // 5. Availability submission — full
  await fire('availability', '📅 הגשת זמינות — הילה מאסיל [בדיקה]',
    [`👤 הילה מאסיל`,
     `📅 ${dateStr}`,
     `סטטוס: ⏰ פנוי/ה חלקית`,
     `🕐 משמרת מועדפת: ערב`,
     `⏱️ שעות: 17:00-22:00`,
     `🏢 מחלקה: פלור`,
     `🎯 תפקידים: מלצר, ראנר`,
     `📝 צריכה לצאת מוקדם בגלל לימודים בערב`].join('\n'));
  // 6. Clock-in — full
  await fire('clock_in', '⏰ כניסה למשמרת — דביר ניפוסי [בדיקה]',
    [`👤 דביר ניפוסי`,
     `🕐 שעת כניסה: 17:00`,
     `📅 ${dateStr} · ערב 🌙`,
     `📍 31.9645, 34.7931`].join('\n'));
  // 7. Overtime — full
  await fire('overtime', '⚠️ חריגה בשעות משמרת — אוהד פלד [בדיקה]',
    [`👤 אוהד פלד`,
     `⏱️ סה"כ 11.2 שעות עבודה`,
     `✨ אפקטיביות: 10.7 שעות`,
     `☕ הפסקות: 30 דק'`,
     `🕐 התחיל ב-12:00`,
     `🍽️ אכל: שניצל וצ'יפס`].join('\n'));
  // 8. Brief published — full
  await fire('brief_published', '📢 תדריך פורסם — ערב 🌙 ' + dateStr + ' [בדיקה]',
    [`📅 ${dateStr} · ערב 🌙`,
     `👤 מנהל: דביר ניפוסי`,
     `💰 דגש מכירה: דחיפת קוקטייל החתימה החדש "ספריצי עלינא" — יעד 25 מנות`,
     `🛎️ דגש שירות: הצגת התפריט תוך 90 שניות מההושבה`,
     `🏭 דגש תפעולי: בדיקת חימום פיתות לפני 19:00`,
     `🎯 סיפור היום: שף נריה עיצב מנת ערב מיוחדת — לדבר עליה`].join('\n'));
  // 9. Shift swap request — full
  await fire('swap_request', '🔄 בקשת החלפת משמרת [בדיקה]',
    [`👤 רותם שרעבי ↔️ הילה מאסיל`,
     `📅 ${dateStr} · ערב 🌙`,
     `🎯 תפקיד: מלצרית`,
     `🕐 17:00-23:00`,
     `📝 חופשה מתוכננת בסופ"ש, מבקשת לעבור עם הילה`].join('\n'));
  // 10. Leave request — full
  await fire('leave_request', '🌴 בקשת חופשה חדשה — יפית גולדין [בדיקה]',
    [`👤 יפית גולדין`,
     `🌴 סוג: vacation`,
     `📅 10/06/2026 → 12/06/2026 (3 ימים)`,
     `📝 סיבה: חתונה במשפחה — אחותי`].join('\n'));
  // 11. Leave status update — full
  await fire('leave_status', '🌴 עדכון סטטוס חופשה [בדיקה]',
    [`👤 יפית גולדין`,
     `🌴 vacation · 10/06/2026 → 12/06/2026`,
     `סטטוס: אושרה ✓`,
     `📝 מאשר. תארגן החלפה עם הילה מאסיל לסופ"ש`].join('\n'));
  // 12. Geofence auto-close — full
  await fire('geofence_auto_close', '🚪 משמרת נסגרה אוטומטית — דביר ניפוסי [בדיקה]',
    [`👤 דביר ניפוסי`,
     `📅 ${dateStr} · 17:00-19:35`,
     `📍 סיבה: left_geofence`,
     `⏱️ סה"כ 2.6 שעות`].join('\n'));
  // 13. Events: new lead
  await fireEvents('events_new_lead', '✨ ליד אירוע חדש — שיחה פעילה [בדיקה]', `👤 גל · 0532181900\n📅 ${dateStr}\n🎉 יום הולדת\n👥 28 אורחים\n💰 ₪220/סועד\n📥 מקור: web_chat`);
  // 14. Events: abandoned lead
  await fireEvents('events_abandoned', '⚠️ ליד אירוע נטוש [בדיקה]', `👤 רותם · 0509998877\n📅 15/07/2026\n🎉 ברית\n👥 60 אורחים\n📊 ציון: 72/100\n⏰ עזב לפני ~10 דק׳ באמצע השיחה`);
  // 15. Event lead CLOSED (booking confirmed by manager)
  await fireEvents('event_closed', '🎉 אירוע נסגר — אישור מנהל [בדיקה]', `👤 גל · 0532181900\n📅 09/06/2026 19:00\n🎉 יום הולדת\n👥 28 אורחים\n💰 סה"כ: ₪7,840\n💳 מקדמה: ₪1,568`);
  // 16. Event same-day urgent close
  await fireEvents('event_same_day', '⚡ אירוע same-day נסגר! [בדיקה]', `👤 עידן · 0501122334\n📅 ${dateStr} 21:00\n🎉 אירוסין\n👥 20 אורחים\n💰 ₪4,500`);
  // 17. New high-score job candidate
  await fire('new_candidate_high_score', '🎯 מועמד גיוס חדש (ציון גבוה) [בדיקה]', `👤 שירה כהן · 24\n📱 0541112222\n💼 מלצרית · 3+ שנות ניסיון\n⭐ ציון: 92/100\n📍 ראשון לציון`);
  // 18. New interview scheduled
  await fire('interview_scheduled', '📅 ראיון חדש נקבע [בדיקה]', `שירה כהן · ${dateStr} 14:30\nתפקיד: מלצרית · ציון: 92`);
  // 19. Interview reminder (3h before)
  await fire('interview_reminder', '⏰ ראיון עבודה בעוד ~3 שעות [בדיקה]', `שירה כהן · 14:30\nתפקיד: מלצרית · ציון: 92\n📱 0541112222`);
  // 20. New reservation through the site
  await fire('new_reservation', `📅 הזמנה חדשה — ${dateStr} 20:00 [בדיקה]`, `👤 משפחת לוי · 0508887777\n👥 6 סועדים\n🎉 יום הולדת\n📝 שולחן ליד החלון אם אפשר`);
  // 21. Positive customer feedback
  await fire('feedback_positive', '⭐ משוב לקוח חיובי (5/5) [בדיקה]', `אורן בן-דוד · 0531234567\n⭐⭐⭐⭐⭐ 5/5\n🍽️ אוכל: 5/5\n🛎️ שירות: 5/5\n🪑 שולחן 12\n💬 חוויה מדהימה, האוכל היה מצוין והצוות מקסים!`);
  // 22. Negative customer feedback (alarm)
  await fire('feedback_negative', '🚨 משוב לקוח שלילי (2/5) [בדיקה]', `אנונימי\n⭐⭐ 2/5\n🍽️ אוכל: 2/5\n🛎️ שירות: 3/5\n🪑 שולחן 7\n💬 האוכל הגיע קר ולקח 40 דקות`);
  // 23. Checklist completed WITHOUT issues
  await fire('checklist_ok', '✅ צ\'קליסט הושלם — תקין [בדיקה]', `צ\'ק ליסט סגירת בר · יהלי דסקלו\n18 עברו · 0 נכשלו · ✅ הכל תקין`);
  // 24. Checklist completed WITH issues
  await fire('checklist_issues', '⚠️ צ\'קליסט הושלם עם בעיות [בדיקה]', `צ\'ק ליסט פתיחת מטבח · אוהד פלד\n12 עברו · 2 נכשלו · ⚠️ 2 בעיות\n• מקרר 2 — טמפרטורה גבוהה (8°C)\n• כיריים — אזעקה לא עובדת`);
  // 25. Restroom check reminder (parallel to the webpush flow, sent to admins)
  await fire('restroom_reminder', '🚽 בדיקת שירותים [בדיקה]', `הגיעה השעה לבדוק שירותים. סמן בדיקה באפליקציה (אפשר עם תמונה).`);
  // 26. EventBooking created (initial record)
  await fireEvents('event_booking_created', '📋 הזמנת אירוע נוצרה — אביבה כהן [בדיקה]',
    [`👤 אביבה כהן · 0541234567`,
     `📅 15/07/2026 · 🕐 19:30`,
     `👥 35 אורחים`,
     `💰 סה"כ: ${fmt(9100)}`,
     `💳 מקדמה: ${fmt(1820)}`,
     `📥 מקור: web_chat`].join('\n'));
  // 27. EventBooking rejected
  await fireEvents('event_rejected', '❌ אירוע נדחה ע"י מנהל [בדיקה]',
    [`👤 מאי כהן · 0509876543`,
     `📅 04/06/2026 · 🕐 20:00`,
     `👥 80 אורחים`,
     `💰 סה"כ: ${fmt(28000)}`,
     `📝 סיבה: התאריך כבר תפוס לחתונה אחרת`].join('\n'));

  return { total: sent.length, ok: sent.filter((s) => s.ok).length, failed: sent.filter((s) => !s.ok), report: sent };
});

// End-to-end push test. Reports what was attempted and the env state so we
// can tell *why* it failed if it didn't arrive. Locked to dvirnifusi@gmail.com.
registerFn('testAllPushPaths', async ({ user }) => {
  if (!user?.email) throw new Error('unauthorized');
  if (String(user.email).toLowerCase() !== 'dvirnifusi@gmail.com') {
    throw new Error('owner_only');
  }
  const report: any = {
    env_PUSHOVER_APP_TOKEN: !!(process.env.PUSHOVER_APP_TOKEN || process.env.PUSHOVER_API_TOKEN),
    env_TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
    env_TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    env_VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
  };
  // 1. Admin user lookup
  const admins = await (prisma as any).user.findMany({ where: { role: 'admin' } });
  report.admin_users = admins.length;
  // 2. Linked employee with pushover_user_key
  const adminEmployees = [];
  for (const admin of admins) {
    const emp = await (prisma as any).employee.findFirst({
      where: { email: admin.email, pushover_user_key: { not: null } },
    });
    if (emp) adminEmployees.push({ name: emp.full_name, has_key: !!emp.pushover_user_key });
  }
  report.admin_employees_with_pushover_key = adminEmployees;
  // 3. Actually fire each push path
  const ts = new Date().toLocaleTimeString('he-IL');
  const r1 = await pushoverToAdmins(
    '🧪 בדיקה — pushoverToAdmins',
    `אם הגעת — פוש למנהלים עובד ✅\nשעה: ${ts}`,
  ).catch((e: any) => ({ error: String(e?.message || e) }));
  report.pushoverToAdmins = r1;
  const r2 = await pushoverEventsOwners(
    '🧪 בדיקה — אירועים',
    `אם הגעת — פוש לידי אירועים עובד ✅\nשעה: ${ts}`,
  ).catch((e: any) => ({ error: String(e?.message || e) }));
  report.pushoverEventsOwners = r2;
  return report;
});

// One-off: promote the caller's User record to role='admin' so pushoverToAdmins
// has a non-empty recipient list. Idempotent. Locked to dvirnifusi@gmail.com
// (the owner) to avoid privilege escalation.
registerFn('promoteSelfToAdmin', async ({ user }) => {
  if (!user?.email) throw new Error('unauthorized');
  const allowed = ['dvirnifusi@gmail.com'];
  if (!allowed.includes(String(user.email).toLowerCase())) {
    throw new Error('not_allowed_for_this_email');
  }
  const before: any = await (prisma as any).user.findUnique({ where: { id: user.id } });
  await (prisma as any).user.update({ where: { id: user.id }, data: { role: 'admin' } });
  return { ok: true, email: user.email, previous_role: before?.role || null };
});

// Add legacy created_date / updated_date text columns to every table whose
// Prisma model declares them. Prisma otherwise throws P2022 when reading a
// declared column that doesn't exist in DB. Idempotent.
registerFn('addLegacyDateColumns', async () => {
  const { Prisma } = await import('@prisma/client');
  const stmts: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Set(model.fields.map((f) => f.name));
    const table = (model as any).dbName || model.name;
    if (fields.has('created_date')) stmts.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "created_date" TEXT`);
    if (fields.has('updated_date')) stmts.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "updated_date" TEXT`);
  }
  const results: Array<{ stmt: string; ok: boolean; error?: string }> = [];
  for (const stmt of stmts) {
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    failures: results.filter((r) => !r.ok).slice(0, 10),
  };
}, { public: true });

// Broad triplet repair — introspects Prisma DMMF for every model declaring
// createdAt/updatedAt/createdBy and adds the missing columns idempotently.
// Needed because the original base44 import only covered 4 tables, leaving
// the rest (WorkShift, DailyBrief, Checklist, DailyChallenge, CoinTransaction,
// ShiftSwapRequest, Shift, Incident, LeaveRequest, Customer, etc.) broken on
// every Prisma read with `P2022: column "createdBy" does not exist`.
// Idempotent (uses IF NOT EXISTS); safe to re-run.
registerFn('repairTripletAllTables', async () => {
  const { Prisma } = await import('@prisma/client');
  const stmts: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Set(model.fields.map((f) => f.name));
    const table = (model as any).dbName || model.name;
    if (fields.has('createdBy')) {
      stmts.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`);
    }
    if (fields.has('createdAt')) {
      stmts.push(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      );
    }
    if (fields.has('updatedAt')) {
      stmts.push(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      );
    }
  }
  const results: Array<{ stmt: string; ok: boolean; error?: string }> = [];
  for (const stmt of stmts) {
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return { total: results.length, ok: okCount, failed: failCount, results };
}, { public: true });

// Repair DATE-column drift: many base44-imported tables have columns declared
// as DateTime in Prisma but actually created as PostgreSQL DATE type. Prisma's
// client then chokes reading them with `P2023: Could not convert value
// "2025-09-21" of the field 'date' to type 'DateTime'`. Fix: in-place ALTER
// COLUMN TYPE to TIMESTAMP(3), parsing existing dates as midnight UTC.
// Idempotent — only touches columns currently `data_type = 'date'`.
registerFn('repairDateColumnsToTimestamp', async () => {
  const { Prisma } = await import('@prisma/client');
  const want = new Set<string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = (model as any).dbName || model.name;
    for (const f of model.fields) {
      if (f.kind === 'scalar' && f.type === 'DateTime') {
        const col = (f as any).dbName || f.name;
        want.add(`${table}.${col}`);
      }
    }
  }
  // Match anything that isn't already a timestamp — covers DATE, TEXT, VARCHAR,
  // CHAR (the base44 import varied). We attempt ALTER per column; rows with
  // non-parseable values will surface as failures in `results`.
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type NOT IN ('timestamp without time zone','timestamp with time zone')
  `;
  const results: Array<{ stmt: string; from: string; ok: boolean; error?: string }> = [];
  for (const r of rows) {
    const key = `${r.table_name}.${r.column_name}`;
    if (!want.has(key)) continue;
    // Defensive USING: only convert values whose text form starts with
    // YYYY-MM-DD; substring to first 10 chars to tolerate appended junk like
    // "2025-10-10-27"; anything else becomes NULL. Avoids one corrupted row
    // blocking the whole column conversion.
    const stmt = `ALTER TABLE "${r.table_name}" ALTER COLUMN "${r.column_name}" TYPE TIMESTAMP(3) USING (CASE WHEN "${r.column_name}"::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN substring("${r.column_name}"::text, 1, 10)::timestamp ELSE NULL END)`;
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, from: r.data_type, ok: true });
    } catch (e: any) {
      results.push({ stmt, from: r.data_type, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    db_columns_scanned: rows.length,
    matched_and_altered: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}, { public: true });

// Scrub 0x00 bytes from every TEXT/VARCHAR column in tables imported from
// base44 that carry corrupted rows. PostgreSQL rejects 0x00 inside UTF-8 text
// (errcode 22021), and that's what's been blocking ShiftTracking entity reads
// even after the column types are correct. Whitelisted to known-problem tables
// to avoid scanning the whole DB. Idempotent.
registerFn('scrubNullBytesAllTables', async () => {
  const cols: any[] = await (prisma as any).$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')
  `;
  const results: Array<{ stmt: string; ok: boolean; affected?: number; error?: string }> = [];
  for (const c of cols) {
    // Use chr(0) (server-side function call) — embedding the literal byte
    // 0x00 in the query body would cause PG to reject the whole statement
    // with errcode 22021 ("invalid byte sequence for encoding UTF8").
    const stmt = `UPDATE "${c.table_name}" SET "${c.column_name}" = replace("${c.column_name}", chr(0), '') WHERE strpos("${c.column_name}", chr(0)) > 0`;
    try {
      const n = await (prisma as any).$executeRawUnsafe(stmt);
      if (n > 0) results.push({ stmt, ok: true, affected: Number(n) });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    columns_scanned: cols.length,
    rows_touched: results.filter((r) => r.ok).reduce((s: any, r: any) => s + (r.affected || 0), 0),
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}, { public: true });

// Backfill NULLs in columns declared NOT NULL in Prisma. Required because the
// base44 import left some rows with NULL in fields the schema now demands
// (e.g. Reservation.customer_name, Order.order_number). Prisma findMany then
// crashes with P2032 trying to coerce NULL to a non-nullable type.
// Strings -> '', Int/Float -> 0, Boolean -> false. Idempotent (no-op when no
// NULLs remain). Skips columns with @default — those should be filled by DB.
registerFn('backfillRequiredNulls', async () => {
  const { Prisma } = await import('@prisma/client');
  const results: Array<{ stmt: string; ok: boolean; affected?: number; error?: string }> = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = (model as any).dbName || model.name;
    for (const f of model.fields) {
      if (f.kind !== 'scalar') continue;
      if (f.isRequired === false) continue;
      if (f.isId) continue;
      if ((f as any).hasDefaultValue) continue;
      const col = (f as any).dbName || f.name;
      let defaultLit: string | null = null;
      if (f.type === 'String') defaultLit = `''`;
      else if (f.type === 'Int' || f.type === 'BigInt' || f.type === 'Float' || f.type === 'Decimal') defaultLit = `0`;
      else if (f.type === 'Boolean') defaultLit = `false`;
      else continue;
      const stmt = `UPDATE "${table}" SET "${col}" = ${defaultLit} WHERE "${col}" IS NULL`;
      try {
        const n = await (prisma as any).$executeRawUnsafe(stmt);
        if (n > 0) results.push({ stmt, ok: true, affected: Number(n) });
      } catch (e: any) {
        results.push({ stmt, ok: false, error: String(e?.message || e) });
      }
    }
  }
  return {
    rows_touched: results.filter((r) => r.ok).reduce((s: any, r: any) => s + (r.affected || 0), 0),
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}, { public: true });

// Emergency: refill NULL values in required-DateTime columns. The tolerant
// USING clause in repairDateColumnsToTimestamp set malformed date strings
// (like "2025-10-10-27", "15/03/26") to NULL. Frontend code then crashes on
// `.startsWith`/`.substring`/`.split` of those nulls. This restores a value
// using the row's createdAt (or current time as fallback) so renders stop
// crashing. Only touches columns Prisma declares as required + DateTime.
// Diagnostic — column types for a given table. Used to derive Prisma schema
// for tables Prisma doesn't know about yet.
registerFn('describeTable', async ({ body }) => {
  const t = String((body as any)?.table || '').replace(/[^A-Za-z0-9_]/g, '');
  if (!t) return { error: 'missing table' };
  const cols: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`,
  );
  return cols;
}, { public: true });

registerFn('listMatchingTables', async ({ body }) => {
  const pattern = String((body as any)?.pattern || '%').toLowerCase();
  const tables: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND LOWER(table_name) LIKE '${pattern.replace(/'/g, "''")}'`,
  );
  const out: Record<string, string[]> = {};
  for (const t of tables) {
    const cols: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t.table_name.replace(/'/g, "''")}' ORDER BY ordinal_position`,
    );
    out[t.table_name] = cols.map((c) => c.column_name);
  }
  return out;
}, { public: true });

registerFn('backfillNullDateTimes', async () => {
  const { Prisma } = await import('@prisma/client');
  const results: Array<{ stmt: string; ok: boolean; affected?: number; error?: string }> = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = (model as any).dbName || model.name;
    const fieldNames = new Set(model.fields.map((f) => f.name));
    const hasCreatedAt = fieldNames.has('createdAt');
    for (const f of model.fields) {
      if (f.kind !== 'scalar') continue;
      if (f.type !== 'DateTime') continue;
      if (f.isRequired === false) continue;
      if (f.isId) continue;
      const col = (f as any).dbName || f.name;
      const expr = hasCreatedAt ? 'COALESCE("createdAt", NOW())' : 'NOW()';
      const stmt = `UPDATE "${table}" SET "${col}" = ${expr} WHERE "${col}" IS NULL`;
      try {
        const n = await (prisma as any).$executeRawUnsafe(stmt);
        if (n > 0) results.push({ stmt, ok: true, affected: Number(n) });
      } catch (e: any) {
        results.push({ stmt, ok: false, error: String(e?.message || e) });
      }
    }
  }
  return {
    rows_touched: results.filter((r) => r.ok).reduce((s: any, r: any) => s + (r.affected || 0), 0),
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}, { public: true });

// ─────────────────────────────────────────────────────────────────────────────
// BEECOMM POS INTEGRATION (Order Center API)
// Docs: http://bibeecommws.azurewebsites.net/Docs/OrdersCenter/OrdersCenter.aspx
// Base: https://biapp.beecomm.co.il:8094
// ─────────────────────────────────────────────────────────────────────────────

const BEECOMM_DEFAULT_BASE = 'https://biapp.beecomm.co.il:8094';

async function loadBeecommConfig() {
  const rows = await (prisma as any).beecommConfig.findMany({ take: 1, orderBy: { createdAt: 'asc' } });
  return rows[0] || null;
}

async function beecommAuth(cfg: { client_id: string; client_secret: string; api_base_url?: string | null }) {
  const base = cfg.api_base_url || BEECOMM_DEFAULT_BASE;
  const body = new URLSearchParams({ client_id: cfg.client_id, client_secret: cfg.client_secret });
  const res = await fetch(`${base}/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { result: false, message: text.slice(0, 200) }; }
  if (!res.ok || !json?.result || !json?.access_token) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return { token: String(json.access_token), base };
}

// Returns a non-expired access token, re-authing if needed (50-min window).
async function ensureBeecommToken() {
  const cfg = await loadBeecommConfig();
  if (!cfg) throw new Error('Beecomm not configured');
  const exp = cfg.token_expires ? new Date(cfg.token_expires).getTime() : 0;
  if (cfg.access_token && exp > Date.now() + 60_000) {
    return { token: cfg.access_token as string, base: cfg.api_base_url || BEECOMM_DEFAULT_BASE, cfgId: cfg.id };
  }
  const { token, base } = await beecommAuth(cfg);
  await (prisma as any).beecommConfig.update({
    where: { id: cfg.id },
    data: { access_token: token, token_expires: new Date(Date.now() + 50 * 60 * 1000), active: true },
  });
  return { token, base, cfgId: cfg.id };
}

// Save / update Beecomm credentials (singleton row).
registerFn('beecommSaveConfig', async ({ body }) => {
  const b = (body || {}) as { client_id?: string; client_secret?: string; api_base_url?: string };
  if (!b.client_id || !b.client_secret) throw new Error('client_id and client_secret are required');
  const existing = await loadBeecommConfig();
  const data = {
    client_id: b.client_id.trim(),
    client_secret: b.client_secret.trim(),
    api_base_url: (b.api_base_url || BEECOMM_DEFAULT_BASE).trim(),
    access_token: null,
    token_expires: null,
  };
  if (existing) {
    await (prisma as any).beecommConfig.update({ where: { id: existing.id }, data });
  } else {
    await (prisma as any).beecommConfig.create({ data: { ...data, active: false } });
  }
  return { ok: true };
});

// Test credentials by acquiring a token; persists it on success.
registerFn('beecommTestConnection', async () => {
  const cfg = await loadBeecommConfig();
  if (!cfg) throw new Error('Beecomm not configured — save credentials first');
  try {
    const { token } = await beecommAuth(cfg);
    await (prisma as any).beecommConfig.update({
      where: { id: cfg.id },
      data: { access_token: token, token_expires: new Date(Date.now() + 50 * 60 * 1000), active: true },
    });
    return { ok: true, message: 'מחובר ל-Beecomm בהצלחה' };
  } catch (e: any) {
    await (prisma as any).beecommConfig.update({
      where: { id: cfg.id },
      data: { active: false, access_token: null, token_expires: null },
    });
    return { ok: false, message: String(e?.message || e) };
  }
});

// List customers/branches/POS visible to the authenticated client.
registerFn('beecommGetCustomers', async () => {
  const { token, base } = await ensureBeecommToken();
  const res = await fetch(`${base}/api/v2/services/orderCenter/customers`, {
    method: 'GET',
    headers: { access_token: token },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { result: false, message: text.slice(0, 200) }; }
  if (!res.ok || !json?.result) throw new Error(json?.message || `HTTP ${res.status}`);
  return { ok: true, customers: json.customers || [] };
});

// Read current config status (does NOT expose client_secret).
registerFn('beecommGetStatus', async () => {
  const cfg = await loadBeecommConfig();
  if (!cfg) return { configured: false };
  const exp = cfg.token_expires ? new Date(cfg.token_expires).getTime() : 0;
  return {
    configured: true,
    active: !!cfg.active,
    has_token: !!cfg.access_token,
    token_valid: exp > Date.now(),
    token_expires: cfg.token_expires,
    api_base_url: cfg.api_base_url,
    client_id_masked: cfg.client_id ? `${cfg.client_id.slice(0, 4)}…${cfg.client_id.slice(-4)}` : null,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENT DIGITAL CONTRACT — generation, public signing, listing
// Built from the Word doc Dvir uses as a paper sign-off. Each contract is a
// frozen snapshot of an EventBooking + EventSalesKit at signing time, with a
// customer signature captured on a public, token-protected URL.
// ─────────────────────────────────────────────────────────────────────────────

let eventContractTableReady = false;

// =================== INVENTORY / RECIPES / CASH FLOW ===================
// Idempotent bootstrap. Created here (not via prisma db push) for the same
// reason as EventContract — silent push failures on this project. See memory.
// =================== MULTI-TENANT PLATFORM ===================
// Container-per-tenant architecture. Each new restaurant gets its own
// DB + api container, isolated. The Tenant + ProvisioningJob tables
// live in the MAIN (Alena's) DB and act as the platform registry.
// Owner approves a Signup request via PlatformAdmin → ProvisioningJob
// row goes to 'pending_provisioning' → VPS cron picks it up → runs
// provision-tenant.sh → flips status to 'live' or 'failed'.
let platformTablesReady = false;
async function ensurePlatformTables() {
  if (platformTablesReady) return;
  const sql = (prisma as any).$executeRawUnsafe.bind(prisma);
  await sql(`CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "restaurant_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "subdomain_url" TEXT,
    "db_name" TEXT,
    "container_name" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "provisioned_at" TIMESTAMP(3),
    "live_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status")`);
  // Welcome-delivery tracking columns — added later for observability. Without
  // these, a silent SMS/email/WhatsApp failure leaves ops flying blind. Every
  // welcome attempt writes an outcome per channel so the PlatformAdmin can
  // render green/red dots and the operator KNOWS whether the owner got their
  // credentials or not.
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_at" TIMESTAMP(3)`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_sms_status" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_sms_error" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_email_status" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_email_error" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_wa_status" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_wa_error" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "last_welcome_wa_link" TEXT`);
  await sql(`CREATE TABLE IF NOT EXISTS "ProvisioningJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "log" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "ProvisioningJob_status_idx" ON "ProvisioningJob"("status")`);
  // Onboarding state machine — one row per tenant tracks where they are in
  // the WhatsApp-driven setup conversation. current_step is a slug the
  // handler uses to know which question to send next.
  await sql(`CREATE TABLE IF NOT EXISTS "OnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
    "current_step" TEXT NOT NULL DEFAULT 'welcome',
    "completed_steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "collected_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "OnboardingState_current_step_idx" ON "OnboardingState"("current_step")`);

  // ── Plans (subscription tiers) — Phase 2 plan/feature engine. Global catalog
  // of packages; each defines which OPTIONAL modules are included + hard limits
  // + pricing. Tenant.plan_key assigns a tenant to a plan; per-tenant module
  // overrides live in the tenant's own ModuleSetting rows.
  await sql(`CREATE TABLE IF NOT EXISTS "Plan" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price_monthly" INTEGER NOT NULL DEFAULT 0,
    "price_yearly" INTEGER NOT NULL DEFAULT 0,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "max_users" INTEGER,
    "max_employees" INTEGER,
    "max_whatsapp" INTEGER,
    "modules" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "sub_features" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "sub_features" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "plan_key" TEXT`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "plan_since" TIMESTAMP(3)`);
  await sql(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3)`);
  // Backfill default sub-features for the built-in tiers (only if untouched, so
  // owner edits survive). Pro gets the advanced sub-features; Enterprise all.
  const proSubs = ['sched_advanced', 'emp_performance', 'emp_pay', 'queue_analytics', 'events_contracts', 'club_campaigns', 'fin_accountant'];
  const entSubs = [...proSubs, 'fin_bi'];
  for (const [k, subs] of [['pro', proSubs], ['enterprise', entSubs]] as [string, string[]][]) {
    await sql(
      `UPDATE "Plan" SET sub_features = $1::jsonb, "updatedAt" = NOW()
       WHERE key = $2 AND (sub_features IS NULL OR jsonb_array_length(sub_features) = 0)`,
      JSON.stringify(subs), k,
    ).catch(() => {});
  }
  // Seed the three default tiers (idempotent — ON CONFLICT keeps owner edits).
  const seedPlans = [
    { key: 'basic', name: 'Basic', price_monthly: 199, price_yearly: 1990, trial_days: 14, max_users: 3, max_employees: 15, max_whatsapp: 500, is_default: true, sort_order: 1,
      modules: ['reservations', 'queue', 'checklists', 'waiter'] },
    { key: 'pro', name: 'Pro', price_monthly: 499, price_yearly: 4990, trial_days: 14, max_users: 10, max_employees: 60, max_whatsapp: 3000, is_default: false, sort_order: 2,
      modules: ['reservations', 'queue', 'checklists', 'waiter', 'events', 'delivery', 'restroom_cleaning', 'kitchen_screen', 'customer_club', 'gamification', 'ai_assistant', 'marketing_advisor', 'recruitment', 'financial'] },
    { key: 'enterprise', name: 'Enterprise', price_monthly: 999, price_yearly: 9990, trial_days: 30, max_users: null, max_employees: null, max_whatsapp: null, is_default: false, sort_order: 3,
      modules: ['reservations', 'queue', 'delivery', 'events', 'restroom_cleaning', 'checklists', 'waiter', 'kitchen_screen', 'customer_club', 'gamification', 'ai_assistant', 'ceo_agent', 'marketing_advisor', 'stories', 'recruitment', 'financial'] },
  ];
  for (const p of seedPlans) {
    await sql(
      `INSERT INTO "Plan" ("key","name","price_monthly","price_yearly","trial_days","max_users","max_employees","max_whatsapp","modules","is_default","sort_order","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,NOW())
       ON CONFLICT ("key") DO NOTHING`,
      p.key, p.name, p.price_monthly, p.price_yearly, p.trial_days, p.max_users, p.max_employees, p.max_whatsapp,
      JSON.stringify(p.modules), p.is_default, p.sort_order,
    ).catch((e: any) => console.warn('[plan seed]', p.key, e?.message));
  }
  platformTablesReady = true;
}

// Platform-owner gate. This is DIFFERENT from tenant-owner: only the
// person who owns the entire TopAlena app (Dvir) is a platform_owner.
// Regular restaurant owners get role='owner' inside their own tenant
// schema — they are NOT platform_owners. This distinction is what
// keeps miha's owner from viewing bigizik's tenant list.
//
// Extendable via PLATFORM_OWNER_EMAILS env var (comma-separated) so a
// future co-founder can be added without a code change.
const PLATFORM_OWNER_EMAILS = new Set(
  ['dvirnifusi@gmail.com', ...(process.env.PLATFORM_OWNER_EMAILS || '').split(',')]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
function isSuperAdmin(user: any): boolean {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  return PLATFORM_OWNER_EMAILS.has(email);
}

// PUBLIC-authenticated fn — frontend calls to know whether to show the
// Platform Admin nav item. Zero body, uses the JWT user directly.
registerFn('getMyPlatformInfo', async ({ user }) => {
  return {
    is_platform_owner: isSuperAdmin(user),
    email: (user as any)?.email || null,
  };
});

// PUBLIC — anyone can post a signup. Creates Tenant in pending_approval +
// WhatsApp notifies super-admin with one-tap approve link.
// B — public real-time slug availability check for the signup form.
// Returns { available: bool, reason: string | null }. Reasons: 'format',
// 'reserved', 'taken'. Never leaks other tenant data.
registerFn('slugAvailable', async ({ body }) => {
  await ensurePlatformTables();
  const b = (body || {}) as any;
  const slug = String(b.slug || '').toLowerCase().trim();
  if (!slug) return { available: false, reason: 'empty' };
  if (!/^[a-z][a-z0-9-]{2,29}$/.test(slug)) return { available: false, reason: 'format' };
  const reserved = ['www', 'admin', 'signup', 'api', 'app', 'mail', 'ftp', 'topalena', 'alena', 'platform', 'meta', 'static'];
  if (reserved.includes(slug)) return { available: false, reason: 'reserved' };
  const rows: any[] = await (prisma as any).$queryRawUnsafe(`SELECT 1 FROM "Tenant" WHERE slug = $1 LIMIT 1`, slug);
  if (rows.length) return { available: false, reason: 'taken' };
  return { available: true, reason: null };
}, { public: true });

registerFn('requestTenantSignup', async ({ body }) => {
  await ensurePlatformTables();
  const b = (body || {}) as any;
  const slug = String(b.slug || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '').slice(0, 30);
  const restaurantName = String(b.restaurant_name || '').trim();
  const ownerName = String(b.owner_name || '').trim();
  const ownerPhone = String(b.owner_phone || '').trim();
  const ownerEmail = String(b.owner_email || '').trim().toLowerCase();
  if (!slug || !/^[a-z][a-z0-9-]{2,}$/.test(slug)) throw new Error('סלוג לא תקין — אותיות אנגליות, מספרים ומקפים בלבד, להתחיל באות');
  if (!restaurantName || !ownerName || !ownerPhone || !ownerEmail) throw new Error('כל השדות חובה');

  // Reserved slugs
  const reserved = ['www', 'admin', 'signup', 'api', 'app', 'mail', 'ftp', 'topalena', 'alena', 'platform', 'meta', 'static'];
  if (reserved.includes(slug)) throw new Error(`סלוג "${slug}" שמור — בחר אחר`);

  const exists: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id FROM "Tenant" WHERE slug = $1`, slug);
  if (exists.length) throw new Error(`הסלוג "${slug}" כבר תפוס`);

  const tenantId = randomUUID();
  const subdomainUrl = `https://${slug}.topalena.com`;
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "Tenant"("id","slug","restaurant_name","owner_name","owner_phone","owner_email","status","subdomain_url","db_name","container_name")
     VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', $7, $8, $9)`,
    tenantId, slug, restaurantName, ownerName, ownerPhone, ownerEmail,
    subdomainUrl, `topalena_${slug}`, `tenant-${slug}-api`,
  );

  const approvePageUrl = `${APP_BASE_URL || 'https://topalena.com'}/PlatformAdmin`;

  // Fire the three notifications in parallel — none should block the
  // signup response.

  // 1) Confirmation email to the signup submitter. They just gave us
  // their email; they need SOMETHING in their inbox proving the form
  // went through, or they'll think it silently failed and refresh-spam.
  try {
    const { sendEmail } = await import('../lib/email.js');
    await sendEmail({
      to: ownerEmail,
      subject: `בקשת ההרשמה של ${restaurantName} התקבלה 🌿`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;padding:24px;max-width:600px;margin:auto;background:#FAF5E8;border-radius:12px;color:#333">
        <h1 style="color:#A04A2E;margin:0 0 12px">✅ בקשתך התקבלה!</h1>
        <p>שלום ${ownerName},</p>
        <p>קיבלנו את בקשת ההרשמה של <strong>${restaurantName}</strong> ל-TOP APOLLO. הצוות שלנו יבדוק את הפרטים ויאשר תוך 24 שעות.</p>
        <div style="background:white;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #ddd">
          <div style="font-weight:bold;margin-bottom:8px">🔗 הכתובת שלך תהיה:</div>
          <div style="font-size:18px;color:#A04A2E;font-weight:bold">${subdomainUrl}</div>
          <div style="color:#888;font-size:12px;margin-top:8px">(תפעל אחרי שנאשר את הבקשה)</div>
        </div>
        <p>אחרי האישור תקבל בסמס ובוואטסאפ:</p>
        <ul>
          <li>שם משתמש וסיסמה זמנית</li>
          <li>קישור לפתיחת שיחה עם הסוכן החכם שיעזור לך להקים את המסעדה שלב-שלב</li>
        </ul>
        <p style="margin-top:24px;color:#666;font-size:13px">בהצלחה 🌿<br>צוות TOP APOLLO</p>
      </div>`,
    });
  } catch (e: any) {
    console.warn('[signup] customer email failed', e?.message);
  }

  // 2) Admin email notification — email is the most reliable channel
  // for admin alerts because it doesn't require an open WhatsApp
  // session and doesn't get swallowed by phone silence-mode. Sent to
  // every platform_owner email so any co-founder gets pinged too.
  try {
    const { sendEmail } = await import('../lib/email.js');
    const adminEmails = Array.from(PLATFORM_OWNER_EMAILS);
    if (adminEmails.length) {
      await sendEmail({
        to: adminEmails,
        subject: `🌟 רישום חדש: ${restaurantName} (${slug})`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;padding:24px;max-width:600px;margin:auto;background:#FAF5E8;border-radius:12px;color:#333">
          <h1 style="color:#A04A2E;margin:0 0 12px">🌟 בקשת רישום חדשה</h1>
          <div style="background:white;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #ddd">
            <div style="margin-bottom:6px"><strong>🍽 מסעדה:</strong> ${restaurantName}</div>
            <div style="margin-bottom:6px"><strong>🏷 סלוג:</strong> <code>${slug}</code></div>
            <div style="margin-bottom:6px"><strong>👤 בעלים:</strong> ${ownerName}</div>
            <div style="margin-bottom:6px"><strong>📱 טלפון:</strong> <a href="tel:${ownerPhone}" style="color:#A04A2E">${ownerPhone}</a></div>
            <div style="margin-bottom:6px"><strong>✉️ מייל:</strong> <a href="mailto:${ownerEmail}" style="color:#A04A2E">${ownerEmail}</a></div>
            <div><strong>🔗 כתובת עתידית:</strong> ${subdomainUrl}</div>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${approvePageUrl}" style="display:inline-block;background:#A04A2E;color:white;padding:14px 32px;border-radius:32px;text-decoration:none;font-weight:bold">
              👉 אשר או דחה ב-PlatformAdmin
            </a>
          </div>
        </div>`,
      });
    }
  } catch (e: any) {
    console.warn('[signup] admin email failed', e?.message);
  }

  // 3) Admin WhatsApp — keeps existing behavior as a redundant channel.
  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (adminNumbers.length) {
    const { sendWhatsApp } = await import('../lib/twilio.js');
    const waMsg = `🌟 *בקשת רישום חדשה למערכת*\n\n` +
      `🍽 מסעדה: ${restaurantName}\n` +
      `👤 בעלים: ${ownerName}\n` +
      `📱 טלפון: ${ownerPhone}\n` +
      `✉️ אימייל: ${ownerEmail}\n` +
      `🔗 כתובת: ${subdomainUrl}\n\n` +
      `אישור/דחייה: ${approvePageUrl}`;
    for (const p of adminNumbers) {
      try { await sendWhatsApp(p, waMsg); } catch (e: any) { console.warn('[signup] wa notify failed', e?.message); }
    }
  }

  // 4) Admin Pushover — the most reliable "wake you up now" channel.
  try {
    const { pushoverToAdmins } = await import('../lib/pushover.js');
    await pushoverToAdmins(`🌟 רישום חדש: ${restaurantName}`, `${ownerName} (${ownerPhone}) — סלוג: ${slug}. אשר ב-PlatformAdmin`);
  } catch (e: any) {
    console.warn('[signup] pushover notify failed', e?.message);
  }

  return { ok: true, tenant_id: tenantId, status: 'pending_approval' };
}, { public: true });

// SUPER-ADMIN — approve a pending tenant. Creates a ProvisioningJob and
// flips Tenant.status to 'pending_provisioning'. VPS cron picks it up.
registerFn('approveTenant', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, status, slug, owner_phone FROM "Tenant" WHERE id = $1`, b.tenant_id,
  );
  if (!rows.length) throw new Error('Tenant not found');
  if (rows[0].status !== 'pending_approval') throw new Error(`Tenant is in status ${rows[0].status} — cannot approve`);
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET status = 'pending_provisioning', approved_by = $1, approved_at = NOW(), "updatedAt" = NOW() WHERE id = $2`,
    (user as any).email || (user as any).id, b.tenant_id,
  );
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "ProvisioningJob"("id","tenant_id","status") VALUES ($1, $2, 'pending')`,
    randomUUID(), b.tenant_id,
  );
  return { ok: true };
});

registerFn('rejectTenant', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET status = 'rejected', rejected_reason = $1, "updatedAt" = NOW() WHERE id = $2`,
    String(b.reason || ''), b.tenant_id,
  );
  return { ok: true };
});

// SUPER-ADMIN — edit a tenant's owner details (name / phone / email). Used to
// test onboarding with your own phone, then hand the tenant to the real owner
// by swapping the phone. Onboarding + welcome follow owner_phone, so after a
// change you can re-send credentials / restart onboarding to the new number.
registerFn('updateTenantOwner', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;
  if (typeof b.owner_name === 'string' && b.owner_name.trim()) { sets.push(`owner_name = $${i++}`); args.push(b.owner_name.trim()); }
  if (typeof b.owner_phone === 'string' && b.owner_phone.trim()) { sets.push(`owner_phone = $${i++}`); args.push(b.owner_phone.trim()); }
  if (typeof b.owner_email === 'string' && b.owner_email.trim()) { sets.push(`owner_email = $${i++}`); args.push(b.owner_email.trim().toLowerCase()); }
  if (!sets.length) throw new Error('nothing to update');
  args.push(b.tenant_id);
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${i}`,
    ...args,
  );
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT owner_name, owner_phone, owner_email FROM "Tenant" WHERE id = $1`, b.tenant_id,
  );
  return { ok: true, owner: rows[0] || null };
});

registerFn('listTenants', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  const status = b.status ? String(b.status) : null;
  const where = status ? `WHERE status = '${status.replace(/'/g, "''")}'` : '';
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, owner_name, owner_phone, owner_email,
            status, subdomain_url, approved_at, live_at, plan_key, trial_ends_at, "createdAt" AS created_at
     FROM "Tenant" ${where} ORDER BY "createdAt" DESC LIMIT 200`,
  );
  return { tenants: rows };
});

// SUPER-ADMIN — Cross-tenant aggregated metrics. Iterates over every live
// tenant schema and queries the same handful of tables (User, Employee,
// ShiftTracking, EventContract, Invoice) — returns platform totals plus a
// per-tenant breakdown. Safe on missing tables per tenant (catch each).
// Get onboarding progress for the current caller's tenant. Public because
// the calling context is the tenant's own app, which uses schema='tenant_X'.
// We look up the tenant by slug (via TENANT_SLUG env var set at provision).
// SUPER-ADMIN — manually (re)start the onboarding conversation for a
// tenant. Wipes existing state + sends the welcome WhatsApp. Useful for
// tenants provisioned before the onboarding agent existed (like Miha).
registerFn('restartTenantOnboarding', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  // Wipe any existing state
  await (prisma as any).$executeRawUnsafe(
    `DELETE FROM "OnboardingState" WHERE tenant_id = $1`, b.tenant_id,
  );
  const { startOnboarding } = await import('../lib/whatsappOnboarding.js');
  await startOnboarding(b.tenant_id);
  return { ok: true, message: 'Onboarding conversation restarted' };
});

registerFn('getMyOnboardingStatus', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  await ensurePlatformTables();
  const slug = process.env.TENANT_SLUG || 'alena';
  const tenantRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, restaurant_name FROM "Tenant" WHERE slug = $1`, slug,
  );
  if (!tenantRows.length) return { onboarding: null, is_main: slug === 'alena' };
  const stateRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT current_step, completed_steps, collected_data, started_at, completed_at
     FROM "OnboardingState" WHERE tenant_id = $1`,
    tenantRows[0].id,
  );
  if (!stateRows.length) return { onboarding: null };
  const s = stateRows[0];
  const totalSteps = 7; // welcome + name + address + hours + cuisine + employees + menu
  const done = Array.isArray(s.completed_steps) ? s.completed_steps.length : 0;
  return {
    onboarding: {
      current_step: s.current_step,
      completed_steps: s.completed_steps,
      collected_data: s.collected_data,
      progress_percent: Math.round((done / totalSteps) * 100),
      started_at: s.started_at,
      completed_at: s.completed_at,
      is_done: s.current_step === 'done',
    },
  };
});

registerFn('getSuperAdminMetrics', async ({ user }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const tenants: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, owner_phone, owner_email, status,
            last_welcome_at, last_welcome_sms_status, last_welcome_sms_error,
            last_welcome_email_status, last_welcome_email_error,
            last_welcome_wa_status, last_welcome_wa_error, last_welcome_wa_link
     FROM "Tenant" WHERE status = 'live' ORDER BY "createdAt" ASC`,
  );

  // Onboarding progress (public.OnboardingState, keyed by tenant_id). Onboarding
  // v4 tracks core fields + optional modules in collected_data, so estimate a
  // percentage from filled core fields + modules handled.
  const onbByTenant: Record<string, any> = {};
  try {
    const onbRows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT tenant_id, current_step, collected_data, last_message_at FROM "OnboardingState"`,
    );
    for (const o of onbRows) onbByTenant[o.tenant_id] = o;
  } catch { /* table may not exist yet */ }
  const onbProgress = (o: any) => {
    if (!o) return null;
    const step = o.current_step;
    if (step === 'done') return { progress_percent: 100, current_step: 'done', last_message_at: o.last_message_at };
    let d = o.collected_data || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    const core = ['name', 'address', 'opening_hours', 'cuisine'].filter((k) => d[k]).length;
    const doneMods = Array.isArray(d._done_modules) ? d._done_modules.length : 0;
    const counts = d._counts || {};
    const filledCounts = Object.values(counts).filter((v: any) => Number(v) > 0).length;
    const modules = Math.max(doneMods, filledCounts);
    const pct = step === 'welcome' && core === 0 ? 0 : Math.min(99, Math.round(((core + modules) / 15) * 100));
    return { progress_percent: pct, current_step: step, last_message_at: o.last_message_at };
  };

  const perTenant: any[] = [];
  let totalUsers = 0;
  let totalEmployees = 0;
  let totalActiveShifts = 0;
  let totalContractRevenue = 0;
  let totalUnpaidInvoices = 0;

  for (const t of tenants) {
    const schema = `tenant_${t.slug}`;
    const row: any = {
      id: t.id, slug: t.slug, name: t.restaurant_name,
      owner_phone: t.owner_phone, owner_email: t.owner_email,
      onboarding: onbProgress(onbByTenant[t.id]),
      last_welcome_at: t.last_welcome_at,
      welcome: {
        sms: { status: t.last_welcome_sms_status, error: t.last_welcome_sms_error },
        email: { status: t.last_welcome_email_status, error: t.last_welcome_email_error },
        whatsapp: { status: t.last_welcome_wa_status, error: t.last_welcome_wa_error },
        wa_link: t.last_welcome_wa_link,
      },
    };
    try {
      const r: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM "${schema}"."User") AS users,
           (SELECT COUNT(*)::int FROM "${schema}"."Employee" WHERE status = 'active') AS employees,
           (SELECT COUNT(*)::int FROM "${schema}"."ShiftTracking" WHERE status IN ('active', 'on_break')) AS active_shifts,
           (SELECT COALESCE(SUM(subtotal_ils), 0)::int FROM "${schema}"."EventContract" WHERE status = 'signed') AS contract_revenue,
           (SELECT COUNT(*)::int FROM "${schema}"."Invoice" WHERE payment_status = 'unpaid') AS unpaid_invoices`,
      );
      row.users = r[0]?.users || 0;
      row.employees = r[0]?.employees || 0;
      row.active_shifts = r[0]?.active_shifts || 0;
      row.contract_revenue = r[0]?.contract_revenue || 0;
      row.unpaid_invoices = r[0]?.unpaid_invoices || 0;
    } catch (e: any) {
      // Tenant schema may be missing tables during provisioning — mark unavailable.
      row.error = String(e?.message || 'schema query failed').slice(0, 120);
      row.users = row.employees = row.active_shifts = 0;
      row.contract_revenue = row.unpaid_invoices = 0;
    }
    totalUsers += row.users;
    totalEmployees += row.employees;
    totalActiveShifts += row.active_shifts;
    totalContractRevenue += row.contract_revenue;
    totalUnpaidInvoices += row.unpaid_invoices;
    perTenant.push(row);
  }

  // Also include the main Alena DB (public schema) — that's YOUR restaurant.
  try {
    const r: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT
         (SELECT COUNT(*)::int FROM "public"."User") AS users,
         (SELECT COUNT(*)::int FROM "public"."Employee" WHERE status = 'active') AS employees,
         (SELECT COUNT(*)::int FROM "public"."ShiftTracking" WHERE status IN ('active', 'on_break')) AS active_shifts,
         (SELECT COALESCE(SUM(subtotal_ils), 0)::int FROM "public"."EventContract" WHERE status = 'signed') AS contract_revenue,
         (SELECT COUNT(*)::int FROM "public"."Invoice" WHERE payment_status = 'unpaid') AS unpaid_invoices`,
    );
    const alena = {
      id: 'alena-main',
      slug: 'alena',
      name: 'עלינא (הבסיסית)',
      users: r[0]?.users || 0,
      employees: r[0]?.employees || 0,
      active_shifts: r[0]?.active_shifts || 0,
      contract_revenue: r[0]?.contract_revenue || 0,
      unpaid_invoices: r[0]?.unpaid_invoices || 0,
      is_main: true,
    };
    perTenant.unshift(alena);
    totalUsers += alena.users;
    totalEmployees += alena.employees;
    totalActiveShifts += alena.active_shifts;
    totalContractRevenue += alena.contract_revenue;
    totalUnpaidInvoices += alena.unpaid_invoices;
  } catch (e: any) {
    console.warn('[super-admin] alena main query failed', e?.message);
  }

  return {
    tenant_count: tenants.length + 1, // +1 for Alena
    totals: {
      users: totalUsers,
      employees: totalEmployees,
      active_shifts: totalActiveShifts,
      contract_revenue: totalContractRevenue,
      unpaid_invoices: totalUnpaidInvoices,
    },
    per_tenant: perTenant,
  };
});

// ── Phase 2: plan / feature engine ─────────────────────────────────────────
// The optional (non-core) module catalog the Plan Builder toggles per plan.
const optionalModuleDefs = () => MODULE_CATALOG.filter((m) => !m.core).map((m) => ({
  key: m.key, name_he: m.name_he, category: m.category, icon: m.icon,
}));

registerFn('listPlans', async ({ user }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const plans: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT key, name, price_monthly, price_yearly, trial_days, max_users, max_employees, max_whatsapp,
            modules, sub_features, is_default, active, sort_order
     FROM "Plan" ORDER BY sort_order ASC, price_monthly ASC`,
  );
  // How many live tenants are on each plan (default plan covers the unassigned).
  const counts: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT COALESCE(plan_key, '(none)') AS k, COUNT(*)::int AS n FROM "Tenant" WHERE status = 'live' GROUP BY plan_key`,
  );
  const countBy: Record<string, number> = {};
  for (const c of counts) countBy[c.k] = c.n;
  return {
    plans: plans.map((p) => ({
      ...p,
      modules: Array.isArray(p.modules) ? p.modules : [],
      sub_features: Array.isArray(p.sub_features) ? p.sub_features : [],
      tenant_count: countBy[p.key] || 0,
    })),
    unassigned: countBy['(none)'] || 0,
    catalog: optionalModuleDefs(),
    sub_catalog: SUB_FEATURE_CATALOG.map((s) => ({
      ...s, module_name: MODULE_CATALOG.find((m) => m.key === s.module_key)?.name_he || s.module_key,
    })),
  };
});

registerFn('upsertPlan', async ({ user, key, name, price_monthly, price_yearly, trial_days, max_users, max_employees, max_whatsapp, modules, sub_features, is_default, active }: any) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const planKey = String(key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!planKey) throw new Error('missing plan key');
  const validKeys = new Set(MODULE_CATALOG.filter((m) => !m.core).map((m) => m.key));
  const mods = (Array.isArray(modules) ? modules : []).filter((k: string) => validKeys.has(k));
  const validSubKeys = new Set(SUB_FEATURE_CATALOG.map((s) => s.key));
  const subs = (Array.isArray(sub_features) ? sub_features : []).filter((k: string) => validSubKeys.has(k));
  const nInt = (v: any) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.floor(Number(v)) || 0));
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "Plan" ("key","name","price_monthly","price_yearly","trial_days","max_users","max_employees","max_whatsapp","modules","sub_features","is_default","active","sort_order","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,NOW())
     ON CONFLICT ("key") DO UPDATE SET
       name=$2, price_monthly=$3, price_yearly=$4, trial_days=$5,
       max_users=$6, max_employees=$7, max_whatsapp=$8, modules=$9::jsonb,
       sub_features=$10::jsonb, is_default=$11, active=$12, "updatedAt"=NOW()`,
    planKey, String(name || planKey), nInt(price_monthly) || 0, nInt(price_yearly) || 0, nInt(trial_days) ?? 14,
    nInt(max_users), nInt(max_employees), nInt(max_whatsapp), JSON.stringify(mods), JSON.stringify(subs),
    !!is_default, active === undefined ? true : !!active, 99,
  );
  // Only one default plan.
  if (is_default) {
    await (prisma as any).$executeRawUnsafe(`UPDATE "Plan" SET is_default=false WHERE key <> $1`, planKey);
  }
  return { ok: true, key: planKey };
});

// Assign a plan to a tenant and MATERIALISE its modules into that tenant's
// ModuleSetting rows (so the tenant app's existing getMyTenantModules keeps
// working with zero cross-schema reads at request time). Manual toggles made
// afterwards act as per-tenant overrides until the plan is re-assigned.
registerFn('assignTenantPlan', async ({ user, tenant_id, plan_key }: any) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug FROM "Tenant" WHERE id = $1`, tenant_id,
  );
  const tenant = rows[0];
  if (!tenant) throw new Error('tenant not found');
  const planRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT key, modules, sub_features, trial_days FROM "Plan" WHERE key = $1 AND active = true`, plan_key,
  );
  const plan = planRows[0];
  if (!plan) throw new Error('plan not found');
  const planModules: string[] = Array.isArray(plan.modules) ? plan.modules : [];
  const planSubs: string[] = Array.isArray(plan.sub_features) ? plan.sub_features : [];

  const schema = `tenant_${tenant.slug}`;
  const { randomUUID } = await import('node:crypto');
  // Ensure the per-tenant ModuleSetting table exists (older tenants may lack it).
  await (prisma as any).$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."ModuleSetting" (
       "id" TEXT NOT NULL PRIMARY KEY,
       "module_key" TEXT NOT NULL UNIQUE,
       "enabled" BOOLEAN NOT NULL DEFAULT true,
       "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  ).catch(() => {});
  let materialised = 0;
  // Materialise both modules AND sub-features into ModuleSetting (distinct keys
  // coexist in the same table). enabled = the plan includes that key.
  const featureRows: Array<{ key: string; on: boolean }> = [
    ...MODULE_CATALOG.filter((mm) => !mm.core).map((m) => ({ key: m.key, on: planModules.includes(m.key) })),
    ...SUB_FEATURE_CATALOG.map((s) => ({ key: s.key, on: planSubs.includes(s.key) })),
  ];
  for (const f of featureRows) {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "${schema}"."ModuleSetting" ("id","module_key","enabled","enabled_at","createdAt","updatedAt")
       VALUES ($1,$2,$3,NOW(),NOW(),NOW())
       ON CONFLICT ("module_key") DO UPDATE SET enabled=$3, enabled_at=NOW(), "updatedAt"=NOW()`,
      randomUUID(), f.key, f.on,
    ).then(() => { materialised++; }).catch((e: any) => console.warn('[assignPlan]', f.key, e?.message));
  }
  // Snapshot the plan into the tenant's OWN schema so the tenant app can render
  // the paywall (locked features + "available in X") with no cross-schema read.
  // unlock_map: for each optional module NOT in this plan, the cheapest active
  // plan that DOES include it → the upsell target shown to the owner.
  const allPlans: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT key, name, price_monthly, modules, sub_features FROM "Plan" WHERE active = true ORDER BY price_monthly ASC`,
  );
  const unlockMap: Record<string, string> = {};
  for (const m of MODULE_CATALOG.filter((mm) => !mm.core)) {
    if (planModules.includes(m.key)) continue;
    const cheapest = allPlans.find((pl) => Array.isArray(pl.modules) && pl.modules.includes(m.key));
    if (cheapest) unlockMap[m.key] = cheapest.name;
  }
  for (const s of SUB_FEATURE_CATALOG) {
    if (planSubs.includes(s.key)) continue;
    const cheapest = allPlans.find((pl) => Array.isArray(pl.sub_features) && pl.sub_features.includes(s.key));
    if (cheapest) unlockMap[s.key] = cheapest.name;
  }
  const planName = allPlans.find((pl) => pl.key === plan_key)?.name || plan_key;
  await (prisma as any).$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."TenantPlanInfo" (
       "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
       "plan_key" TEXT, "plan_name" TEXT, "modules" JSONB NOT NULL DEFAULT '[]'::jsonb,
       "sub_features" JSONB NOT NULL DEFAULT '[]'::jsonb,
       "unlock_map" JSONB NOT NULL DEFAULT '{}'::jsonb,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "TenantPlanInfo_singleton" CHECK ("id" = 1)
     )`,
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(`ALTER TABLE "${schema}"."TenantPlanInfo" ADD COLUMN IF NOT EXISTS "sub_features" JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "${schema}"."TenantPlanInfo" ("id","plan_key","plan_name","modules","sub_features","unlock_map","updatedAt")
     VALUES (1,$1,$2,$3::jsonb,$4::jsonb,$5::jsonb,NOW())
     ON CONFLICT ("id") DO UPDATE SET plan_key=$1, plan_name=$2, modules=$3::jsonb, sub_features=$4::jsonb, unlock_map=$5::jsonb, "updatedAt"=NOW()`,
    plan_key, planName, JSON.stringify(planModules), JSON.stringify(planSubs), JSON.stringify(unlockMap),
  ).catch((e: any) => console.warn('[assignPlan snapshot]', e?.message));

  const trialDays = Number(plan.trial_days) || 0;
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET plan_key = $1, plan_since = NOW(),
       trial_ends_at = ${trialDays > 0 ? `NOW() + INTERVAL '${trialDays} days'` : 'NULL'},
       "updatedAt" = NOW()
     WHERE id = $2`,
    plan_key, tenant_id,
  );
  return { ok: true, tenant_id, plan_key, modules_materialised: materialised };
});

// ── Phase 4: billing / MRR overview (revenue is DERIVED from plan prices ×
// live tenants — no external billing provider wired yet; that step needs the
// owner's Stripe/Meshulam account, flagged in the UI).
registerFn('getPlatformBilling', async ({ user }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const plans: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT key, name, price_monthly, price_yearly, is_default FROM "Plan" WHERE active = true ORDER BY price_monthly ASC`,
  );
  const planByKey: Record<string, any> = {};
  for (const p of plans) planByKey[p.key] = p;
  const defaultPlan = plans.find((p) => p.is_default) || null;

  const tenants: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, plan_key, plan_since, trial_ends_at, live_at
     FROM "Tenant" WHERE status = 'live' ORDER BY "createdAt" ASC`,
  );
  const now = Date.now();
  const soon = now + 7 * 24 * 60 * 60 * 1000;
  let activeMrr = 0, potentialMrr = 0, trialing = 0, trialsExpiring = 0, unassigned = 0;
  const byPlan: Record<string, { key: string; name: string; price_monthly: number; count: number; mrr: number }> = {};
  for (const p of plans) byPlan[p.key] = { key: p.key, name: p.name, price_monthly: p.price_monthly, count: 0, mrr: 0 };

  const rows = tenants.map((t) => {
    const plan = t.plan_key ? planByKey[t.plan_key] : defaultPlan;
    if (!t.plan_key) unassigned++;
    const price = plan ? Number(plan.price_monthly) || 0 : 0;
    const onTrial = t.trial_ends_at && new Date(t.trial_ends_at).getTime() > now;
    if (onTrial) { trialing++; if (new Date(t.trial_ends_at).getTime() <= soon) trialsExpiring++; }
    potentialMrr += price;
    if (!onTrial && plan) activeMrr += price;
    if (plan && byPlan[plan.key]) { byPlan[plan.key].count++; byPlan[plan.key].mrr += onTrial ? 0 : price; }
    return {
      id: t.id, slug: t.slug, name: t.restaurant_name,
      plan_key: t.plan_key || null, plan_name: plan?.name || null, price_monthly: price,
      on_trial: !!onTrial, trial_ends_at: t.trial_ends_at || null, plan_since: t.plan_since || null,
    };
  });

  return {
    active_mrr: activeMrr,
    potential_mrr: potentialMrr,
    active_arr: activeMrr * 12,
    trialing,
    trials_expiring_7d: trialsExpiring,
    unassigned,
    live_count: tenants.length,
    by_plan: Object.values(byPlan),
    tenants: rows,
    billing_provider_connected: false, // Stripe/Meshulam not wired — see UI note
  };
});

// Self-healing schema sync — creates in tenant_<slug> every table that
// exists in public but is missing there. pg_dump during provisioning is
// best-effort and has silently skipped tables more than once (zohara,
// hamara); this runs INSIDE the API via plain SQL so no shell, no SSH,
// no dump pipeline. `LIKE ... INCLUDING ALL` copies columns, defaults,
// indexes and constraints; cross-schema FKs are intentionally not copied.
// Idempotent and cheap when nothing is missing.
async function syncTenantSchemaFromPublic(slug: string): Promise<string[]> {
  const schema = `tenant_${slug}`;
  await (prisma as any).$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  const missing: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.tables x
         WHERE x.table_schema = $1 AND x.table_name = t.table_name
       )`,
    schema,
  );
  const created: string[] = [];
  for (const row of missing) {
    const name = String(row.table_name || '');
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    try {
      await (prisma as any).$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${schema}"."${name}" (LIKE "public"."${name}" INCLUDING ALL)`,
      );
      created.push(name);
    } catch (e: any) {
      console.warn(`[schemaSync] ${schema}.${name} failed:`, e?.message);
    }
  }
  if (created.length) console.log(`[schemaSync] ${schema}: created ${created.length} tables`, created.slice(0, 10));
  return created;
}

// Shared helper — sends the welcome (SMS + email + WhatsApp best-effort),
// seeds the owner user, records outcome per channel to the Tenant row.
// Used by BOTH resendTenantWelcome (admin button) AND reportProvisioningResult
// (auto-fired at the end of provisioning) so the dots in PlatformAdmin
// always reflect the last attempt regardless of source.
async function sendWelcomeForTenant(tenantId: string): Promise<any> {
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, owner_name, owner_phone, owner_email, subdomain_url, status
     FROM "Tenant" WHERE id = $1`,
    tenantId,
  );
  if (!rows.length) throw new Error('Tenant not found');
  const t = rows[0];
  if (!t.owner_phone) throw new Error('Tenant has no owner_phone');
  // Self-heal BEFORE anything touches tenant tables — the User upsert
  // below and every page the owner opens right after need the full set.
  await syncTenantSchemaFromPublic(t.slug).catch((e) =>
    console.warn('[welcome] schema sync failed:', e?.message),
  );
  const brandDisplay = t.restaurant_name || t.slug;
  const link = t.subdomain_url || `https://${t.slug}.topalena.com`;
  const waFromNumber = String(process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:\+?/, '').replace(/[^\d]/g, '');
  const ownerFirstName = String(t.owner_name || '').split(/\s+/)[0] || '';
  const opener = `היי, אני ${ownerFirstName || 'הבעלים של'} ${brandDisplay}. אני רוצה להתחיל להקים את המסעדה שלי במערכת 🚀`;
  const waLink = waFromNumber ? `https://wa.me/${waFromNumber}?text=${encodeURIComponent(opener)}` : '';

  // Fresh temp password + seed user (idempotent — update-then-insert).
  // NOT "ON CONFLICT (email)": partially-provisioned schemas have been seen
  // missing the unique email index, which makes ON CONFLICT throw
  // "no unique or exclusion constraint matching the ON CONFLICT
  // specification" and the whole seed silently fail (hamara got a welcome
  // message with "❌ יצירת המשתמש נכשלה" because of exactly this).
  const tempPassword = `TopApollo-${Math.floor(1000 + Math.random() * 9000)}`;
  let credsLine = 'צור/צרי משתמש בעצמך בטופס הרשמה.';
  let seedError: string | null = null;
  if (t.owner_email) {
    try {
      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash(tempPassword, 10);
      const schema = `tenant_${t.slug}`;
      const emailLc = String(t.owner_email).toLowerCase();
      const updated: number = await (prisma as any).$executeRawUnsafe(
        `UPDATE "${schema}"."User" SET "passwordHash" = $1, "role" = 'owner', "updatedAt" = NOW()
         WHERE lower("email") = $2`,
        hash, emailLc,
      );
      if (!updated) {
        await (prisma as any).$executeRawUnsafe(
          `INSERT INTO "${schema}"."User" ("id", "email", "passwordHash", "role", "fullName", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'owner', $4, NOW(), NOW())`,
          randomUUID(), emailLc, hash, t.owner_name || '',
        );
      }
      // Best-effort: restore the unique index for future upsert-style code.
      await (prisma as any).$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "${schema}"."User"("email")`,
      ).catch(() => {});
      credsLine = `📧 מייל: ${t.owner_email}\n🔑 סיסמה זמנית: *${tempPassword}*\n(שנה/י אותה אחרי הכניסה הראשונה)`;
    } catch (e: any) {
      seedError = String(e?.message || 'seed_failed').slice(0, 300);
      console.warn('[welcome] user seed failed', seedError);
      credsLine = `❌ יצירת המשתמש נכשלה. פנה לתמיכה.`;
    }
  }
  const credsLinePlain = credsLine.replace(/\*/g, '');
  const startLine = waLink ? `\n\n👉 להתחלת הקמה עם הסוכן החכם: ${waLink}` : '';
  const smsMsg = `🎉 ${brandDisplay} - המערכת שלך מוכנה!\n${link}\n${credsLinePlain}${startLine}`;
  const waMsg = `🎉 *${brandDisplay}* — המערכת שלך מוכנה!\n\n🔗 כתובת: ${link}\n\n${credsLine}\n\nתוך רגע אני אכתוב לך שוב כדי לעזור לך להקים את המסעדה שלב-שלב 🚀`;
  const emailHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;padding:24px;max-width:600px;margin:auto;background:#FAF5E8;border-radius:12px;color:#333">
      <h1 style="color:#A04A2E;margin:0 0 8px">🎉 ${brandDisplay} — המערכת שלך מוכנה!</h1>
      <p style="margin:16px 0 8px">שלום ${t.owner_name || ''},</p>
      <p>המערכת של <strong>${brandDisplay}</strong> הותקנה בהצלחה. הכתובת הפרטית שלך:</p>
      <p style="margin:12px 0"><a href="${link}" style="color:#A04A2E;font-weight:bold;font-size:18px">${link}</a></p>
      <div style="background:white;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #ddd">
        <div style="font-weight:bold;margin-bottom:8px">🔐 פרטי הכניסה שלך:</div>
        <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${credsLinePlain}</pre>
      </div>
      ${waLink ? `<div style="background:#25D366;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
        <div style="color:white;font-weight:bold;font-size:16px;margin-bottom:12px">💬 להתחיל להקים את המסעדה — לחיצה אחת</div>
        <a href="${waLink}" style="display:inline-block;background:white;color:#075E54;padding:14px 32px;border-radius:32px;text-decoration:none;font-weight:bold;font-size:16px">📱 פתח וואטסאפ עם הסוכן</a>
      </div>` : ''}
      <p style="margin:24px 0 8px;color:#666;font-size:13px">בהצלחה! 🌿<br>צוות TOP APOLLO</p>
    </div>`;

  const { sendWhatsApp, sendSms } = await import('../lib/twilio.js');
  const { sendEmail } = await import('../lib/email.js');
  const results: any = {};
  try { results.sms = await sendSms(t.owner_phone, smsMsg); }
  catch (e: any) { results.sms_error = e?.message || 'sms_failed'; }
  if (t.owner_email) {
    try { results.email = await sendEmail({ to: t.owner_email, subject: `${brandDisplay} — המערכת מוכנה! פרטי כניסה בפנים`, html: emailHtml }); }
    catch (e: any) { results.email_error = e?.message || 'email_failed'; }
  } else {
    results.email_error = 'no_email_on_file';
  }
  try { results.whatsapp = await sendWhatsApp(t.owner_phone, waMsg); }
  catch (e: any) { results.whatsapp_error = e?.message || 'whatsapp_blocked_no_session'; }

  const smsStatus = results.sms_error ? 'failed' : (results.sms?.skipped ? 'skipped' : 'sent');
  const emailStatus = results.email_error ? 'failed' : (results.email?.skipped ? 'skipped' : 'sent');
  const waStatus = results.whatsapp_error ? 'failed' : (results.whatsapp?.skipped ? 'skipped' : 'sent');

  try {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Tenant" SET
         last_welcome_at = NOW(),
         last_welcome_sms_status = $2, last_welcome_sms_error = $3,
         last_welcome_email_status = $4, last_welcome_email_error = $5,
         last_welcome_wa_status = $6, last_welcome_wa_error = $7,
         last_welcome_wa_link = $8, "updatedAt" = NOW()
       WHERE id = $1`,
      tenantId,
      smsStatus, results.sms_error || null,
      emailStatus, results.email_error || null,
      waStatus, results.whatsapp_error || null,
      waLink || null,
    );
  } catch (e: any) {
    console.warn('[welcome] status persist failed:', e?.message);
  }
  try {
    const { ensureOnboardingRow } = await import('../lib/whatsappOnboarding.js');
    await ensureOnboardingRow(tenantId);
  } catch (e: any) {
    console.warn('[welcome] ensureOnboardingRow skipped:', e?.message);
  }
  return {
    ok: true, sent_to: t.owner_phone, wa_link: waLink,
    channels: { sms: smsStatus, email: emailStatus, whatsapp: waStatus },
    user_seed_error: seedError,
    ...results,
  };
}

// SUPER-ADMIN — probe every outbound channel and report which are actually
// configured + reachable. No SSH needed. Sends a test message to the
// caller's own phone/email so they see it land (or don't).
registerFn('diagnoseChannels', async ({ user }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  const out: any = { env: {}, tests: {} };
  // 1. What's actually set in the container env?
  out.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ? `SET (${process.env.TWILIO_ACCOUNT_SID.length} chars)` : 'MISSING';
  out.env.TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  ? 'SET' : 'MISSING';
  out.env.TWILIO_PHONE_NUMBER= process.env.TWILIO_PHONE_NUMBER|| 'MISSING (no SMS)';
  out.env.TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'MISSING (no WhatsApp)';
  out.env.RESEND_API_KEY     = process.env.RESEND_API_KEY     ? `SET (${process.env.RESEND_API_KEY.length} chars)` : 'MISSING (no email)';
  out.env.EMAIL_FROM         = process.env.EMAIL_FROM || 'default: noreply@alenabepita.co.il';
  out.env.PUSHOVER_TOKEN     = process.env.PUSHOVER_TOKEN ? 'SET' : 'MISSING';
  // 2. Live probe: Resend /domains — the cheapest 200-OK endpoint
  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      out.tests.resend = { status: r.status, ok: r.ok };
      if (!r.ok) out.tests.resend.body = (await r.text()).slice(0, 200);
    } catch (e: any) {
      out.tests.resend = { error: e?.message || 'network_error' };
    }
  } else {
    out.tests.resend = { skipped: 'no_api_key' };
  }
  // 3. Live probe: Twilio account status
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const creds = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, {
        headers: { Authorization: `Basic ${creds}` },
      });
      const data: any = await r.json();
      out.tests.twilio = { status: r.status, ok: r.ok, account_status: data?.status };
    } catch (e: any) {
      out.tests.twilio = { error: e?.message || 'network_error' };
    }
  } else {
    out.tests.twilio = { skipped: 'no_credentials' };
  }
  // 4. Actually send test messages to Dvir's own number/email so he sees them land.
  const testPhone = (user as any)?.phone || process.env.SUPER_ADMIN_PHONE || '';
  const testEmail = (user as any)?.email || '';
  if (testPhone) {
    const { sendSms, sendWhatsApp } = await import('../lib/twilio.js');
    const stamp = new Date().toISOString().slice(11, 19);
    try {
      out.tests.sms_send = await sendSms(testPhone, `TOP APOLLO test SMS ${stamp}`);
    } catch (e: any) {
      out.tests.sms_send = { error: e?.message || 'sms_failed' };
    }
    try {
      out.tests.whatsapp_send = await sendWhatsApp(testPhone, `TOP APOLLO test WhatsApp ${stamp}`);
    } catch (e: any) {
      out.tests.whatsapp_send = { error: e?.message || 'wa_failed' };
    }
  } else {
    out.tests.sms_send = { skipped: 'no_test_phone' };
    out.tests.whatsapp_send = { skipped: 'no_test_phone' };
  }
  if (testEmail) {
    const { sendEmail } = await import('../lib/email.js');
    const stamp = new Date().toISOString().slice(11, 19);
    try {
      out.tests.email_send = await sendEmail({
        to: testEmail,
        subject: `TOP APOLLO channel test ${stamp}`,
        html: `<p>אם קיבלת את זה במייל — הערוץ עובד.</p><p>שלחתי אליך ב-${stamp} UTC.</p>`,
      });
    } catch (e: any) {
      out.tests.email_send = { error: e?.message || 'email_failed' };
    }
  } else {
    out.tests.email_send = { skipped: 'no_test_email' };
  }
  return out;
});

// SUPER-ADMIN — reset a tenant back to pending_provisioning and enqueue
// a fresh ProvisioningJob. Used when a tenant is stuck (like zohara —
// marked 'live' but the schema was never created). Provisioner will pick
// up the job on the next tick and run provision-tenant.sh which creates
// the schema, dumps table structure, and spins up the container.
// Idempotent: safe to call on a stuck 'live' tenant or a stuck
// 'pending_provisioning' one.
registerFn('reprovisionTenant', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, status FROM "Tenant" WHERE id = $1`, b.tenant_id,
  );
  if (!rows.length) throw new Error('Tenant not found');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET status = 'pending_provisioning',
       provisioned_at = NULL, live_at = NULL, "updatedAt" = NOW()
     WHERE id = $1`,
    b.tenant_id,
  );
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "ProvisioningJob"("id","tenant_id","status") VALUES ($1, $2, 'pending')`,
    randomUUID(), b.tenant_id,
  );
  return { ok: true, message: 'Reprovisioning job queued. Cron will pick it up within 30-60s.' };
});

// SUPER-ADMIN — resend the welcome WhatsApp with fresh credentials.
// Refuses to run if the tenant's schema doesn't exist yet — otherwise
// we'd flip status to 'live' with no backing schema (like happened to
// zohara). In that case, the caller should hit reprovisionTenant first.
registerFn('resendTenantWelcome', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, status FROM "Tenant" WHERE id = $1`, b.tenant_id,
  );
  if (!rows.length) throw new Error('Tenant not found');
  const t = rows[0];

  // Self-heal instead of refusing: create the schema if missing and copy
  // any missing tables from public. This turns the button into "fix
  // whatever is broken in the DB and send credentials" — one click, no
  // SSH, no reprovision dance for DB-level gaps. (Reprovision is still
  // there for container/Caddy-level problems.)
  await syncTenantSchemaFromPublic(t.slug);

  // OK to flip to live now.
  if (t.status === 'pending_provisioning' || t.status === 'provisioning') {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "Tenant" SET status = 'live', provisioned_at = COALESCE(provisioned_at, NOW()),
         live_at = COALESCE(live_at, NOW()), "updatedAt" = NOW() WHERE id = $1`,
      b.tenant_id,
    );
  }

  // All the actual sending + persistence lives in sendWelcomeForTenant so
  // reportProvisioningResult can share the same code path.
  const result = await sendWelcomeForTenant(b.tenant_id);
  if (result.sms_error && result.email_error && result.whatsapp_error) {
    throw new Error(`All channels failed. SMS: ${result.sms_error}. Email: ${result.email_error}. WA: ${result.whatsapp_error}`);
  }
  return result;
});

// SUPER-ADMIN — generate an impersonation token that logs the caller in
// as the OWNER of a target tenant. Redirects to the tenant subdomain with
// the token in a URL param that the frontend picks up on load.
registerFn('impersonateTenant', async ({ user, body }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const b = (body || {}) as any;
  if (!b.tenant_id) throw new Error('tenant_id required');
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT slug, subdomain_url, owner_email FROM "Tenant" WHERE id = $1 AND status = 'live'`,
    b.tenant_id,
  );
  if (!rows.length) throw new Error('Tenant not found or not live');
  const t = rows[0];
  // Look up the owner user in the tenant schema.
  const owner: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, email, role, "fullName" FROM "tenant_${t.slug}"."User" WHERE email = $1 LIMIT 1`,
    t.owner_email.toLowerCase(),
  );
  if (!owner.length) throw new Error('Owner user not yet registered in tenant DB');
  const o = owner[0];
  // Sign a JWT using the shared JWT_SECRET (all tenant containers use the same one).
  const { default: jwt } = await import('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const token = jwt.sign(
    { id: o.id, email: o.email, role: o.role, impersonator: (user as any).email, tenant: t.slug },
    secret,
    { expiresIn: '1h' },
  );
  return { redirect_url: `${t.subdomain_url}/?impersonate=${encodeURIComponent(token)}`, tenant_slug: t.slug };
});

registerFn('getTenantStats', async ({ user }) => {
  if (!isSuperAdmin(user)) throw new Error('super-admin only');
  await ensurePlatformTables();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'live')::int AS live,
       COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval,
       COUNT(*) FILTER (WHERE status IN ('pending_provisioning', 'provisioning'))::int AS provisioning,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM "Tenant"`,
  );
  return rows[0] || { live: 0, pending_approval: 0, provisioning: 0, failed: 0, rejected: 0 };
});

// Called by the VPS cron — pulls one pending job, marks it running,
// returns the data needed to provision. The cron script then runs the
// shell provisioning + posts back via reportProvisioningResult.
registerFn('pickNextProvisioningJob', async ({ body }) => { /*PUBLIC—cron_secret is the auth*/
  await ensurePlatformTables();
  const b = (body || {}) as any;
  const secret = String(b.cron_secret || '');
  if (secret !== process.env.CRON_SECRET) throw new Error('forbidden');
  // Atomic claim: pick one pending row, mark as running.
  const claimed: any[] = await (prisma as any).$queryRawUnsafe(
    `UPDATE "ProvisioningJob" SET status = 'running', started_at = NOW(), "updatedAt" = NOW()
     WHERE id = (SELECT id FROM "ProvisioningJob" WHERE status = 'pending' ORDER BY "createdAt" ASC LIMIT 1)
     RETURNING id, tenant_id`,
  );
  if (!claimed.length) return { job: null };
  const job = claimed[0];
  const tenant: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, owner_name, owner_phone, owner_email, db_name, container_name, subdomain_url
     FROM "Tenant" WHERE id = $1`,
    job.tenant_id,
  );
  if (!tenant.length) return { job: null };
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET status = 'provisioning', "updatedAt" = NOW() WHERE id = $1`,
    job.tenant_id,
  );
  // Object spread ordering fix: `{ id: job.id, ...tenant[0] }` puts the
  // spread LAST which overwrites `id` with tenant's id — so the provisioner
  // received the tenant_id as "job_id" and reportProvisioningResult's
  // `UPDATE ... WHERE id = tenant_id` never matched, leaving every
  // successful zohara/hamara/etc. job stuck at status='pending' forever
  // and re-provisioned on every cron tick. Now returns BOTH ids explicitly.
  return {
    job: {
      ...tenant[0],
      job_id: job.id,          // ProvisioningJob.id — for reportProvisioningResult
      tenant_id: tenant[0].id, // Tenant.id — for the welcome flow
    },
  };
}, { public: true });

// PUBLIC — cron on the VPS calls this every 5 min. Returns any tenants
// that are stuck longer than expected. See scripts/watch-stuck-tenants.sh.
registerFn('checkStuckTenants', async ({ body }) => {
  const b = (body || {}) as any;
  if (String(b.cron_secret || '') !== process.env.CRON_SECRET) throw new Error('forbidden');
  await ensurePlatformTables();
  const stuck: any[] = [];
  // pending_provisioning > 10 min → provisioner cron probably not running
  const provStuck: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, "createdAt", approved_at FROM "Tenant"
     WHERE status IN ('pending_provisioning', 'provisioning')
       AND approved_at < NOW() - INTERVAL '10 minutes'`,
  );
  for (const t of provStuck) {
    stuck.push({
      tenant_id: t.id, slug: t.slug, kind: 'pending_provisioning_stuck',
      msg: `${t.restaurant_name} (${t.slug}) תקוע ב-pending_provisioning יותר מ-10 דקות. בדוק את provisioner-cron על ה-VPS.`,
    });
  }
  // pending_approval > 24h → Dvir forgot to approve
  const approvalStuck: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, "createdAt", owner_name, owner_phone FROM "Tenant"
     WHERE status = 'pending_approval'
       AND "createdAt" < NOW() - INTERVAL '24 hours'`,
  );
  for (const t of approvalStuck) {
    stuck.push({
      tenant_id: t.id, slug: t.slug, kind: 'pending_approval_stuck',
      msg: `${t.restaurant_name} (${t.owner_name}, ${t.owner_phone}) מחכה לאישורך יותר מ-24 שעות.`,
    });
  }
  // live but no welcome ever sent successfully
  const noWelcome: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, slug, restaurant_name, live_at FROM "Tenant"
     WHERE status = 'live'
       AND live_at < NOW() - INTERVAL '15 minutes'
       AND (last_welcome_at IS NULL
            OR (last_welcome_sms_status <> 'sent'
                AND last_welcome_email_status <> 'sent'
                AND last_welcome_wa_status <> 'sent'))`,
  );
  for (const t of noWelcome) {
    stuck.push({
      tenant_id: t.id, slug: t.slug, kind: 'no_welcome_delivered',
      msg: `${t.restaurant_name} עלה לאוויר לפני יותר מ-15 דקות אבל הבעלים לא קיבל שום פרטי כניסה. לחץ "שלח פרטי כניסה" ב-PlatformAdmin.`,
    });
  }
  return { stuck };
}, { public: true });

// PUBLIC — cron-invoked pushover alert. Reuses the existing pushover
// infra but exposed under a public route with cron_secret auth so shell
// scripts can call it without a JWT.
registerFn('pushoverAlert', async ({ body }) => {
  const b = (body || {}) as any;
  if (String(b.cron_secret || '') !== process.env.CRON_SECRET) throw new Error('forbidden');
  const title = String(b.title || 'TOP APOLLO alert').slice(0, 100);
  const message = String(b.message || '').slice(0, 1024);
  const { pushoverToAdmins } = await import('../lib/pushover.js');
  try {
    await pushoverToAdmins(title, message);
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
  return { ok: true };
}, { public: true });

registerFn('reportProvisioningResult', async ({ body }) => {
  await ensurePlatformTables();
  const b = (body || {}) as any;
  const secret = String(b.cron_secret || '');
  if (secret !== process.env.CRON_SECRET) throw new Error('forbidden');
  if (!b.job_id || !b.tenant_id) throw new Error('job_id and tenant_id required');
  const success = b.status === 'success';
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "ProvisioningJob" SET status = $1, finished_at = NOW(), log = $2, error = $3, "updatedAt" = NOW() WHERE id = $4`,
    success ? 'done' : 'failed', String(b.log || '').slice(0, 8000), String(b.error || '').slice(0, 2000), b.job_id,
  );
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "Tenant" SET status = $1, provisioned_at = NOW(), live_at = ${success ? 'NOW()' : 'NULL'}, "updatedAt" = NOW() WHERE id = $2`,
    success ? 'live' : 'failed', b.tenant_id,
  );
  // On successful provisioning, fire the multi-channel welcome. The helper
  // seeds the owner user, sends SMS + email + WA, and persists per-channel
  // outcome to the Tenant row (so the PlatformAdmin dots update immediately).
  // Wrapped in try/catch — a welcome-send failure MUST NOT roll back the
  // 'live' status flip above. The operator can retry from the UI.
  if (success) {
    try {
      const welcome = await sendWelcomeForTenant(b.tenant_id);
      return { ok: true, welcome };
    } catch (e: any) {
      console.warn('[reportProvisioningResult] sendWelcomeForTenant failed', e?.message);
      return { ok: true, welcome_error: e?.message };
    }
  }
  return { ok: true };
}, { public: true });

// =================== SCHEDULING RULES ===================
// Constraints the manager wires up gradually. The weekly schedule builder
// injects them into the LLM prompt AND a post-build validator checks that
// no active rule was violated. Owner can add rules from the app OR via a
// WhatsApp message ("אבי לא עובד ראשון").
let schedulingRulesReady = false;
async function ensureSchedulingRulesTable() {
  if (schedulingRulesReady) return;
  const sql = (prisma as any).$executeRawUnsafe.bind(prisma);
  await sql(`CREATE TABLE IF NOT EXISTS "SchedulingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "employee_id" TEXT,
    "employee_name" TEXT,
    "day_of_week" INTEGER,
    "shift_type" TEXT,
    "other_employee_id" TEXT,
    "other_employee_name" TEXT,
    "max_per_week" INTEGER,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "SchedulingRule_active_idx" ON "SchedulingRule"("active")`);
  schedulingRulesReady = true;
}

registerFn('listSchedulingRules', async () => {
  await ensureSchedulingRulesTable();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM "SchedulingRule" WHERE active = true ORDER BY "createdAt" DESC`,
  );
  return { rules: rows };
});

registerFn('addSchedulingRule', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureSchedulingRulesTable();
  const b = (body || {}) as any;
  if (!b.kind || !b.description) throw new Error('kind and description required');
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "SchedulingRule"(
       "id","kind","employee_id","employee_name","day_of_week","shift_type",
       "other_employee_id","other_employee_name","max_per_week","description"
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
     )`,
    randomUUID(), b.kind, b.employee_id || null, b.employee_name || null,
    b.day_of_week != null ? b.day_of_week : null, b.shift_type || null,
    b.other_employee_id || null, b.other_employee_name || null,
    b.max_per_week != null ? b.max_per_week : null, b.description,
  );
  return { ok: true };
});

registerFn('deleteSchedulingRule', async ({ body, user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  await ensureSchedulingRulesTable();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "SchedulingRule" SET active = false, "updatedAt" = NOW() WHERE id = $1`,
    b.id,
  );
  return { ok: true };
});

// Manual trigger for the weekly schedule build — ignores the Tue 16:00 gate.
// Used by (a) the "בנה סידור" WhatsApp command and (b) the Platform Admin
// button. Returns the same shape as the cron so downstream consumers work.
registerFn('triggerWeeklyScheduleBuild', async ({ user }) => {
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  return runWeeklyScheduleBuild({ force: true });
});

let inventoryTablesReady = false;
async function ensureInventoryTables() {
  if (inventoryTablesReady) return;
  const sql = (prisma as any).$executeRawUnsafe.bind(prisma);
  await sql(`CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "supplier_name" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "price_per_unit" DOUBLE PRECISION,
    "waste_percent" DOUBLE PRECISION DEFAULT 0,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "Ingredient_name_key" ON "Ingredient"("name")`);
  await sql(`CREATE TABLE IF NOT EXISTS "IngredientAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL UNIQUE,
    "ingredient_id" TEXT NOT NULL REFERENCES "Ingredient"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'DISH',
    "name" TEXT NOT NULL,
    "total_cost" DOUBLE PRECISION,
    "sale_price" DOUBLE PRECISION,
    "food_cost_percent" DOUBLE PRECISION,
    "yield_qty" DOUBLE PRECISION DEFAULT 1,
    "yield_unit" TEXT DEFAULT 'unit',
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "Recipe_kind_idx" ON "Recipe"("kind")`);
  await sql(`CREATE TABLE IF NOT EXISTS "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipe_id" TEXT NOT NULL REFERENCES "Recipe"("id") ON DELETE CASCADE,
    "ingredient_id" TEXT REFERENCES "Ingredient"("id"),
    "prep_recipe_id" TEXT REFERENCES "Recipe"("id"),
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "cost_at_import" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "RecipeIngredient_recipe_idx" ON "RecipeIngredient"("recipe_id")`);
  await sql(`CREATE TABLE IF NOT EXISTS "CashFlowEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "paid_at" TIMESTAMP(3),
    "invoice_id" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "CashFlowEntry_date_idx" ON "CashFlowEntry"("date")`);
  await sql(`CREATE TABLE IF NOT EXISTS "MonthlyTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyTarget_month_category_key" ON "MonthlyTarget"("month", "category")`);
  inventoryTablesReady = true;
}
async function ensureEventContractTable() {
  if (eventContractTableReady) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EventContract" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "booking_id" TEXT,
      "contract_number" TEXT,
      "public_token" TEXT,
      "customer_name" TEXT,
      "customer_phone" TEXT,
      "company_or_event_label" TEXT,
      "event_location" TEXT,
      "event_date" TEXT,
      "event_start_time" TEXT,
      "event_end_time" TEXT,
      "guest_count" INTEGER,
      "package_label" TEXT,
      "price_per_guest_ils" INTEGER,
      "upsells_total_ils" INTEGER,
      "subtotal_ils" INTEGER,
      "deposit_ils" INTEGER,
      "balance_ils" INTEGER,
      "tip_ils" INTEGER,
      "menu_snapshot" JSONB,
      "upsells_snapshot" JSONB,
      "terms_snapshot" JSONB,
      "notes" TEXT,
      "signature_data_url" TEXT,
      "signed_at" TIMESTAMP(3),
      "signed_ip" TEXT,
      "signed_user_agent" TEXT,
      "status" TEXT DEFAULT 'draft',
      "sent_at" TIMESTAMP(3),
      "sent_via" TEXT,
      "created_date" TEXT,
      "updated_date" TEXT,
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await (prisma as any).$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "EventContract_public_token_uq" ON "EventContract"("public_token");
  `);
  // Forward-compat: add columns that may be missing on tables created by older builds
  const addCol = async (col: string, type: string) => {
    await (prisma as any).$executeRawUnsafe(
      `ALTER TABLE "EventContract" ADD COLUMN IF NOT EXISTS "${col}" ${type};`
    ).catch(() => {});
  };
  await addCol('tip_ils', 'INTEGER');
  await addCol('customer_email', 'TEXT');
  await addCol('customer_address', 'TEXT');
  await addCol('customer_id_or_taxno', 'TEXT');
  await addCol('event_type', 'TEXT');
  await addCol('kids_count', 'INTEGER');
  await addCol('rep_name', 'TEXT');
  await addCol('rep_signature_data_url', 'TEXT');
  await addCol('rep_signed_at', 'TIMESTAMP(3)');
  await addCol('rep_user_email', 'TEXT');
  eventContractTableReady = true;
}

function randomToken(len = 24) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function fmtContractNumber(seq: number) {
  const yr = new Date().getFullYear();
  return `ALN-${yr}-${String(seq).padStart(4, '0')}`;
}

// Build a draft contract from a booking (or from scratch with raw fields).
// Official terms — verbatim from "הסכם קיום אירוע - עלינא" doc. Mirrors
// src/data/eventContractTerms.js (frontend default for the TermsEditor).
// Lines beginning with "## " are section headers that the signing page
// renders as bold subtitles.
const OFFICIAL_EVENT_TERMS_TEMPLATE: string[] = [
  '## שינויים בהזמנה',
  'ניתן לעדכן את התפריט ואת מספר הסועדים עד 72 שעות לפני מועד האירוע.',
  'לאחר מועד זה לא ניתן לבצע שינויים בתפריט או להפחית את מספר הסועדים המחויב.',
  'הגדלת מספר הסועדים לאחר מועד זה כפופה לאישור {brand} בלבד ובהתאם לתפוסת המסעדה וזמינות המקום.',
  'במקרה שבו יגיעו פחות סועדים מהכמות שאושרה, החיוב יתבצע לפי הכמות שסוכמה 72 שעות לפני האירוע.',
  'במקרה שבו יגיעו סועדים נוספים ויתאפשר לארחם, יחויב כל סועד נוסף במחיר המלא שנקבע בהסכם.',
  '## מקדמה ותשלום',
  'בתוך 48 שעות ממועד חתימת ההסכם תועבר מקדמה בגובה 25% משווי האירוע.',
  'המקדמה תשולם באמצעות כרטיס אשראי, העברה בנקאית או אמצעי תשלום אחר שיאושר על ידי המסעדה.',
  'כרטיס האשראי שנמסר לצורך תשלום המקדמה ישמש גם ככרטיס ביטחון להבטחת התחייבויות המזמין בהתאם להסכם זה.',
  'כל התשלומים יבוצעו כנגד חשבונית מס / קבלה כדין.',
  'יתרת התשלום תשולם בסיום האירוע.',
  'התשלום בסיום האירוע מתבצע באופן מרוכז על ידי המזמין (סוגר האירוע) בלבד, במסגרת חשבון אחד כולל. המסעדה אינה מפצלת חשבונות בין הסועדים ואינה גובה תשלום פרטני מאורחי האירוע; המזמין מתחייב להסדיר את מלוא יתרת התשלום בסיום האירוע, ולגבות לפי שיקול דעתו את חלקם של אורחיו במישרין.',
  'במידה ונצרכו שירותים, משקאות, מנות או תוספות מעבר למוסכם בהזמנה, יחויבו אלו בהתאם למחירי המסעדה במועד האירוע.',
  '## הרכב שולחנות וישיבה',
  'הרכב השולחנות וסידור הישיבה ייקבעו על ידי המסעדה בהתאם לכמות הסועדים בהזמנה, לתפוסת המסעדה ולתשתית הפיזית של המקום.',
  '{brand} תעשה כל מאמץ לארח את כלל אורחי האירוע במתחם אחד או בסמיכות מרבית, אולם ייתכן והישיבה תתפרס על פני מספר שולחנות או אזורים בהתאם לשיקול דעתה הבלעדי של המסעדה.',
  'אין באמור כדי לפגוע באיכות השירות או באווירת האירוע — המסעדה תעמיד את כלל המשאבים הנדרשים כדי להעניק חוויה אחידה לכלל הסועדים.',
  '## מדיניות ביטול',
  'ביטול עד 72 שעות לפני מועד האירוע – ללא דמי ביטול והמקדמה תוחזר במלואה.',
  'ביטול בין 48 ל-72 שעות לפני האירוע – יחולו דמי ביטול בגובה 25% משווי האירוע.',
  'ביטול בין 24 ל-48 שעות לפני האירוע – יחולו דמי ביטול בגובה 50% משווי האירוע.',
  'ביטול פחות מ-24 שעות לפני מועד האירוע – יחויב המזמין במלוא עלות האירוע.',
  '## איחורים',
  'השולחן יישמר למשך 15 דקות ממועד ההגעה שנקבע.',
  'במקרה של איחור העולה על 15 דקות, זמן האירוע ייחשב החל משעת ההגעה המקורית שנקבעה בהזמנה ולא משעת ההגעה בפועל.',
  '{brand} שומרת לעצמה את הזכות לבצע התאמות במיקום הישיבה, בסדר ההגשה ובקצב השירות בהתאם לתפוסת המסעדה ולצרכיה התפעוליים.',
  '## התנהלות במהלך האירוע',
  '{brand} הינה מסעדה פעילה והאירוע אינו מהווה אירוע פרטי או סגירת המסעדה, אלא אם סוכם אחרת בכתב.',
  'המוזיקה המושמעת במסעדה נבחרת על ידי המסעדה והווליום נקבע על ידה בלבד.',
  'נאומים, מצגות, הקרנות, מערכות הגברה, הופעות או כל פעילות העלולה להפריע לאורחי המסעדה מחייבות אישור מראש ובכתב.',
  'משך האירוח במסגרת ההזמנה הינו עד שעתיים ממועד ההגעה שנקבע.',
  'במידה ויתאפשר ובהסכמת המסעדה להאריך את משך הישיבה מעבר לשעתיים, יחויבו ההזמנות הנוספות בהתאם לצריכה בפועל.',
  'לכל אירוע יוצג למזמין מנהל אירוע מטעם המסעדה.',
  'באירועים של מעל 20 סועדים יוקצה איש שירות ייעודי לשולחן.',
  'האירוע אינו כולל דמי שירות.',
  'נהוג להשאיר דמי שירות בגובה 12%-15% מסך החשבון, לפי שיקול דעת הלקוח.',
  '## אלכוהול חיצוני',
  'ניתן להביא בקבוקי יין שאינם מופיעים בתפריט המסעדה.',
  'במקרים אלו ייגבו דמי חליצה ושירות בגובה 65 ₪ לכל בקבוק.',
  'הבאת משקאות אלכוהוליים אחרים מחייבת אישור מראש ובכתב.',
  '## מזון חיצוני',
  'מטעמי כשרות, בטיחות מזון ונהלי המסעדה, הכנסת מזון, עוגות, קינוחים או משקאות חיצוניים אינה מותרת.',
  'חריגים יאושרו מראש בלבד ובכפוף לאישור הנהלת המסעדה והמשגיח.',
  '## אלרגיות ורגישויות',
  'המזמין מתחייב להעביר למסעדה מראש מידע מלא ומדויק בדבר אלרגיות, רגישויות או מגבלות תזונתיות של מי מהאורחים.',
  'המסעדה תעשה מאמץ סביר להתחשב בבקשות אלו, אולם המטבח אינו סטרילי ואינו יכול להבטיח היעדר מוחלט של אלרגנים.',
  '## אחריות לנזק ורכוש',
  'המזמין ואורחיו מתחייבים לכבד את נהלי המקום ואת הוראות הצוות.',
  'המזמין יהיה אחראי לכל נזק חריג שייגרם לציוד, ריהוט, מתקנים או רכוש המסעדה על ידי מי מאורחי האירוע.',
  'המסעדה אינה אחראית לאובדן, גניבה או נזק לציוד אישי של אורחי האירוע.',
];

registerFn('createEventContract', async ({ body, user }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  let booking: any = null;
  if (b.booking_id) {
    booking = await (prisma as any).eventBooking.findUnique({ where: { id: String(b.booking_id) } });
  }
  // Pull current sales kit for menu/upsells/terms snapshot
  const kit = await (prisma as any).eventSalesKit.findFirst().catch(() => null);

  // Derive package label from booking.selected_menu (which usually carries id/name/price)
  const selMenu: any = booking?.selected_menu || null;
  const packageLabel = b.package_label || (selMenu?.name || selMenu?.label || null);
  const pricePerGuest = Number(b.price_per_guest_ils ?? selMenu?.price_per_guest ?? selMenu?.price ?? 0) || 0;
  const guestCount = Number(b.guest_count ?? booking?.guest_count ?? 0) || 0;
  const upsellsTotal = Number(b.upsells_total_ils ?? 0) || 0;
  const subtotalIls = Number(b.subtotal_ils ?? booking?.total_ils ?? (pricePerGuest * guestCount + upsellsTotal)) || 0;
  const depositIls = Number(b.deposit_ils ?? booking?.deposit_amount_ils ?? 0) || 0;
  const balanceIls = Number(b.balance_ils ?? Math.max(0, subtotalIls - depositIls)) || 0;

  // Sequence number — count existing rows
  const seq = (await (prisma as any).eventContract.count()) + 1;

  const created = await (prisma as any).eventContract.create({
    data: {
      booking_id: booking?.id || null,
      contract_number: fmtContractNumber(seq),
      public_token: randomToken(28),
      customer_name: b.customer_name ?? booking?.customer_name ?? null,
      customer_phone: b.customer_phone ?? booking?.customer_phone ?? null,
      customer_email: b.customer_email ?? booking?.customer_email ?? null,
      customer_address: b.customer_address ?? booking?.customer_address ?? null,
      customer_id_or_taxno: b.customer_id_or_taxno ?? null,
      company_or_event_label: b.company_or_event_label ?? null,
      event_type: b.event_type ?? booking?.event_type ?? null,
      event_location: b.event_location ?? (await getBrandName()),
      event_date: b.event_date ?? booking?.event_date ?? null,
      event_start_time: b.event_start_time ?? booking?.event_time ?? null,
      event_end_time: b.event_end_time ?? null,
      guest_count: guestCount || null,
      kids_count: Number(b.kids_count ?? booking?.kids_count ?? 0) || null,
      package_label: packageLabel,
      price_per_guest_ils: pricePerGuest || null,
      upsells_total_ils: upsellsTotal || null,
      subtotal_ils: subtotalIls || null,
      deposit_ils: depositIls || null,
      balance_ils: balanceIls || null,
      menu_snapshot: b.menu_snapshot ?? booking?.selected_dishes ?? selMenu?.dishes ?? null,
      upsells_snapshot: b.upsells_snapshot ?? booking?.selected_upsells ?? null,
      terms_snapshot: b.terms_snapshot ?? await (async () => {
        const brand = await getBrandName();
        const raw = Array.isArray(kit?.terms) && kit.terms.length > 0 ? kit.terms : OFFICIAL_EVENT_TERMS_TEMPLATE;
        return raw.map((t: string) => String(t).replaceAll('{brand}', brand).replaceAll('עלינא', brand));
      })(),
      notes: b.notes ?? null,
      status: 'draft',
      createdBy: user?.email || null,
    },
  });
  return { ok: true, contract: created };
});

// Admin read
registerFn('getEventContract', async ({ body }) => {
  await ensureEventContractTable();
  const id = String((body as any)?.id || '');
  if (!id) throw new Error('id required');
  const c = await (prisma as any).eventContract.findUnique({ where: { id } });
  if (!c) throw new Error('Not found');
  return c;
});

// Admin patch (only allowed before signing)
registerFn('updateEventContract', async ({ body }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const existing = await (prisma as any).eventContract.findUnique({ where: { id: String(b.id) } });
  if (!existing) throw new Error('Not found');
  // Status-only updates are allowed even on signed contracts (the manager
  // may need to mark a signed contract as cancelled, etc.). Block edits
  // of any *other* field on signed contracts.
  if (existing.status === 'signed') {
    const onlyStatus = Object.keys(b).every((k) => k === 'id' || k === 'status');
    if (!onlyStatus) throw new Error('חוזה חתום — אי אפשר לערוך (רק לשנות סטטוס)');
  }
  const allowed = [
    'customer_name', 'customer_phone', 'customer_email', 'customer_address',
    'customer_id_or_taxno', 'company_or_event_label', 'event_type', 'event_location',
    'event_date', 'event_start_time', 'event_end_time', 'guest_count', 'kids_count',
    'package_label', 'price_per_guest_ils', 'upsells_total_ils', 'subtotal_ils',
    'deposit_ils', 'balance_ils', 'tip_ils', 'menu_snapshot', 'upsells_snapshot',
    'terms_snapshot', 'notes', 'status',
  ];
  // INTEGER columns — coerce defensively so the API never throws Prisma's cryptic
  // 'invalid argument' (which surfaces in the UI as 'function_error') just because
  // an old client sent '' instead of null for a cleared number field.
  const INT_FIELDS = new Set([
    'guest_count', 'kids_count', 'price_per_guest_ils', 'upsells_total_ils',
    'subtotal_ils', 'deposit_ils', 'balance_ils', 'tip_ils',
  ]);
  const data: Record<string, any> = {};
  for (const k of allowed) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (INT_FIELDS.has(k)) {
      if (v === '' || v === null) { data[k] = null; continue; }
      const n = Number(v);
      data[k] = Number.isFinite(n) ? Math.round(n) : null;
    } else {
      data[k] = v;
    }
  }
  const updated = await (prisma as any).eventContract.update({ where: { id: String(b.id) }, data });
  return { ok: true, contract: updated };
});

registerFn('deleteEventContract', async ({ body }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const existing = await (prisma as any).eventContract.findUnique({ where: { id: String(b.id) } });
  if (!existing) throw new Error('Not found');
  await (prisma as any).eventContract.delete({ where: { id: String(b.id) } });
  return { ok: true };
});

// List contracts (admin)
registerFn('listEventContracts', async ({ body }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  const limit = Math.min(200, Math.max(1, Number(b.limit) || 50));
  const where: any = {};
  if (b.status) where.status = String(b.status);
  if (b.booking_id) where.booking_id = String(b.booking_id);
  const rows = await (prisma as any).eventContract.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit,
  });
  return { ok: true, contracts: rows };
});

// Mark as "sent" + generate WhatsApp link
registerFn('sendEventContract', async ({ body }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  if (!b.id) throw new Error('id required');
  const c = await (prisma as any).eventContract.findUnique({ where: { id: String(b.id) } });
  if (!c) throw new Error('Not found');
  await (prisma as any).eventContract.update({
    where: { id: c.id },
    data: { status: 'sent', sent_at: new Date(), sent_via: b.via || 'whatsapp' },
  });
  return { ok: true, public_url: `/r/contract/${c.public_token}` };
});

// PUBLIC — fetch contract by token (for the customer signing page)
registerFn('getPublicEventContract', async ({ body }) => {
  await ensureEventContractTable();
  const token = String((body as any)?.token || '');
  if (!token) throw new Error('token required');
  const c = await (prisma as any).eventContract.findFirst({ where: { public_token: token } });
  if (!c) throw new Error('Not found');
  // Strip server-internal fields before returning to public
  const { signed_ip: _ip, signed_user_agent: _ua, ...safe } = c as any;
  return { ok: true, contract: safe };
}, { public: true });

// PUBLIC — customer submits signature
registerFn('signEventContract', async ({ body, req }) => {
  await ensureEventContractTable();
  const b = (body || {}) as any;
  const token = String(b.token || '');
  const dataUrl = String(b.signature_data_url || '');
  const sigName = String(b.customer_name || '').trim();
  if (!token) throw new Error('token required');
  if (!dataUrl.startsWith('data:image/')) throw new Error('signature_data_url must be a PNG/JPEG dataURL');
  if (dataUrl.length > 250_000) throw new Error('signature too large');
  if (!sigName) throw new Error('customer_name required');

  const c = await (prisma as any).eventContract.findFirst({ where: { public_token: token } });
  if (!c) throw new Error('Not found');
  if (c.status === 'signed') throw new Error('כבר חתום');

  const ip = (req as any)?.ip || (req as any)?.headers?.['x-forwarded-for'] || null;
  const ua = (req as any)?.headers?.['user-agent'] || null;

  await (prisma as any).eventContract.update({
    where: { id: c.id },
    data: {
      signature_data_url: dataUrl,
      customer_name: sigName,  // sync the printed name to the one the customer typed when signing
      signed_at: new Date(),
      signed_ip: ip ? String(ip).slice(0, 60) : null,
      signed_user_agent: ua ? String(ua).slice(0, 200) : null,
      status: 'signed',
    },
  });
  return { ok: true };
}, { public: true });

// Admin counter-signature — owner/admin signs the contract after customer.
// Together with the customer signature this makes the contract bilaterally
// binding. Once both are present, status is implicitly 'fully_signed' (we
// keep status='signed' for backwards compatibility, the rep_signed_at field
// indicates counter-signature).
registerFn('signEventContractAsRep', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  await ensureEventContractTable();
  const b = (body || {}) as any;
  const id = String(b.id || '');
  const dataUrl = String(b.signature_data_url || '');
  const repName = String(b.rep_name || '').trim();
  if (!id) throw new Error('id required');
  if (!dataUrl.startsWith('data:image/')) throw new Error('signature_data_url must be a PNG/JPEG dataURL');
  if (dataUrl.length > 250_000) throw new Error('signature too large');
  if (!repName) throw new Error('rep_name required');

  const c = await (prisma as any).eventContract.findUnique({ where: { id } });
  if (!c) throw new Error('Not found');

  await (prisma as any).eventContract.update({
    where: { id },
    data: {
      rep_name: repName,
      rep_signature_data_url: dataUrl,
      rep_signed_at: new Date(),
      rep_user_email: (user as any).email || null,
    },
  });
  return { ok: true };
});

// PUBLIC — live social-proof counter for the reservation page hero.
// "🔥 בוצעו N הזמנות ב-H שעות האחרונות". Bounded at 999 and floor 0.
registerFn('getRecentReservationCount', async ({ body }) => {
  const hours = Math.min(72, Math.max(1, Number((body as any)?.hours) || 3));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const count = await db.reservation.count({
    where: {
      createdAt: { gte: since },
      status: { in: ['confirmed', 'pending', 'seated'] },
    },
  }).catch(() => 0);
  return { count: Math.max(0, Math.min(999, count)), hours };
}, { public: true });

// PUBLIC — featured menu items for the public reservation page carousel.
// Picks recommended + highest-popularity items that have an image, falls back
// to any item with image_url. Caps to 8.
registerFn('getPublicFeaturedMenuItems', async ({ body }) => {
  const limit = Math.min(12, Math.max(1, Number((body as any)?.limit) || 6));
  try {
    // First pass: recommended items with images
    let items = await db.menuItem.findMany({
      where: { is_recommended: true, available: true, image_url: { not: null } },
      orderBy: [{ popularity_score: 'desc' }, { name: 'asc' }],
      take: limit,
      select: { id: true, name: true, description: true, price: true, image_url: true, category: true },
    });
    if (items.length < limit) {
      // Fallback: any available item with an image
      const need = limit - items.length;
      const seen = new Set(items.map((i: any) => i.id));
      const more = await db.menuItem.findMany({
        where: { available: true, image_url: { not: null }, id: { notIn: Array.from(seen) } },
        orderBy: [{ popularity_score: 'desc' }, { name: 'asc' }],
        take: need,
        select: { id: true, name: true, description: true, price: true, image_url: true, category: true },
      });
      items = [...items, ...more];
    }
    return { items };
  } catch (e: any) {
    return { items: [], error: e?.message };
  }
}, { public: true });

// PUBLIC — recent positive reviews for the public page social-proof block.
// Returns 4-5 stars from CustomerFeedback with a real comment.
registerFn('getPublicRecentReviews', async ({ body }) => {
  const limit = Math.min(10, Math.max(1, Number((body as any)?.limit) || 5));
  try {
    const rows = await db.customerFeedback.findMany({
      where: {
        rating: { gte: 4 },
        comments: { not: null },
      },
      orderBy: [{ visit_date: 'desc' }, { createdAt: 'desc' }],
      take: limit * 3, // over-fetch then prune empty comments client-side guard
      select: { customer_name: true, rating: true, comments: true, visit_date: true },
    });
    const filtered = rows
      .filter((r: any) => r.comments && r.comments.trim().length >= 8)
      .slice(0, limit)
      .map((r: any) => ({
        name: r.customer_name || 'אורח',
        rating: r.rating,
        comment: r.comments,
        date: r.visit_date ? new Date(r.visit_date).toISOString().slice(0, 10) : null,
      }));
    return { reviews: filtered };
  } catch (e: any) {
    return { reviews: [], error: e?.message };
  }
}, { public: true });

// PUBLIC — bulk availability check for a date. Returns map { "20:00": "open" | "tight" | "full" }
// so the booking page can color time slots without per-slot round trips.
registerFn('getDayAvailabilitySnapshot', async ({ body }) => {
  const b = (body || {}) as any;
  const date = String(b.date || '').slice(0, 10);
  const party_size = Math.max(1, Math.min(20, Number(b.party_size) || 2));
  const slots: string[] = Array.isArray(b.slots) ? b.slots.slice(0, 60).map((s: any) => String(s)) : [];
  if (!date || slots.length === 0) return { availability: {} };

  // Reuse the same engine the actual booking uses — most accurate signal.
  const search: any = functionHandlers['searchReservationTable'];
  const result: Record<string, string> = {};
  const RESTAURANT_CAP = 36;
  await Promise.all(slots.map(async (time) => {
    try {
      const res: any = await search({ body: { date, time, party_size }, user: null, req: undefined });
      if (!res?.canAccommodate) result[time] = 'full';
      else if ((res?.currentCapacity ?? 0) >= RESTAURANT_CAP * 0.7) result[time] = 'tight';
      else result[time] = 'open';
    } catch { result[time] = 'open'; }
  }));
  return { availability: result };
}, { public: true });

// PUBLIC — fetch a reservation by tracking_token for the customer-view page.
// Returns customer-safe fields only (no internal hostess_flag, no source data).
registerFn('getReservationByToken', async ({ body }) => {
  await ensureReservationSourceCols();
  const token = String((body as any)?.token || '').trim();
  if (!token) throw new Error('token required');
  const r = await (prisma as any).reservation.findFirst({ where: { tracking_token: token } });
  if (!r) throw new Error('not_found');
  return {
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    customer_email: r.customer_email,
    date: r.date,
    time: r.time,
    reservation_end_time: r.reservation_end_time,
    party_size: r.party_size,
    assigned_table: r.assigned_table,
    status: r.status,
    cancelled_at: r.cancelled_at,
    special_occasion: r.special_occasion,
    special_requests: r.special_requests,
  };
}, { public: true });

// PUBLIC — cancel a reservation by tracking_token.
// Policy: < 2 hours before start → marked 'no_show' (eligible for deposit charge).
// Otherwise → 'cancelled' (no charge).
registerFn('cancelReservationByToken', async ({ body }) => {
  await ensureReservationSourceCols();
  const b = (body || {}) as any;
  const token = String(b.token || '').trim();
  const reason = String(b.reason || '').slice(0, 300);
  if (!token) throw new Error('token required');
  const r = await (prisma as any).reservation.findFirst({ where: { tracking_token: token } });
  if (!r) throw new Error('not_found');
  if (r.cancelled_at || r.status === 'cancelled' || r.status === 'no_show') {
    return { ok: false, reason: 'already_cancelled' };
  }
  // Compute hours until reservation start
  const d = r.date instanceof Date ? r.date : new Date(r.date);
  const dateStr = d.toISOString().slice(0, 10);
  const startMs = new Date(`${dateStr}T${r.time}:00`).getTime();
  const hoursTo = (startMs - Date.now()) / (60 * 60 * 1000);
  const lateCancel = hoursTo < 2 && hoursTo >= -1;  // within 2h window (or up to 1h after start)
  const status = lateCancel ? 'no_show' : 'cancelled';
  await (prisma as any).reservation.update({
    where: { id: r.id },
    data: {
      status,
      cancelled_at: new Date(),
      cancellation_reason: reason || (lateCancel ? 'בוטל פחות משעתיים לפני' : 'בוטל ע״י הלקוח'),
    },
  });
  // Notify admin
  try {
    await pushoverToAdmins(
      lateCancel ? '🚨 ביטול מאוחר — הזמנה' : '❌ ביטול הזמנה',
      [
        `👤 ${r.customer_name} · ${r.customer_phone}`,
        `📅 ${dateStr} 🕐 ${r.time}`,
        `👥 ${r.party_size}`,
        reason ? `סיבה: ${reason}` : null,
        lateCancel ? '⚠️ פחות משעתיים — מועמד לחיוב פיקדון' : null,
      ].filter(Boolean).join('\n')
    );
  } catch {}
  return { ok: true, status, lateCancel };
}, { public: true });

// ---------------------------------------------------------------------------
// AI guest concierge for /PublicReservation
//   Answers menu / reservation / hours / parking / dietary / event questions.
//   Hard-coded system prompt — knows the restaurant cold so prospective
//   diners can ask anything and get a Hebrew answer right inside the page.
//   Returns { reply, intent?: 'reservation'|'event'|'menu'|'general' } so
//   the client can show context-aware shortcuts (e.g. a "scroll to form"
//   button when intent=reservation).
// ---------------------------------------------------------------------------
registerFn('guestInquiry', async ({ body }) => {
  const { message, history } = body as any || {};
  if (typeof message !== 'string' || !message.trim()) {
    return { reply: 'אפשר לכתוב לי שאלה ואני אנסה לעזור.', intent: 'general' };
  }
  const trimmed = String(message).slice(0, 800);
  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history.slice(-10) : [];
  const transcript = turns
    .map(t => `${t.role === 'assistant' ? 'מלצר' : 'אורח'}: ${String(t.content || '').slice(0, 400)}`)
    .join('\n');

  // Inject current Asia/Jerusalem day + hour so the model can answer
  // 'מה רץ הערב' correctly without guessing.
  const now = new Date();
  const tzShift = new Date(now.getTime() + 3 * 3600 * 1000); // ~UTC+3, close enough
  const israelHour = tzShift.getUTCHours();
  const israelDay = tzShift.getUTCDay();
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const todayName = dayNames[israelDay];
  const todayStatus = (() => {
    if (israelDay === 5) return 'סגורים כל היום (שישי). פותחים מוצ״ש מ-20:15.';
    if (israelDay === 6 && israelHour < 20) return 'שבת — פותחים הערב מ-20:15.';
    if (israelDay === 0) return 'ראשון — Burger Night. ספיישלים של בקר טרי 220גר׳.';
    if (israelDay === 1) return 'שני — ערב יין ללא תחתית. סומליה בבר, כוסות מ-₪61.';
    if (israelDay === 2) return 'שלישי — Butcher Night. נתחי הפתעה ומנות שף ישר מהקצב.';
    if (israelDay === 3) return 'רביעי — ערב קלאסי. התפריט המלא, קוקטיילי הבית.';
    if (israelDay === 4) return 'חמישי — פתוחים עד 02:00, האווירה בשיא.';
    return 'מוצ״ש — הערב הכי גבוה של השבוע, פתוחים עד הלקוח האחרון.';
  })();
  const happyHourActive = israelDay !== 5 && israelDay !== 6 && israelHour < 20;

  const systemPrompt = `אתה המלצר הווירטואלי של מסעדת **${await getBrandName()}**.

═══ עכשיו (חשוב מאוד) ═══
היום: יום ${todayName}. השעה בישראל: ${String(israelHour).padStart(2,'0')}:00.
מה רץ הערב במסעדה: ${todayStatus}
Happy Hour כרגע: ${happyHourActive ? 'פעיל — 40% הנחה על האלכוהול' : 'לא פעיל כרגע'}.

═══ מידע קבוע על המסעדה ═══
חמארה ים-תיכונית כשרה. מנגל פתוח, בר אלכוהול. רוטשילד 104 ראשון לציון. טלפון: 03-622-8055. אינסטגרם: @alena.hamara.

שעות:
  א׳-ד׳ 12:00-00:00 · ה׳ 12:00-02:00 · ו׳ סגור · ש׳ 20:15-02:00
  עסקיות 12:00-17:00 בכל יום פתוח

ערבי הנושא:
  ראשון = Burger Night · שני = יין ללא תחתית · שלישי = Butcher Night · רביעי = ערב קלאסי · חמישי = ערב גבוה (עד 02:00) · מוצ״ש = הערב הכי גבוה (מ-20:15)
  Happy Hour: א׳-ה׳ עד 20:00, 40% הנחה על האלכוהול

הזמנות: עד 12 סועדים בטופס בעמוד הזה. 13+ = אירוע פרטי דרך /EventsInquiry. ביטול חופשי עד 3 שעות לפני (אחר כך 30₪ פיקדון לסועד). השולחן ממתין 10 דק׳ לאיחור.

חניה: חניון בן גוריון 2 דק׳ הליכה (חינם אחר הצהריים). חניה בכחול-לבן ברוטשילד/הרצל/וייצמן.

תפריט: בשר על האש, חמארה, פוקצ׳ות, פלטות, סלטים, קינוחים. תפריט מלא ב-/menu. יש מנות צמחוניות (לא טבעוני מלא).

═══ כללים נוקשים ═══
1. **שפת התשובה**: זהה את השפה של ההודעה האחרונה של האורח. **תשובתך חייבת להיות באותה שפה בדיוק**. עברית→עברית, English→English, רוסית→רוסית. ברירת מחדל = עברית. **אסור להחליף שפה אקראית** באמצע השיחה.
2. **רלוונטיות**: תענה ישירות על מה שנשאל. אל תוסיף מידע לא קשור (לדוגמה: אל תספר על Burger Night אם נשאלת על איך להזמין שולחן).
3. **דיוק**: אל תמציא מידע. אם לא יודע — הצע 03-622-8055.
4. **הזמנה** → הדריך למילוי הטופס בעמוד. **אירוע 13+** → הפנה ל-/EventsInquiry.
5. **תמציתיות**: 1-3 משפטים מקסימום. חם, ישיר, מקצועי.
6. אסור לדבר על מתחרים. אסור להבטיח הנחות שלא קיימות.

החזר JSON עם:
  reply  — התשובה לאורח, **באותה שפה של ההודעה האחרונה שלו**
  intent — "reservation" / "event" / "menu" / "hours" / "general"`;

  const userMessage = transcript
    ? `${transcript}\nאורח: ${trimmed}`
    : `אורח: ${trimmed}`;

  try {
    const result: any = await invokeLLM({
      prompt: `${systemPrompt}\n\n--- השיחה ---\n${userMessage}`,
      responseSchema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          intent: { type: 'string', enum: ['reservation', 'event', 'menu', 'hours', 'general'] },
        },
        required: ['reply'],
      },
    });
    return {
      reply: String(result?.reply || 'מצטער, רגע אחד...').slice(0, 1500),
      intent: result?.intent || 'general',
    };
  } catch (err: any) {
    return {
      reply: 'משהו פה לא עובד אצלי כרגע. אפשר להתקשר ל-03-622-8055 ונשמח לעזור.',
      intent: 'general',
    };
  }
}, { public: true });
// ===========================================================================
// SpecialPopup admin + tracking
//   Owner edits the marketing popups from /SpecialsAdmin; PublicReservation
//   fetches the active list at load time and picks one client-side. Every
//   show / dismiss / click / converted is logged to PopupEvent so the admin
//   can see which variants actually drive bookings.
// ===========================================================================

// Idempotent CREATE TABLE for the two SpecialPopup-related tables.
// The container's cold-start `prisma db push` has been failing silently
// on this host, so we mirror the additive-schema pattern used for
// Reservation columns elsewhere in this file.
let specialPopupTablesEnsured = false;
async function ensureSpecialPopupTables() {
  if (specialPopupTablesEnsured) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SpecialPopup" (
      "id"                TEXT PRIMARY KEY,
      "variant"           TEXT NOT NULL UNIQUE,
      "eyebrow"           TEXT,
      "emoji"             TEXT,
      "title"             TEXT NOT NULL,
      "body"              TEXT NOT NULL,
      "cta"               TEXT NOT NULL DEFAULT 'הזמן שולחן',
      "cta_href"          TEXT,
      "target_days"       TEXT,
      "target_hour_from"  INTEGER,
      "target_hour_to"    INTEGER,
      "priority"          INTEGER NOT NULL DEFAULT 0,
      "is_active"         BOOLEAN NOT NULL DEFAULT TRUE,
      "starts_at"         TIMESTAMP(3),
      "ends_at"           TIMESTAMP(3),
      "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => {});
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PopupEvent" (
      "id"        TEXT PRIMARY KEY,
      "variant"   TEXT NOT NULL,
      "action"    TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "ts"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PopupEvent_variant_action_idx" ON "PopupEvent"("variant","action");`
  ).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PopupEvent_sessionId_idx" ON "PopupEvent"("sessionId");`
  ).catch(() => {});
  specialPopupTablesEnsured = true;
}

// Public — list of all active popups, including filters. Client picks one.
registerFn('getActiveSpecialPopups', async () => {
  await ensureSpecialPopupTables();
  const now = new Date();
  const rows: any[] = await db.specialPopup.findMany({
    where: {
      is_active: true,
      OR: [
        { AND: [{ starts_at: null }, { ends_at: null }] },
        { AND: [{ starts_at: { lte: now } }, { ends_at: null }] },
        { AND: [{ starts_at: null }, { ends_at: { gte: now } }] },
        { AND: [{ starts_at: { lte: now } }, { ends_at: { gte: now } }] },
      ],
    } as any,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((p) => ({
    id: p.id, variant: p.variant,
    eyebrow: p.eyebrow, emoji: p.emoji, title: p.title, body: p.body,
    cta: p.cta, cta_href: p.cta_href,
    target_days: p.target_days, target_hour_from: p.target_hour_from, target_hour_to: p.target_hour_to,
    priority: p.priority,
  }));
}, { public: true });

// Public — telemetry sink. Accepts {variant, action, sessionId}.
// action is one of 'shown' | 'dismissed' | 'clicked' | 'converted'.
registerFn('trackPopupEvent', async ({ body }) => {
  const { variant, action, sessionId } = (body as any) || {};
  if (typeof variant !== 'string' || !variant.trim()) return { ok: false };
  if (!['shown', 'dismissed', 'clicked', 'converted'].includes(String(action))) return { ok: false };
  if (typeof sessionId !== 'string' || !sessionId.trim()) return { ok: false };
  await ensureSpecialPopupTables();
  try {
    await db.popupEvent.create({
      data: {
        variant: String(variant).slice(0, 80),
        action: String(action),
        sessionId: String(sessionId).slice(0, 80),
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}, { public: true });

// Admin — full list including inactive, for the editor.
registerFn('listSpecialPopups', async ({ user }) => {
  if (!user) throw new Error('auth required');
  await ensureSpecialPopupTables();
  return await db.specialPopup.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] });
});

// Admin — create or update a popup row.
registerFn('upsertSpecialPopup', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  await ensureSpecialPopupTables();
  const b = (body as any) || {};
  if (typeof b.variant !== 'string' || !b.variant.trim()) throw new Error('variant required');
  if (typeof b.title !== 'string' || !b.title.trim()) throw new Error('title required');
  const data: any = {
    variant: String(b.variant).trim().slice(0, 80),
    eyebrow: b.eyebrow ? String(b.eyebrow).slice(0, 120) : null,
    emoji: b.emoji ? String(b.emoji).slice(0, 8) : null,
    title: String(b.title).slice(0, 240),
    body: String(b.body || '').slice(0, 1200),
    cta: b.cta ? String(b.cta).slice(0, 80) : 'הזמן שולחן',
    cta_href: b.cta_href ? String(b.cta_href).slice(0, 240) : null,
    target_days: b.target_days ? String(b.target_days).slice(0, 32) : null,
    target_hour_from: typeof b.target_hour_from === 'number' ? Math.max(0, Math.min(23, b.target_hour_from)) : null,
    target_hour_to: typeof b.target_hour_to === 'number' ? Math.max(0, Math.min(24, b.target_hour_to)) : null,
    priority: typeof b.priority === 'number' ? b.priority : 0,
    is_active: b.is_active !== undefined ? Boolean(b.is_active) : true,
    starts_at: b.starts_at ? new Date(b.starts_at) : null,
    ends_at: b.ends_at ? new Date(b.ends_at) : null,
  };
  const existing = await db.specialPopup.findUnique({ where: { variant: data.variant } });
  if (existing) {
    return await db.specialPopup.update({ where: { id: existing.id }, data });
  }
  return await db.specialPopup.create({ data });
});

// Admin — delete a popup. Tracking events stay so historic analytics survive.
registerFn('deleteSpecialPopup', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  await ensureSpecialPopupTables();
  const id = (body as any)?.id;
  if (typeof id !== 'string') throw new Error('id required');
  await db.specialPopup.delete({ where: { id } });
  return { ok: true };
});

// Admin — per-variant funnel: shown / dismissed / clicked / converted.
registerFn('getPopupAnalytics', async ({ user, body }) => {
  if (!user) throw new Error('auth required');
  await ensureSpecialPopupTables();
  const sinceDays = Number((body as any)?.since_days) || 30;
  const since = new Date(Date.now() - sinceDays * 86400 * 1000);
  const rows: any[] = await db.popupEvent.groupBy({
    by: ['variant', 'action'],
    where: { ts: { gte: since } },
    _count: { _all: true },
  });
  const byVariant: Record<string, any> = {};
  for (const r of rows) {
    const v = r.variant;
    if (!byVariant[v]) byVariant[v] = { variant: v, shown: 0, dismissed: 0, clicked: 0, converted: 0 };
    byVariant[v][r.action] = (r._count?._all as number) || 0;
  }
  const out = Object.values(byVariant).map((v: any) => ({
    ...v,
    ctr: v.shown > 0 ? Math.round((v.clicked / v.shown) * 1000) / 10 : 0,
    conversion_rate: v.clicked > 0 ? Math.round((v.converted / v.clicked) * 1000) / 10 : 0,
  }));
  out.sort((a, b) => b.shown - a.shown);
  return { since_days: sinceDays, variants: out };
});

// Admin — seed defaults if the table is empty.
registerFn('seedSpecialPopupsIfEmpty', async ({ user }) => {
  if (!user) throw new Error('auth required');
  await ensureSpecialPopupTables();
  const count = await db.specialPopup.count();
  if (count > 0) return { seeded: false, existing: count };
  const seeds = [
    { variant: 'events', priority: 0, eyebrow: 'אירועים פרטיים', emoji: '🎉',
      title: 'מארגנים אירוע אצלכם בעסק או בחיים?',
      body: 'יום הולדת 30, מסיבת רווקות, אירוע חברה, מפגש לקוחות — אצלנו סוגרים תפריט אישי, חדר פרטי, ובר פתוח. מנוסים באירוח גבוה.',
      cta: 'בקשת הצעת מחיר לאירוע', cta_href: '/EventsInquiry' },
    { variant: 'lunch', priority: 10, eyebrow: 'בצהריים אצלנו', emoji: '🍽',
      title: 'ארוחות צהריים עסקיות',
      body: 'תפריט עסקי במחיר מיוחד, 12:00-17:00. מנה ראשונה, עיקרית ושתייה — והשולחן כולו רק שלכם.',
      cta: 'הזמן צהריים', target_days: '0,1,2,3,4', target_hour_from: 11, target_hour_to: 15 },
    { variant: 'midweek-1', priority: 8, eyebrow: 'אמצע שבוע', emoji: '🍷',
      title: 'הערב — יין ללא תחתית',
      body: 'הסומליה בבר, כוסות מ-61 שקל, יין נמזג ברצף עד הסגירה. הערב הכי שקט-עם-עומק של השבוע.',
      cta: 'תפוס שולחן הערב', target_days: '1', target_hour_from: 16 },
    { variant: 'midweek-2', priority: 8, eyebrow: 'אמצע שבוע', emoji: '🥩',
      title: 'הערב — Butcher Night',
      body: 'נתחי הפתעה ומנות שף חד-פעמיות. ישר מהקצב לגריל. כשנגמר — נגמר.',
      cta: 'תפוס שולחן הערב', target_days: '2', target_hour_from: 16 },
    { variant: 'midweek-3', priority: 8, eyebrow: 'אמצע שבוע', emoji: '🍸',
      title: 'הערב — רביעי קלאסי',
      body: 'התפריט המלא, השף בעבודה, וקוקטיילי הבית במיטבם. אווירת מועדון שקטה ומדויקת.',
      cta: 'תפוס שולחן הערב', target_days: '3', target_hour_from: 16 },
    { variant: 'sat', priority: 9, eyebrow: 'מוצש', emoji: '✨',
      title: 'הערב הכי גבוה של השבוע',
      body: 'פותחים מ-20:15 עד הלקוח האחרון. הצוות בכושר, המקום מתמלא — אם רוצים שולחן הלילה, עכשיו זה הזמן.',
      cta: 'תפוס שולחן עכשיו', target_days: '6', target_hour_from: 18 },
  ];
  for (const s of seeds) {
    await db.specialPopup.create({ data: { ...s, is_active: true } });
  }
  return { seeded: true, count: seeds.length };
});

// ─────────────────────────────────────────────────────────────────────────────
// AI SEATING ASSISTANT — LLM-backed advisor for the hostess
// Takes a free-text question + current restaurant state, returns a structured
// recommendation. Used by the rail's AI chat box.
// ─────────────────────────────────────────────────────────────────────────────
registerFn('aiSeatingAssistant', async ({ body }) => {
  const b = (body || {}) as any;
  const question = String(b.question || '').slice(0, 600).trim();
  if (!question) throw new Error('question required');

  // Limit DB load: only TODAY's reservations + active queue + active sessions.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const [layout, allRes, queue, sessions] = await Promise.all([
    (prisma as any).seatingLayout.findFirst().catch(() => null),
    db.reservation.findMany({
      where: { date: { gte: todayStart, lt: todayEnd } },
      orderBy: { time: 'asc' },
      take: 60,
    }).catch(() => []),
    (prisma as any).queueEntry.findMany({
      where: { OR: [{ status: 'pending' }, { status: 'active' }] },
      orderBy: { timestamp_register: 'desc' },
      take: 20,
    }).catch(() => []),
    db.tableSession.findMany({ where: { status: 'active' } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayRes = (allRes || []).filter((r: any) => {
    const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    return d === today;
  });
  const activeQueue = (queue || []).filter((q: any) =>
    (q.status === 'pending' || q.status === 'active') && !q.treated
  );
  const tables = (layout?.tables as any[] || []).map((t: any) => ({
    n: t.table_number, min: t.min_capacity, max: t.max_capacity,
    area: t.area, combinable: t.combinable_with, location: t.location,
  }));
  const reservations = todayRes.map((r: any) => ({
    name: r.customer_name, time: r.time, end: r.reservation_end_time,
    party: r.party_size, status: r.status, table: r.assigned_table,
  }));
  const queueShort = activeQueue.map((q: any) => ({
    name: q.customer_name, party: q.party_size,
    waitMin: q.timestamp_register
      ? Math.round((Date.now() - new Date(q.timestamp_register).getTime()) / 60000) : 0,
    status: q.status, pref: q.seating_preference,
  }));
  const seatedNow = sessions.map((s: any) => ({
    table: s.table_number, party: s.party_size, name: s.customer_name,
  }));

  const nowStr = new Date().toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const combinable = tables.filter((t: any) => Array.isArray(t.combinable) && t.combinable.length);

  const sys = `${await businessContextBlock()}אתה עוזר ניהול הושבה למסעדה "${await getBrandName()}". מקבל מצב מסעדה עכשיו ועונה למארחת בעברית.
תפקידך: המלצה קצרה, מעשית, ספציפית. שמות, שעות ושולחנות אמיתיים מהנתונים בלבד.
תמיד החזר JSON: {"answer": "...", "actions": [{"label":"...","table":"...","customer":"..."}]}.
תשובה 1-3 משפטים. פעולות = רעיונות קונקרטיים (חבר 201+202, הושב X על שולחן Y, האריך, העבר וכו').`;

  // Split tables by location so location-based questions ("בחוץ" / "outdoor") just work.
  const outdoorTables = tables.filter((t: any) => String(t.location || '').toLowerCase() === 'outdoor');
  const indoorTables = tables.filter((t: any) => String(t.location || '').toLowerCase() !== 'outdoor');
  // Compute "free until" for each table — earliest upcoming reservation time today.
  // For an OCCUPIED table (active session), free becomes the estimated end of session.
  const nowMin = (() => {
    const d = new Date();
    return (d.getUTCHours() + 3) % 24 * 60 + d.getUTCMinutes();
  })();
  const toMin = (hhmm: string) => {
    if (!hhmm) return -1;
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h * 60) + (m || 0);
  };
  const freeUntilByTable = new Map<string, string>(); // tableNum → 'HH:MM' or 'תפוס' or 'פנוי כל הערב'
  for (const t of tables) {
    const tableNum = String(t.n);
    const occupiedNow = seatedNow.some((s: any) => String(s.table) === tableNum);
    // Find upcoming today reservations that assign this table, sorted by time
    const upcomingForTable = reservations
      .filter((r: any) => {
        const assigned = Array.isArray(r.table) ? r.table : [r.table];
        return assigned && assigned.some((a: any) => String(a) === tableNum) && toMin(r.time) > nowMin;
      })
      .sort((a: any, b: any) => toMin(a.time) - toMin(b.time));
    if (occupiedNow) {
      freeUntilByTable.set(tableNum, 'תפוס עכשיו' + (upcomingForTable[0] ? ` → גם ב-${upcomingForTable[0].time}` : ''));
    } else if (upcomingForTable[0]) {
      freeUntilByTable.set(tableNum, `פנוי עד ${upcomingForTable[0].time} (אז ${upcomingForTable[0].name} ×${upcomingForTable[0].party})`);
    } else {
      freeUntilByTable.set(tableNum, 'פנוי כל הערב');
    }
  }

  // Identify which tables are currently occupied (active session) or assigned to an upcoming reservation
  const occupiedTableSet = new Set<string>();
  for (const s of seatedNow) if (s.table) occupiedTableSet.add(String(s.table));
  for (const r of reservations) {
    if (!r.table) continue;
    const arr = Array.isArray(r.table) ? r.table : [r.table];
    for (const tn of arr) occupiedTableSet.add(String(tn));
  }
  const freeTables = tables.filter((t: any) => !occupiedTableSet.has(String(t.n)));
  const freeOutdoor = freeTables.filter((t: any) => String(t.location || '').toLowerCase() === 'outdoor');
  const freeIndoor  = freeTables.filter((t: any) => String(t.location || '').toLowerCase() !== 'outdoor');

  // Load owner-saved explicit combos (the 📌 ones from the new UI) — sorted by priority
  const ownerCombos: Array<any> = (Array.isArray((layout as any)?.combos) ? (layout as any).combos : [])
    .slice()
    .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999));
  // Tag each combo with current availability so AI can pick the first free option.
  const comboAvailability = (c: any) => {
    const fixed: string[] = Array.isArray(c.tables) ? c.tables.map(String) : [];
    const taken: string[] = [];
    for (const t of fixed) if (occupiedTableSet.has(t)) taken.push(t);
    if (taken.length === 0) return { status: '✅ פנוי', note: '' };
    return { status: '❌ תפוס', note: `(${taken.map(t=>'#'+t).join(', ')} תפוסים)` };
  };
  const groupedCombosByPartySize: Record<number, any[]> = {};
  for (const c of ownerCombos) {
    const ps = Number(c.party_size);
    if (!groupedCombosByPartySize[ps]) groupedCombosByPartySize[ps] = [];
    groupedCombosByPartySize[ps].push(c);
  }
  const ownerCombosText = Object.keys(groupedCombosByPartySize).length
    ? Object.entries(groupedCombosByPartySize).map(([ps, list]: [string, any[]]) => {
        const lines = list.map((c, i) => {
          const fixed = (c.tables || []).map((id: any) => `#${id}`).join('+');
          const flex = (c.flex_slots || []).map((s: any) => `+🃏${s.label || `max ${s.table_max}`}`).join('');
          const av = comboAvailability(c);
          return `  ${i+1}. ${fixed}${flex} → ${av.status} ${av.note}`;
        }).join('\n');
        return `[${ps} סועדים]\n${lines}`;
      }).join('\n')
    : 'אין חיבורים שמורים';

  // Areas summary — group tables by area with counts
  const areaSummary = (() => {
    const map = new Map<string, { total: number; free: number; loc: string }>();
    for (const t of tables) {
      const area = t.area || '(ללא אזור)';
      const cur = map.get(area) || { total: 0, free: 0, loc: t.location === 'outdoor' ? 'חוץ' : 'פנים' };
      cur.total++;
      if (!occupiedTableSet.has(String(t.n))) cur.free++;
      map.set(area, cur);
    }
    return [...map.entries()].map(([a, v]) => `${a} (${v.loc}, פנויים ${v.free}/${v.total})`).join(', ');
  })();

  const summarizeByCap = (arr: any[]) => {
    if (!arr.length) return 'אין';
    return arr.map((t: any) => `#${t.n}(${t.min}-${t.max})`).join(', ');
  };
  const summarizeWithUntil = (arr: any[]) => {
    if (!arr.length) return 'אין';
    return arr.map((t: any) => {
      const until = freeUntilByTable.get(String(t.n));
      const untilShort = until?.startsWith('פנוי עד') ? ' עד ' + until.match(/\d{2}:\d{2}/)?.[0] : '';
      return `#${t.n}(${t.min}-${t.max}${untilShort})`;
    }).join(', ');
  };

  const userCtx = `שעה: ${nowStr}

שאלה מהמארחת:
"""${question}"""

מילון מיקומים:
• "בחוץ" / "outdoor" / "חצר" / "טראסה" = location: outdoor
• "בפנים" / "indoor" / "פנים" / "סלון" = location: indoor

מצב נוכחי:
• ${tables.length} שולחנות סה"כ — ${indoorTables.length} בפנים, ${outdoorTables.length} בחוץ
• אזורים: ${areaSummary}
• ${reservations.length} הזמנות היום, ${queueShort.length} בתור (${queueShort.filter((q: any) => q.status === 'pending').length} pending, ${queueShort.filter((q: any) => q.status === 'active').length} active), ${seatedNow.length} סשנים פעילים

🌿 שולחנות פנויים בחוץ (#מס׳(min-max)):
${summarizeByCap(freeOutdoor).slice(0, 600)}

🏠 שולחנות פנויים בפנים:
${summarizeByCap(freeIndoor).slice(0, 600)}

⏰ זמינות עד מתי (רק שולחנות שיש להם הזמנה היום):
${[...freeUntilByTable.entries()].filter(([_,v]) => v.startsWith('פנוי עד')).slice(0, 15).map(([n,v]) => `#${n}: ${v}`).join(' | ') || 'אין הזמנות עתידיות היום'}

📌 חיבורים שמורים — סדר עדיפות של בעל המסעדה (1=הכי עדיף, ✅=פנוי, ❌=תפוס):
${ownerCombosText}

⚠️ כשהבקשה תואמת מספר סועדים שיש לו חיבורים שמורים — חובה ללכת לפי הסדר ולבחור את הראשון שמסומן ✅. דלג על ❌. אם כולם תפוסים — תאמר זאת ותציע חלופה אוטומטית.

🔗 חיבורים אוטומטיים מהגרף (combinable_with):
${combinable.map((t: any) => `${t.n}+${t.combinable.join('+')} (${t.min}-${t.max})`).join(', ') || 'אין'}

הזמנות פתוחות (היום):
${reservations.slice(0, 30).map((r: any) => `${r.time || '--'} ${r.name} ×${r.party} [${r.status}]${r.table ? ' שולחן ' + (Array.isArray(r.table) ? r.table.join(',') : r.table) : ''}`).join('\n') || '—'}

בתור:
${queueShort.map((q: any) => `${q.name} ×${q.party} (ממתין ${q.waitMin}ד״ק, ${q.status}${q.pref ? ', ' + q.pref : ''})`).join('\n') || '—'}

יושבים עכשיו (סשנים פעילים):
${seatedNow.map((s: any) => `שולחן ${s.table} ×${s.party} ${s.name || ''}`).join('\n') || '—'}

חוקים לתשובה:
1. **answer** — תשובה אנושית, 1-2 משפטים. תמיד מלא במשהו מועיל. אסור להחזיר ריק.
2. **actions** — מקסימום 2 פעולות מומלצות. בלי רשימות ארוכות.
3. אם נדרש מקום ספציפי (בחוץ/בפנים/אזור) — להציע מהמיקום הזה. אם אין — להגיד "אין X, אפשר Y" במקום זה.
4. אם יש חיבור שמור (📌) שמתאים לכמות סועדים — להעדיף.
5. אם שולחן פנוי רק עד שעה מסוימת — לציין.

החזר JSON בלבד.`;

  try {
    const out: any = await invokeLLM({
      prompt: `${sys}\n\n---\n\n${userCtx}`,
      // Speed > reliability for this interactive helper.
      timeoutMs: 25_000,
      maxOutputTokens: 4096,
      maxAttempts: 1,
      responseSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                table: { type: 'string' },
                customer: { type: 'string' },
              },
            },
          },
        },
        required: ['answer'],
      },
    } as any);
    console.log('[aiSeatingAssistant] LLM raw output:', JSON.stringify(out).slice(0, 400));
    // Robust answer extraction — LLM sometimes wraps JSON in markdown, returns
    // {text:...} instead of {answer:...}, or returns a stringified JSON.
    let answer: string = String(out?.answer || out?.text || out?.reply || '').trim();
    if (!answer && typeof out === 'string') {
      // Sometimes invokeLLM returns the raw text when JSON parsing failed upstream
      try {
        const parsed = JSON.parse(out.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
        answer = String(parsed?.answer || '');
      } catch { /* fallthrough */ }
      if (!answer) answer = out as string;
    }
    return {
      answer: answer || 'ה-AI לא החזיר תשובה. נסה שוב, או נסח קצר יותר.',
      actions: Array.isArray(out?.actions) ? out.actions.slice(0, 5) : [],
    };
  } catch (e: any) {
    console.error('[aiSeatingAssistant] error:', e?.message);
    return { answer: `שגיאת AI: ${e?.message || 'לא ידוע'}`, actions: [] };
  }
});
// ---------------------------------------------------------------------------
// T+24h survey ping
//   Runs daily ~12:00 via /api/cron/customer-survey-reminder. For each
//   confirmed (non-standby, non-cancelled) reservation that started yesterday
//   and hasn't been pinged yet, send a WhatsApp asking for feedback. Link
//   goes to /CustomerSurvey?source=t24&res=<id> — existing survey page
//   already handles rating>3 → Google review redirect and rating<=3 →
//   internal incident creation.
// ---------------------------------------------------------------------------
export async function sendT24SurveyReminders() {
  await ensureReservationSourceCols();
  const now = new Date();
  // Yesterday in Asia/Jerusalem (UTC+3 approx — close enough for "yesterday")
  const tzNow = new Date(now.getTime() + 3 * 3600 * 1000);
  const tzYesterday = new Date(tzNow);
  tzYesterday.setUTCDate(tzNow.getUTCDate() - 1);
  const yStart = new Date(Date.UTC(tzYesterday.getUTCFullYear(), tzYesterday.getUTCMonth(), tzYesterday.getUTCDate()));
  const yEnd = new Date(yStart.getTime() + 24 * 3600 * 1000);

  const targets: any[] = await db.reservation.findMany({
    where: {
      date: { gte: yStart, lt: yEnd },
      status: 'confirmed',
      is_standby: false,
      survey_sent_at: null,
      customer_phone: { not: null },
    } as any,
    select: {
      id: true, customer_name: true, customer_phone: true,
      time: true, party_size: true, date: true,
    } as any,
  });

  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
  let sent = 0;
  let failed = 0;

  for (const r of targets) {
    const phone = String(r.customer_phone || '').trim();
    if (!phone) continue;
    const link = `${baseUrl}/CustomerSurvey?source=t24&res=${r.id}`;
    const body = [
      `שלום ${r.customer_name || ''}!`,
      ``,
      `איך הייתה הארוחה אתמול ב${await getBrandName()}?`,
      `נשמח לחוות דעתך — לוקח 30 שניות:`,
      `${link}`,
      ``,
      `תודה ולהתראות 🌿`,
    ].join('\n');

    try {
      await sendWhatsApp(phone, body);
      await db.reservation.update({
        where: { id: r.id },
        data: { survey_sent_at: new Date() } as any,
      });
      sent++;
    } catch (e: any) {
      failed++;
      console.warn('[t24-survey] send failed for', r.id, e?.message);
    }
  }

  // Notify admins so they know the cron actually ran (and how many went out).
  if (sent > 0) {
    try {
      await pushoverToAdmins(
        'סקרי T+24h נשלחו',
        `${sent} לקוחות קיבלו הזמנה לחוות דעת על אתמול${failed ? ` · ${failed} נכשלו` : ''}`,
      );
    } catch {}
  }

  return { sent, failed, candidates: targets.length };
}

// === Startup drift-repair: ensure Reservation columns exist before any read ===
// Without this, a fresh deploy that added a new column (e.g. survey_sent_at) breaks
// every Reservation.findMany() until createPublicReservation happens to run.
// Fires once at module import (= server boot).
if (!(globalThis as any).__startupDriftRepair) {
  (globalThis as any).__startupDriftRepair = true;
  void (async () => {
    try {
      await ensureReservationSourceCols();
      console.log('[startup] ensureReservationSourceCols OK');
    } catch (e: any) {
      console.error('[startup] ensureReservationSourceCols failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "SeatingLayout" ADD COLUMN IF NOT EXISTS "combos" JSONB;`);
      console.log('[startup] SeatingLayout.combos column ensured');
    } catch (e: any) {
      console.error('[startup] ensure SeatingLayout.combos failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_required" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_amount" INTEGER;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_provider" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_provider_ref" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_status" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_authorized_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_released_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "marketing_consent_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketing_consent_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketing_unsubscribed_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ShiftTracking" ADD COLUMN IF NOT EXISTS "end_reminder_sent_at" TIMESTAMP(3);`);
      // Checklist.department — added for dept-filter UI (floor/bar/kitchen/managers)
      await prisma.$executeRawUnsafe(`ALTER TABLE "Checklist" ADD COLUMN IF NOT EXISTS "department" TEXT;`);
      // Customer marketing fields — birthday/anniversary for campaigns + throttling
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "city" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthday_mmdd" TEXT;`);
      // Club-profile legacy/base44 columns — ensure they exist so the Prisma
      // model declarations don't P2022 on rows that predate them.
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthday" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "satisfaction_status" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "total_visits" DOUBLE PRECISION DEFAULT 0;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "total_spent" DOUBLE PRECISION DEFAULT 0;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "anniversary_mmdd" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "anniversary_label" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "last_marketing_sent_at" TIMESTAMP(3);`);
      // Drip-campaign tracking columns
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "welcome_sent_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "nps_sent_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pre_birthday_sent_year" INTEGER;`);
      // CampaignSend table — log of every marketing campaign for analytics + history
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CampaignSend" (
        "id" TEXT PRIMARY KEY,
        "campaign_key" TEXT NOT NULL,
        "campaign_label" TEXT,
        "segment_key" TEXT NOT NULL,
        "segment_filter" JSONB,
        "channel" TEXT NOT NULL,
        "message_template" TEXT NOT NULL,
        "media_url" TEXT,
        "recipient_count" INTEGER NOT NULL DEFAULT 0,
        "success_count" INTEGER NOT NULL DEFAULT 0,
        "failure_count" INTEGER NOT NULL DEFAULT 0,
        "failure_reasons" JSONB,
        "delivered_count" INTEGER NOT NULL DEFAULT 0,
        "read_count" INTEGER NOT NULL DEFAULT 0,
        "converted_count" INTEGER NOT NULL DEFAULT 0,
        "estimated_cost_ils" DOUBLE PRECISION,
        "sent_by" TEXT,
        "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      // Add new cols to existing CampaignSend if upgrading
      await prisma.$executeRawUnsafe(`ALTER TABLE "CampaignSend" ADD COLUMN IF NOT EXISTS "media_url" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CampaignSend" ADD COLUMN IF NOT EXISTS "delivered_count" INTEGER NOT NULL DEFAULT 0;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CampaignSend" ADD COLUMN IF NOT EXISTS "read_count" INTEGER NOT NULL DEFAULT 0;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CampaignSend" ADD COLUMN IF NOT EXISTS "converted_count" INTEGER NOT NULL DEFAULT 0;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CampaignSend" ADD COLUMN IF NOT EXISTS "estimated_cost_ils" DOUBLE PRECISION;`);
      // Per-recipient tracking — lifecycle + attribution
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CampaignRecipient" (
        "id" TEXT PRIMARY KEY,
        "campaign_send_id" TEXT NOT NULL,
        "customer_id" TEXT,
        "phone" TEXT NOT NULL,
        "customer_name" TEXT,
        "twilio_sid" TEXT UNIQUE,
        "status" TEXT NOT NULL DEFAULT 'queued',
        "delivered_at" TIMESTAMP(3),
        "read_at" TIMESTAMP(3),
        "failed_at" TIMESTAMP(3),
        "failure_reason" TEXT,
        "converted_reservation_id" TEXT,
        "converted_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaign_send_id_idx" ON "CampaignRecipient"("campaign_send_id");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CampaignRecipient_customer_id_idx" ON "CampaignRecipient"("customer_id");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CampaignRecipient_twilio_sid_idx" ON "CampaignRecipient"("twilio_sid");`);

      // SavedSegment — owner-saved custom filters for re-use
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SavedSegment" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "segment_key" TEXT NOT NULL,
        "custom_filter" JSONB,
        "default_template" TEXT,
        "default_channel" TEXT DEFAULT 'whatsapp',
        "created_by" TEXT,
        "use_count" INTEGER NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      // ReferralCode + ReferralUse — referral program
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReferralCode" (
        "id" TEXT PRIMARY KEY,
        "code" TEXT UNIQUE NOT NULL,
        "customer_id" TEXT,
        "customer_phone" TEXT,
        "customer_name" TEXT,
        "reward_referrer_amount" INTEGER DEFAULT 50,
        "reward_referee_amount" INTEGER DEFAULT 50,
        "total_uses" INTEGER NOT NULL DEFAULT 0,
        "total_conversions" INTEGER NOT NULL DEFAULT 0,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReferralUse" (
        "id" TEXT PRIMARY KEY,
        "referral_code" TEXT NOT NULL,
        "used_by_phone" TEXT NOT NULL,
        "used_by_name" TEXT,
        "reservation_id" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "reward_issued_at" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReferralUse_referral_code_idx" ON "ReferralUse"("referral_code");`);

      // === EVENT VENDORS ====================================================
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Vendor" (
        "id" TEXT PRIMARY KEY,
        "business_name" TEXT NOT NULL,
        "contact_name" TEXT, "phone" TEXT, "whatsapp" TEXT, "email" TEXT,
        "city" TEXT, "website" TEXT, "instagram" TEXT,
        "business_id" TEXT, "vat_type" TEXT,
        "categories" JSONB, "specialties" TEXT,
        "default_commission_pct" DOUBLE PRECISION,
        "default_commission_fixed_ils" INTEGER,
        "commission_stage" TEXT DEFAULT 'on_event_date',
        "bank_name" TEXT, "bank_branch" TEXT, "bank_account" TEXT, "bank_account_owner" TEXT,
        "insurance_url" TEXT, "insurance_expiry" TIMESTAMP(3),
        "business_license_url" TEXT, "business_license_expiry" TIMESTAMP(3),
        "status" TEXT DEFAULT 'active',
        "rating" INTEGER, "internal_notes" TEXT,
        "marketing_consent" BOOLEAN NOT NULL DEFAULT TRUE,
        "marketing_consent_at" TIMESTAMP(3),
        "marketing_unsubscribed_at" TIMESTAMP(3),
        "last_marketing_sent_at" TIMESTAMP(3),
        "created_by" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VendorAgreement" (
        "id" TEXT PRIMARY KEY,
        "vendor_id" TEXT NOT NULL,
        "title" TEXT, "file_url" TEXT,
        "commission_pct" DOUBLE PRECISION,
        "commission_fixed_ils" INTEGER,
        "commission_stage" TEXT,
        "valid_from" TIMESTAMP(3), "valid_until" TIMESTAMP(3),
        "status" TEXT DEFAULT 'active',
        "notes" TEXT, "created_by" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VendorAgreement_vendor_id_idx" ON "VendorAgreement"("vendor_id");`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "VendorAgreement" ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "VendorAgreement" ADD COLUMN IF NOT EXISTS "signed_by_name" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "VendorAgreement" ADD COLUMN IF NOT EXISTS "signed_signature_url" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EventVendor" (
        "id" TEXT PRIMARY KEY,
        "vendor_id" TEXT NOT NULL,
        "event_booking_id" TEXT,
        "role" TEXT NOT NULL,
        "service_type" TEXT,
        "commission_pct" DOUBLE PRECISION,
        "commission_fixed_ils" INTEGER,
        "commission_stage" TEXT,
        "commission_amount_ils" INTEGER,
        "payment_status" TEXT NOT NULL DEFAULT 'pending',
        "paid_at" TIMESTAMP(3),
        "paid_amount_ils" INTEGER,
        "notes" TEXT, "created_by" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EventVendor_vendor_id_idx" ON "EventVendor"("vendor_id");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EventVendor_event_booking_id_idx" ON "EventVendor"("event_booking_id");`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VendorContact" (
        "id" TEXT PRIMARY KEY,
        "vendor_id" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "subject" TEXT, "body" TEXT,
        "twilio_sid" TEXT, "resend_id" TEXT,
        "created_by" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VendorContact_vendor_id_idx" ON "VendorContact"("vendor_id");`);

      // ============================================================
      // ONE-TIME MIGRATION: grant marketing_consent to existing customers
      // ============================================================
      // Frontend deploy lag prevented the owner from clicking the
      // "📢 הענק הסכמה לכולם" button in /CustomerClub. Run it once here.
      // Idempotent: skipped if already run (gated by SystemFlag row).
      try {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SystemFlag" (
          "key" TEXT PRIMARY KEY,
          "value" TEXT,
          "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`);
        // === Reset EventSalesKit.system_prompt to the Dana / info-only prompt ===
        // Owner asked to switch the events agent from the closing-sales persona
        // to 'דנה, מנהלת אירועים' that only gathers info + sends Pushover.
        // The existing kit row in DB has a stale prompt overriding the default,
        // so we force-reset it once. Gated by SystemFlag to run only once.
        try {
          const danaFlag: any = await prisma.$queryRawUnsafe(
            `SELECT key FROM "SystemFlag" WHERE key = 'dana_events_prompt_v6' LIMIT 1`,
          );
          if (!danaFlag || danaFlag.length === 0) {
            // Use parameterised raw SQL — Prisma raw template handles the long string
            await (prisma as any).$queryRaw`
              UPDATE "EventSalesKit"
                 SET system_prompt = ${DEFAULT_EVENTS_PROMPT}
               WHERE singleton = TRUE
            `;
            await prisma.$executeRawUnsafe(
              `INSERT INTO "SystemFlag" (key, value) VALUES ('dana_events_prompt_v6', 'done') ON CONFLICT (key) DO NOTHING`,
            );
            console.log('[migration] dana_events_prompt_v6: reset EventSalesKit prompt');
          }
        } catch (e: any) {
          console.warn('[migration] dana_events_prompt_v6 failed (non-fatal):', e?.message);
        }
        const flagKey = 'bulk_grant_consent_v1_done';
        const existing: any = await prisma.$queryRawUnsafe(
          `SELECT key FROM "SystemFlag" WHERE key = $1 LIMIT 1`,
          flagKey,
        );
        if (!existing || existing.length === 0) {
          const result: any = await prisma.$executeRawUnsafe(`
            UPDATE "Customer"
               SET marketing_consent = true,
                   marketing_consent_at = COALESCE(marketing_consent_at, NOW())
             WHERE marketing_consent = false
               AND marketing_unsubscribed_at IS NULL
               AND phone IS NOT NULL AND phone != '';
          `);
          await prisma.$executeRawUnsafe(
            `INSERT INTO "SystemFlag" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
            flagKey, String(result),
          );
          console.log(`[migration] bulk_grant_consent_v1: granted consent to ${result} existing customers`);
        } else {
          console.log('[migration] bulk_grant_consent_v1: already run, skipping');
        }
      } catch (e: any) {
        console.warn('[migration] bulk_grant_consent_v1 failed:', e?.message);
      }
      console.log('[startup] Reservation deposit + marketing consent + shift reminder + Checklist.department + Customer marketing + CampaignSend columns ensured');
    } catch (e: any) {
      console.error('[startup] ensure Reservation deposit cols failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DepositSettings" (
        "id" TEXT PRIMARY KEY,
        "singleton" BOOLEAN NOT NULL UNIQUE DEFAULT TRUE,
        "required_weekend_days" JSONB,
        "required_midweek_min_party_size" INTEGER DEFAULT 6,
        "amount_per_guest_ils" INTEGER DEFAULT 30,
        "event_pct" INTEGER DEFAULT 20,
        "free_cancel_hours_small" INTEGER DEFAULT 3,
        "free_cancel_hours_large" INTEGER DEFAULT 6,
        "free_cancel_hours_event" INTEGER DEFAULT 24,
        "small_party_threshold" INTEGER DEFAULT 6,
        "provider" TEXT,
        "provider_credentials" JSONB,
        "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      console.log('[startup] DepositSettings table ensured');
    } catch (e: any) {
      console.error('[startup] ensure DepositSettings failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ActivityLog" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT NOT NULL,
        "user_name" TEXT,
        "action_type" TEXT NOT NULL,
        "page" TEXT,
        "label" TEXT,
        "target_id" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_user_id_createdAt_idx" ON "ActivityLog" ("user_id", "createdAt");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_action_type_createdAt_idx" ON "ActivityLog" ("action_type", "createdAt");`);
      console.log('[startup] ActivityLog table + indexes ensured');
    } catch (e: any) {
      console.error('[startup] ensure ActivityLog failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BeecommSnapshot" (
        "id" TEXT PRIMARY KEY,
        "pos_id" TEXT NOT NULL,
        "pos_name" TEXT,
        "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "total_today" DOUBLE PRECISION,
        "total_tips" DOUBLE PRECISION,
        "open_money" DOUBLE PRECISION,
        "predicted_month" DOUBLE PRECISION,
        "predicted_year" DOUBLE PRECISION,
        "online_shifts" INTEGER,
        "active_today" BOOLEAN,
        "beecomm_last_update_x" BIGINT,
        "beecomm_last_update_z" BIGINT,
        "beecomm_last_update_dishes" BIGINT,
        "beecomm_last_update_shifts" BIGINT,
        "workers" JSONB,
        "top_dishes" JSONB,
        "payments" JSONB,
        "orders_by_hour" JSONB,
        "stations" JSONB,
        "dine_in" JSONB,
        "takeaway" JSONB,
        "delivery" JSONB,
        "harigot" JSONB,
        "z_numbers_open" JSONB,
        "raw" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BeecommSnapshot_pos_captured_idx" ON "BeecommSnapshot" ("pos_id", "captured_at");`);
      console.log('[startup] BeecommSnapshot table + index ensured');
    } catch (e: any) {
      console.error('[startup] ensure BeecommSnapshot failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "GomileySnapshot" (
        "id" TEXT PRIMARY KEY,
        "restaurant_id" TEXT NOT NULL,
        "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "total_income" DOUBLE PRECISION,
        "total_orders" INTEGER,
        "new_orders" INTEGER,
        "cancelled_orders" INTEGER,
        "split_orders" INTEGER,
        "cross_min_orders" INTEGER,
        "cash_orders_count" INTEGER DEFAULT 0,
        "cash_orders_amount" DOUBLE PRECISION DEFAULT 0,
        "orders" JSONB,
        "raw" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GomileySnapshot_restaurant_captured_idx" ON "GomileySnapshot" ("restaurant_id", "captured_at");`);
      console.log('[startup] GomileySnapshot table + index ensured');
    } catch (e: any) {
      console.error('[startup] ensure GomileySnapshot failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "GomileyDashboardSnapshot" (
        "id" TEXT PRIMARY KEY,
        "restaurant_id" TEXT NOT NULL,
        "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "date_range_label" TEXT,
        "total_income" DOUBLE PRECISION,
        "total_orders" INTEGER,
        "new_customers" INTEGER,
        "new_companies" INTEGER,
        "onetime_percent" DOUBLE PRECISION,
        "returning_count" INTEGER,
        "onetime_count" INTEGER,
        "platforms" JSONB,
        "top_dishes" JSONB,
        "top_customers" JSONB,
        "top_companies" JSONB,
        "raw_text" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GomileyDashboardSnapshot_restaurant_captured_idx" ON "GomileyDashboardSnapshot" ("restaurant_id", "captured_at");`);
      console.log('[startup] GomileyDashboardSnapshot table + index ensured');
    } catch (e: any) {
      console.error('[startup] ensure GomileyDashboardSnapshot failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
        "id" TEXT PRIMARY KEY,
        "twilio_sid" TEXT UNIQUE,
        "direction" TEXT NOT NULL,
        "from_phone" TEXT NOT NULL,
        "to_phone" TEXT NOT NULL,
        "contact_phone" TEXT NOT NULL,
        "body" TEXT,
        "num_media" INTEGER DEFAULT 0,
        "status" TEXT,
        "error_code" TEXT,
        "is_read" BOOLEAN DEFAULT FALSE,
        "raw" JSONB,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WhatsAppMessage_contact_created_idx" ON "WhatsAppMessage" ("contact_phone", "created_at");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WhatsAppMessage_direction_is_read_idx" ON "WhatsAppMessage" ("direction", "is_read");`);
      console.log('[startup] WhatsAppMessage table + indexes ensured');
    } catch (e: any) {
      console.error('[startup] ensure WhatsAppMessage failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BeecommHistoricalDay" (
        "id" TEXT PRIMARY KEY,
        "pos_id" TEXT NOT NULL,
        "date" TEXT NOT NULL,
        "z_numbers" JSONB NOT NULL,
        "net_total" DOUBLE PRECISION,
        "gross_total" DOUBLE PRECISION,
        "total_tips" DOUBLE PRECISION,
        "diners" INTEGER,
        "orders_count" INTEGER,
        "workers" JSONB,
        "payments" JSONB,
        "top_dishes" JSONB,
        "category_totals" JSONB,
        "stations" JSONB,
        "dine_in" JSONB,
        "takeaway" JSONB,
        "delivery" JSONB,
        "harigot" JSONB,
        "raw_z_summary" JSONB,
        "raw_dishes" JSONB,
        "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BeecommHistoricalDay_pos_date_unique" ON "BeecommHistoricalDay" ("pos_id", "date");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BeecommHistoricalDay_date_idx" ON "BeecommHistoricalDay" ("date");`);
      console.log('[startup] BeecommHistoricalDay table + indexes ensured');
    } catch (e: any) {
      console.error('[startup] ensure BeecommHistoricalDay failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SalesGoalTemplate" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "dish_label" TEXT NOT NULL,
        "emoji" TEXT NOT NULL,
        "default_target" INTEGER NOT NULL,
        "default_coins_per_sale" INTEGER NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "sort_order" INTEGER DEFAULT 0,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SalesGoal" (
        "id" TEXT PRIMARY KEY,
        "template_id" TEXT NOT NULL,
        "shift_date" TEXT NOT NULL,
        "shift_type" TEXT NOT NULL,
        "dish_label" TEXT NOT NULL,
        "emoji" TEXT NOT NULL,
        "target" INTEGER NOT NULL,
        "coins_per_sale" INTEGER NOT NULL,
        "current_count" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'active',
        "activated_by_id" TEXT NOT NULL,
        "activated_by_name" TEXT NOT NULL,
        "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TIMESTAMP(3),
        "closed_at" TIMESTAMP(3),
        "closed_by_id" TEXT,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesGoal_shift_status_idx" ON "SalesGoal" ("shift_date", "shift_type", "status");`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SaleEvent" (
        "id" TEXT PRIMARY KEY,
        "goal_id" TEXT NOT NULL,
        "waiter_id" TEXT NOT NULL,
        "waiter_name" TEXT NOT NULL,
        "credited_by_id" TEXT NOT NULL,
        "credited_by_name" TEXT NOT NULL,
        "coins_amount" INTEGER NOT NULL,
        "is_bonus" BOOLEAN NOT NULL DEFAULT FALSE,
        "undone_at" TIMESTAMP(3),
        "coin_transaction_id" TEXT,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SaleEvent_goal_createdAt_idx" ON "SaleEvent" ("goal_id", "createdAt");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SaleEvent_waiter_createdAt_idx" ON "SaleEvent" ("waiter_id", "createdAt");`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WeeklyPersonalGoal" (
        "id" TEXT PRIMARY KEY,
        "employee_id" TEXT NOT NULL,
        "employee_name" TEXT NOT NULL,
        "week_start_date" TEXT NOT NULL,
        "target" INTEGER NOT NULL,
        "current_count" INTEGER NOT NULL DEFAULT 0,
        "reward_coins" INTEGER NOT NULL,
        "is_awarded" BOOLEAN NOT NULL DEFAULT FALSE,
        "awarded_at" TIMESTAMP(3),
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WeeklyPersonalGoal_employee_week_idx" ON "WeeklyPersonalGoal" ("employee_id", "week_start_date");`);
      console.log('[startup] Sales gamification tables ensured');
    } catch (e: any) {
      console.error('[startup] ensure sales gamification tables failed:', e?.message);
    }
  })();
}

// === No-show auto-mark cron =================================================
// Every 5 min: scan today's reservations whose time + grace_minutes has passed
// and that don't have an active TableSession. Mark them as 'no_show' and stamp
// cancelled_at. This is the hook that will later trigger deposit capture.
const NO_SHOW_GRACE_MIN = 30;
export async function autoMarkNoShows() {
  try {
    const il = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => il.find(p => p.type === t)?.value || '';
    const ilDateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const nowMin = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    const { start: dayStart, next: dayNext } = dayRange(ilDateStr);
    const todayRes: any[] = await db.reservation.findMany({
      where: { date: { gte: dayStart, lt: dayNext } },
    });
    const activeSessions: any[] = await db.tableSession.findMany({ where: { status: 'active' } });
    const sessionTables = new Set<string>();
    for (const s of activeSessions) {
      for (const t of String(s.table_number || '').split(/[,+]/)) sessionTables.add(t.trim());
    }
    let marked = 0;
    for (const r of todayRes) {
      const status = String(r.status || 'pending').toLowerCase();
      // Only confirmed/pending bookings can flip to no_show
      if (!['confirmed', 'pending'].includes(status)) continue;
      // Need a time to compare
      const [hh, mm] = String(r.time || '').split(':').map((s: string) => parseInt(s, 10));
      if (!Number.isFinite(hh)) continue;
      const resMin = hh * 60 + (mm || 0);
      if (nowMin - resMin < NO_SHOW_GRACE_MIN) continue; // not yet past grace
      // If any of their assigned tables has an active session — they're seated, skip
      const assigned: string[] = Array.isArray(r.assigned_table) ? r.assigned_table.map(String) : [];
      if (assigned.some((t) => sessionTables.has(t))) continue;
      // Mark as no_show
      try {
        await db.reservation.update({
          where: { id: r.id },
          data: {
            status: 'no_show',
            cancelled_at: new Date(),
            cancellation_reason: `auto-marked no-show (${NO_SHOW_GRACE_MIN}+ min past time)`,
          },
        });
        marked++;
        console.log(`[no-show-cron] marked ${r.customer_name} ${r.time} as no_show`);
      } catch (e: any) { console.warn('[no-show-cron] update failed:', e?.message); }
    }
    if (marked > 0) {
      try {
        await pushoverEventsOwners(
          '⚠️ הזמנות סומנו אוטומטית כלא-הגיע',
          `${marked} הזמנות עברו ${NO_SHOW_GRACE_MIN} דק' אחרי הזמן ולא הגיעו.\nבדוק את לוח ההזמנות.`,
        );
      } catch { /* ignore */ }
    }
  } catch (e: any) {
    console.error('[no-show-cron] failed:', e?.message);
  }
}

if (!(globalThis as any).__noShowCronTimer) {
  (globalThis as any).__noShowCronTimer = setTimeout(function loop() {
    autoMarkNoShows().finally(() => {
      (globalThis as any).__noShowCronTimer = setTimeout(loop, 5 * 60 * 1000);
    });
  }, 90 * 1000);
}

// === Daily summary push to owner at 22:30 IL ================================
// Aggregates today's reservations and sends a single owner-facing summary push.
// Idempotent: tracked via __dailySummarySentDate so we send once per day.
export async function maybeDailySummary() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    const ilDateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const ilHour = parseInt(get('hour'), 10);
    const ilMin = parseInt(get('minute'), 10);
    // Only fire between 22:30 and 23:00 IL, and at most once per day
    if (ilHour !== 22 || ilMin < 30) return;
    if ((globalThis as any).__dailySummarySentDate === ilDateStr) return;
    (globalThis as any).__dailySummarySentDate = ilDateStr;

    const { start: dayStart, next: dayNext } = dayRange(ilDateStr);
    const todayRes: any[] = await db.reservation.findMany({
      where: { date: { gte: dayStart, lt: dayNext } },
    });
    const stat = (s: string) => todayRes.filter((r: any) => String(r.status || '').toLowerCase() === s).length;
    const totalGuests = todayRes.reduce((sum, r) => sum + (Number(r.party_size) || 0), 0);
    const seated = stat('seated') + stat('completed');
    const no_show = stat('no_show');
    const cancelled = stat('cancelled');
    const confirmed = stat('confirmed');
    const seatedGuests = todayRes
      .filter((r: any) => ['seated', 'completed'].includes(String(r.status || '').toLowerCase()))
      .reduce((s: any, r: any) => s + (Number(r.party_size) || 0), 0);
    const estRevenue = seatedGuests * 220; // ₪220/guest avg ticket — adjust if owner has real number
    const noShowRate = todayRes.length ? Math.round((no_show / todayRes.length) * 100) : 0;
    const body = [
      `📊 סיכום יום · ${ilDateStr.split('-').reverse().join('/')}`,
      ``,
      `📋 סה"כ הזמנות: ${todayRes.length} (${totalGuests} סועדים)`,
      `✅ הגיעו ויושבים/השלימו: ${seated}`,
      `⏳ עוד מאושרים שלא יושב: ${confirmed}`,
      `❌ הבריזו (no-show): ${no_show} (${noShowRate}%)`,
      `🚫 ביטולים: ${cancelled}`,
      ``,
      `💰 הכנסה משוערת מיושבים: ₪${estRevenue.toLocaleString()}`,
      `(לפי ₪220 לסועד)`,
    ].join('\n');
    try {
      await pushoverEventsOwners('📊 סיכום יום במסעדה', body);
    } catch (e: any) { console.warn('[daily-summary] push failed:', e?.message); }
  } catch (e: any) {
    console.error('[daily-summary] failed:', e?.message);
  }
}

if (!(globalThis as any).__dailySummaryTimer) {
  (globalThis as any).__dailySummaryTimer = setTimeout(function loop() {
    maybeDailySummary().finally(() => {
      // Check every 5 min so we hit the 22:30 window at most once
      (globalThis as any).__dailySummaryTimer = setTimeout(loop, 5 * 60 * 1000);
    });
  }, 120 * 1000);
}

// === Marketing consent gating ==============================================
// Use this BEFORE any promotional/marketing send to a customer. Returns false
// if the customer never opted in, or explicitly unsubscribed.
export async function customerCanReceiveMarketing(phone: string): Promise<boolean> {
  if (!phone) return false;
  const c: any = await db.customer.findFirst({ where: { phone: String(phone).trim() } }).catch(() => null);
  if (!c) return false;
  if (c.marketing_unsubscribed_at) return false;
  return !!c.marketing_consent;
}

// Public: customer-facing unsubscribe by phone.
// Marks the customer record as unsubscribed; future marketing sends will skip them.
registerFn('unsubscribeMarketing', async ({ body }) => {
  const phone = String((body as any)?.phone || '').trim();
  if (!phone) throw new Error('phone required');
  const c: any = await db.customer.findFirst({ where: { phone } }).catch(() => null);
  if (!c) return { success: true, already: false };
  await db.customer.update({
    where: { id: c.id },
    data: { marketing_unsubscribed_at: new Date(), marketing_consent: false } as any,
  });
  return { success: true };
}, { public: true });

// === ShiftTracking auto-close cron ==========================================
// Closes any 'active' ShiftTracking row whose clock-in is older than 16 hours.
// 16h leaves slack for a full double-shift but prevents the database from
// accumulating zombie 'active' rows when an employee forgets to clock out.
// Uses scheduled end_time from the matching WorkShift if found; otherwise
// clock_in + 6 hours.
const SHIFT_AUTO_CLOSE_HOURS = 16;
// One-shot recovery — re-opens ShiftTracking rows that were auto-closed in
// the last 36 hours. Triggered after disabling the three auto-close paths
// so the owner can manually finalize hours that the system cut short.
export async function reopenAutoClosedShifts(maxAgeHours = 36) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const closed: any[] = await (prisma as any).shiftTracking.findMany({
    where: {
      shift_start: { gte: cutoff },
      status: { in: ['completed', 'auto_closed'] },
      auto_close_reason: { not: null },
    },
    orderBy: { shift_start: 'desc' },
  });
  const reverted: any[] = [];
  const failures: any[] = [];
  for (const t of closed) {
    // Use raw SQL — bypasses Prisma model validation for the `end_reminder_sent_at`
    // column which exists in the DB (added by drift-repair) but isn't on the
    // Prisma model. Update the standard fields via the same raw write.
    try {
      await (prisma as any).$executeRawUnsafe(
        `UPDATE "ShiftTracking" SET
           status = 'active',
           shift_end = NULL,
           total_hours = NULL,
           effective_hours = NULL,
           auto_close_reason = NULL,
           end_reminder_sent_at = NULL,
           "updatedAt" = NOW()
         WHERE id = $1`,
        t.id,
      );
      reverted.push({
        id: t.id,
        employee_name: t.employee_name,
        started_at: t.shift_start,
        was_ended_at: t.shift_end,
        was_total_hours: t.total_hours,
        reason: t.auto_close_reason,
      });
    } catch (e: any) {
      console.warn('[reopenAutoClosedShifts] failed', t.id, e?.message);
      failures.push({ id: t.id, employee_name: t.employee_name, error: e?.message });
    }
  }
  return { scanned: closed.length, reverted: reverted.length, details: reverted, failures };
}

registerFn('reopenAutoClosedShifts', async ({ user, body }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const maxAgeHours = Number((body as any)?.maxAgeHours) || 36;
  return reopenAutoClosedShifts(maxAgeHours);
});

export async function autoCloseStaleShifts() {
  try {
    const cutoff = new Date(Date.now() - SHIFT_AUTO_CLOSE_HOURS * 3600 * 1000);
    const stuck: any[] = await (prisma as any).shiftTracking.findMany({
      where: { status: 'active', shift_start: { lt: cutoff } },
      take: 200,
    }).catch(() => []);
    if (stuck.length === 0) return;
    // Pull today's + yesterday's WorkShifts to find scheduled end_time per employee.
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const workShifts: any[] = await db.workShift.findMany({
      where: { date: { gte: since } },
    }).catch(() => []);
    const endByEmp = new Map<string, string>();
    for (const w of workShifts) {
      for (const s of ((w.assigned_staff as any[]) || [])) {
        if (s.employee_id && s.end_time && /^\d{2}:\d{2}$/.test(String(s.end_time))) {
          endByEmp.set(s.employee_id, s.end_time);
        }
      }
    }
    let closed = 0;
    for (const t of stuck) {
      const start = new Date(t.shift_start);
      const scheduledEnd = endByEmp.get(t.employee_id);
      let endTime: Date;
      let reason: string;
      if (scheduledEnd) {
        const [hh, mm] = scheduledEnd.split(':').map(Number);
        // IL → UTC shift
        endTime = new Date(start);
        endTime.setUTCHours(hh - 3, mm, 0, 0);
        if (endTime <= start) endTime.setUTCDate(endTime.getUTCDate() + 1);
        reason = `auto-closed by cron — used scheduled end_time ${scheduledEnd}`;
      } else {
        endTime = new Date(start.getTime() + 6 * 3600 * 1000);
        reason = `auto-closed by cron — no scheduled end, used +6h`;
      }
      const totalHours = Math.round(((endTime.getTime() - start.getTime()) / 36000)) / 100;
      try {
        await (prisma as any).shiftTracking.update({
          where: { id: t.id },
          data: {
            status: 'completed',
            shift_end: endTime,
            total_hours: totalHours,
            effective_hours: totalHours,
            auto_close_reason: reason,
          },
        });
        closed++;
      } catch (e: any) { console.warn('[shift-auto-close] update failed:', t.id, e?.message); }
    }
    if (closed > 0) {
      console.log(`[shift-auto-close] closed ${closed} stale ShiftTracking rows`);
      try {
        await pushoverToAdmins(
          '⏰ משמרות נסגרו אוטומטית',
          `${closed} עובדים שכחו לסיים משמרת — סגרתי אוטומטית לפי שעות מתוכננות.`,
        );
      } catch { /* ignore */ }
    }
  } catch (e: any) {
    console.error('[shift-auto-close] failed:', e?.message);
  }
}

// === DISABLED 7/6/2026 — owner asked for manual close only.
// Re-enable only if zombie 'active' rows start piling up faster than the
// admin can clean them. autoCloseStaleShifts() remains callable manually
// from a script if needed. To re-enable: uncomment the setTimeout block.
//
// if (!(globalThis as any).__shiftAutoCloseTimer) {
//   (globalThis as any).__shiftAutoCloseTimer = setTimeout(function loop() {
//     autoCloseStaleShifts().finally(() => {
//       (globalThis as any).__shiftAutoCloseTimer = setTimeout(loop, 30 * 60 * 1000);
//     });
//   }, 3 * 60 * 1000);
// }

// === Tighter shift-end reminder + earlier auto-close ========================
// Runs every 10 min. For each active ShiftTracking:
//   1) If now > scheduled_end + 30 min AND no reminder sent → push the employee
//   2) If now > scheduled_end + 4 hours → auto-close (more aggressive than the 16h safety net)
// Uses the matching WorkShift assignment's end_time as the source of truth.
async function findEmployeeScheduledEnd(employeeId: string, clockInDate: Date): Promise<Date | null> {
  const start = new Date(clockInDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const dayShifts = await db.workShift.findMany({
    where: { date: { gte: start, lt: end } },
  }).catch(() => []);
  for (const w of dayShifts) {
    for (const s of ((w.assigned_staff as any[]) || [])) {
      if (s.employee_id === employeeId && s.end_time && /^\d{2}:\d{2}$/.test(String(s.end_time))) {
        const [hh, mm] = String(s.end_time).split(':').map(Number);
        const scheduled = new Date(clockInDate);
        scheduled.setUTCHours(hh - 3, mm, 0, 0);
        if (scheduled <= clockInDate) scheduled.setUTCDate(scheduled.getUTCDate() + 1);
        return scheduled;
      }
    }
  }
  return null;
}

export async function shiftEndReminderAndClose() {
  try {
    const active: any[] = await (prisma as any).shiftTracking.findMany({
      where: { status: 'active' },
      take: 200,
    }).catch(() => []);
    const now = Date.now();
    let reminders = 0, closed = 0;
    for (const t of active) {
      const clockIn = new Date(t.shift_start);
      const scheduled = await findEmployeeScheduledEnd(t.employee_id, clockIn);
      if (!scheduled) continue; // no schedule found → the 16h safety-net cron handles it
      const minsPast = (now - scheduled.getTime()) / 60000;

      // === AUTO-CLOSE DISABLED 7/6/2026 (owner directive: manual close only) ===
      // Previously closed at 4h past scheduled end. Now we only send a louder
      // reminder so admin can poke the employee — no automatic state change.
      if (minsPast >= 240 && !t.end_reminder_sent_at) {
        try {
          await (prisma as any).shiftTracking.update({
            where: { id: t.id },
            data: { end_reminder_sent_at: new Date() },
          });
          const hhmm = `${String(scheduled.getUTCHours() + 3).padStart(2,'0')}:${String(scheduled.getUTCMinutes()).padStart(2,'0')}`;
          await pushoverToAdmins(
            '⚠️ עובד עם משמרת פתוחה 4h+ אחרי הסיום',
            `${t.employee_name} הייתה אמורה לסיים ב-${hhmm} ועדיין במשמרת פעילה.\nסגירה ידנית בלבד — צריך לעדכן את הטופס שלה.`,
          ).catch(() => {});
          reminders++;
        } catch { /* ignore */ }
        continue;
      }

      // Reminder push: 30 min past scheduled end, only if we haven't already pinged.
      if (minsPast >= 30 && !t.end_reminder_sent_at) {
        try {
          await (prisma as any).shiftTracking.update({
            where: { id: t.id },
            data: { end_reminder_sent_at: new Date() },
          });
          const hhmm = `${String(scheduled.getUTCHours() + 3).padStart(2,'0')}:${String(scheduled.getUTCMinutes()).padStart(2,'0')}`;
          // Admin gets notified — they can poke the employee. The employee themselves
          // sees the pulsing red banner in the app the moment they open ShiftClockWidget.
          await pushoverToAdmins(
            '⏰ עובד שכח לסיים משמרת',
            `${t.employee_name} הייתה אמורה לסיים ב-${hhmm} ועדיין מסומנת במשמרת.\nאם לא תסיים, הקרון יסגור אוטומטית בעוד כ-3.5 שעות.`,
          ).catch(() => {});
          reminders++;
        } catch { /* ignore individual failures */ }
      }
    }
    if (reminders > 0 || closed > 0) {
      console.log(`[shift-end-reminder] ${reminders} reminders sent, ${closed} auto-closed`);
    }
  } catch (e: any) {
    console.error('[shift-end-reminder] failed:', e?.message);
  }
}

// === REMINDERS-ONLY CRON 7/6/2026 ===
// Owner asked for no auto-close. We keep the reminder push so admin still
// gets pinged "X forgot to clock out" but the function now SKIPS the close
// block (4h aggressive). See shiftEndReminderAndClose() — the close
// branch is bypassed below.
if (!(globalThis as any).__shiftEndReminderTimer) {
  (globalThis as any).__shiftEndReminderTimer = setTimeout(function loop() {
    shiftEndReminderAndClose().finally(() => {
      (globalThis as any).__shiftEndReminderTimer = setTimeout(loop, 10 * 60 * 1000);
    });
  }, 5 * 60 * 1000); // 5 min after boot
}

// === Voice command LLM fallback parser ======================================
// Frontend's regex parser tries first (fast, free). If it returns 'unknown',
// it calls this endpoint with the raw transcript; Gemini parses meaning into
// the same intent schema. Drops cost to ~₪0.01 per fallback (only when regex
// fails); regex still handles ~70% of common phrasings free.
const VOICE_INTENT_LIST = `
You are a Hebrew voice command parser for a restaurant manager (Alina). Hebrew word order is fluid — you MUST understand meaning, not match keywords literally.

Return exactly ONE JSON object with 'intent' + params. No markdown, no prose, no apologies.

========== AVAILABLE INTENTS ==========

▶ TABLE STATUS
table_free        — table is free/finished/empty. params: { table }
table_finishing   — table in dessert/check/finishing. params: { table }
table_seated      — guests just sat down. params: { table }
table_no_show     — table didn't show up. params: { table }

▶ FLAGS (visual markers on reservations)
table_flag        — params: { table, flag: "green"|"red"|"orange"|"black"|"" }
                    green=VIP/important, red=problem, orange=attention, ""=clear

▶ QUEUE (waiting list)
queue_add         — add to queue. params: { name, party_size, pref: "inside"|"outside"|"no_preference" }
queue_call        — ring the customer / "your table is ready". params: { name }
queue_arrived     — they showed up / approve. params: { name }
queue_abandoned   — they left / didn't wait. params: { name }

▶ SEATING
seat_walkin       — seat someone without a reservation. params: { party_size, table }
seat_reservation  — seat an existing reservation. params: { name, table } OR { name, tables: ["10","11"] }
seat_next_queue   — seat the next in queue on a table. params: { table }

▶ RESERVATIONS (advance bookings)
reservation_add   — create a new reservation. params: { name, party_size, time: "HH:MM", when: "היום"|"מחר"|"מחרתיים"|date "YYYY-MM-DD" }
reservation_cancel — cancel one. params: { name }
reservation_confirm — confirm pending. params: { name }

▶ SESSIONS
session_extend    — extend a seated table. params: { table, minutes }
session_move      — move guests to different table. params: { from, to }

▶ INFO QUESTIONS (system speaks back)
q_next_in_queue        — who's next in queue
q_next_reservation     — what's the next reservation
q_queue_count          — how many in queue
q_free_tables          — how many free tables
q_who_on_table         — who's at table N. params: { table }
q_today_reservations   — today's reservation count
q_tomorrow_reservations — tomorrow's count
q_today_guests         — today's guest count
q_today_revenue        — today's est. revenue
q_status_summary       — overall current state
q_on_shift             — who's working today (any shift)
q_on_shift_now         — who's working right now
q_on_shift_evening     — who's working evening shift today
q_on_shift_lunch       — who's working lunch shift today
q_on_shift_date        — who's working on date X. params: { when: "מחר"|"מחרתיים"|date, shift_type?: "lunch"|"dinner" }
q_customer_history     — info on a returning customer. params: { name }

▶ COMMUNICATION (sends messages)
resend_confirmation    — re-send reservation confirmation SMS. params: { name }
send_reminder          — send reminder before reservation. params: { name }
send_staff_schedule    — broadcast today's schedule to staff via WhatsApp. params: { when: "היום"|"מחר" }
send_team_message      — send custom WhatsApp message to the team. params: { message }
send_customer_message  — send custom message to a customer. params: { name, message }

▶ NAVIGATION (jump to a page)
nav_open — params: { target: "dashboard"|"seating"|"queue"|"events"|"work_scheduling"|"settings_deposit"|"settings_reservation"|"reports"|"employees"|"voice_test" }

▶ TASKS / OPERATIONS
incident_open    — log an incident/issue. params: { description }
task_add         — add a checklist task. params: { description, who?: name }

▶ HELP
help — list what voice can do.

unknown — only if you really, truly can't map the request to ANY intent.

========== EXAMPLES (semantic, NOT keyword-matched) ==========
Input: "שולחן 11 נגמר" → {"intent":"table_free","table":"11"}
Input: "תפנה את שולחן 11" → {"intent":"table_free","table":"11"}
Input: "11 פתחו לי" → {"intent":"table_free","table":"11"}
Input: "שולחן 30 בקינוח, כבר עוד מעט מסיימים" → {"intent":"table_finishing","table":"30"}
Input: "תוסיף הזמנה להיום בשעה 9 בערב על שם רן לשמונה אנשים" → {"intent":"reservation_add","name":"רן","party_size":8,"time":"21:00","when":"היום"}
Input: "תכניס הזמנה ליום שני 8 בערב 6 אנשים על שם דביר" → {"intent":"reservation_add","name":"דביר","party_size":6,"time":"20:00","when":"מחר"}
Input: "תכניס שירה לתור היא ארבע" → {"intent":"queue_add","name":"שירה","party_size":4,"pref":"no_preference"}
Input: "תוסיף ארבע אנשים לתור על שם רן" → {"intent":"queue_add","name":"רן","party_size":4,"pref":"no_preference"}
Input: "מי עובד היום בערב" → {"intent":"q_on_shift_evening"}
Input: "מי עובד עכשיו" → {"intent":"q_on_shift_now"}
Input: "מי עובד מחר בצהריים" → {"intent":"q_on_shift_date","when":"מחר","shift_type":"lunch"}
Input: "תשלח לצוות שעות להיום בוואטסאפ" → {"intent":"send_staff_schedule","when":"היום"}
Input: "תשלח לצוות סידור עבודה לסוף שבוע" → {"intent":"send_staff_schedule","when":"מחר"}
Input: "תכריז לכולם שהמסעדה סגורה מחר" → {"intent":"send_team_message","message":"המסעדה סגורה מחר"}
Input: "כמה אנשים בתור" → {"intent":"q_queue_count"}
Input: "מה המצב" → {"intent":"q_status_summary"}
Input: "תפתח את הדאשבורד" → {"intent":"nav_open","target":"dashboard"}
Input: "פתח לי את העובדים" → {"intent":"nav_open","target":"employees"}
Input: "תפתח את הדוחות" → {"intent":"nav_open","target":"reports"}
Input: "תפתח תקרית — המקרר התקלקל" → {"intent":"incident_open","description":"המקרר התקלקל"}
Input: "תוסיף משימה לרון לנקות את הגריל" → {"intent":"task_add","description":"לנקות את הגריל","who":"רון"}
Input: "מי דביר ניפוסי" → {"intent":"q_customer_history","name":"דביר ניפוסי"}
Input: "מה אפשר לעשות פה" → {"intent":"help"}

========== RULES ==========
1. Hebrew names — return exactly as spoken
2. Tables — always strings ("10" not 10)
3. party_size — number
4. Times — HH:MM 24h. "9 בערב"=21:00, "11 בבוקר"=11:00, "8 בלילה"=20:00.
5. Hebrew numbers (ארבע, חמישה, עשר...) — convert to digits
6. NEVER reject because of word order. Re-read mentally as English and figure out intent.
7. If ambiguous between two intents, prefer the more specific one
8. Return unknown ONLY when truly nothing in the list fits.
`;

registerFn('parseVoiceCommand', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const text = String((body as any)?.text || '').trim();
  if (!text) return { intent: 'unknown', raw: '' };
  try {
    // Concise prompt — Gemini Flash returned empty when prompt was too long.
    // Keep intent list compact, push examples to the end, lean on structured output.
    const prompt = `Parse a Hebrew restaurant voice command into JSON.

Available intents (return field "intent" + relevant params):

TABLES:
- table_free {table}: שולחן נגמר/פנוי/התפנה
- table_finishing {table}: שולחן בקינוח/חשבון/סיום
- table_seated {table}: יושבים
- table_no_show {table}: הבריזו/לא הגיעו
- table_flag {table, flag}: דגל (flag: green/red/orange/black/"")

QUEUE:
- queue_add {name, party_size, pref}: הוסף לתור (pref: inside/outside/no_preference)
- queue_call {name}: קרא
- queue_arrived {name}: הגיע
- queue_abandoned {name}: עזב

SEATING:
- seat_walkin {party_size, table}: הושיב walk-in
- seat_reservation {name, table OR tables[]}: הושיב/העבר הזמנה לשולחן
- seat_next_queue {table}: הושיב את הבא בתור
- q_ai_seat_suggest {party_size, preference?}: מצא לי מקום עם עוזר/AI

RESERVATIONS:
- reservation_add {name, party_size, time, when}: ליצור (when: היום/מחר/מחרתיים, time: HH:MM)
- reservation_cancel {name}
- reservation_confirm {name}
- reservation_reschedule {name, time, when?}: דחה/הזז שעה של הזמנה
- reservation_update_phone {name, phone}: עדכן טלפון בהזמנה
- reservation_mark_arrived {name}: ההזמנה הגיעה (לסמן יושב)

SESSIONS:
- session_extend {table, minutes}
- session_move {from, to}
- session_move_multi {from_tables[], to}: העבר כמה שולחנות לאחד

QUESTIONS:
- q_next_in_queue / q_next_reservation / q_queue_count / q_free_tables
- q_who_on_table {table}
- q_today_reservations / q_tomorrow_reservations / q_today_guests / q_today_revenue / q_status_summary
- q_on_shift (any), q_on_shift_now, q_on_shift_evening, q_on_shift_lunch, q_on_shift_date {when, shift_type?, position?}
  Position values: "מלצר", "טבח", "ברמן", "מנהלת משמרת", "ראנר", "מארחת", "קופה", "שוטף כלים", etc.
- q_customer_history {name}

COMMS:
- resend_confirmation {name}
- send_reminder {name}
- send_staff_schedule {when}: סידור לצוות בוואטסאפ
- send_team_message {message}: הודעת צוות
- send_customer_message {name, message}: לקוח

NAV:
- nav_open {target}: dashboard/seating/queue/events/work_scheduling/reports/employees/settings_deposit/settings_reservation

OPS:
- incident_open {description}: פתח תקרית
- task_add {description, who?}: משימה

SCHEDULE:
- schedule_add {name, when?, shift_type?, position?}: שבץ למשמרת
- schedule_remove {name, when?, shift_type?}: הוצא מהמשמרת / מהסידור

# === SYNONYM GROUPS — שיטה מרכזית להבנת ניסוחים ===
# Hebrew has many verbs that mean the same action. NORMALIZE all of these:
#
# REMOVE/DELETE group (all → schedule_remove or *_cancel):
#   תמחק / תוריד / תוציא / תסיר / תבטל / תזרוק / להוציא / לבטל / להסיר
#   Example: "תמחק את עדן מהסידור" / "תוריד את עדן מהמשמרת" / "תוציא את
#   עדן מהיום" — all map to {schedule_remove, name: "עדן", when: "היום"}
#
# ADD/CREATE group (all → *_add or *_activate):
#   תוסיף / תרשום / תכניס / תקבע / תזמין / תפתח / תיצור / תייצר / להוסיף
#   Example: "תוסיף את שירה ערב" / "תכניס את שירה לסידור הערב" / "שבץ
#   את שירה לערב" — all map to schedule_add
#
# QUERY group (all → q_*):
#   מה / כמה / מי / איפה / איך / תראה לי / תבדוק / תספור / תגיד / רגע
#   Example: "מי במשמרת" / "תראה לי מי במשמרת" / "תגיד מי במשמרת" — all
#   map to q_on_shift
#
# MOVE/TRANSFER group (all → session_move or seat_reservation):
#   תעביר / תזיז / תקח / להעביר / להעיף / לשנות
#   Example: "תעביר 30 ל11" / "תזיז 30 ל11" / "תקח את 30 ל11"
#
# REFERENCES / PRONOUNS:
#   When user says אותו/אותה/אותם — it refers to the LAST mentioned person
#   or table. Without context, treat as the subject of the sentence.
#
# TIME REFERENCES (always convert to when field):
#   "היום" / "הערב" / "עכשיו" / "כרגע" → "היום"
#   "מחר" / "מחר בבוקר" / "מחר בערב" → "מחר"
#   "מחרתיים" / "ביומיים" → "מחרתיים"
#   "השבוע" / "סוף שבוע" / "שבת" → keep as text or convert to date
#   "יום שני" / "ראשון" / "שלישי" → resolve to next occurrence
#
# THE GOLDEN RULE:
# Match by MEANING not by exact words. If you understand what the user
# wants — return the intent even if their words don't match any example.

SALES:
- sale_credit {dish, name}: זיכוי מכירה למלצר ספציפי
- sales_goal_activate {template}: פתיחת יעד מכירות
- q_sales_status {dish?}: כמה נמכר היום
- q_sales_leader: מי המוביל

CUSTOMERS:
- q_birthdays_today: מי חוגג היום
- q_returning_customers: לקוחות חוזרים/VIP
- customer_set_vip {name}: סמן VIP
- customer_send_coupon {name}: שלח קופון
- benefit_give {name, description?, type?}: הטבה
- q_benefits_given: כמה הטבות פעילות

EMPLOYEES_EXT:
- q_new_hires_month: עובדים חדשים החודש
- q_hours_worked {name}: שעות עבודה
- q_on_leave: מי בחופש היום
- leave_approve {name}: אשר חופש
- request_swap {name, date?, shift_type?}: פתח בקשת החלפה
- q_late_today: מי איחר היום
- schedule_add {name, when?, shift_type?, position?}: שבץ למשמרת

INVENTORY:
- q_stock {item}: כמה במלאי
- q_low_stock: פריטים חסרים
- inventory_add {item, quantity}: הוסף למלאי
- order_from_supplier {item, quantity?}: הזמן מספק
- q_supplier_of {item}: ספק של פריט

SUPPLIERS:
- q_supplier_invoice {supplier}: חשבונית אחרונה של ספק
- q_supplier_balance {supplier}: יתרה אצל ספק

MENU:
- q_top_seller: הכי נמכר
- q_today_sold: מה נמכר היום
- menu_remove {name}: הסר מהתפריט
- menu_add {name, category?, price}: הוסף לתפריט
- q_profit_on {name}: רווח על מנה

FINANCE:
- q_tips_today: טיפים היום
- pay_bonus {name, amount?, reason?}: בונוס לעובד
- coins_give {name, amount, reason?}: מטבעות לעובד
- q_open_invoices: חשבוניות פתוחות
- invoice_create {supplier, amount}: יצירת חשבונית
- q_weekly_revenue: הכנסה שבועית

EVENTS:
- q_events_week: אירועים השבוע
- q_next_event: האירוע הבא
- event_add {name, date?, guest_count?, event_type?, phone?}: ליד אירוע
- event_send_contract {name}: שלח חוזה
- q_event_status {name}: סטטוס אירוע

TASKS_CHECKLISTS:
- q_tasks_for {name}: משימות לעובד
- q_checklist_done: צ׳קליסטים שהושלמו היום
- checklist_mark_done {title?}: סמן צ׳קליסט כהושלם
- checklist_open: צ׳קליסטים פעילים

INCIDENTS_EXT:
- q_open_incidents: תקריות פתוחות
- incident_close {description?}: סגור תקרית

MARKETING:
- campaign_broadcast {message}: שלח לכל הלקוחות
- q_campaign_success: סטטוס קמפיין אחרון
- popup_activate {title}: הפעל פופאפ

GAMIFICATION:
- q_leaderboard: לוח שיאים
- q_employee_score {name}: כמה מטבעות לעובד

DEVICES:
- q_who_has_ipad: מי לקח אייפד
- return_device {device_number}: החזרת מכשיר
- q_device_count: כמה מכשירים

POS:
- q_open_orders: הזמנות פעילות בקופה
- q_avg_wait: זמן המתנה ממוצע

TRAINING:
- q_who_didnt_finish_course: מי לא סיים קורס

DELIVERIES:
- q_active_courier: שליחים פעילים
- q_deliveries_today: משלוחים היום
- courier_assign {courier}: שבץ שליח

SETTINGS:
- settings_change_cancellation {hours}: שנה חלון ביטול
- settings_change_deposit_pct {pct}: שנה אחוז פיקדון
- table_add: הוסף שולחן (פותח מפת הושבה)
- online_reservations_toggle {enabled?}: הפעל/כבה הזמנות אונליין

REPORTS:
- report_generate_monthly / report_send_weekly_whatsapp / report_export_excel: דוחות

SHIFTCHAT:
- chat_broadcast {message}: שלח הודעה לצ׳אט משמרת
- q_today_chat: הודעות בצ׳אט היום

WORK_SCHEDULE_EDIT (כניסה/יציאה של עובד בסידור עבודה):
- schedule_set_end_time {name, time, when?, shift_type?}: שנה שעת יציאה — "סדר ליציאה של אסתר ב-22", "תשנה לאסתר יציאה ל10 בערב", "אסתר יוצאת ב11"
- schedule_set_start_time {name, time, when?, shift_type?}: שנה שעת כניסה — "אסתר נכנסת ב4", "תזיז כניסה של אסתר ל-15:30"

TIPS_FLOW (ניהול דוח טיפים — שעות, סה"כ, חישוב לשעה):
- tips_sync_hours {when?, shift_type?}: סנכרן שעות מהסידור לדוח הטיפים — "תסנכרן שעות עם הסידור", "תכניס את השעות מהסידור לטיפים"
- tips_set_total {amount, when?, shift_type?}: הכנס סה"כ טיפים — "סהכ טיפים 2400", "טיפים היום 1800", "סכום טיפים 3000"
- q_tips_per_hour {when?}: כמה יוצא לשעה — "כמה יוצא לשעה", "תגיד כמה לשעה", "טיפ לשעה"

# === MULTI-STEP PLANS — שרשרת פעולות ===
# When the user chains MULTIPLE actions in one utterance (using "ו"/"אז"/"וגם"/
# "אחרי זה"/"בנוסף" or just commas), return a "steps" array INSTEAD of a single
# intent. Each step is {intent, params}. Steps execute in order; later steps
# see the results of earlier ones (no need to re-state shared params).
#
# Examples:
# "תפתח סידור עבודה, סדר ליציאה של אסתר ב-22, תסנכרן שעות עם הסידור, תכניס סהכ טיפים 2400, ותגיד כמה יוצא לשעה" →
# {"intent":"plan","steps":[
#   {"intent":"nav_open","target":"work_scheduling"},
#   {"intent":"schedule_set_end_time","name":"אסתר","time":"22:00","when":"היום"},
#   {"intent":"tips_sync_hours","when":"היום"},
#   {"intent":"tips_set_total","amount":2400,"when":"היום"},
#   {"intent":"q_tips_per_hour","when":"היום"}
# ]}
#
# "תוסיף הזמנה לדביר 4 אנשים ב9 בערב ותסמן כ-VIP" →
# {"intent":"plan","steps":[
#   {"intent":"reservation_add","name":"דביר","party_size":4,"time":"21:00","when":"היום"},
#   {"intent":"customer_set_vip","name":"דביר"}
# ]}
#
# "תסגור שולחן 30, תושיב את הבא בתור עליו, ותגיד מה המצב" →
# {"intent":"plan","steps":[
#   {"intent":"table_free","table":"30"},
#   {"intent":"seat_next_queue","table":"30"},
#   {"intent":"q_status_summary"}
# ]}
#
# "תפתח טיפים, סנכרן שעות, תכניס 1800, ותגיד כמה לשעה" →
# {"intent":"plan","steps":[
#   {"intent":"nav_open","target":"tips"},
#   {"intent":"tips_sync_hours","when":"היום"},
#   {"intent":"tips_set_total","amount":1800,"when":"היום"},
#   {"intent":"q_tips_per_hour","when":"היום"}
# ]}
#
# "תוציא את עדן מהסידור היום ותשלח לצוות שיש שינוי" →
# {"intent":"plan","steps":[
#   {"intent":"schedule_remove","name":"עדן","when":"היום"},
#   {"intent":"send_team_message","message":"יש שינוי בסידור היום"}
# ]}
#
# When the user uses "אותו"/"אותה" referring to a previous step's subject,
# pass "__last__" as the value — the dispatcher will resolve it.
#
# Use "plan" as the top-level intent ONLY when there's a steps array. For
# single actions, return the regular single-intent form.

EXTRA_NAV_TARGETS (in nav_open):
- tips: ניהול טיפים (TipManagement / "תפתח טיפים" / "ניהול טיפים")
- employees: עובדים
- reports: דוחות

CLOCK_IN_OUT (שעון נוכחות עובד ספציפי — מנהל מסמן עבור עובד):
- clock_in {name}: "תכניס את אסתר למשמרת", "אסתר התחילה", "אסתר נכנסה לעבודה", "תפתח שעון לאסתר"
- clock_out {name}: "אסתר סיימה", "תוציא את אסתר מהמשמרת", "תסגור שעון לאסתר", "אסתר הולכת"
- break_start {name}: "אסתר יצאה להפסקה", "תן הפסקה לאסתר", "אסתר ב20 דק"
- break_end {name}: "אסתר חזרה מהפסקה", "אסתר חזרה לעבודה"
- q_clocked_in_now: "מי עובד עכשיו", "מי בעבודה", "מי במשמרת בפועל"

SCHEDULE_EDIT_EXTRA:
- schedule_change_position {name, position, when?, shift_type?}: שנה תפקיד בסידור — "תעשה את אסתר ברמן הערב", "אסתר תהיה מארחת היום"
- tips_add_employee {name, hours, when?, position?}: הוסף עובד ידנית לדוח טיפים — "תוסיף את אסתר 5 שעות לטיפים", "אסתר 4 שעות בטיפים"

EVENTS_EDIT:
- event_update_date {name, date}: שנה תאריך אירוע — "תזיז אירוע של מורן ל28/12", "אירוע ניב עובר ל15 בחודש"
- event_update_guests {name, guest_count}: שנה כמות סועדים — "אירוע של מורן 80 אנשים במקום 60", "תעדכן אירוע ניב ל-100 סועדים"
- event_payment_received {name, amount}: תשלום התקבל — "התקבלו 2000 מאירוע מורן", "קיבלתי 5000 פיקדון מניב לאירוע"
- event_cancel {name}: בטל אירוע — "בטל אירוע של מורן", "אירוע ניב מבוטל"

POPUPS_EDIT:
- popup_disable {title?}: כבה פופאפ — "כבה את הפופאפ", "תוריד פופאפ של אירועים", "תכבה הפופאפ"

# === SPOKEN VARIANTS for new intents (real-life owner dictation) ===
"תכניס את אסתר למשמרת" → {"intent":"clock_in","name":"אסתר"}
"אסתר התחילה" → {"intent":"clock_in","name":"אסתר"}
"אסתר נכנסה לעבודה" → {"intent":"clock_in","name":"אסתר"}
"תפתח שעון לאסתר" → {"intent":"clock_in","name":"אסתר"}
"אסתר סיימה" → {"intent":"clock_out","name":"אסתר"}
"תסגור שעון לאסתר" → {"intent":"clock_out","name":"אסתר"}
"אסתר הולכת" → {"intent":"clock_out","name":"אסתר"}
"תוציא את אסתר מהמשמרת" → {"intent":"clock_out","name":"אסתר"}
"אסתר יצאה להפסקה" → {"intent":"break_start","name":"אסתר"}
"תן הפסקה לאסתר" → {"intent":"break_start","name":"אסתר"}
"אסתר חזרה מהפסקה" → {"intent":"break_end","name":"אסתר"}
"מי עובד עכשיו" → {"intent":"q_clocked_in_now"}
"מי בעבודה" → {"intent":"q_clocked_in_now"}

"תעשה את אסתר ברמן הערב" → {"intent":"schedule_change_position","name":"אסתר","position":"ברמן","when":"היום","shift_type":"dinner"}
"אסתר תהיה מארחת היום" → {"intent":"schedule_change_position","name":"אסתר","position":"מארחת","when":"היום"}

"תוסיף את אסתר 5 שעות לטיפים" → {"intent":"tips_add_employee","name":"אסתר","hours":5,"when":"היום"}
"אסתר 4 שעות בטיפים" → {"intent":"tips_add_employee","name":"אסתר","hours":4,"when":"היום"}

"תזיז אירוע של מורן ל28/12" → {"intent":"event_update_date","name":"מורן","date":"28/12"}
"אירוע מורן 80 אנשים" → {"intent":"event_update_guests","name":"מורן","guest_count":80}
"התקבלו 2000 מאירוע מורן" → {"intent":"event_payment_received","name":"מורן","amount":2000}
"בטל את אירוע של מורן" → {"intent":"event_cancel","name":"מורן"}

"כבה את הפופאפ" → {"intent":"popup_disable"}
"תוריד פופאפ של אירועים" → {"intent":"popup_disable","title":"אירועים"}

CUSTOMER_CELEBRATIONS:
- customer_set_birthday {name, date|mmdd}: שמור יום הולדת לקוח — "יום הולדת של דביר 15 במרץ", "תעדכן יום הולדת רן ל5/3"
- customer_set_anniversary {name, date|mmdd, label?}: שמור יום נישואים — "יום נישואים של דביר ושירה 22 ביולי", "תעדכן ציון מיוחד של רן ל14/2"

"יום הולדת של דביר ב15 במרץ" → {"intent":"customer_set_birthday","name":"דביר","date":"15 במרץ"}
"תעדכן יום הולדת רן ל5/3" → {"intent":"customer_set_birthday","name":"רן","date":"5/3"}
"דביר חוגג יום הולדת ב22 ביוני" → {"intent":"customer_set_birthday","name":"דביר","date":"22 ביוני"}
"יום נישואים של רן ב14/2" → {"intent":"customer_set_anniversary","name":"רן","date":"14/2"}

# Multi-step examples (chained operations)
"תסיים משמרת לאסתר ותוסיף אותה לטיפים 5 שעות" → {"intent":"plan","steps":[
  {"intent":"clock_out","name":"אסתר"},
  {"intent":"tips_add_employee","name":"אסתר","hours":5,"when":"היום"}
]}
"תפתח טיפים, סנכרן שעות, סהכ 1800, ותגיד כמה לשעה" → {"intent":"plan","steps":[
  {"intent":"tips_sync_hours","when":"היום"},
  {"intent":"tips_set_total","amount":1800,"when":"היום"},
  {"intent":"q_tips_per_hour","when":"היום"},
  {"intent":"nav_open","target":"tips"}
]}
"אירוע של מורן עובר ל28/12 ויהיו 80 אנשים" → {"intent":"plan","steps":[
  {"intent":"event_update_date","name":"מורן","date":"28/12"},
  {"intent":"event_update_guests","name":"מורן","guest_count":80}
]}

DELIVERIES_EXTRA:
- delivery_assign_courier {name, courier}: שבץ שליח למשלוח — "תן את משלוח של דביר ליוסי", "יוסי לוקח את המשלוח של דביר"
- delivery_mark_delivered {name}: סמן נמסר — "המשלוח של דביר נמסר", "דביר קיבל את ההזמנה", "סיים משלוח של דביר"
- q_pending_deliveries: משלוחים ממתינים — "אילו משלוחים מחכים", "מה בתור למשלוחים"

INVENTORY_EXTRA:
- inventory_set {item, quantity}: קבע מלאי (לא להוסיף — להחליף) — "המלאי של חזה עוף 50", "תעדכן מלאי חזה עוף ל-50"
- inventory_remove {item, quantity}: הורד מהמלאי — "תוריד 5 חזה עוף", "הוצא 10 ביצים מהמלאי"
- q_inventory_value: שווי מלאי כולל — "כמה שווה המלאי", "מה ערך המלאי"

CUSTOMERS_EXTRA:
- customer_add {name, phone}: הוסף לקוח חדש — "תוסיף לקוח דביר 050123", "תפתח כרטיס לקוח לדביר"
- customer_update_phone {name, phone}: עדכן טלפון בלקוח — "תעדכן טלפון של דביר ל-0502222222"
- q_customer_spend {name}: כמה הלקוח הוציא — "כמה דביר הוציא", "מה ההיסטוריה של דביר"

PUSH_BROADCAST:
- push_to_role {role, message}: דחוף לתפקיד ספציפי — "תגיד למלצרים שיש פגישה ב-15:00", "תשלח לטבחים — מוצרים חדשים"

# === Examples for new intents ===
"תן את המשלוח של דביר ליוסי" → {"intent":"delivery_assign_courier","name":"דביר","courier":"יוסי"}
"יוסי לוקח את משלוח דביר" → {"intent":"delivery_assign_courier","name":"דביר","courier":"יוסי"}
"המשלוח של דביר נמסר" → {"intent":"delivery_mark_delivered","name":"דביר"}
"דביר קיבל את ההזמנה" → {"intent":"delivery_mark_delivered","name":"דביר"}
"אילו משלוחים מחכים" → {"intent":"q_pending_deliveries"}

"המלאי של חזה עוף 50" → {"intent":"inventory_set","item":"חזה עוף","quantity":50}
"תעדכן מלאי חזה עוף ל50" → {"intent":"inventory_set","item":"חזה עוף","quantity":50}
"תוריד 5 חזה עוף" → {"intent":"inventory_remove","item":"חזה עוף","quantity":5}
"הוצא 10 ביצים מהמלאי" → {"intent":"inventory_remove","item":"ביצים","quantity":10}
"כמה שווה המלאי" → {"intent":"q_inventory_value"}

"תוסיף לקוח דביר 0501234567" → {"intent":"customer_add","name":"דביר","phone":"0501234567"}
"תפתח כרטיס לקוח לדביר 0501234567" → {"intent":"customer_add","name":"דביר","phone":"0501234567"}
"תעדכן טלפון של דביר ל0502222222" → {"intent":"customer_update_phone","name":"דביר","phone":"0502222222"}
"כמה דביר הוציא" → {"intent":"q_customer_spend","name":"דביר"}

"תגיד למלצרים שיש פגישה ב-15:00" → {"intent":"push_to_role","role":"waiter","message":"יש פגישה ב-15:00"}
"תשלח לטבחים מוצרים חדשים" → {"intent":"push_to_role","role":"chef","message":"מוצרים חדשים"}

# Multi-step new examples
"תשבץ את יוסי למשלוח של דביר ותסמן שנמסר" → {"intent":"plan","steps":[
  {"intent":"delivery_assign_courier","name":"דביר","courier":"יוסי"},
  {"intent":"delivery_mark_delivered","name":"דביר"}
]}
"תוריד 5 חזה עוף, ותזמין עוד 20 מהספק" → {"intent":"plan","steps":[
  {"intent":"inventory_remove","item":"חזה עוף","quantity":5},
  {"intent":"order_from_supplier","item":"חזה עוף","quantity":20}
]}

CHECKLISTS_EXTRA:
- checklist_create {title, items?, role?, frequency?}: צ׳קליסט חדש — "תוסיף צ׳קליסט סיום משמרת — לכבות מנורות, לסגור מקרר, לבדוק קופה"
- q_checklist_pending: צ׳קליסטים שלא הושלמו — "מה לא הושלם", "מה עוד פתוח בצ׳קליסטים"

RESTAURANT_EMERGENCY:
- restaurant_close_now: סגירת מסעדה זמנית — "סגור את המסעדה", "אנחנו סגורים", "תכבה הכל"
- restaurant_open_now: חזרה לפעילות — "פתח את המסעדה", "אנחנו פתוחים"

BLACKLIST_FLOW:
- reservation_blacklist {name?, phone?, reason?}: חסום — "תחסום את דביר", "תוסיף לרשימה שחורה 0501234567"
- customer_unblacklist {name}: שחרר חסימה — "תוריד חסימה מדביר", "דביר לא חסום"
- q_check_phone {phone}: בדוק מי בעל טלפון — "מי בעל המספר 0501234567", "תבדוק את המספר"

STAFF_COMMS:
- staff_meeting {time, message}: פגישת צוות — "תקבע פגישת צוות מחר ב-15:00 על תפריט חדש"

EXEC_SUMMARY:
- q_today_summary: סיכום מנהל ליום — "תן לי סיכום", "מה המצב היום", "תגיד הכל"
- q_compare_revenue: השוואת השבוע מול שעבר — "תשווה הכנסות לשבוע שעבר", "השבוע יחסית לשעבר"

# === Examples for phase-4 intents ===
"תוסיף צ׳קליסט סיום משמרת" → {"intent":"checklist_create","title":"סיום משמרת"}
"מה לא הושלם" → {"intent":"q_checklist_pending"}
"סגור את המסעדה" → {"intent":"restaurant_close_now"}
"פתח את המסעדה" → {"intent":"restaurant_open_now"}
"תחסום את דביר" → {"intent":"reservation_blacklist","name":"דביר"}
"תוסיף לרשימה שחורה 0501234567" → {"intent":"reservation_blacklist","phone":"0501234567"}
"תוריד חסימה מדביר" → {"intent":"customer_unblacklist","name":"דביר"}
"מי בעל המספר 0501234567" → {"intent":"q_check_phone","phone":"0501234567"}
"תקבע פגישת צוות מחר ב-15:00" → {"intent":"staff_meeting","time":"מחר 15:00","message":"פגישת צוות"}
"תן לי סיכום" → {"intent":"q_today_summary"}
"מה המצב היום" → {"intent":"q_today_summary"}
"תשווה הכנסות לשבוע שעבר" → {"intent":"q_compare_revenue"}

# Big multi-step examples (combine many phases)
"סגור הזמנות, תגיד לצוות שאנחנו סוגרים מוקדם, ותכבה כל הפופאפים" → {"intent":"plan","steps":[
  {"intent":"restaurant_close_now"},
  {"intent":"send_team_message","message":"סוגרים מוקדם היום, ביי"},
  {"intent":"popup_disable"}
]}
"אסתר סיימה, תוסיף אותה לטיפים 7 שעות, ותוסיף עוד 100 מטבעות בונוס" → {"intent":"plan","steps":[
  {"intent":"clock_out","name":"אסתר"},
  {"intent":"tips_add_employee","name":"אסתר","hours":7,"when":"היום"},
  {"intent":"coins_give","name":"אסתר","amount":100,"reason":"בונוס סיום משמרת"}
]}

RESTROOM:
- q_last_clean: מתי ניקיון אחרון
- mark_clean: סמן ניקיון

- help: עזרה
- unknown: רק אם באמת אי-אפשר

Rules:
- Hebrew word order is fluid — UNDERSTAND MEANING.
- Names: כפי שנאמרו.
- Tables: strings ("10").
- "9 בערב"=21:00, "11 בבוקר"=11:00, "8 בלילה"=20:00, "12 בצהריים"=12:00.
- Hebrew numbers (ארבע=4, חמישה=5 etc) — convert.
- JSON only, no markdown.

EXAMPLES:
"מי עובד היום בערב" → {"intent":"q_on_shift_evening"}
"מי עובד עכשיו" → {"intent":"q_on_shift_now"}
"מי עובד היום מלצר" → {"intent":"q_on_shift_date","when":"היום","position":"מלצר"}
"איזה מלצרים יש מחר בערב" → {"intent":"q_on_shift_date","when":"מחר","shift_type":"dinner","position":"מלצר"}
"מי טבח עכשיו" → {"intent":"q_on_shift_now","position":"טבח"}
"תשלח לצוות שעות להיום בוואטסאפ" → {"intent":"send_staff_schedule","when":"היום"}
"11 פתחו לי" → {"intent":"table_free","table":"11"}
"שולחן 30 בקינוח" → {"intent":"table_finishing","table":"30"}
"תכניס שירה לתור היא ארבע" → {"intent":"queue_add","name":"שירה","party_size":4,"pref":"no_preference"}
"תוסיף הזמנה להיום בשעה 9 בערב על שם רן לשמונה אנשים" → {"intent":"reservation_add","name":"רן","party_size":8,"time":"21:00","when":"היום"}
"כמה אנשים בתור" → {"intent":"q_queue_count"}
"מה המצב" → {"intent":"q_status_summary"}
"תפתח את הדאשבורד" → {"intent":"nav_open","target":"dashboard"}
"תפתח תקרית המקרר התקלקל" → {"intent":"incident_open","description":"המקרר התקלקל"}
"מי חוגג היום" → {"intent":"q_birthdays_today"}
"תסמן את דביר כVIP" → {"intent":"customer_set_vip","name":"דביר"}
"תשלח קופון לרן" → {"intent":"customer_send_coupon","name":"רן"}
"כמה חזה עוף יש במלאי" → {"intent":"q_stock","item":"חזה עוף"}
"מלאי נמוך" → {"intent":"q_low_stock"}
"תוסיף 10 חזה עוף למלאי" → {"intent":"inventory_add","item":"חזה עוף","quantity":10}
"תזמין חזה עוף מהספק" → {"intent":"order_from_supplier","item":"חזה עוף"}
"חשבונית אחרונה של גלעם" → {"intent":"q_supplier_invoice","supplier":"גלעם"}
"יתרה של גלעם" → {"intent":"q_supplier_balance","supplier":"גלעם"}
"הכי נמכר" → {"intent":"q_top_seller"}
"תוסיף לתפריט פיצה ב-65" → {"intent":"menu_add","name":"פיצה","price":65}
"כמה טיפים היום" → {"intent":"q_tips_today"}
"תן בונוס לרן 100" → {"intent":"pay_bonus","name":"רן","amount":100}
"תן 50 מטבעות לשירה" → {"intent":"coins_give","name":"שירה","amount":50}
"חשבוניות פתוחות" → {"intent":"q_open_invoices"}
"תיצור חשבונית גלעם 1200" → {"intent":"invoice_create","supplier":"גלעם","amount":1200}
"הכנסה השבוע" → {"intent":"q_weekly_revenue"}
"אירועים השבוע" → {"intent":"q_events_week"}
"האירוע הבא" → {"intent":"q_next_event"}
"תוסיף אירוע לרן 25/12 50 אנשים" → {"intent":"event_add","name":"רן","date":"25/12","guest_count":50}
"תשלח חוזה לרן" → {"intent":"event_send_contract","name":"רן"}
"תקריות פתוחות" → {"intent":"q_open_incidents"}
"סגור את תקרית המקרר" → {"intent":"incident_close","description":"המקרר"}
"תשלח לכל הלקוחות אנחנו פתוחים השבת" → {"intent":"campaign_broadcast","message":"אנחנו פתוחים השבת"}
"לוח שיאים" → {"intent":"q_leaderboard"}
"כמה מטבעות יש לדביר" → {"intent":"q_employee_score","name":"דביר"}
"מי לקח אייפד" → {"intent":"q_who_has_ipad"}
"תחזיר אייפד 3" → {"intent":"return_device","device_number":"3"}
"מי בחופש היום" → {"intent":"q_on_leave"}
"מי איחר היום" → {"intent":"q_late_today"}
"עובדים חדשים החודש" → {"intent":"q_new_hires_month"}
"כמה שעות עבד רן" → {"intent":"q_hours_worked","name":"רן"}
"תאשר חופש של רן" → {"intent":"leave_approve","name":"רן"}
"תוסיף את שירה למשמרת ערב היום" → {"intent":"schedule_add","name":"שירה","shift_type":"dinner","when":"היום"}
"שנה חלון ביטול ל-12 שעות" → {"intent":"settings_change_cancellation","hours":12}
"שנה פיקדון ל-25%" → {"intent":"settings_change_deposit_pct","pct":25}
"הפעל הזמנות אונליין" → {"intent":"online_reservations_toggle","enabled":true}
"מתי ניקיון אחרון" → {"intent":"q_last_clean"}
"תסמן ניקיון" → {"intent":"mark_clean"}
"תשלח לצ׳אט משמרת קדימה חבר׳ה" → {"intent":"chat_broadcast","message":"קדימה חבר׳ה"}
"מי לא סיים את הקורס" → {"intent":"q_who_didnt_finish_course"}
"כמה משלוחים היום" → {"intent":"q_deliveries_today"}
"איזה שליחים פעילים" → {"intent":"q_active_courier"}
"משימות לרן" → {"intent":"q_tasks_for","name":"רן"}
"תוסיף קינוח לרן" → {"intent":"sale_credit","dish":"קינוח","name":"רן"}
"+1 ספיישל לשירה" → {"intent":"sale_credit","dish":"ספיישל","name":"שירה"}
"תפעיל יעד מבצע קינוחים" → {"intent":"sales_goal_activate","template":"מבצע קינוחים"}
"כמה קינוחים מכרנו" → {"intent":"q_sales_status","dish":"קינוח"}
"מי המוביל" → {"intent":"q_sales_leader"}
"תוסיף הזמנה רן ארבעה אנשים תשע מחר" → {"intent":"reservation_add","name":"רן","party_size":4,"time":"21:00","when":"מחר"}
"תוסיף הזמנה על שם ניב להיום בערב בשעה 9:00" → {"intent":"reservation_add","name":"ניב","party_size":2,"time":"21:00","when":"היום"}
"תדחה את ההזמנה של רן ל-9:30 בערב" → {"intent":"reservation_reschedule","name":"רן","time":"21:30"}
"ההזמנה של רן ליום שני מאחרים לשעה 9:30 בערב" → {"intent":"reservation_reschedule","name":"רן","time":"21:30"}
"תזיז את ההזמנה של רן לשעה 22" → {"intent":"reservation_reschedule","name":"רן","time":"22:00"}
"תעדכן את הטלפון של רן ל0501234567" → {"intent":"reservation_update_phone","name":"רן","phone":"0501234567"}
"תעדכן את המספר טלפון בהזמנה של רן ליום שני למספר 0503962976" → {"intent":"reservation_update_phone","name":"רן","phone":"0503962976"}
"תעשה שהזמנה של עדיה הגיעה" → {"intent":"reservation_mark_arrived","name":"עדיה"}
"ההזמנה של רן הגיעה" → {"intent":"reservation_mark_arrived","name":"רן"}
"תעביר את ההזמנה של דביר לשולחן 8" → {"intent":"seat_reservation","name":"דביר","table":"8"}
"תעביר את שולחנות 70 ו 71 לשולחן 8" → {"intent":"session_move_multi","from_tables":["70","71"],"to":"8"}
"תמצא לי מקום לעשרה אנשים עכשיו" → {"intent":"q_ai_seat_suggest","party_size":10}
"תמצא לי בעזרת העוזר האישי מקום לעשרה אנשים" → {"intent":"q_ai_seat_suggest","party_size":10}

# === SPOKEN HEBREW VARIANTS — מקסם דיוק על דיבור טבעי ===
# Owner reported certain phrasings were missing. These cover real dictation
# patterns: skipping prepositions, mixing speeds, dropping "את"/"של", merging
# numbers into the next word, using nicknames for time.

# Reservations — every conceivable phrasing
"רן מחר בערב 4 אנשים" → {"intent":"reservation_add","name":"רן","party_size":4,"time":"20:00","when":"מחר"}
"תקבע ליום שישי בשמונה לדביר 6 אנשים" → {"intent":"reservation_add","name":"דביר","party_size":6,"time":"20:00","when":"מחר"}
"תזמין לארבעה אנשים על שם נועה היום בשמונה וחצי" → {"intent":"reservation_add","name":"נועה","party_size":4,"time":"20:30","when":"היום"}
"רשום שירה ל2 הערב ב8" → {"intent":"reservation_add","name":"שירה","party_size":2,"time":"20:00","when":"היום"}
"הזמנה למחר בצהריים ל6 אנשים על שם איציק" → {"intent":"reservation_add","name":"איציק","party_size":6,"time":"13:00","when":"מחר"}
"אורי מחרתיים בערב 8 אנשים" → {"intent":"reservation_add","name":"אורי","party_size":8,"time":"20:00","when":"מחרתיים"}
"תכניס יוסי ל4 ב8 וחצי הערב" → {"intent":"reservation_add","name":"יוסי","party_size":4,"time":"20:30","when":"היום"}

# Cancel — slang, missing את, just name
"בטל את רן" → {"intent":"reservation_cancel","name":"רן"}
"רן ביטל" → {"intent":"reservation_cancel","name":"רן"}
"רן לא בא" → {"intent":"reservation_cancel","name":"רן"}
"דביר ביטל את ההזמנה" → {"intent":"reservation_cancel","name":"דביר"}
"תוריד את שירה" → {"intent":"reservation_cancel","name":"שירה"}

# Confirm
"רן אישר" → {"intent":"reservation_confirm","name":"רן"}
"אישור לדביר" → {"intent":"reservation_confirm","name":"דביר"}

# Mark arrived
"שירה הגיעה" → {"intent":"reservation_mark_arrived","name":"שירה"}
"רן פה" → {"intent":"reservation_mark_arrived","name":"רן"}
"דביר נכנס" → {"intent":"reservation_mark_arrived","name":"דביר"}
"תסמן שעדיה ישבה" → {"intent":"reservation_mark_arrived","name":"עדיה"}

# Reschedule
"רן יאחר חצי שעה" → {"intent":"reservation_reschedule","name":"רן","time":""}
"תזיז את רן לשמונה וחצי" → {"intent":"reservation_reschedule","name":"רן","time":"20:30"}
"רן יבוא ב9 במקום 8" → {"intent":"reservation_reschedule","name":"רן","time":"21:00"}
"דביר מאחר לשעה 21" → {"intent":"reservation_reschedule","name":"דביר","time":"21:00"}

# Tables — open, finishing, freed
"30 פנוי" → {"intent":"table_free","table":"30"}
"30 קם" → {"intent":"table_free","table":"30"}
"30 הלך" → {"intent":"table_free","table":"30"}
"30 שילם" → {"intent":"table_free","table":"30"}
"שולחן 11 גמרו" → {"intent":"table_free","table":"11"}
"11 חשבון" → {"intent":"table_finishing","table":"11"}
"30 קינוחים" → {"intent":"table_finishing","table":"30"}
"11 ישבו" → {"intent":"table_seated","table":"11"}
"11 על שולחן" → {"intent":"table_seated","table":"11"}
"30 הבריזו" → {"intent":"table_no_show","table":"30"}
"30 לא באו" → {"intent":"table_no_show","table":"30"}

# Seating commands
"תושיב את רן על 30" → {"intent":"seat_reservation","name":"רן","table":"30"}
"רן יושב על 30" → {"intent":"seat_reservation","name":"רן","table":"30"}
"שירה ל11" → {"intent":"seat_reservation","name":"שירה","table":"11"}
"דביר על 70 ו71" → {"intent":"seat_reservation_multi","name":"דביר","tables":["70","71"]}
"תקבל את הבא בתור על 30" → {"intent":"seat_next_queue","table":"30"}
"קבל את הבא על 11" → {"intent":"seat_next_queue","table":"11"}
"וווק אין 4 על 30" → {"intent":"seat_walkin","party_size":4,"table":"30"}
"4 על 30" → {"intent":"seat_walkin","party_size":4,"table":"30"}

# Move tables
"תזיז שולחן 30 ל11" → {"intent":"session_move","from":"30","to":"11"}
"העבר 30 ל11" → {"intent":"session_move","from":"30","to":"11"}
"30 ל11 תעביר" → {"intent":"session_move","from":"30","to":"11"}

# Extend sessions
"30 עוד רבע שעה" → {"intent":"session_extend","table":"30","minutes":15}
"30 עוד 20 דקות" → {"intent":"session_extend","table":"30","minutes":20}

# Queue — natural phrasings
"רן בא עכשיו לתור 4 אנשים" → {"intent":"queue_add","name":"רן","party_size":4,"pref":"no_preference"}
"שירה מחכה בחוץ" → {"intent":"queue_add","name":"שירה","party_size":2,"pref":"outside"}
"תרשום רן ל4 חוץ" → {"intent":"queue_add","name":"רן","party_size":4,"pref":"outside"}
"רן יצא" → {"intent":"queue_abandoned","name":"רן"}
"שירה לא מחכה" → {"intent":"queue_abandoned","name":"שירה"}
"תקרא לרן" → {"intent":"queue_call","name":"רן"}
"רן נכנס" → {"intent":"queue_arrived","name":"רן"}

# Flags — slang
"30 VIP" → {"intent":"table_flag","table":"30","flag":"green"}
"30 חשוב" → {"intent":"table_flag","table":"30","flag":"green"}
"30 ירוק" → {"intent":"table_flag","table":"30","flag":"green"}
"30 בעיה" → {"intent":"table_flag","table":"30","flag":"red"}
"30 אדום" → {"intent":"table_flag","table":"30","flag":"red"}
"30 שים לב" → {"intent":"table_flag","table":"30","flag":"orange"}

# Live questions
"מה קורה עכשיו" → {"intent":"q_status_summary"}
"איך אנחנו עומדים" → {"intent":"q_status_summary"}
"כמה פנוי" → {"intent":"q_free_tables"}
"מה הבא בתור" → {"intent":"q_next_in_queue"}
"מי הבא" → {"intent":"q_next_in_queue"}
"מה עם 30" → {"intent":"q_who_on_table","table":"30"}
"מי על 30" → {"intent":"q_who_on_table","table":"30"}
"כמה אנשים יש לי היום" → {"intent":"q_today_guests"}
"כמה הכנסה עד עכשיו" → {"intent":"q_today_revenue"}

# Staff
"מי הצוות עכשיו" → {"intent":"q_on_shift_now"}
"מי בערב היום" → {"intent":"q_on_shift_evening"}
"מי במשמרת ערב" → {"intent":"q_on_shift_evening"}
"מי בצהריים מחר" → {"intent":"q_on_shift_date","when":"מחר","shift_type":"lunch"}
"איזה מלצרים יש לי היום" → {"intent":"q_on_shift_date","when":"היום","position":"מלצר"}
"מי הברמן הערב" → {"intent":"q_on_shift_date","when":"היום","shift_type":"dinner","position":"ברמן"}

# Comms
"תזכר לרן" → {"intent":"send_reminder","name":"רן"}
"שלח אישור לדביר" → {"intent":"resend_confirmation","name":"דביר"}
"תגיד לצוות שיש מבצע" → {"intent":"send_team_message","message":"יש מבצע"}
"שלח לכולם שאנחנו חוגגים" → {"intent":"send_team_message","message":"אנחנו חוגגים"}

# Sales
"דביר מכר עוד קינוח" → {"intent":"sale_credit","dish":"קינוח","name":"דביר"}
"+1 לדביר קינוח" → {"intent":"sale_credit","dish":"קינוח","name":"דביר"}
"מכרתי קינוח לרן" → {"intent":"sale_credit","dish":"קינוח","name":"רן"}
"שירה מכרה ספיישל" → {"intent":"sale_credit","dish":"ספיישל","name":"שירה"}
"תפעיל את מבצע הקינוחים" → {"intent":"sales_goal_activate","template":"מבצע קינוחים"}
"מה מצב המכירות" → {"intent":"q_sales_status"}
"מי בראש" → {"intent":"q_sales_leader"}

# Open page
"פתח לי את המפה" → {"intent":"nav_open","target":"seating"}
"קח אותי למפה" → {"intent":"nav_open","target":"seating"}
"מפת השולחנות" → {"intent":"nav_open","target":"seating"}
"דאשבורד" → {"intent":"nav_open","target":"dashboard"}
"קופה לייב" → {"intent":"nav_open","target":"dashboard"}

# Help
"מה אתה יכול לעשות" → {"intent":"help"}
"איך משתמשים בזה" → {"intent":"help"}
"תסביר לי" → {"intent":"help"}

# Common time phrasings (always convert to HH:MM)
# "תשע בערב"=21:00, "תשע וחצי בערב"=21:30, "שמונה רבע"=08:15, "שמונה ורבע"=08:15
# "אחת אחר חצות"=01:00, "חצי שבע"=06:30 (NOT 07:30 — שלא לפי תקני בלוח השעון)
# "רבע ל9 בערב"=20:45, "עשר וחצי בלילה"=22:30
# Hebrew weekday names: ראשון=Sun, שני=Mon, שלישי=Tue, רביעי=Wed, חמישי=Thu, שישי=Fri, שבת=Sat
# When user says "יום שני" — that's Monday; resolve to nearest future Monday and use as the when field.
# When user says "סוף שבוע" → typically מחר (חמישי) או מחרתיים (שישי) — default to closest weekend.

# === Schedule remove — all verb variants must work ===
"תמחק את עדן מהסידור היום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תוריד את עדן מהמשמרת היום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תוציא את עדן מהיום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תסיר את עדן מהסידור" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תבטל את המשמרת של עדן היום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תוריד אותה מהמשמרת היום" → {"intent":"schedule_remove","name":"","when":"היום"}
"עדן לא במשמרת היום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"עדן יצאה מהיום" → {"intent":"schedule_remove","name":"עדן","when":"היום"}
"תזרוק את עדן מהערב מחר" → {"intent":"schedule_remove","name":"עדן","when":"מחר","shift_type":"dinner"}
"להוציא את עדן מהצהריים שלישי" → {"intent":"schedule_remove","name":"עדן","when":"שלישי","shift_type":"lunch"}

Input: "${text}"
Output (JSON only, MUST include "intent"):`;

    const result: any = await invokeLLM({
      prompt,
      timeoutMs: 25000,
      maxOutputTokens: 2048,
      maxAttempts: 2,
      responseSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string' },
          table: { type: 'string' },
          name: { type: 'string' },
          party_size: { type: 'number' },
          pref: { type: 'string' },
          flag: { type: 'string' },
          tables: { type: 'array', items: { type: 'string' } },
          time: { type: 'string' },
          when: { type: 'string' },
          minutes: { type: 'number' },
          from: { type: 'string' },
          to: { type: 'string' },
          target: { type: 'string' },
          shift_type: { type: 'string' },
          position: { type: 'string' },
          message: { type: 'string' },
          description: { type: 'string' },
          who: { type: 'string' },
          // Extended intents (Customers/Inventory/Suppliers/Menu/Finance/Events/Tasks/Settings/Devices/Marketing/Couriers)
          item: { type: 'string' },
          quantity: { type: 'number' },
          supplier: { type: 'string' },
          amount: { type: 'number' },
          reason: { type: 'string' },
          price: { type: 'number' },
          category: { type: 'string' },
          date: { type: 'string' },
          guest_count: { type: 'number' },
          event_type: { type: 'string' },
          phone: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string' },
          device_number: { type: 'string' },
          hours: { type: 'number' },
          pct: { type: 'number' },
          enabled: { type: 'boolean' },
          courier: { type: 'string' },
          // Reservation extended (reschedule / update phone / multi-move)
          from_tables: { type: 'array', items: { type: 'string' } },
          preference: { type: 'string' },
          // Sales gamification
          dish: { type: 'string' },
          template: { type: 'string' },
          // New phase-3 fields
          role: { type: 'string' },
          // Multi-step plan — array of {intent, ...params} executed in order
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                name: { type: 'string' },
                table: { type: 'string' },
                time: { type: 'string' },
                when: { type: 'string' },
                shift_type: { type: 'string' },
                amount: { type: 'number' },
                party_size: { type: 'number' },
                target: { type: 'string' },
                message: { type: 'string' },
                description: { type: 'string' },
                item: { type: 'string' },
                quantity: { type: 'number' },
                dish: { type: 'string' },
                courier: { type: 'string' },
                role: { type: 'string' },
                phone: { type: 'string' },
                position: { type: 'string' },
                hours: { type: 'number' },
                guest_count: { type: 'number' },
                date: { type: 'string' },
                title: { type: 'string' },
                continue_on_error: { type: 'boolean' },
              },
              required: ['intent'],
            },
          },
        },
        required: ['intent'],
      },
    } as any);
    console.log('[parseVoiceCommand]', JSON.stringify({ text, result }).slice(0, 400));
    return { ...result, raw: text };
  } catch (e: any) {
    console.warn('[parseVoiceCommand] LLM failed:', e?.message);
    return { intent: 'unknown', raw: text, error: e?.message };
  }
});

// === Voice → team broadcast helper ==========================================
// Sends one WhatsApp/SMS to every active employee with a phone on file.
// Used by the voice 'send_staff_schedule' and 'send_team_message' intents.
registerFn('sendTeamWhatsApp', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const message = String((body as any)?.message || '').trim();
  if (!message) throw new Error('message required');
  const employees: any[] = await db.employee.findMany({ where: { status: 'active' } });
  const targets = employees.filter((e) => e.phone);
  let sent = 0, failed = 0;
  for (const e of targets) {
    try {
      // Try WhatsApp first (template-less free-form works if they messaged us in 24h);
      // SMS as fallback to ensure delivery.
      await sendWhatsApp(e.phone, message).catch(() => sendSms(e.phone, message));
      sent++;
    } catch (err: any) {
      console.warn('[sendTeamWhatsApp] failed for', e.phone, err?.message);
      failed++;
    }
  }
  return { sent, failed, total: targets.length };
});

// === Shared shift resolution =================================================
// Mirror of src/lib/salesShift.js — frontend and backend MUST agree on which
// shift a given moment belongs to or sales goals get filed to the wrong shift.
function resolveCurrentShift(now: Date = new Date()): { date: string; type: 'lunch' | 'dinner' } | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10);

  if (hour >= 6 && hour < 17) return { date: dateStr, type: 'lunch' };
  if (hour >= 17 && hour <= 23) return { date: dateStr, type: 'dinner' };
  if (hour >= 0 && hour < 3) {
    const y = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const yget = (t: string) => y.find(p => p.type === t)?.value || '';
    return { date: `${yget('year')}-${yget('month')}-${yget('day')}`, type: 'dinner' };
  }
  return null;
}

// Resolves the staff currently on shift and returns Employee records with
// push capability. If `onlyEmployeeId` is provided, returns just that one.
async function getActiveShiftStaff(onlyEmployeeId?: string): Promise<any[]> {
  const shift = resolveCurrentShift(new Date());
  if (!shift) return [];
  const workShifts: any[] = await (db as any).workShift.findMany({
    where: { date: shift.date, shift_type: shift.type },
  });
  const ids = new Set<string>();
  for (const ws of workShifts) {
    for (const a of (ws.assigned_staff || [])) {
      if (a.employee_id) ids.add(a.employee_id);
    }
  }
  if (onlyEmployeeId) {
    if (!ids.has(onlyEmployeeId)) return [];
    const e = await (db as any).employee.findUnique({ where: { id: onlyEmployeeId } });
    return e ? [e] : [];
  }
  if (ids.size === 0) return [];
  return (db as any).employee.findMany({ where: { id: { in: [...ids] } } });
}

// Like pushoverToAdmins but addresses staff on the currently active shift only.
async function pushoverToActiveShift(title: string, message: string, onlyEmployeeId?: string) {
  try {
    const staff = await getActiveShiftStaff(onlyEmployeeId);
    for (const e of staff) {
      const sub = (e as any).push_subscription;
      if (!sub) continue;
      try { await pushover(sub, title, message); }
      catch (err: any) { console.warn('[pushoverToActiveShift] push failed for', e.id, err?.message); }
    }
  } catch (e: any) {
    console.warn('[pushoverToActiveShift] failed:', e?.message);
  }
}

// Role check used by sale_credit / activateSalesGoal endpoints and voice intents.
const SUPERVISOR_POSITIONS = new Set(['אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת', 'אחמש']);
async function isShiftSupervisor(userId: string): Promise<boolean> {
  try {
    const u: any = await (db as any).user.findUnique({ where: { id: userId } });
    if (!u) return false;
    if (u.role === 'admin' || u.role === 'manager' || u.role === 'owner') return true;
    const emp: any = await (db as any).employee.findFirst({ where: { email: u.email } });
    if (!emp) return false;
    if (emp.role === 'admin' || emp.role === 'manager') return true;
    const positions: string[] = Array.isArray(emp.positions) ? emp.positions : (emp.role ? [emp.role] : []);
    return positions.some(p => SUPERVISOR_POSITIONS.has(String(p).trim()));
  } catch { return false; }
}

registerFn('activateSalesGoal', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can activate goals');
  const b = (body || {}) as any;
  const templateId = String(b.template_id || '');
  if (!templateId) throw new Error('template_id required');
  const tmpl: any = await (db as any).salesGoalTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl) throw new Error('template not found');
  if (!tmpl.is_active) throw new Error('template not active');
  const shift = resolveCurrentShift(new Date());
  if (!shift) throw new Error('no active shift right now (03:00–06:00 dead window)');

  const goal: any = await (db as any).salesGoal.create({
    data: {
      template_id: tmpl.id,
      shift_date: shift.date,
      shift_type: shift.type,
      dish_label: tmpl.dish_label,
      emoji: tmpl.emoji,
      target: Number(b.target) > 0 ? Number(b.target) : tmpl.default_target,
      coins_per_sale: Number(b.coins_per_sale) > 0 ? Number(b.coins_per_sale) : tmpl.default_coins_per_sale,
      activated_by_id: String(user.id),
      activated_by_name: String((user as any).full_name || user.email || ''),
    },
  });

  // Activity log + push to all on-shift staff
  try {
    await (db as any).activityLog.create({
      data: {
        user_id: String(user.id),
        user_name: String((user as any).full_name || user.email || ''),
        action_type: 'goal_activate',
        page: '/EmployeeHome',
        label: `${tmpl.name} (target ${goal.target})`,
        target_id: goal.id,
      },
    });
  } catch { /* best-effort */ }
  await pushoverToActiveShift(
    `🎯 יעד חדש: ${goal.target} ${goal.dish_label}`,
    `קדימה צוות! ${goal.coins_per_sale} 🪙 פר מכירה`,
  );
  return { goal };
});

registerFn('creditSale', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can credit sales');
  const b = (body || {}) as any;
  const goalId = String(b.goal_id || '');
  const waiterId = String(b.waiter_id || '');
  if (!goalId || !waiterId) throw new Error('goal_id and waiter_id required');

  const goal: any = await (db as any).salesGoal.findUnique({ where: { id: goalId } });
  if (!goal) throw new Error('goal not found');
  if (goal.status === 'closed') throw new Error('היעד נסגר');
  // 'completed' goals still accept sales, with bonus

  const waiter: any = await (db as any).employee.findUnique({ where: { id: waiterId } });
  if (!waiter) throw new Error('waiter not found');

  const isBonus = goal.status === 'completed';
  const coins = isBonus ? goal.coins_per_sale * 2 : goal.coins_per_sale;

  // Coin transaction first so we have the id to link
  const ct: any = await (db as any).coinTransaction.create({
    data: {
      employee_id: waiter.id,
      employee_name: waiter.full_name,
      amount: coins,
      reason: `מכירת ${goal.dish_label}${isBonus ? ' (בונוס)' : ''}`,
      type: 'sale_bonus',
      trigger: `sales_goal:${goal.id}`,
      status: 'approved',
      approved_by: String((user as any).full_name || user.email || ''),
    },
  });

  // Sale event
  const event: any = await (db as any).saleEvent.create({
    data: {
      goal_id: goal.id,
      waiter_id: waiter.id,
      waiter_name: waiter.full_name,
      credited_by_id: String(user.id),
      credited_by_name: String((user as any).full_name || user.email || ''),
      coins_amount: coins,
      is_bonus: isBonus,
      coin_transaction_id: ct.id,
    },
  });

  // Atomic increment + completion flip
  const newCount = goal.current_count + 1;
  const justCompleted = !isBonus && newCount === goal.target;
  await (db as any).salesGoal.update({
    where: { id: goal.id },
    data: {
      current_count: { increment: 1 },
      status: justCompleted ? 'completed' : goal.status,
      completed_at: justCompleted ? new Date() : undefined,
    },
  });

  // Activity log
  try {
    await (db as any).activityLog.create({
      data: {
        user_id: String(user.id),
        user_name: String((user as any).full_name || user.email || ''),
        action_type: 'sale_credit',
        page: '/EmployeeHome',
        label: `+1 ${goal.dish_label} → ${waiter.full_name}`,
        target_id: goal.id,
        metadata: { waiter_id: waiter.id, coins },
      },
    });
  } catch { /* best-effort */ }

  // Push to the credited waiter (always), then group push on completion
  await pushoverToActiveShift(
    `+${coins} 🪙 על ${goal.dish_label}!`,
    isBonus ? 'בונוס כפול 🔥' : 'יפה מאוד!',
    waiter.id,
  );
  if (justCompleted) {
    await pushoverToActiveShift(
      `🎉 הצוות עשה את זה!`,
      `${goal.target} ${goal.dish_label} — בונוס כפול על מכירות נוספות`,
    );
  }

  return { event, new_count: newCount, just_completed: justCompleted };
});

registerFn('undoLastSale', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can undo');
  const b = (body || {}) as any;
  const goalId = String(b.goal_id || '');
  const waiterId = String(b.waiter_id || '');
  if (!goalId || !waiterId) throw new Error('goal_id and waiter_id required');

  const last: any = await (db as any).saleEvent.findFirst({
    where: { goal_id: goalId, waiter_id: waiterId, undone_at: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) throw new Error('אין מכירה לבטל');
  const ageMs = Date.now() - new Date(last.createdAt).getTime();
  if (ageMs > 60_000) throw new Error('חלון ביטול נסגר');

  await (db as any).saleEvent.update({
    where: { id: last.id },
    data: { undone_at: new Date() },
  });
  // Reverse coins via a negative CoinTransaction so audit trail is preserved
  if (last.coin_transaction_id) {
    await (db as any).coinTransaction.create({
      data: {
        employee_id: last.waiter_id,
        employee_name: last.waiter_name,
        amount: -Math.abs(last.coins_amount),
        reason: `ביטול מכירה`,
        type: 'sale_undo',
        trigger: `sales_goal:${goalId}`,
        status: 'approved',
        approved_by: String((user as any).full_name || user.email || ''),
      },
    });
  }
  await (db as any).salesGoal.update({
    where: { id: goalId },
    data: { current_count: { decrement: 1 } },
  });
  return { undone: true };
});

registerFn('closeSalesGoal', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can close');
  const goalId = String((body as any)?.goal_id || '');
  if (!goalId) throw new Error('goal_id required');

  const goal: any = await (db as any).salesGoal.findUnique({ where: { id: goalId } });
  if (!goal) throw new Error('goal not found');
  if (goal.status === 'closed') return { goal };

  // Compute leaderboard for the auto-Story
  const events: any[] = await (db as any).saleEvent.findMany({
    where: { goal_id: goal.id, undone_at: null },
  });
  const perWaiter = new Map<string, { id: string; name: string; count: number }>();
  for (const e of events) {
    const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
    cur.count++;
    perWaiter.set(e.waiter_id, cur);
  }
  const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
  const leader = ranked[0];

  const updated = await (db as any).salesGoal.update({
    where: { id: goal.id },
    data: {
      status: 'closed',
      closed_at: new Date(),
      closed_by_id: String(user.id),
    },
  });

  // Auto-Story (best-effort — the story model name may vary in this codebase;
  // try the most likely names and ignore errors).
  if (leader) {
    try {
      await (db as any).employeeStory.create({
        data: {
          title: `👑 המוביל ב-${goal.dish_label}`,
          content: `${leader.name} עם ${leader.count} מכירות (${ranked.length} מלצרים השתתפו, סה״כ ${events.length} ${goal.dish_label})`,
          image_url: null,
          author_id: String(user.id),
          author_name: String((user as any).full_name || user.email || ''),
          published_at: new Date(),
        },
      });
    } catch (e: any) {
      console.warn('[closeSalesGoal] story create failed:', e?.message);
    }
  }
  return { goal: updated, leaderboard: ranked };
});

registerFn('getActiveSalesGoals', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const b = (body || {}) as any;
  const explicit = b.shift_date && b.shift_type ? { date: String(b.shift_date), type: String(b.shift_type) } : null;
  const shift = explicit || resolveCurrentShift(new Date());
  if (!shift) return { shift: null, goals: [] };

  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { shift_date: shift.date, shift_type: shift.type, status: { not: 'closed' } },
    orderBy: { activated_at: 'asc' },
  });
  // For each goal, leaderboard + caller's slot
  const callerEmp: any = await (db as any).employee.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } } });
  const callerId = callerEmp?.id || null;

  const enriched = await Promise.all(goals.map(async (g) => {
    const events: any[] = await (db as any).saleEvent.findMany({
      where: { goal_id: g.id, undone_at: null },
    });
    const perWaiter = new Map<string, { id: string; name: string; count: number }>();
    for (const e of events) {
      const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
      cur.count++;
      perWaiter.set(e.waiter_id, cur);
    }
    const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
    const myCount = callerId ? (perWaiter.get(callerId)?.count || 0) : 0;
    const myPosition = callerId ? ranked.findIndex(r => r.id === callerId) + 1 : 0;
    return { ...g, leaderboard: ranked.slice(0, 5), my_count: myCount, my_position: myPosition };
  }));
  return { shift, goals: enriched };
});

registerFn('getShiftLeaderboard', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const b = (body || {}) as any;
  const explicit = b.shift_date && b.shift_type ? { date: String(b.shift_date), type: String(b.shift_type) } : null;
  const shift = explicit || resolveCurrentShift(new Date());
  if (!shift) return { shift: null, board: [] };
  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { shift_date: shift.date, shift_type: shift.type },
    select: { id: true },
  });
  if (goals.length === 0) return { shift, board: [] };
  const events: any[] = await (db as any).saleEvent.findMany({
    where: { goal_id: { in: goals.map(g => g.id) }, undone_at: null },
  });
  const perWaiter = new Map<string, { id: string; name: string; sales: number; coins: number }>();
  for (const e of events) {
    const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, sales: 0, coins: 0 };
    cur.sales++;
    cur.coins += e.coins_amount;
    perWaiter.set(e.waiter_id, cur);
  }
  const board = [...perWaiter.values()].sort((a, b) => b.coins - a.coins);
  return { shift, board };
});

registerFn('getMyWeeklyGoal', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const emp: any = await (db as any).employee.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } } });
  if (!emp) return { goal: null };
  // Find current week start (Sunday) in IL
  const now = new Date();
  const ilDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(now);
  const daysFromSun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(ilDay);
  const sunday = new Date(now.getTime() - daysFromSun * 24 * 60 * 60 * 1000);
  const weekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(sunday);
  const goal: any = await (db as any).weeklyPersonalGoal.findFirst({
    where: { employee_id: emp.id, week_start_date: weekStart },
  });
  return { goal };
});

registerFn('getActiveRewardsForMe', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const emp: any = await (db as any).employee.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } } });
  let balance = 0;
  if (emp) {
    const txs: any[] = await (db as any).coinTransaction.findMany({
      where: { employee_id: emp.id, status: 'approved' },
      select: { amount: true },
    });
    balance = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  }
  const rewards: any[] = await (db as any).reward.findMany({
    where: { is_active: true },
    orderBy: { cost: 'asc' },
  });
  const affordable = rewards.filter((r: any) => Number(r.cost || 0) <= balance);
  // Show up to 6 "locked" rewards as motivation — always populated when there
  // are any active rewards in the catalog, even if the caller has 0 balance.
  const locked = rewards.filter((r: any) => Number(r.cost || 0) > balance).slice(0, 6);
  return { affordable, locked, balance };
});

// === Auto-Tracker =========================================================
// Watches owner/manager actions (page nav, voice commands, button clicks),
// stores them in ActivityLog, and once a day asks Gemini to spot repeated
// workflows and propose voice shortcuts / widgets / automations. Each
// suggestion is saved as an AiSuggestion record and pushed to the owner.
registerFn('logActivity', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const events: any[] = Array.isArray((body as any)?.events) ? (body as any).events : [];
  if (events.length === 0) return { saved: 0 };
  const rows = events.slice(0, 200).map((e: any) => ({
    user_id: String(user.id),
    user_name: String((user as any).full_name || user.email || ''),
    action_type: String(e.action_type || 'unknown').slice(0, 60),
    page: e.page ? String(e.page).slice(0, 200) : null,
    label: e.label ? String(e.label).slice(0, 200) : null,
    target_id: e.target_id ? String(e.target_id).slice(0, 100) : null,
    metadata: e.metadata ?? null,
  }));
  try {
    await (db as any).activityLog.createMany({ data: rows, skipDuplicates: true });
    return { saved: rows.length };
  } catch (e: any) {
    console.warn('[logActivity] insert failed:', e?.message);
    return { saved: 0, error: e?.message };
  }
});

// === Pattern analysis + suggestion generation ============================
// Looks at the last 7 days of activity for each user, finds patterns (same
// action repeated 5+ times, or workflows of N actions that follow each
// other), and asks Gemini to propose voice shortcuts. Idempotent: it skips
// patterns already represented by an existing 'auto_tracker' AiSuggestion.
export async function runAutoTrackerAnalysis() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logs: any[] = await (db as any).activityLog.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'asc' },
  });
  if (logs.length < 5) return { skipped: 'not enough activity', total: logs.length };

  // Group per user
  const perUser = new Map<string, any[]>();
  for (const l of logs) {
    if (!perUser.has(l.user_id)) perUser.set(l.user_id, []);
    perUser.get(l.user_id)!.push(l);
  }

  // Existing auto_tracker suggestions — used for dedup
  const existing: any[] = await (db as any).aiSuggestion.findMany({
    where: { suggestion_type: 'auto_tracker' },
    select: { title: true, ai_context: true },
  });
  const seenKeys = new Set(
    existing.map(e => (e.ai_context || '').split('|')[0]).filter(Boolean)
  );

  let suggestionsCreated = 0;

  for (const [userId, userLogs] of perUser) {
    // Count repeats: key = action_type + page + (label substring)
    const counts = new Map<string, { key: string; count: number; example: any }>();
    for (const l of userLogs) {
      const key = `${l.action_type}::${l.page || ''}::${l.label || ''}`;
      const prev = counts.get(key) || { key, count: 0, example: l };
      prev.count++;
      counts.set(key, prev);
    }
    const repeats = [...counts.values()]
      .filter(c => c.count >= 5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    if (repeats.length === 0) continue;

    // Build context for LLM
    const summary = repeats.map(r =>
      `- ${r.count}× ${r.example.action_type} · ${r.example.page || ''} · ${r.example.label || ''}`
    ).join('\n');

    let llmResult: any = null;
    try {
      llmResult = await invokeLLM({
        prompt: `אתה עוזר לבעלים של מסעדת ${await getBrandName()}. הוא משתמש במערכת ניהול עם פקודות קוליות.
ניתחתי את הפעולות שלו ב-7 ימים האחרונים ומצאתי דברים שהוא חוזר עליהם:

${summary}

לכל פעולה חוזרת, הצע שיפור אחד מהאפשרויות:
1. **פקודה קולית חדשה** ("תגיד 'X' ויעשה את זה אוטומטית")
2. **Widget בדאשבורד** ("נציג לך את הנתון הזה בעמוד הראשי")
3. **אוטומציה** ("נריץ את זה אוטומטית כשX קורה")

החזר JSON array עם עד 5 הצעות:
[
  {"title": "כותרת קצרה", "content": "תיאור מלא בעברית — מה זה ולמה זה יעזור", "type": "voice"|"widget"|"automation", "context_key": "${repeats[0]?.key || ''}", "priority": "high"|"medium"|"low"}
]

החזר רק את ה-JSON, בלי הסבר.`,
        timeoutMs: 25000,
        maxOutputTokens: 1500,
        responseSchema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  type: { type: 'string' },
                  context_key: { type: 'string' },
                  priority: { type: 'string' },
                },
              },
            },
          },
        },
      } as any);
    } catch (e: any) {
      console.warn('[autoTracker] LLM failed:', e?.message);
      continue;
    }

    const suggestions: any[] = Array.isArray(llmResult?.suggestions) ? llmResult.suggestions : [];
    for (const s of suggestions.slice(0, 5)) {
      const key = String(s.context_key || s.title || '').slice(0, 200);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      try {
        await (db as any).aiSuggestion.create({
          data: {
            suggestion_type: 'auto_tracker',
            title: String(s.title || '').slice(0, 200),
            content: String(s.content || '').slice(0, 2000),
            ai_context: `${key}|user:${userId}`,
            priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
            implementation_status: 'saved',
            category: s.type || 'voice',
            tags: { source: 'auto_tracker', target_user: userId, type: s.type || 'voice' },
          },
        });
        suggestionsCreated++;
      } catch (e: any) {
        console.warn('[autoTracker] create suggestion failed:', e?.message);
      }
    }

    // Push owner one summary notification per analysis cycle
    if (suggestions.length > 0) {
      try {
        await pushoverToAdmins(
          `💡 ${suggestions.length} הצעות חדשות מ-Auto-Tracker`,
          suggestions.slice(0, 3).map((s: any) => `• ${s.title}`).join('\n'),
        );
      } catch { /* push optional */ }
    }
  }

  return { users_analyzed: perUser.size, suggestions_created: suggestionsCreated, logs_scanned: logs.length };
}

registerFn('runAutoTrackerAnalysis', async ({ user }) => {
  if (!user) throw new Error('auth required');
  return runAutoTrackerAnalysis();
});

// === Auto-Tracker daily cron at 23:00 IL ====================================
// Idempotent guard so we don't run twice per day.
if (!(globalThis as any).__autoTrackerCronTimer) {
  (globalThis as any).__autoTrackerCronTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jerusalem',
          hour: '2-digit',
          hour12: false,
        }).formatToParts(new Date());
        const hour = parts.find(p => p.type === 'hour')?.value || '00';
        const dateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jerusalem',
        }).format(new Date());
        const lastRun = (globalThis as any).__autoTrackerLastRun;
        if (hour === '23' && lastRun !== dateStr) {
          (globalThis as any).__autoTrackerLastRun = dateStr;
          console.log('[autoTracker] daily run starting');
          const r = await runAutoTrackerAnalysis();
          console.log('[autoTracker] daily run done:', JSON.stringify(r));
        }
      } catch (e: any) {
        console.warn('[autoTracker] daily cron failed:', e?.message);
      }
      (globalThis as any).__autoTrackerCronTimer = setTimeout(loop, 15 * 60 * 1000);
    })();
  }, 60 * 1000);
}

// === Sales-goal auto-close cron =============================================
// Lunch goals close at 18:00 IL of their shift_date.
// Dinner goals close at 03:00 IL of (shift_date + 1 day).
// Idempotent: only goals with status='active' or 'completed' are touched.
export async function runSalesAutoClose() {
  const now = new Date();
  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { status: { in: ['active', 'completed'] } },
  });
  let closed = 0;
  for (const g of goals) {
    let closeTimeIso: string;
    if (g.shift_type === 'lunch') {
      closeTimeIso = `${g.shift_date}T18:00:00+03:00`;
    } else {
      const [y, m, d] = g.shift_date.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      const nextStr = next.toISOString().slice(0, 10);
      closeTimeIso = `${nextStr}T03:00:00+03:00`;
    }
    if (now.getTime() < new Date(closeTimeIso).getTime()) continue;
    try {
      // Use the same close logic as the manual endpoint
      const events: any[] = await (db as any).saleEvent.findMany({
        where: { goal_id: g.id, undone_at: null },
      });
      const perWaiter = new Map<string, { id: string; name: string; count: number }>();
      for (const e of events) {
        const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
        cur.count++;
        perWaiter.set(e.waiter_id, cur);
      }
      const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
      await (db as any).salesGoal.update({
        where: { id: g.id },
        data: { status: 'closed', closed_at: now, closed_by_id: 'cron' },
      });
      if (ranked[0]) {
        try {
          await (db as any).employeeStory.create({
            data: {
              title: `👑 המוביל ב-${g.dish_label}`,
              content: `${ranked[0].name} עם ${ranked[0].count} מכירות (${events.length} סה״כ ${g.dish_label})`,
              author_id: 'cron',
              author_name: 'מערכת',
              published_at: now,
            },
          });
        } catch (err: any) { console.warn('[salesAutoClose] story failed:', err?.message); }
      }
      closed++;
    } catch (err: any) {
      console.warn('[salesAutoClose] close failed for', g.id, err?.message);
    }
  }
  return { scanned: goals.length, closed };
}

if (!(globalThis as any).__salesAutoCloseTimer) {
  (globalThis as any).__salesAutoCloseTimer = setTimeout(function loop() {
    void runSalesAutoClose()
      .then(r => { if (r.closed > 0) console.log('[salesAutoClose]', JSON.stringify(r)); })
      .catch(e => console.warn('[salesAutoClose] failed:', e?.message))
      .finally(() => {
        (globalThis as any).__salesAutoCloseTimer = setTimeout(loop, 30 * 60 * 1000);
      });
  }, 2 * 60 * 1000);
}

// === Weekly personal goals cron =============================================
// Sunday 06:00 IL: for each active employee with sales role, compute last
// week's total sales count and create a new WeeklyPersonalGoal with
// target = last_week + 15% (rounded), reward_coins = 200.
// Idempotent per week_start_date.
export async function runWeeklyPersonalGoals() {
  const now = new Date();
  const ilDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(now);
  const daysFromSun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(ilDay);
  const sunday = new Date(now.getTime() - daysFromSun * 24 * 60 * 60 * 1000);
  const weekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(sunday);
  const prevSunday = new Date(sunday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(prevSunday);

  const employees: any[] = await (db as any).employee.findMany({ where: { status: 'active' } });
  let created = 0, skipped = 0;
  const SALES_KEYWORDS = ['מלצר', 'ברמן', 'מארח', 'ראנר'];

  for (const emp of employees) {
    const role = String(emp.role || '');
    if (!SALES_KEYWORDS.some(k => role.includes(k))) continue;
    const existing = await (db as any).weeklyPersonalGoal.findFirst({
      where: { employee_id: emp.id, week_start_date: weekStart },
    });
    if (existing) { skipped++; continue; }
    // Count last week's events for this waiter
    const lastWeekStart = new Date(`${prevWeekStart}T00:00:00+03:00`);
    const thisWeekStart = new Date(`${weekStart}T00:00:00+03:00`);
    const prevCount = await (db as any).saleEvent.count({
      where: {
        waiter_id: emp.id,
        undone_at: null,
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    });
    const target = Math.max(5, Math.round(prevCount * 1.15));
    try {
      await (db as any).weeklyPersonalGoal.create({
        data: {
          employee_id: emp.id,
          employee_name: emp.full_name,
          week_start_date: weekStart,
          target,
          reward_coins: 200,
        },
      });
      created++;
    } catch (e: any) {
      console.warn('[weeklyPersonalGoals] create failed for', emp.id, e?.message);
    }
  }
  return { week_start: weekStart, created, skipped };
}

if (!(globalThis as any).__weeklyPersonalGoalTimer) {
  (globalThis as any).__weeklyPersonalGoalTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date());
        const day = parts.find(p => p.type === 'weekday')?.value;
        const hour = parts.find(p => p.type === 'hour')?.value;
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
        const lastRun = (globalThis as any).__weeklyPersonalGoalLastRun;
        if (day === 'Sun' && hour === '06' && lastRun !== dateStr) {
          (globalThis as any).__weeklyPersonalGoalLastRun = dateStr;
          const r = await runWeeklyPersonalGoals();
          console.log('[weeklyPersonalGoals]', JSON.stringify(r));
        }
      } catch (e: any) { console.warn('[weeklyPersonalGoals cron] failed:', e?.message); }
      (globalThis as any).__weeklyPersonalGoalTimer = setTimeout(loop, 30 * 60 * 1000);
    })();
  }, 3 * 60 * 1000);
}

// === Beecomm BeePort live data integration =================================
// BeePort (the cloud dashboard Beecomm provides) hits a single endpoint that
// returns the live X data, top dishes, predicted month/year, and per-waiter
// sales. We poll the same endpoint every 15 minutes from the server with the
// owner's Firebase UID — the only auth Beecomm uses is a `userid` header —
// and store a snapshot row. The frontend widget reads the latest snapshot.

const BEECOMM_BASE = 'https://beeport.bcmws.com';
// Tenant-isolation fix (2026-07-02): the previous hardcoded fallback UID
// was Alena's — any container without an explicit BEECOMM_UID env var
// pulled Alena's live POS data. That caused Miha's /BeecommLive to display
// Alena's sales. Now every container requires either:
//   (a) an explicit BEECOMM_UID env var (Alena sets this), OR
//   (b) a per-tenant BeecommConfig row with beecomm_uid.
// Without one, fetchBeecommPos returns null and no snapshot is written.
async function resolveBeecommUid(): Promise<string | null> {
  if (process.env.BEECOMM_UID) return process.env.BEECOMM_UID;
  try {
    const cfg: any = await (db as any).beecommConfig?.findFirst?.({});
    if (cfg && (cfg.beecomm_uid || cfg.uid)) return String(cfg.beecomm_uid || cfg.uid);
  } catch { /* table missing on this tenant — treat as no config */ }
  return null;
}

async function fetchBeecommPos(): Promise<{ pos: any | null; debug: any }> {
  const uid = await resolveBeecommUid();
  if (!uid) {
    return { pos: null, debug: { skipped: 'no BEECOMM_UID for this tenant' } };
  }
  const debug: any = { url: `${BEECOMM_BASE}/api/auth/${uid}` };
  try {
    const r = await fetch(debug.url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'userid': uid,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    debug.status = r.status;
    debug.contentType = r.headers.get('content-type');
    if (!r.ok) {
      const text = await r.text();
      debug.bodyPreview = text.slice(0, 300);
      console.warn('[beecomm] fetch failed', debug);
      return { pos: null, debug };
    }
    const json: any = await r.json();
    debug.success = json?.success;
    debug.message = json?.message;
    debug.hasData = !!json?.data;
    debug.hasUser = !!json?.data?.user;
    debug.groupCount = json?.data?.user?.groups?.length || 0;
    const pos = json?.data?.user?.groups?.[0]?.restaurants?.[0]?.poses?.[0];
    debug.foundPos = !!pos;
    debug.posName = pos?.name;
    return { pos: pos || null, debug };
  } catch (e: any) {
    debug.error = e?.message || String(e);
    console.warn('[beecomm] fetch error:', debug);
    return { pos: null, debug };
  }
}

export async function captureBeecommSnapshot() {
  const { pos, debug } = await fetchBeecommPos();
  if (!pos) {
    console.warn('[beecomm] captureBeecommSnapshot: no pos data', debug);
    return { ok: false, reason: 'no pos data', debug };
  }
  const x: any = pos.x || {};
  const lu = pos.lastUpdate || {};
  const predicted = pos.predicted || {};

  let snap: any;
  try {
    snap = await (db as any).beecommSnapshot.create({
    data: {
      pos_id: String(pos.posId || ''),
      pos_name: String(pos.name || ''),
      total_today: Number(x.total) || 0,
      total_tips: Number(x.totalTips) || 0,
      open_money: Number(pos.openMoney) || 0,
      predicted_month: Number(predicted.totalMonth) || 0,
      predicted_year: Number(predicted.totalYear) || 0,
      online_shifts: Array.isArray(pos.onlineShifts) ? pos.onlineShifts.length : (Number(pos.onlineShifts) || 0),
      active_today: Boolean(pos.activeToday),
      beecomm_last_update_x: lu.x ? BigInt(lu.x) : null,
      beecomm_last_update_z: lu.z ? BigInt(lu.z) : null,
      beecomm_last_update_dishes: lu.dishes ? BigInt(lu.dishes) : null,
      beecomm_last_update_shifts: lu.shifts ? BigInt(lu.shifts) : null,
      workers: x.workers || [],
      top_dishes: pos.topDishes || [],
      payments: x.payments || {},
      orders_by_hour: x.ordersByHours || {},
      stations: x.stations || [],
      dine_in: x.restaurantOrder || null,
      takeaway: x.takeawayOrder || null,
      delivery: x.deliveryOrder || null,
      harigot: x.harigot || null,
      z_numbers_open: x.zNumbers || [],
      raw: pos,
    },
  });
  } catch (e: any) {
    console.error('[beecomm] DB insert failed:', e?.message);
    return { ok: false, reason: 'db insert failed', error: e?.message, debug };
  }
  return { ok: true, snapshot_id: snap.id, total: Number(snap.total_today), workers: (x.workers || []).length };
}

registerFn('captureBeecommSnapshot', async ({ user }) => {
  if (!user) throw new Error('auth required');
  return captureBeecommSnapshot();
});

// Returns the last snapshot of each of the past N days (for the 7-day chart on
// the Beecomm Live page). Each entry is the latest snapshot captured between
// 18:00 and 23:59 IL of that day — the moment that best represents that
// day's full total before nightly close.
// Per-waiter / per-station / per-category aggregates over a date range — pulls
// the matching snapshot rows from BeecommSnapshot and aggregates locally so we
// don't hammer the Beecomm API. For each calendar day we use the MAX-total
// snapshot of that day (representing the day's full result before close).
registerFn('getBeecommRangeBreakdown', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const b = (body || {}) as any;
  const days = Math.min(180, Math.max(1, Number(b.days) || 7));
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(since);
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);

  // Pull from BOTH sources:
  // 1. BeecommHistoricalDay = backfilled closed days (most accurate)
  // 2. BeecommSnapshot = live capture of today + any day we don't have history for
  const [historicalRows, liveRows]: any[] = await Promise.all([
    (db as any).beecommHistoricalDay.findMany({
      where: { date: { gte: sinceStr, lte: todayStr } },
      orderBy: { date: 'asc' },
    }),
    (db as any).beecommSnapshot.findMany({
      where: { captured_at: { gte: since } },
      orderBy: { captured_at: 'asc' },
    }),
  ]);

  // Index historical by date so we can prefer it
  const histByDate = new Map<string, any>();
  for (const h of historicalRows) histByDate.set(h.date, h);

  // For each snapshot, fall back to it only if no historical exists for that day
  const byDay = new Map<string, any>();
  for (const date of histByDate.keys()) {
    const h = histByDate.get(date);
    byDay.set(date, {
      source: 'historical',
      total: Number(h.net_total) || 0,
      tips: Number(h.total_tips) || 0,
      diners: Number(h.diners) || 0,
      workers: h.workers || [],
      stations: h.stations || [],
      top_dishes: h.top_dishes || [],
      category_totals: h.category_totals || [],
    });
  }
  for (const s of liveRows) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(s.captured_at);
    if (byDay.has(d) && byDay.get(d).source === 'historical') continue;
    const cur = byDay.get(d);
    if (cur && Number(cur.total) >= Number(s.total_today)) continue;
    byDay.set(d, {
      source: 'snapshot',
      total: Number(s.total_today) || 0,
      tips: Number(s.total_tips) || 0,
      diners: 0,
      workers: s.workers || [],
      stations: s.stations || [],
      top_dishes: s.top_dishes || [],
      category_totals: [],
    });
  }

  // Aggregate
  const waiterTotals = new Map<string, { name: string; sum: number; tips: number; diners: number; days: number }>();
  const stationTotals = new Map<string, { name: string; sum: number; tips: number; days: number }>();
  const dishTotals = new Map<string, { name: string; categoryName: string; quantity: number; sum: number }>();
  const categoryTotals = new Map<string, { name: string; sum: number; quantity: number }>();
  let totalSum = 0, totalTips = 0, totalDiners = 0;

  for (const day of byDay.values()) {
    totalSum += day.total;
    totalTips += day.tips;
    totalDiners += day.diners;
    for (const w of (day.workers || [])) {
      const key = String(w.workerId || w.name || '?');
      const e = waiterTotals.get(key) || { name: w.name || key, sum: 0, tips: 0, diners: 0, days: 0 };
      e.sum += Number(w.sum) || 0;
      e.tips += Number(w.tips) || 0;
      e.diners += Number(w.diners) || 0;
      e.days += 1;
      waiterTotals.set(key, e);
    }
    for (const st of (day.stations || [])) {
      const key = String(st.stationName || '?');
      const e = stationTotals.get(key) || { name: key, sum: 0, tips: 0, days: 0 };
      e.sum += Number(st.sum) || 0;
      e.tips += Number(st.tips) || 0;
      e.days += 1;
      stationTotals.set(key, e);
    }
    for (const d of (day.top_dishes || [])) {
      const key = String(d.dishId || d.name || '?');
      const e = dishTotals.get(key) || { name: d.name || key, categoryName: d.categoryName || '', quantity: 0, sum: 0 };
      e.quantity += Number(d.quantity) || 0;
      e.sum += Number(d.sum) || 0;
      dishTotals.set(key, e);
    }
    for (const c of (day.category_totals || [])) {
      const key = String(c.name || '?');
      const e = categoryTotals.get(key) || { name: key, sum: 0, quantity: 0 };
      e.sum += Number(c.sum) || 0;
      e.quantity += Number(c.quantity) || 0;
      categoryTotals.set(key, e);
    }
  }

  return {
    days_covered: byDay.size,
    days_historical: historicalRows.length,
    days_live: byDay.size - historicalRows.length,
    range: { from: since.toISOString(), to: now.toISOString() },
    totals: { sum: totalSum, tips: totalTips, diners: totalDiners },
    waiters: [...waiterTotals.values()].sort((a, b) => b.sum - a.sum),
    stations: [...stationTotals.values()].sort((a, b) => b.sum - a.sum),
    dishes: [...dishTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 50),
    categories: [...categoryTotals.values()].sort((a, b) => b.sum - a.sum),
  };
});

registerFn('getBeecommDailyHistory', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const days = Math.min(30, Math.max(1, Number((body as any)?.days) || 7));
  const now = new Date();
  const dayStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const all: any[] = await (db as any).beecommSnapshot.findMany({
    where: { captured_at: { gte: dayStart } },
    orderBy: { captured_at: 'asc' },
  });
  // Group by IL calendar date, keep the max-total snapshot per day
  const byDay = new Map<string, any>();
  for (const s of all) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(s.captured_at);
    const prev = byDay.get(d);
    if (!prev || Number(s.total_today) >= Number(prev.total_today)) byDay.set(d, s);
  }
  const history = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, snap]) => ({
      date,
      total: Number(snap.total_today) || 0,
      tips: Number(snap.total_tips) || 0,
      open_money: Number(snap.open_money) || 0,
      workers: Array.isArray(snap.workers) ? snap.workers.length : 0,
    }));
  return { days, history };
});

// Returns the latest snapshot, plus today-over-yesterday delta for context.
registerFn('getLatestBeecommSnapshot', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const latest: any = await (db as any).beecommSnapshot.findFirst({
    orderBy: { captured_at: 'desc' },
  });
  if (!latest) return { snapshot: null };
  // Find the same-time snapshot from yesterday for comparison
  const yesterday = new Date(latest.captured_at.getTime() - 24 * 60 * 60 * 1000);
  const yWindow = new Date(yesterday.getTime() - 60 * 60 * 1000); // ±1h
  const yWindow2 = new Date(yesterday.getTime() + 60 * 60 * 1000);
  const ySnap: any = await (db as any).beecommSnapshot.findFirst({
    where: { captured_at: { gte: yWindow, lte: yWindow2 } },
    orderBy: { captured_at: 'desc' },
  });
  // If today has no sales yet (e.g. fresh Z opened, restaurant just opened),
  // also return the most recent snapshot that had real data so the widget can
  // still show waiters/dishes/payments breakdown instead of empty zeroes.
  let lastWithData: any = null;
  if ((Number(latest.total_today) || 0) === 0) {
    lastWithData = await (db as any).beecommSnapshot.findFirst({
      where: { total_today: { gt: 0 } },
      orderBy: { captured_at: 'desc' },
    });
  }
  return {
    snapshot: serializeBigInts(latest),
    yesterday: ySnap ? serializeBigInts(ySnap) : null,
    last_with_data: lastWithData ? serializeBigInts(lastWithData) : null,
  };
});

// Workaround: Prisma BigInt is not JSON.stringify-able; convert before sending.
function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object') {
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = serializeBigInts(obj[k]);
    return out;
  }
  return obj;
}

// === Historical backfill ===================================================
// pos.z is a map of every closed Z report (zNumber → { startTS, endTS }) back
// to ~Sept 2023. We group by IL calendar date based on endTS, then for each
// requested day call /api/z/summary and /api/dishes with that day's zNums and
// persist a BeecommHistoricalDay row.

function beecommHeaders(uid: string) {
  return {
    'Accept': 'application/json',
    'userid': uid,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  };
}

function ilDateFromMs(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));
}

async function fetchBeecommZMap(): Promise<{ posId: string; zByDate: Map<string, number[]> } | null> {
  const uid = await resolveBeecommUid();
  if (!uid) return null;
  try {
    const r = await fetch(`${BEECOMM_BASE}/api/auth/${uid}`, { headers: beecommHeaders(uid) });
    if (!r.ok) return null;
    const json: any = await r.json();
    const pos = json?.data?.user?.groups?.[0]?.restaurants?.[0]?.poses?.[0];
    if (!pos?.posId || !pos.z) return null;
    const zByDate = new Map<string, number[]>();
    for (const k of Object.keys(pos.z)) {
      const z = pos.z[k];
      if (!z?.zNumber || !z?.endTS) continue;
      const d = ilDateFromMs(Number(z.endTS));
      if (!zByDate.has(d)) zByDate.set(d, []);
      zByDate.get(d)!.push(Number(z.zNumber));
    }
    return { posId: String(pos.posId), zByDate };
  } catch (e: any) {
    console.warn('[beecomm] fetchZMap failed:', e?.message);
    return null;
  }
}

async function fetchBeecommZSummary(posId: string, zNums: number[], fromTS: string, toTS: string): Promise<any | null> {
  const uid = await resolveBeecommUid();
  if (!uid) return null;
  try {
    const r = await fetch(`${BEECOMM_BASE}/api/z/summary`, {
      method: 'POST',
      headers: beecommHeaders(uid),
      body: JSON.stringify({ poses: [{ posId, zNums }], fromTS, toTS }),
    });
    if (!r.ok) {
      console.warn('[beecomm] z/summary failed', r.status, await r.text().then(t => t.slice(0, 200)));
      return null;
    }
    return await r.json();
  } catch (e: any) {
    console.warn('[beecomm] z/summary error:', e?.message);
    return null;
  }
}

async function fetchBeecommDishes(posId: string, zNums: number[], fromTS: string, toTS: string): Promise<any | null> {
  const uid = await resolveBeecommUid();
  if (!uid) return null;
  try {
    const r = await fetch(`${BEECOMM_BASE}/api/dishes`, {
      method: 'POST',
      headers: beecommHeaders(uid),
      body: JSON.stringify({
        poses: [posId],
        posesZNums: [{ posId, zNums }],
        fromTS,
        toTS,
      }),
    });
    if (!r.ok) {
      console.warn('[beecomm] dishes failed', r.status);
      return null;
    }
    return await r.json();
  } catch (e: any) {
    console.warn('[beecomm] dishes error:', e?.message);
    return null;
  }
}

export async function backfillBeecommHistory(opts: { days?: number; forceRefresh?: boolean } = {}) {
  const days = Math.min(180, Math.max(1, Number(opts.days) || 30));
  const map = await fetchBeecommZMap();
  if (!map) return { ok: false, reason: 'no z map' };
  const today = ilDateFromMs(Date.now());
  // sort dates descending so newest is first; take up to `days` dates
  const sorted = [...map.zByDate.entries()].sort(([a], [b]) => b.localeCompare(a));
  const targets = sorted.filter(([d]) => d < today).slice(0, days);

  let fetched = 0, skipped = 0, failed = 0;
  for (const [date, zNums] of targets) {
    // Skip if we already have this day (unless forceRefresh)
    const existing: any = await (db as any).beecommHistoricalDay.findFirst({
      where: { pos_id: map.posId, date },
    });
    if (existing && !opts.forceRefresh) { skipped++; continue; }

    // IL day window: 06:00 → next-day 06:00 (Beecomm's shift boundary)
    const fromTS = `${date}T06:00:00+03:00`;
    const [yy, mm, dd] = date.split('-').map(Number);
    const next = new Date(Date.UTC(yy, mm - 1, dd + 1));
    const nextStr = next.toISOString().slice(0, 10);
    const toTS = `${nextStr}T06:00:00+03:00`;

    const [zSummary, dishes] = await Promise.all([
      fetchBeecommZSummary(map.posId, zNums, fromTS, toTS),
      fetchBeecommDishes(map.posId, zNums, fromTS, toTS),
    ]);

    if (!zSummary?.success && !dishes?.success) { failed++; continue; }

    // Parse z summary — structure: data.poses (one entry) with aggregated fields
    const zData = zSummary?.data?.poses?.[0] || zSummary?.data?.[0] || zSummary?.data || {};
    const dishesData = dishes?.data?.[map.posId] || [];

    // Aggregate category totals + flatten top dishes
    const categoryTotals: any[] = [];
    const allDishes: any[] = [];
    for (const cat of (Array.isArray(dishesData) ? dishesData : [])) {
      categoryTotals.push({
        name: cat.name,
        sum: Number(cat.sum) || 0,
        quantity: Number(cat.quantity) || 0,
      });
      for (const d of (cat.dishes || [])) {
        allDishes.push({
          dishId: d.dishId,
          name: d.name,
          categoryName: d.categoryName || cat.name,
          quantity: Number(d.quantity) || 0,
          sum: Number(d.sum) || 0,
        });
      }
    }
    allDishes.sort((a, b) => b.quantity - a.quantity);

    const data = {
      pos_id: map.posId,
      date,
      z_numbers: zNums,
      net_total: Number(zData.netTotal ?? zData.total ?? 0),
      gross_total: Number(zData.grossTotal ?? zData.total ?? 0),
      total_tips: Number(zData.totalTips ?? 0),
      diners: Number(zData.totalDiners ?? zData.diners ?? 0) || null,
      orders_count: Number(zData.totalOrders ?? zData.orders ?? 0) || null,
      workers: zData.workers ?? null,
      payments: zData.payments ?? null,
      top_dishes: allDishes.slice(0, 20),
      category_totals: categoryTotals,
      stations: zData.stations ?? null,
      dine_in: zData.restaurantOrder ?? null,
      takeaway: zData.takeawayOrder ?? null,
      delivery: zData.deliveryOrder ?? null,
      harigot: zData.harigot ?? null,
      raw_z_summary: zSummary?.data ?? null,
      raw_dishes: dishes?.data ?? null,
      fetched_at: new Date(),
    };

    try {
      if (existing) {
        await (db as any).beecommHistoricalDay.update({ where: { id: existing.id }, data });
      } else {
        await (db as any).beecommHistoricalDay.create({ data });
      }
      fetched++;
    } catch (e: any) {
      console.warn('[beecomm backfill] insert failed for', date, e?.message);
      failed++;
    }

    // Throttle so Beecomm doesn't rate-limit us
    await new Promise(r => setTimeout(r, 300));
  }
  return { ok: true, requested_days: days, fetched, skipped, failed, latest: targets[0]?.[0], oldest: targets[targets.length - 1]?.[0] };
}

registerFn('backfillBeecommHistory', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const days = Number((body as any)?.days) || 30;
  const forceRefresh = Boolean((body as any)?.forceRefresh);
  return backfillBeecommHistory({ days, forceRefresh });
});

// Returns historical days for a given range (reads from BeecommHistoricalDay)
registerFn('getBeecommHistoricalDays', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const days = Math.min(180, Math.max(1, Number((body as any)?.days) || 30));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(since);
  const rows: any[] = await (db as any).beecommHistoricalDay.findMany({
    where: { date: { gte: sinceStr, lte: today } },
    orderBy: { date: 'desc' },
  });
  return { days: rows.length, rows };
});

// 3-min cron — idempotent guard, first fire 60s after boot. Beecomm's own
// lastUpdate.x stamps under a minute, so 3 min strikes a balance between
// "feels live" and "not hammering Beecomm".
if (!(globalThis as any).__beecommSnapshotTimer) {
  (globalThis as any).__beecommSnapshotTimer = setTimeout(function loop() {
    captureBeecommSnapshot()
      .then(r => { if (r.ok) console.log('[beecomm] snapshot captured', r.snapshot_id); })
      .catch(e => console.warn('[beecomm] capture failed:', e?.message))
      .finally(() => {
        (globalThis as any).__beecommSnapshotTimer = setTimeout(loop, 3 * 60 * 1000);
      });
  }, 60 * 1000);
}

// === Gomiley delivery aggregator integration ================================
// Polls /system/pages/orders/ajax.php every 5 min and parses the DataTables
// response — for each order row we extract id, guid, customer, source,
// amount, timestamps from the HTML cells. Cash detection: by default any
// order whose source is NOT a card-based platform (Wolt/Bolt/10bis/Mishloha/
// PayBox/Cibus) is counted as cash. Owner says receipt actually carries the
// 'מזומן' label — best detected per-order from the preview endpoint, which
// we'll add in a follow-up pass.
const GOMILEY_BASE = 'https://app.gomiley.com';
const GOMILEY_RESTAURANT_ID = process.env.GOMILEY_RESTAURANT_ID || '1968';

// In-memory cache of cookies read from IntegrationSecret. Refreshed lazily
// every 60s so a save through the admin page takes effect immediately for
// the next cron tick without restarting the API.
let __gomileyCookieCache: { value: { phpSessId: string; arena: string; deviceToken: string; restaurantId: string }; expiresAt: number } | null = null;

async function readGomileyCookieRow(key: string): Promise<string> {
  try {
    const row: any = await (db as any).integrationSecret.findFirst({ where: { key } });
    return row?.value || '';
  } catch { return ''; }
}

async function loadGomileyCookies() {
  if (__gomileyCookieCache && __gomileyCookieCache.expiresAt > Date.now()) {
    return __gomileyCookieCache.value;
  }
  const [phpSessId, arena, deviceToken, restaurantId] = await Promise.all([
    readGomileyCookieRow('gomiley_phpsessid'),
    readGomileyCookieRow('gomiley_arena'),
    readGomileyCookieRow('gomiley_device_token'),
    readGomileyCookieRow('gomiley_restaurant_id'),
  ]);
  const value = {
    phpSessId: phpSessId || process.env.GOMILEY_PHPSESSID || '',
    arena: arena || process.env.GOMILEY_ARENA || '',
    deviceToken: deviceToken || process.env.GOMILEY_DEVICE_TOKEN || '',
    restaurantId: restaurantId || process.env.GOMILEY_RESTAURANT_ID || '1968',
  };
  __gomileyCookieCache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

async function gomileyCookieHeader(): Promise<string> {
  const c = await loadGomileyCookies();
  const parts: string[] = ['user_language=he'];
  if (c.phpSessId) parts.push(`PHPSESSID=${c.phpSessId}`);
  if (c.arena) parts.push(`arena=${c.arena}`);
  if (c.deviceToken) parts.push(`device_token=${c.deviceToken}`);
  return parts.join('; ');
}

// Build the standard DataTables.net payload that Gomiley's ajax.php expects.
// 15 columns, server-side processing, default sort by col 0 DESC, 30 rows.
function gomileyDataTablesPayload(length = 30, start = 0): URLSearchParams {
  const p = new URLSearchParams();
  p.append('move', '');
  p.append('moveorderid', '');
  p.append('draw', '1');
  for (let i = 0; i < 15; i++) {
    p.append(`columns[${i}][data]`, String(i));
    p.append(`columns[${i}][name]`, '');
    p.append(`columns[${i}][searchable]`, 'true');
    p.append(`columns[${i}][orderable]`, 'true');
    p.append(`columns[${i}][search][value]`, '');
    p.append(`columns[${i}][search][regex]`, 'false');
  }
  p.append('order[0][column]', '0');
  p.append('order[0][dir]', 'DESC');
  p.append('start', String(start));
  p.append('length', String(length));
  p.append('search[value]', '');
  p.append('search[regex]', 'false');
  return p;
}

// Strip HTML tags and decode common entities from a Gomiley cell.
function stripHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract a `data-X="value"` attribute from a raw HTML string.
function extractDataAttr(html: string, attr: string): string | null {
  const m = String(html || '').match(new RegExp(`data-${attr}=['"]([^'"]+)['"]`));
  return m ? m[1] : null;
}

// Sources that are typically credit-based (paid via app). Anything else gets
// flagged as potential cash. The owner confirms cash is printed on the receipt
// — we'll override per-order from preview in a follow-up if needed.
const GOMILEY_CARD_SOURCES = new Set([
  'wolt', 'bolt', '10bis', 'mishloha', 'paybox', 'cibus', 'tenbis', 'gett',
  'goodi', 'goodybag', 'מתאבון',  // ironic but it's listed
]);

function isCardSource(source: string): boolean {
  const s = (source || '').toLowerCase().trim();
  for (const card of GOMILEY_CARD_SOURCES) {
    if (s.includes(card.toLowerCase())) return true;
  }
  return false;
}

type GomileyOrder = {
  id: string;
  guid: string;
  display_id: string;
  package_no: string;
  restaurant: string;
  customer: string;
  delivery_at: string;
  source: string;
  amount: number;
  created_at: string;
  status: string;
  is_cash_guess: boolean;
};

function parseGomileyRow(row: string[]): GomileyOrder | null {
  if (!Array.isArray(row) || row.length < 12) return null;
  // Column layout from Gomiley's DataTables payload:
  //   0  checkbox (value=order_id)
  //   1  display_id (e.g. 25)
  //   2  package_no (e.g. 628)
  //   3  restaurant name
  //   4  customer name (anchor with data-guid)
  //   5  empty
  //   6  delivery_address (anchor with data-lat/lng)
  //   7  empty
  //   8  delivery_at (e.g. 08/06 00:19)
  //   9  source (e.g. Wolt)
  //   10 amount (e.g. 61.00₪)
  //   11 created_at (e.g. 07/06/26 23:58)
  //   12 status button (e.g. הודפסה)
  //   13 courier select
  //   14 actions menu
  const checkbox = row[0] || '';
  const idMatch = checkbox.match(/value=['"](\d+)['"]/);
  const id = idMatch ? idMatch[1] : '';
  const guid = extractDataAttr(row.join(' '), 'guid') || '';
  const display_id = stripHtml(row[1] || '');
  const package_no = stripHtml(row[2] || '');
  const restaurant = stripHtml(row[3] || '');
  const customer = stripHtml(row[4] || '');
  const delivery_at = stripHtml(row[8] || '');
  const source = stripHtml(row[9] || '');
  const amountStr = stripHtml(row[10] || '').replace(/[^\d.]/g, '');
  const amount = Number(amountStr) || 0;
  const created_at = stripHtml(row[11] || '');
  const status = stripHtml(row[12] || '').slice(0, 40);
  return {
    id,
    guid,
    display_id,
    package_no,
    restaurant,
    customer,
    delivery_at,
    source,
    amount,
    created_at,
    status,
    is_cash_guess: !isCardSource(source),
  };
}

export async function captureGomileySnapshot() {
  const cookieHeader = await gomileyCookieHeader();
  if (!cookieHeader.includes('PHPSESSID')) {
    return { ok: false, reason: 'no cookies — set them at /AdminGomileyCookies' };
  }
  const cookies = await loadGomileyCookies();
  const restaurantId = cookies.restaurantId || GOMILEY_RESTAURANT_ID;
  const url = `${GOMILEY_BASE}/system/pages/orders/ajax.php?move=&moveorderid=`;
  const payload = gomileyDataTablesPayload(100, 0);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieHeader,
        'Referer': `${GOMILEY_BASE}/system/pages/orders/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      },
      body: payload.toString(),
    });
    if (!r.ok) {
      const text = await r.text();
      console.warn('[gomiley] fetch failed', r.status, text.slice(0, 200));
      return { ok: false, reason: `http ${r.status}`, preview: text.slice(0, 200) };
    }
    // Gomiley returns the DataTables JSON with Content-Type: text/html (not
    // application/json), so we always read as text and try to parse. Only if
    // JSON.parse fails AND the response looks like a login page do we treat
    // it as session-expired.
    const text = await r.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      const lowered = text.toLowerCase();
      const looksLikeLogin =
        lowered.includes('<form') ||
        lowered.includes('login') ||
        lowered.includes('signin') ||
        lowered.includes('<!doctype');
      if (looksLikeLogin) {
        return { ok: false, reason: 'session expired', preview: text.slice(0, 200) };
      }
      return { ok: false, reason: 'unparseable response', preview: text.slice(0, 200) };
    }
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    const orders = rows.map(parseGomileyRow).filter((o): o is GomileyOrder => !!o);
    const cashOrders = orders.filter(o => o.is_cash_guess);

    // Parse '61.00₪' to number
    const parseAmt = (s: string) => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;

    const snap = await (db as any).gomileySnapshot.create({
      data: {
        restaurant_id: restaurantId,
        total_income: parseAmt(json?.total_income),
        total_orders: Number(json?.total_orders) || 0,
        new_orders: Number(json?.new_orders) || 0,
        cancelled_orders: Number(json?.canceld_orders ?? json?.cancelled_orders) || 0,
        split_orders: Number(json?.split_orders_amount) || 0,
        cross_min_orders: Number(json?.cross_min_orders) || 0,
        cash_orders_count: cashOrders.length,
        cash_orders_amount: cashOrders.reduce((s, o) => s + o.amount, 0),
        orders,
        raw: json,
      },
    });
    return {
      ok: true,
      snapshot_id: snap.id,
      total_orders: snap.total_orders,
      total_income: snap.total_income,
      cash_orders_count: snap.cash_orders_count,
      cash_orders_amount: snap.cash_orders_amount,
    };
  } catch (e: any) {
    console.warn('[gomiley] capture failed:', e?.message);
    return { ok: false, reason: e?.message };
  }
}

registerFn('captureGomileySnapshot', async ({ user }) => {
  if (!user) throw new Error('auth required');
  return captureGomileySnapshot();
});

registerFn('getLatestGomileySnapshot', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const latest: any = await (db as any).gomileySnapshot.findFirst({
    orderBy: { captured_at: 'desc' },
  });
  if (!latest) return { snapshot: null };
  return { snapshot: latest };
});

// Combined Beecomm + Gomiley summary for the dashboard's top-line tile.
registerFn('getCombinedRevenueToday', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const [bc, gm]: any[] = await Promise.all([
    (db as any).beecommSnapshot.findFirst({ orderBy: { captured_at: 'desc' } }),
    (db as any).gomileySnapshot.findFirst({ orderBy: { captured_at: 'desc' } }),
  ]);
  const beecomm_total = Number(bc?.total_today) || 0;
  const beecomm_open_money = Number(bc?.open_money) || 0;
  const gomiley_total = Number(gm?.total_income) || 0;
  const gomiley_cash = Number(gm?.cash_orders_amount) || 0;
  const gomiley_cash_count = Number(gm?.cash_orders_count) || 0;
  const gomiley_orders = Number(gm?.total_orders) || 0;
  return {
    combined_total: beecomm_total + gomiley_total,
    beecomm: { total: beecomm_total, open_money: beecomm_open_money },
    gomiley: {
      total: gomiley_total,
      orders: gomiley_orders,
      cash_count: gomiley_cash_count,
      cash_amount: gomiley_cash,
    },
    // Approximate today's cash = Beecomm open money (cash in drawer) + Gomiley cash
    cash_today_approx: beecomm_open_money + gomiley_cash,
    last_beecomm_update: bc?.captured_at || null,
    last_gomiley_update: gm?.captured_at || null,
  };
});

// ============================================================================
// Gomiley customers sync — pulls /system/pages/customers/ajax.php with the
// same DataTables payload pattern as orders. For each row we extract name,
// phone, address (column indices guessed from the customers table — verified
// after first run). Upserts into DeliveryCustomer by normalized phone, tags
// new ones with note 'נכנס מ-Gomiley'.
// ============================================================================

function normPhone(s: string): string {
  return String(s || '').replace(/\D/g, '').replace(/^972/, '0');
}

type GomileyCustomerRow = {
  name: string;
  phone: string;
  email: string;
  address: string;
  total_orders: number;
  total_spent: number;
};

function parseGomileyCustomerRow(row: string[]): GomileyCustomerRow | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  // Phone: Gomiley renders as "052-619-6523" — dashes break a digit regex.
  // Strip non-digits per cell and check for 9-10 digit Israeli pattern.
  let phone = '';
  for (const cell of row) {
    const digitsOnly = String(stripHtml(cell)).replace(/\D/g, '');
    if (!digitsOnly) continue;
    const normalized = digitsOnly.replace(/^972/, '0');
    if (/^0[2-9]\d{7,8}$/.test(normalized)) {
      phone = normalized;
      break;
    }
  }
  // Email: standard regex across the joined row
  const joined = row.join(' ');
  const emailMatch = joined.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const email = emailMatch ? emailMatch[0] : '';
  // Name: clean each cell — strip phones, IDs, dates, times that leak from
  // sibling badges in the same HTML cell. Then pick first cell with letters.
  let name = '';
  for (const cell of row) {
    let clean = stripHtml(cell);
    if (!clean) continue;
    clean = clean
      .replace(/0\d[-\s]?\d{3}[-\s]?\d{4}/g, '')          // 052-619-6523 / 0526196523
      .replace(/\+?972[-\s]?\d[-\s]?\d{3}[-\s]?\d{4}/g, '') // +972-...
      .replace(/\b\d{9,}\b/g, '')                          // long IDs / timestamps
      .replace(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g, '') // dates
      .replace(/\d{1,2}:\d{2}/g, '')                       // times
      .replace(/ת\.?ז\.?\s*\d*/g, '')                      // israeli ID label
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) continue;
    if (/^[\d\s.,/-]+$/.test(clean)) continue;
    if (clean === phone || clean === email) continue;
    if (clean.length > 1 && clean.length < 60 && /[א-תA-Za-z]/.test(clean)) {
      name = clean;
      break;
    }
  }
  // Address: look for a cell that contains street keywords
  let address = '';
  for (const cell of row) {
    const clean = stripHtml(cell);
    if (!clean) continue;
    if (/רחוב|דרך|שכונה|רח'|פינת|מספר|שדרות/.test(clean)) {
      address = clean;
      break;
    }
  }
  // total_orders / total_spent from Gomiley's customers table is unreliable —
  // the layout puts customer IDs and phones in numeric cells that look like
  // orders/spent. We deliberately keep these at 0 and only trust name/phone/
  // address from Gomiley.
  if (!phone && !name) return null;
  return { name, phone, email, address, total_orders: 0, total_spent: 0 };
}

export async function captureGomileyCustomers() {
  const cookieHeader = await gomileyCookieHeader();
  if (!cookieHeader.includes('PHPSESSID')) {
    return { ok: false, reason: 'no cookies — set them at /AdminGomileyCookies' };
  }
  const url = `${GOMILEY_BASE}/system/pages/customers/ajax.php?move=&moveorderid=`;
  const payload = gomileyDataTablesPayload(500, 0);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieHeader,
        'Referer': `${GOMILEY_BASE}/system/pages/customers/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      },
      body: payload.toString(),
    });
    if (!r.ok) return { ok: false, reason: `http ${r.status}` };
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); }
    catch { return { ok: false, reason: 'session expired or unparseable', preview: text.slice(0, 200) }; }
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    const customers = rows.map(parseGomileyCustomerRow).filter((c): c is GomileyCustomerRow => !!c);

    let upserted = 0, skipped = 0, created = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const c of customers) {
      const phone = c.phone;
      if (!phone || phone.length < 9) { skipped++; continue; }
      const existing: any = await (db as any).deliveryCustomer.findFirst({
        where: { customer_phone: phone },
      });
      if (existing) {
        // Update only if Gomiley has more orders / newer data
        const noteHasGomiley = (existing.notes || '').includes('Gomiley');
        await (db as any).deliveryCustomer.update({
          where: { id: existing.id },
          data: {
            customer_name: existing.customer_name || c.name,
            address: existing.address || c.address,
            notes: noteHasGomiley
              ? existing.notes
              : `${existing.notes || ''}\nסונכרן מ-Gomiley (בתאבון) ב-${today}`.trim(),
            total_orders: Math.max(Number(existing.total_orders) || 0, c.total_orders),
            total_spent: Math.max(Number(existing.total_spent) || 0, c.total_spent),
          },
        });
        upserted++;
      } else {
        await (db as any).deliveryCustomer.create({
          data: {
            customer_name: c.name || 'לקוח Gomiley',
            customer_phone: phone,
            email: c.email || null,
            address: c.address || null,
            notes: `נכנס מ-Gomiley (בתאבון) ב-${today}`,
            total_orders: c.total_orders,
            total_spent: c.total_spent,
          },
        });
        created++;
      }
    }
    return {
      ok: true,
      scanned: customers.length,
      created,
      updated: upserted,
      skipped_no_phone: skipped,
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

registerFn('captureGomileyCustomers', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  return captureGomileyCustomers();
});

// ============================================================================
// Full backfill — paginates through ALL Gomiley customers (17K+ rows).
// Runs in the background, status is exposed via getGomileyBackfillStatus.
// Skips rows without a phone (Wolt orders, anonymous walk-ins).
// ============================================================================
async function fetchGomileyCustomersPage(start: number, length: number, cookieHeader: string): Promise<{ rows: any[]; recordsTotal: number } | { error: string }> {
  const url = `${GOMILEY_BASE}/system/pages/customers/ajax.php?move=&moveorderid=`;
  const payload = gomileyDataTablesPayload(length, start);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookieHeader,
      'Referer': `${GOMILEY_BASE}/system/pages/customers/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    body: payload.toString(),
  });
  if (!r.ok) return { error: `http ${r.status}` };
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    return { rows: Array.isArray(json?.data) ? json.data : [], recordsTotal: Number(json?.recordsTotal) || 0 };
  } catch { return { error: 'session expired or unparseable' }; }
}

export async function runGomileyCustomersBackfill() {
  const g: any = globalThis as any;
  if (g.__gomileyBackfillRunning) {
    return { ok: false, reason: 'כבר רץ backfill — בדוק סטטוס', status: g.__gomileyBackfillStatus };
  }
  const cookieHeader = await gomileyCookieHeader();
  if (!cookieHeader.includes('PHPSESSID')) {
    return { ok: false, reason: 'אין cookies — תגדיר ב-/AdminGomileyCookies' };
  }
  g.__gomileyBackfillRunning = true;
  g.__gomileyBackfillStatus = {
    running: true,
    started_at: new Date().toISOString(),
    page: 0,
    scanned: 0,
    created: 0,
    updated: 0,
    skipped_no_phone: 0,
    total_expected: 0,
    finished_at: null,
    error: null,
  };
  const status = g.__gomileyBackfillStatus;

  void (async () => {
    try {
      const PAGE_SIZE = 500;
      let start = 0;
      const today = new Date().toISOString().slice(0, 10);
      while (true) {
        status.page += 1;
        const pageResult = await fetchGomileyCustomersPage(start, PAGE_SIZE, cookieHeader);
        if ('error' in pageResult) {
          status.error = pageResult.error;
          break;
        }
        if (status.total_expected === 0 && pageResult.recordsTotal) {
          status.total_expected = pageResult.recordsTotal;
        }
        if (pageResult.rows.length === 0) break;

        const customers = pageResult.rows.map(parseGomileyCustomerRow).filter((c): c is GomileyCustomerRow => !!c);
        for (const c of customers) {
          const phone = c.phone;
          if (!phone || phone.length < 9) { status.skipped_no_phone += 1; continue; }
          const existing: any = await (db as any).deliveryCustomer.findFirst({
            where: { customer_phone: phone },
          });
          if (existing) {
            const noteHasGomiley = (existing.notes || '').includes('Gomiley');
            // Overwrite dirty names that contain embedded phones/IDs
            const existingNameDirty = /\d{7,}/.test(existing.customer_name || '');
            const newNameClean = c.name && !/\d{7,}/.test(c.name);
            const finalName = (existingNameDirty && newNameClean)
              ? c.name
              : (existing.customer_name || c.name);
            // Reset corrupted totals from old parser. We don't trust any
            // Gomiley-sourced numeric data — only name/phone/address.
            const existingOrdersBad = Number(existing.total_orders) > 1_000;
            const existingSpentBad = Number(existing.total_spent) > 100_000;
            await (db as any).deliveryCustomer.update({
              where: { id: existing.id },
              data: {
                customer_name: finalName,
                address: existing.address || c.address,
                notes: noteHasGomiley
                  ? existing.notes
                  : `${existing.notes || ''}\nסונכרן מ-Gomiley (backfill) ב-${today}`.trim(),
                ...(existingOrdersBad ? { total_orders: 0 } : {}),
                ...(existingSpentBad ? { total_spent: 0 } : {}),
              },
            });
            status.updated += 1;
          } else {
            await (db as any).deliveryCustomer.create({
              data: {
                customer_name: c.name || 'לקוח Gomiley',
                customer_phone: phone,
                email: c.email || null,
                address: c.address || null,
                notes: `נכנס מ-Gomiley (backfill) ב-${today}`,
                total_orders: c.total_orders,
                total_spent: c.total_spent,
              },
            });
            status.created += 1;
          }
        }
        status.scanned += pageResult.rows.length;
        if (pageResult.rows.length < PAGE_SIZE) break;
        start += PAGE_SIZE;
        // Small delay so we don't hammer Gomiley and trip rate limits
        await new Promise(r => setTimeout(r, 800));
      }
      status.running = false;
      status.finished_at = new Date().toISOString();
    } catch (e: any) {
      status.error = e?.message || String(e);
      status.running = false;
      status.finished_at = new Date().toISOString();
    } finally {
      g.__gomileyBackfillRunning = false;
    }
  })();

  return { ok: true, started: true, status };
}

registerFn('backfillGomileyCustomers', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  return runGomileyCustomersBackfill();
});

registerFn('getGomileyBackfillStatus', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const g: any = globalThis as any;
  return g.__gomileyBackfillStatus || { running: false, scanned: 0, message: 'לא הופעל עדיין' };
});

// One-shot SQL: reset total_orders and total_spent to 0 for every customer
// that has 'Gomiley' in their notes. The old parser stored corrupted values
// (customer IDs / phone digits) in these fields; the new code keeps them at 0.
registerFn('resetGomileyCustomerTotals', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const r: any = await (db as any).$executeRawUnsafe(`
    UPDATE "DeliveryCustomer"
    SET total_orders = 0, total_spent = 0
    WHERE notes ILIKE '%Gomiley%'
      AND (total_orders > 1000 OR total_spent > 100000)
  `);
  return { ok: true, rows_updated: Number(r) || 0 };
});

// One-shot SQL: normalize Israeli phone numbers stored in international form
// (e.g. 972523409696) to local form (0523409696). Skips numbers that would
// collide with an existing local-format row (rare; logged as skipped).
registerFn('normalizeIsraeliPhones', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  // Only update rows where converting 972XXX → 0XXX won't conflict with an
  // existing row. Conflicting rows are left alone — owner can merge manually.
  const r: any = await (db as any).$executeRawUnsafe(`
    UPDATE "DeliveryCustomer" d
    SET customer_phone = '0' || substring(d.customer_phone from 4)
    WHERE d.customer_phone ~ '^972[0-9]{8,9}$'
      AND NOT EXISTS (
        SELECT 1 FROM "DeliveryCustomer" d2
        WHERE d2.customer_phone = '0' || substring(d.customer_phone from 4)
      )
  `);
  const conflicts: any = await (db as any).$queryRawUnsafe(`
    SELECT COUNT(*)::int AS c FROM "DeliveryCustomer"
    WHERE customer_phone ~ '^972[0-9]{8,9}$'
  `);
  return {
    ok: true,
    rows_normalized: Number(r) || 0,
    rows_left_with_conflicts: Number((conflicts?.[0]?.c) || 0),
  };
});

// ============================================================================
// Gomiley dashboard scrape — /system/pages/index/ is server-rendered HTML.
// We fetch it with the existing session cookies, convert to text (preserving
// table row+col structure), then regex-parse the four KPI tiles, platforms
// table, top dishes/customers/companies, and returning-vs-onetime ratio.
// ============================================================================
function htmlToStructuredText(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<\/(tr|p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseIls(s: string): number {
  if (!s) return 0;
  return Number(String(s).replace(/[₪,\s]/g, '')) || 0;
}

function parseGomileyDashboard(html: string) {
  const text = htmlToStructuredText(html);
  const lines = text.split('\n').map((l: any) => l.trim()).filter(Boolean);

  const result: any = {
    total_income: null,
    total_orders: null,
    new_customers: null,
    new_companies: null,
    onetime_percent: null,
    returning_count: null,
    onetime_count: null,
    platforms: [],
    top_dishes: [],
    top_customers: [],
    top_companies: [],
  };

  // 4 KPI tiles: a value line followed by a label line. Order in the Gomiley
  // page is: הכנסות / הזמנות / לקוחות חדשים / חברות חדשות.
  for (let i = 0; i < lines.length - 1; i++) {
    const value = lines[i];
    const label = lines[i + 1];
    if (label === 'הכנסות' && /₪/.test(value)) result.total_income = parseIls(value);
    else if (label === 'הזמנות' && /^\d/.test(value) && result.total_orders === null) result.total_orders = Number(value.replace(/[,\s]/g, '')) || 0;
    else if (label === 'לקוחות חדשים' && /^\d/.test(value)) result.new_customers = Number(value.replace(/[,\s]/g, '')) || 0;
    else if (label === 'חברות חדשות' && /^\d/.test(value)) result.new_companies = Number(value.replace(/[,\s]/g, '')) || 0;
  }

  // Returning vs one-time customers — line "לקוחות חד-פעמיים" followed by a %,
  // then a "כמות חזרות / אחוז / כמות" header row, then "9 / 181" style row.
  for (let i = 0; i < lines.length; i++) {
    if (/לקוחות חד-?פעמיים/.test(lines[i])) {
      const pctLine = lines.slice(i, i + 6).find(l => /\d+(\.\d+)?%/.test(l));
      if (pctLine) {
        const m = pctLine.match(/(\d+(?:\.\d+)?)%/);
        if (m) result.onetime_percent = Number(m[1]);
      }
      // Find the data row — two integers separated by whitespace/tab
      const dataLine = lines.slice(i, i + 10).find((l: any) => /^\d+\s+\d+$/.test(l) || /^\d+\t\d+$/.test(l));
      if (dataLine) {
        const nums = dataLine.split(/\s+/).map(Number).filter((n: any) => !Number.isNaN(n));
        if (nums.length >= 2) {
          result.returning_count = nums[0];
          result.onetime_count = nums[1];
        }
      }
      break;
    }
  }

  // Platforms table — rows look like:
  //   Wolt\t170\t₪0.00\t₪0.00\t₪0.00\t₪19,014.00\t₪111.85
  // Each row has exactly 7 tab-separated cells (name + 6 numbers).
  for (const raw of text.split('\n')) {
    const cells = raw.split('\t').map(c => c.trim()).filter(Boolean);
    if (cells.length === 7
        && /^[A-Za-zא-ת]/.test(cells[0])
        && /^\d/.test(cells[1])
        && cells.slice(2).every(c => /₪/.test(c) || /^\d/.test(c))) {
      result.platforms.push({
        name: cells[0],
        orders: Number(cells[1]) || 0,
        delivery: parseIls(cells[2]),
        tip: parseIls(cells[3]),
        discount: parseIls(cells[4]),
        total: parseIls(cells[5]),
        avg: parseIls(cells[6]),
      });
    }
  }
  // Drop the totals row (name is empty / numeric only) — already filtered by name check above

  // Top-N tables — rank \t name \t orders \t sum
  // Section anchors: "המנות הנמכרות ביותר", "הלקוחות החוזרים ביותר",
  // "החברות שמזמינות הכי הרבה"
  function extractTopTable(anchor: string, maxRows = 10) {
    const idx = lines.findIndex((l: any) => l.includes(anchor));
    if (idx === -1) return [];
    const out: any[] = [];
    for (let j = idx + 1; j < Math.min(idx + 80, lines.length); j++) {
      const line = lines[j];
      // Stop at next section header
      if (/הצג עוד/.test(line)) break;
      const cells = line.split(/\t|  +/).map((c: any) => c.trim()).filter(Boolean);
      if (cells.length >= 4
          && /^\d+$/.test(cells[0])
          && /^[A-Za-zא-ת]/.test(cells[1])
          && /^\d/.test(cells[2])) {
        out.push({
          rank: Number(cells[0]),
          name: cells[1],
          orders: Number(cells[2].replace(/[,\s]/g, '')) || 0,
          total: parseIls(cells[3]),
        });
        if (out.length >= maxRows) break;
      }
    }
    return out;
  }
  result.top_dishes = extractTopTable('המנות הנמכרות ביותר');
  result.top_customers = extractTopTable('הלקוחות החוזרים ביותר');
  result.top_companies = extractTopTable('החברות שמזמינות הכי הרבה');

  return { ...result, raw_text: text };
}

export async function captureGomileyDashboard() {
  const cookieHeader = await gomileyCookieHeader();
  if (!cookieHeader.includes('PHPSESSID')) {
    return { ok: false, reason: 'אין cookies — תגדיר ב-/AdminGomileyCookies' };
  }
  const url = `${GOMILEY_BASE}/system/pages/index/`;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      },
    });
    if (!r.ok) return { ok: false, reason: `http ${r.status}` };
    const html = await r.text();
    if (!/לוח בקרה|הכנסות|הזמנות/.test(html)) {
      return { ok: false, reason: 'session expired — login page returned', preview: html.slice(0, 200) };
    }
    const parsed = parseGomileyDashboard(html);
    const snap: any = await (db as any).gomileyDashboardSnapshot.create({
      data: {
        restaurant_id: '1968',
        date_range_label: 'החודש הנוכחי',
        total_income: parsed.total_income,
        total_orders: parsed.total_orders,
        new_customers: parsed.new_customers,
        new_companies: parsed.new_companies,
        onetime_percent: parsed.onetime_percent,
        returning_count: parsed.returning_count,
        onetime_count: parsed.onetime_count,
        platforms: parsed.platforms,
        top_dishes: parsed.top_dishes,
        top_customers: parsed.top_customers,
        top_companies: parsed.top_companies,
        raw_text: parsed.raw_text?.slice(0, 20000) || null,
      },
    });
    return {
      ok: true,
      snapshot_id: snap.id,
      total_income: parsed.total_income,
      total_orders: parsed.total_orders,
      platforms_count: parsed.platforms.length,
      top_dishes_count: parsed.top_dishes.length,
      top_customers_count: parsed.top_customers.length,
      top_companies_count: parsed.top_companies.length,
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

registerFn('captureGomileyDashboard', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  return captureGomileyDashboard();
});

registerFn('getLatestGomileyDashboard', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const latest: any = await (db as any).gomileyDashboardSnapshot.findFirst({
    orderBy: { captured_at: 'desc' },
  });
  if (!latest) return { snapshot: null };
  // Strip raw_text from response — too heavy, kept in DB for debugging only
  const { raw_text, ...rest } = latest;
  return { snapshot: rest };
});

// Cron — every 15 min during open hours (08:00-03:00 IL). Gomiley dashboard
// numbers update slowly so 15 min is plenty fresh for the kitchen TV.
if (!(globalThis as any).__gomileyDashboardTimer) {
  (globalThis as any).__gomileyDashboardTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date()));
        // Run between 08:00 and 03:59 IL (kitchen open hours + buffer)
        const inOpenHours = hour >= 8 || hour <= 3;
        if (inOpenHours) {
          const r = await captureGomileyDashboard();
          if (r.ok) console.log('[gomiley dashboard cron]', JSON.stringify({ total_income: r.total_income, platforms: r.platforms_count }));
          else console.warn('[gomiley dashboard cron] skipped:', r.reason);
        }
      } catch (e: any) { console.warn('[gomiley dashboard cron] failed:', e?.message); }
      (globalThis as any).__gomileyDashboardTimer = setTimeout(loop, 15 * 60 * 1000);
    })();
  }, 30 * 1000);  // First run 30s after server boots
}

// Daily cron — 04:00 IL, after the kitchen is closed and Gomiley has all of
// yesterday's orders attributed.
if (!(globalThis as any).__gomileyCustomersTimer) {
  (globalThis as any).__gomileyCustomersTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).formatToParts(new Date());
        const hour = parts.find(p => p.type === 'hour')?.value;
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
        const lastRun = (globalThis as any).__gomileyCustomersLastRun;
        if (hour === '04' && lastRun !== dateStr) {
          (globalThis as any).__gomileyCustomersLastRun = dateStr;
          const r = await captureGomileyCustomers();
          console.log('[gomiley customers cron]', JSON.stringify(r));
        }
      } catch (e: any) { console.warn('[gomiley customers cron] failed:', e?.message); }
      (globalThis as any).__gomileyCustomersTimer = setTimeout(loop, 30 * 60 * 1000);
    })();
  }, 5 * 60 * 1000);
}

// Admin endpoint — set Gomiley cookies. Stored as IntegrationSecret rows
// (key+value) so the owner can refresh them whenever they expire without
// SSH'ing to the VPS.
registerFn('saveGomileyCookies', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const b = (body || {}) as any;
  const updates: Array<[string, string]> = [
    ['gomiley_phpsessid', String(b.phpSessId || '').trim()],
    ['gomiley_arena', String(b.arena || '').trim()],
    ['gomiley_device_token', String(b.deviceToken || '').trim()],
    ['gomiley_restaurant_id', String(b.restaurantId || '1968').trim()],
  ];
  const note = 'Gomiley delivery aggregator — saved from /AdminGomileyCookies';
  for (const [key, value] of updates) {
    if (!value) continue;
    const existing: any = await (db as any).integrationSecret.findFirst({ where: { key } });
    if (existing) {
      await (db as any).integrationSecret.update({
        where: { id: existing.id },
        data: { value, note, updated_at: new Date(), updated_date: new Date().toISOString() },
      });
    } else {
      await (db as any).integrationSecret.create({
        data: { key, value, note, updated_at: new Date() },
      });
    }
  }
  // Bust cache so next snapshot uses new cookies immediately
  __gomileyCookieCache = null;
  // Try a fresh capture right away to confirm cookies work
  const test = await captureGomileySnapshot();
  return { ok: true, saved: updates.filter(([, v]) => v).map(([k]) => k), capture_test: test };
});

registerFn('getGomileyCookiesStatus', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const c = await loadGomileyCookies();
  const latestSnap: any = await (db as any).gomileySnapshot.findFirst({
    orderBy: { captured_at: 'desc' },
  });
  return {
    has_phpsessid: !!c.phpSessId,
    has_arena: !!c.arena,
    has_device_token: !!c.deviceToken,
    restaurant_id: c.restaurantId,
    last_capture_at: latestSnap?.captured_at || null,
    last_orders_count: latestSnap?.total_orders || 0,
  };
});

// 5-min cron — first fire 75s after boot (after Beecomm's 60s).
if (!(globalThis as any).__gomileySnapshotTimer) {
  (globalThis as any).__gomileySnapshotTimer = setTimeout(function loop() {
    captureGomileySnapshot()
      .then(r => {
        if (r.ok) console.log('[gomiley] snapshot captured', r.snapshot_id, 'orders=', r.total_orders);
        else console.warn('[gomiley] capture not-ok:', r.reason);
      })
      .catch(e => console.warn('[gomiley] capture failed:', e?.message))
      .finally(() => {
        (globalThis as any).__gomileySnapshotTimer = setTimeout(loop, 5 * 60 * 1000);
      });
  }, 75 * 1000);
}

// ============================================================================
// KitchenScreen — single aggregated endpoint that returns everything an
// ambient kitchen TV needs: live revenue, active waiters, hot stats, Gomiley
// pending count, top dishes, predicted hour, leaderboard, active goal.
// Polled every 30s by /KitchenScreen page. NO auth gate (display screens
// shouldn't need a user) — but endpoint reads existing snapshots only.
// ============================================================================
registerFn('getKitchenScreenData', async ({ user }) => {
  // Allow anonymous read — kiosk-style display screens
  void user;
  const out: any = {
    server_time: new Date().toISOString(),
    beecomm: null,
    gomiley: null,
    sales_goals: [],         // all active goals (not just one)
    leaderboard: null,
    predicted_hour: null,
    currently_dining: 0,     // sum party_size of seated reservations today
    arriving_soon: [],       // pending/confirmed reservations next 60 min
    arriving_soon_count: 0,
    low_inventory: { kitchen: [], bar: [] },
    deliveries_by_platform: [],  // [{name, orders, total}] from Gomiley dashboard
    daily_specials: [],          // [{description, target_value, bonus}] from today's brief
  };

  // 1. Beecomm latest snapshot — use fallback to last-with-data if today empty
  try {
    const latest: any = await (db as any).beecommSnapshot.findFirst({
      orderBy: { captured_at: 'desc' },
    });
    if (latest) {
      const todayEmpty = (Number(latest.total_today) || 0) === 0
        && (!Array.isArray(latest.workers) || latest.workers.length === 0);
      let src = latest;
      let fallback_date: string | null = null;
      if (todayEmpty) {
        const lwd: any = await (db as any).beecommSnapshot.findFirst({
          where: { total_today: { gt: 0 } },
          orderBy: { captured_at: 'desc' },
        });
        if (lwd) {
          src = lwd;
          fallback_date = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' }).format(new Date(lwd.captured_at));
        }
      }
      out.beecomm = {
        total_today: Number(latest.total_today) || 0,  // always today's real
        total_tips: Number(latest.total_tips) || 0,
        open_money: Number(latest.open_money) || 0,
        predicted_month: Number(latest.predicted_month) || 0,
        workers: Array.isArray(src.workers) ? src.workers : [],
        top_dishes: Array.isArray(src.top_dishes) ? src.top_dishes.slice(0, 5) : [],
        orders_by_hour: src.orders_by_hour || {},
        dine_in: src.dine_in || null,
        takeaway: src.takeaway || null,
        delivery: src.delivery || null,
        captured_at: latest.captured_at,
        fallback_date,
      };
    }
  } catch (e: any) { console.warn('[kitchen-screen] beecomm read failed:', e?.message); }

  // 2. Gomiley pending — count of orders not yet delivered
  try {
    const gSnap: any = await (db as any).gomileySnapshot.findFirst({
      orderBy: { captured_at: 'desc' },
    });
    if (gSnap) {
      const orders: any[] = Array.isArray(gSnap.orders) ? gSnap.orders : [];
      const pending = orders.filter(o =>
        o.status && !/delivered|completed|cancelled|בוצע|מבוטל|נמסר/.test(String(o.status).toLowerCase())
      );
      // "Stuck" orders — pending and older than 10 minutes (rough check from delivery_at)
      const now = Date.now();
      const stuck = pending.filter(o => {
        const t = o.created_at ? new Date(o.created_at).getTime() : 0;
        return t > 0 && (now - t) > 10 * 60 * 1000;
      });
      out.gomiley = {
        pending_count: pending.length,
        stuck_count: stuck.length,
        total_today: Number(gSnap.total_orders) || 0,
        total_income_today: Number(gSnap.total_income) || 0,
        captured_at: gSnap.captured_at,
      };
    }
  } catch (e: any) { console.warn('[kitchen-screen] gomiley read failed:', e?.message); }

  // 3. All active sales goals (not just one) — sorted by progress %
  try {
    const active: any[] = await (db as any).salesGoal.findMany({
      where: { status: { in: ['active', 'completed'] } },
      orderBy: { activated_at: 'desc' },
      take: 6,
    });
    out.sales_goals = active.map((g: any) => ({
      id: g.id,
      label: g.dish_label || 'יעד',
      emoji: g.emoji || '🎯',
      target: Number(g.target) || 0,
      sold: Number(g.current_count) || 0,
      bonus: Number(g.coins_per_sale) || 0,
      status: g.status,
    }));
  } catch (e: any) { console.warn('[kitchen-screen] sales-goals read failed:', e?.message); }

  // 6. Currently dining + arriving soon (next 60 min) from Reservations
  try {
    const now = new Date();
    const today00 = new Date();
    today00.setHours(0, 0, 0, 0);
    const tomorrow00 = new Date(today00.getTime() + 24 * 60 * 60 * 1000);
    const allToday: any[] = await (db as any).reservation.findMany({
      where: { date: { gte: today00, lt: tomorrow00 } },
      select: { id: true, status: true, time: true, party_size: true, customer_name: true },
    });
    let dining = 0;
    const arriving: Array<{ time: string; party: number; name: string }> = [];
    const nowMs = now.getTime();
    const cutoffMs = nowMs + 60 * 60 * 1000;
    for (const r of allToday) {
      const st = String(r.status || '').toLowerCase();
      if (st === 'seated' || st === 'arrived' || st === 'in_progress') {
        dining += Number(r.party_size) || 0;
      } else if (st === 'pending' || st === 'confirmed' || st === '') {
        // Build a date from today's date + the time string (HH:MM)
        const [hh, mm] = String(r.time || '').split(':').map((x: string) => Number(x) || 0);
        const resDt = new Date(today00.getTime());
        resDt.setHours(hh, mm, 0, 0);
        const t = resDt.getTime();
        if (t >= nowMs && t <= cutoffMs) {
          arriving.push({ time: r.time || '', party: Number(r.party_size) || 0, name: r.customer_name || '' });
        }
      }
    }
    out.currently_dining = dining;
    out.arriving_soon = arriving.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8);
    out.arriving_soon_count = arriving.reduce((s, a) => s + a.party, 0);
  } catch (e: any) { console.warn('[kitchen-screen] reservations failed:', e?.message); }

  // 7. Shortages + daily specials — read from today's DailyBrief
  // (owner-edited via /BriefingManagement). Primary source. Falls back to
  // InventoryAlert if no brief exists yet.
  try {
    const today00 = new Date();
    today00.setHours(0, 0, 0, 0);
    const tomorrow00 = new Date(today00.getTime() + 24 * 60 * 60 * 1000);
    const brief: any = await (db as any).dailyBrief.findFirst({
      where: { date: { gte: today00, lt: tomorrow00 } },
      orderBy: { updatedAt: 'desc' },
    });

    let kitchenItems: any[] = [];
    let barItems: any[] = [];
    if (brief) {
      const ks = Array.isArray(brief.kitchen_shortages) ? brief.kitchen_shortages : [];
      const bs = Array.isArray(brief.bar_shortages) ? brief.bar_shortages : [];
      // Accept either string entries or { item: string } entries from legacy data
      const normalize = (s: any) => (typeof s === 'string' ? s : (s?.item ?? '')).trim();
      kitchenItems = ks.map((s: any) => ({ name: normalize(s) })).filter((x: any) => x.name);
      barItems = bs.map((s: any) => ({ name: normalize(s) })).filter((x: any) => x.name);

      // Daily specials from brief.sales_targets — info-only on screen
      const targets = Array.isArray(brief.sales_targets) ? brief.sales_targets : [];
      out.daily_specials = targets.map((t: any) => ({
        description: String(t?.target_description || '').trim(),
        target_value: Number(t?.target_value) || 0,
        bonus: String(t?.bonus_description || '').trim(),
      })).filter((t: any) => t.description);
    }

    // Fallback to InventoryAlert if brief has no shortages yet
    if (kitchenItems.length === 0 && barItems.length === 0) {
      try {
        const isBarName = (n: string) => /יין|בירה|וודקה|ויסקי|טקילה|רום|ג['י]ין|ליקר|שמפניה|פרוסקו|אבסולוט|אלכוהול|קוקטייל|מארטיני|אפרול|לימונדה|קולה|מיץ|סודה|טוניק|שתי/i.test(String(n || ''));
        const alerts: any[] = await (db as any).inventoryAlert.findMany({
          where: { OR: [{ status: 'pending' }, { status: null }] },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });
        for (const a of alerts) {
          const item = { name: String(a.item_name || '').trim() };
          if (!item.name) continue;
          if (isBarName(item.name)) barItems.push(item);
          else kitchenItems.push(item);
        }
      } catch { /* best effort */ }
    }

    out.low_inventory = {
      kitchen: kitchenItems.slice(0, 12),
      bar: barItems.slice(0, 12),
      source: brief ? 'brief' : 'alerts',
      brief_id: brief?.id || null,
    };
  } catch (e: any) { console.warn('[kitchen-screen] shortages failed:', e?.message); }
  if (!Array.isArray(out.daily_specials)) out.daily_specials = [];

  // 8. Deliveries by platform — from latest Gomiley dashboard scrape
  try {
    const dash: any = await (db as any).gomileyDashboardSnapshot.findFirst({
      orderBy: { captured_at: 'desc' },
    });
    if (dash && Array.isArray(dash.platforms)) {
      out.deliveries_by_platform = dash.platforms.map((p: any) => ({
        name: p.name,
        orders: Number(p.orders) || 0,
        total: Number(p.total) || 0,
      }));
    }
  } catch (e: any) { console.warn('[kitchen-screen] platforms failed:', e?.message); }

  // 4. Leaderboard — top 5 waiters by sales today
  try {
    const today00 = new Date();
    today00.setHours(0, 0, 0, 0);
    const events: any[] = await (db as any).saleEvent.findMany({
      where: { created_at: { gte: today00 }, voided: false },
    });
    const byUser = new Map<string, { user_email: string; user_name: string; count: number; bonus_sum: number }>();
    for (const e of events) {
      const key = String(e.user_email || '').toLowerCase();
      if (!key) continue;
      const cur = byUser.get(key) || { user_email: key, user_name: e.user_name || key, count: 0, bonus_sum: 0 };
      cur.count += 1;
      cur.bonus_sum += Number(e.bonus_amount) || 0;
      byUser.set(key, cur);
    }
    out.leaderboard = [...byUser.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  } catch (e: any) { console.warn('[kitchen-screen] leaderboard read failed:', e?.message); }

  // 5. Predicted next-hour load — average of same hour over last 7 same-weekdays
  try {
    const now = new Date();
    const ilHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now));
    const nextHour = (ilHour + 1) % 24;
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recent: any[] = await (db as any).beecommSnapshot.findMany({
      where: { captured_at: { gte: since } },
      select: { orders_by_hour: true, captured_at: true },
      orderBy: { captured_at: 'desc' },
    });
    const sameHourValues: number[] = [];
    const seen = new Set<string>();
    for (const r of recent) {
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(r.captured_at);
      if (seen.has(d)) continue;
      seen.add(d);
      const v = Number(r.orders_by_hour?.[String(nextHour)]?.diners) || 0;
      if (v > 0) sameHourValues.push(v);
      if (sameHourValues.length >= 7) break;
    }
    const avg = sameHourValues.length > 0
      ? Math.round(sameHourValues.reduce((s, v) => s + v, 0) / sameHourValues.length)
      : 0;
    out.predicted_hour = {
      hour: nextHour,
      avg_diners: avg,
      sample_size: sameHourValues.length,
    };
  } catch (e: any) { console.warn('[kitchen-screen] predicted-hour failed:', e?.message); }

  return out;
});

// ============================================================================
// Morning Report — daily summary email at 07:30 IL with one Gemini insight.
// Pulls yesterday's Beecomm + Gomiley + SaleEvents; asks Gemini for ONE
// concrete recommendation; sends to owner inbox.
// ============================================================================
async function buildMorningReportData() {
  // Compute yesterday's IL date window
  const now = new Date();
  const ilYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(ilYesterday);
  const dayStart = new Date(`${dateStr}T00:00:00.000+03:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999+03:00`);

  // Beecomm — use historical day if exists, else max-total snapshot from yesterday
  let beecomm: any = null;
  try {
    const histRow: any = await (db as any).beecommHistoricalDay.findFirst({
      where: { date: dateStr },
    });
    if (histRow) {
      beecomm = {
        total: Number(histRow.total_sum) || 0,
        tips: Number(histRow.total_tips) || 0,
        diners: Number(histRow.total_diners) || 0,
        source: 'historical',
      };
    } else {
      const snaps: any[] = await (db as any).beecommSnapshot.findMany({
        where: { captured_at: { gte: dayStart, lte: dayEnd } },
        orderBy: { total_today: 'desc' },
        take: 1,
      });
      if (snaps[0]) {
        beecomm = {
          total: Number(snaps[0].total_today) || 0,
          tips: Number(snaps[0].total_tips) || 0,
          diners: (snaps[0].workers || []).reduce((s: number, w: any) => s + (Number(w.diners) || 0), 0),
          top_dishes: (snaps[0].top_dishes || []).slice(0, 3),
          source: 'snapshot',
        };
      }
    }
  } catch (e: any) { console.warn('[morning-report] beecomm failed:', e?.message); }

  // Gomiley
  let gomiley: any = null;
  try {
    const snaps: any[] = await (db as any).gomileySnapshot.findMany({
      where: { captured_at: { gte: dayStart, lte: dayEnd } },
      orderBy: { total_income: 'desc' },
      take: 1,
    });
    if (snaps[0]) {
      gomiley = {
        total_orders: Number(snaps[0].total_orders) || 0,
        total_income: Number(snaps[0].total_income) || 0,
      };
    }
  } catch (e: any) { console.warn('[morning-report] gomiley failed:', e?.message); }

  // Sales events from yesterday
  let salesEvents: { count: number; bonus_sum: number; by_template: Record<string, number>; top_waiter: { name: string; count: number } | null } | null = null;
  try {
    const events: any[] = await (db as any).saleEvent.findMany({
      where: { created_at: { gte: dayStart, lte: dayEnd }, voided: false },
    });
    const byTemplate: Record<string, number> = {};
    const byWaiter = new Map<string, number>();
    let bonus = 0;
    for (const e of events) {
      const tpl = e.template_label || 'אחר';
      byTemplate[tpl] = (byTemplate[tpl] || 0) + 1;
      bonus += Number(e.bonus_amount) || 0;
      if (e.user_name) byWaiter.set(e.user_name, (byWaiter.get(e.user_name) || 0) + 1);
    }
    const topW = [...byWaiter.entries()].sort((a, b) => b[1] - a[1])[0];
    salesEvents = {
      count: events.length,
      bonus_sum: bonus,
      by_template: byTemplate,
      top_waiter: topW ? { name: topW[0], count: topW[1] } : null,
    };
  } catch (e: any) { console.warn('[morning-report] sales events failed:', e?.message); }

  // Pending requests that may need owner action
  let pending: any = { availability: 0, swap: 0, vacation: 0 };
  try {
    pending.availability = await (db as any).availabilityRequest.count({ where: { status: 'pending' } }).catch(() => 0);
    pending.swap = await (db as any).shiftSwapRequest?.count({ where: { status: 'pending' } }).catch(() => 0) || 0;
    pending.vacation = await (db as any).vacationRequest?.count({ where: { status: 'pending' } }).catch(() => 0) || 0;
  } catch { /* ignore */ }

  return { date: dateStr, beecomm, gomiley, sales_events: salesEvents, pending };
}

async function callGeminiForMorningInsight(data: any): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return 'ההמלצה לא זמינה (חסר GEMINI_API_KEY)';
  const prompt = `אתה יועץ ניהול למסעדת "${await getBrandName()}". הנה נתוני אתמול:\n${JSON.stringify(data, null, 2)}\n\nתן המלצה אחת קונקרטית בעברית — משפט אחד עד שניים, מעשי, שיעזור לבעלים לפעול היום. ללא הקדמות, רק ההמלצה.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
      }),
    });
    if (!r.ok) return `ההמלצה לא זמינה (Gemini ${r.status})`;
    const json: any = await r.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (text || 'אין המלצה היום').trim();
  } catch (e: any) {
    return `ההמלצה לא זמינה (${e?.message})`;
  }
}

export async function sendMorningReport() {
  const data = await buildMorningReportData();
  const insight = await callGeminiForMorningInsight(data);

  const fmtIls = (n: number) => '₪' + Math.round(n || 0).toLocaleString('he-IL');
  const beecommTxt = data.beecomm
    ? `🔴 קופה: ${fmtIls(data.beecomm.total)} · ${data.beecomm.diners || '?'} סועדים · טיפ ${fmtIls(data.beecomm.tips)}`
    : '🔴 קופה: אין נתונים';
  const gomileyTxt = data.gomiley
    ? `🛵 משלוחים: ${data.gomiley.total_orders} הזמנות · ${fmtIls(data.gomiley.total_income)}`
    : '🛵 משלוחים: אין נתונים';
  const salesTxt = data.sales_events
    ? `💰 מכירות גמיפיקציה: ${data.sales_events.count} פעולות${data.sales_events.top_waiter ? ` · מוביל: ${data.sales_events.top_waiter.name} (${data.sales_events.top_waiter.count})` : ''}`
    : '';
  const pendingItems: string[] = [];
  if (data.pending.availability > 0) pendingItems.push(`${data.pending.availability} זמינויות`);
  if (data.pending.swap > 0) pendingItems.push(`${data.pending.swap} החלפות`);
  if (data.pending.vacation > 0) pendingItems.push(`${data.pending.vacation} חופשות`);
  const pendingTxt = pendingItems.length > 0 ? `📋 ממתינים לאישור: ${pendingItems.join(' · ')}` : '';

  const subject = `☀️ ${await getBrandName()} · סיכום ${data.date}`;
  const html = `
<div dir="rtl" style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#92400e;margin-bottom:8px;">☀️ בוקר טוב, דביר</h2>
  <p style="color:#64748b;font-size:14px;margin-top:0;">סיכום ${data.date}</p>

  <div style="background:#fef3c7;border-right:4px solid #f59e0b;padding:16px;border-radius:8px;margin:16px 0;">
    <div style="font-weight:bold;color:#92400e;margin-bottom:8px;">💡 ההמלצה היומית</div>
    <div style="color:#451a03;line-height:1.6;">${insight}</div>
  </div>

  <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
    <div style="margin:6px 0;">${beecommTxt}</div>
    <div style="margin:6px 0;">${gomileyTxt}</div>
    ${salesTxt ? `<div style="margin:6px 0;">${salesTxt}</div>` : ''}
  </div>

  ${pendingTxt ? `<div style="background:#fef2f2;border-right:4px solid #ef4444;padding:12px;border-radius:8px;margin:16px 0;color:#991b1b;">${pendingTxt}</div>` : ''}

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:11px;color:#94a3b8;text-align:center;">topalena.com · דוח אוטומטי</p>
</div>`.trim();
  const text = `בוקר טוב, דביר\nסיכום ${data.date}\n\n${insight}\n\n${beecommTxt}\n${gomileyTxt}\n${salesTxt}\n${pendingTxt}`.trim();

  await sendEmail({ to: 'dvirnifusi@gmail.com', subject, text, html });
  return { ok: true, sent_to: 'dvirnifusi@gmail.com', date: data.date, insight };
}

registerFn('sendMorningReport', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  return sendMorningReport();
});

// Daily cron — 07:30 IL
if (!(globalThis as any).__morningReportTimer) {
  (globalThis as any).__morningReportTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
        const lastRun = (globalThis as any).__morningReportLastRun;
        if (hour === '07' && Number(minute) >= 30 && lastRun !== dateStr) {
          (globalThis as any).__morningReportLastRun = dateStr;
          const r = await sendMorningReport();
          console.log('[morning-report cron]', JSON.stringify(r));
        }
      } catch (e: any) { console.warn('[morning-report cron] failed:', e?.message); }
      (globalThis as any).__morningReportTimer = setTimeout(loop, 15 * 60 * 1000);
    })();
  }, 10 * 60 * 1000);
}

// ============================================================================
// Critical-3 push filter — wrapper that:
//   1. Suppresses non-critical pushes during quiet hours (13:00-15:00, 19:00-22:00)
//   2. Limits to max 3 pushes per category per day
// Categories: shift_alert, gomiley_alert, ops_alert. Critical bypasses all.
// ============================================================================
const __pushCounters = new Map<string, { count: number; date: string }>();

function isQuietHourIL(): boolean {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date()));
  return (h >= 13 && h < 15) || (h >= 19 && h < 22);
}

export function shouldSendThrottledPush(category: string, opts: { critical?: boolean } = {}): boolean {
  if (opts.critical) return true;
  if (isQuietHourIL()) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const cur = __pushCounters.get(category);
  if (!cur || cur.date !== today) {
    __pushCounters.set(category, { count: 1, date: today });
    return true;
  }
  if (cur.count >= 3) return false;
  cur.count += 1;
  return true;
}

registerFn('getCritical3Status', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const out: any = { quiet_hour_now: isQuietHourIL(), today, counters: {} };
  for (const [k, v] of __pushCounters.entries()) {
    if (v.date === today) out.counters[k] = v.count;
  }
  return out;
});

// ============================================================================
// Auto-credit Sales Gamification from Beecomm top_dishes deltas.
// Runs after each snapshot. For each active goal, finds delta-dishes whose
// name contains goal.dish_label (Hebrew substring), credits the units to the
// waiter with the highest sum-delta in this snapshot. Marks events as
// credited_by_id='beecomm_auto' so they're distinguishable from manual.
// OFF by default — owner enables via toggleBeecommAutoCredit endpoint.
// ============================================================================
const __autoCreditLog: Array<{ at: string; details: any }> = [];

function pushAutoCreditLog(details: any) {
  __autoCreditLog.push({ at: new Date().toISOString(), details });
  if (__autoCreditLog.length > 50) __autoCreditLog.shift();
}

async function autoCreditFromBeecomm(): Promise<{ ok: boolean; credited?: number; reason?: string; details?: any }> {
  const g: any = globalThis as any;
  if (!g.__beecommAutoCreditEnabled) return { ok: false, reason: 'disabled' };

  // 2 most-recent snapshots from today
  const today00 = new Date();
  today00.setHours(0, 0, 0, 0);
  const recent: any[] = await (db as any).beecommSnapshot.findMany({
    where: { captured_at: { gte: today00 } },
    orderBy: { captured_at: 'desc' },
    take: 2,
  });
  if (recent.length < 2) {
    return { ok: false, reason: 'need 2 snapshots today' };
  }
  const [now, prev] = recent;

  // Delta of top_dishes (dishId → qty diff)
  const nowDishes: any[] = Array.isArray(now.top_dishes) ? now.top_dishes : [];
  const prevDishes: any[] = Array.isArray(prev.top_dishes) ? prev.top_dishes : [];
  const prevQtyById = new Map<string, number>();
  for (const d of prevDishes) prevQtyById.set(String(d.dishId || d.netId || ''), Number(d.quantity) || 0);
  const dishDeltas: Array<{ dishId: string; name: string; delta: number }> = [];
  for (const d of nowDishes) {
    const id = String(d.dishId || d.netId || '');
    const cur = Number(d.quantity) || 0;
    const prv = prevQtyById.get(id) || 0;
    if (cur > prv) dishDeltas.push({ dishId: id, name: String(d.name || ''), delta: cur - prv });
  }
  if (dishDeltas.length === 0) return { ok: true, credited: 0, reason: 'no dish growth' };

  // Worker sum-delta (workerId → sumDelta) — used to attribute credit
  const nowWorkers: any[] = Array.isArray(now.workers) ? now.workers : [];
  const prevWorkers: any[] = Array.isArray(prev.workers) ? prev.workers : [];
  const prevSumById = new Map<string, number>();
  for (const w of prevWorkers) prevSumById.set(String(w.workerId), Number(w.sum) || 0);
  const workerDeltas = nowWorkers.map((w: any) => ({
    name: String(w.name || '').trim(),
    workerId: String(w.workerId),
    delta: Math.max(0, (Number(w.sum) || 0) - (prevSumById.get(String(w.workerId)) || 0)),
  })).sort((a, b) => b.delta - a.delta);
  const topWorker = workerDeltas[0];
  if (!topWorker || topWorker.delta === 0) {
    return { ok: false, reason: 'no worker sum delta' };
  }

  // Match top worker name to an Employee record (case-insensitive contains)
  const allEmps: any[] = await (db as any).employee.findMany({
    where: { active: true },
    select: { id: true, full_name: true, email: true },
  });
  const matchEmp = (beeName: string) => {
    const n = beeName.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!n) return null;
    // Try exact, then first-name match
    let m = allEmps.find(e => String(e.full_name).toLowerCase().trim() === n);
    if (m) return m;
    const firstWord = n.split(/\s+/)[0];
    m = allEmps.find(e => String(e.full_name).toLowerCase().includes(firstWord));
    return m || null;
  };
  const waiter = matchEmp(topWorker.name);
  if (!waiter) {
    pushAutoCreditLog({ skip: 'no employee match', beecomm_name: topWorker.name });
    return { ok: false, reason: `no employee match for "${topWorker.name}"` };
  }

  // Active goals for current shift
  const activeGoals: any[] = await (db as any).salesGoal.findMany({
    where: { status: { in: ['active', 'completed'] } },
  });
  if (activeGoals.length === 0) return { ok: true, credited: 0, reason: 'no active goals' };

  let totalCredited = 0;
  const creditedDetails: any[] = [];

  for (const goal of activeGoals) {
    const label = String(goal.dish_label || '').trim();
    if (!label) continue;
    // Find dish deltas where name contains the goal label (Hebrew/English)
    const matchingDeltas = dishDeltas.filter(d => d.name.includes(label));
    if (matchingDeltas.length === 0) continue;
    const totalUnits = matchingDeltas.reduce((s, d) => s + d.delta, 0);

    for (let i = 0; i < totalUnits; i++) {
      const isBonus = goal.status === 'completed';
      const coins = isBonus ? goal.coins_per_sale * 2 : goal.coins_per_sale;
      // Coin transaction
      const ct: any = await (db as any).coinTransaction.create({
        data: {
          employee_id: waiter.id,
          employee_name: waiter.full_name,
          amount: coins,
          reason: `מכירת ${goal.dish_label}${isBonus ? ' (בונוס)' : ''} · אוטומטי מ-Beecomm`,
          type: 'sale_bonus',
          trigger: `sales_goal:${goal.id}:beecomm_auto`,
          status: 'approved',
          approved_by: 'beecomm_auto',
        },
      });
      // SaleEvent — marked as beecomm_auto in credited_by_id
      await (db as any).saleEvent.create({
        data: {
          goal_id: goal.id,
          waiter_id: waiter.id,
          waiter_name: waiter.full_name,
          credited_by_id: 'beecomm_auto',
          credited_by_name: 'מערכת אוטומטית (Beecomm)',
          coins_amount: coins,
          is_bonus: isBonus,
          coin_transaction_id: ct.id,
        },
      });
      const newCount = goal.current_count + 1;
      const justCompleted = !isBonus && newCount === goal.target;
      await (db as any).salesGoal.update({
        where: { id: goal.id },
        data: {
          current_count: { increment: 1 },
          status: justCompleted ? 'completed' : goal.status,
          completed_at: justCompleted ? new Date() : undefined,
        },
      });
      goal.current_count = newCount;
      if (justCompleted) goal.status = 'completed';
      totalCredited += 1;
    }
    creditedDetails.push({
      goal_label: label,
      units: totalUnits,
      to_waiter: waiter.full_name,
      matched_dishes: matchingDeltas.map(d => d.name),
    });
  }

  pushAutoCreditLog({ credited: totalCredited, details: creditedDetails, top_worker: topWorker });
  return { ok: true, credited: totalCredited, details: creditedDetails };
}

registerFn('toggleBeecommAutoCredit', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  const enabled = !!(body as any)?.enabled;
  (globalThis as any).__beecommAutoCreditEnabled = enabled;
  return { ok: true, enabled };
});

registerFn('getBeecommAutoCreditStatus', async ({ user }) => {
  if (!user) throw new Error('auth required');
  return {
    enabled: !!(globalThis as any).__beecommAutoCreditEnabled,
    recent_log: __autoCreditLog.slice(-20).reverse(),
  };
});

registerFn('runBeecommAutoCreditNow', async ({ user }) => {
  if (!user) throw new Error('auth required');
  if ((user as any).role !== 'admin' && (user as any).role !== 'owner') {
    throw new Error('admin only');
  }
  // Temporarily enable to allow a one-shot manual run for testing
  const wasEnabled = (globalThis as any).__beecommAutoCreditEnabled;
  (globalThis as any).__beecommAutoCreditEnabled = true;
  try {
    return await autoCreditFromBeecomm();
  } finally {
    (globalThis as any).__beecommAutoCreditEnabled = wasEnabled;
  }
});

// Run auto-credit after each Beecomm snapshot — but only if enabled.
// Piggybacks on the existing snapshot cron (every 3 min).
if (!(globalThis as any).__beecommAutoCreditTimer) {
  (globalThis as any).__beecommAutoCreditTimer = setTimeout(function loop() {
    void (async () => {
      try {
        if ((globalThis as any).__beecommAutoCreditEnabled) {
          const r = await autoCreditFromBeecomm();
          if (r.credited && r.credited > 0) {
            console.log('[beecomm-auto-credit cron]', JSON.stringify(r));
          }
        }
      } catch (e: any) { console.warn('[beecomm-auto-credit cron] failed:', e?.message); }
      (globalThis as any).__beecommAutoCreditTimer = setTimeout(loop, 3 * 60 * 1000 + 30 * 1000); // 30s after snapshot
    })();
  }, 4 * 60 * 1000);
}

// ── D1: Feature Modules ────────────────────────────────────────────────
//
// Self-heal: prisma db push doesn't auto-create per-tenant tables (schema-
// per-tenant means the container's push targets the default schema, not
// every tenant's). CREATE TABLE IF NOT EXISTS is idempotent + cheap.
let moduleSettingTableReady = false;
async function ensureModuleSettingTable() {
  if (moduleSettingTableReady) return;
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ModuleSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "module_key" TEXT NOT NULL UNIQUE,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  moduleSettingTableReady = true;
}

// Returns the full MODULE_CATALOG merged with the tenant's ModuleSetting rows.
// Every module has an `enabled` boolean. Core modules are always enabled.
// Missing ModuleSetting row → enabled=true (safe default).
registerFn('getMyTenantModules', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  await ensureModuleSettingTable();
  const rows = await (prisma as any).moduleSetting.findMany({
    select: { module_key: true, enabled: true },
  });
  const settingByKey = new Map<string, boolean>(
    (rows as { module_key: string; enabled: boolean }[]).map(r => [r.module_key, r.enabled]),
  );
  // Plan snapshot (written by assignTenantPlan). Absent → no plan assigned →
  // no paywall (backward compatible: every optional module behaves as before).
  let planInfo: any = null;
  try {
    const pi: any[] = await (prisma as any).$queryRawUnsafe(`SELECT plan_key, plan_name, modules, unlock_map FROM "TenantPlanInfo" WHERE id = 1`);
    planInfo = pi[0] || null;
  } catch { /* table not present → no plan */ }
  const planModules: string[] | null = planInfo ? (Array.isArray(planInfo.modules) ? planInfo.modules : []) : null;
  const unlockMap: Record<string, string> = planInfo?.unlock_map && typeof planInfo.unlock_map === 'object' ? planInfo.unlock_map : {};
  // Sub-feature snapshot — separate query so a pre-sub-feature TenantPlanInfo
  // (missing the column) degrades to "no sub-feature gating" instead of failing.
  let planSubs: string[] | null = null;
  if (planInfo) {
    try {
      const ps: any[] = await (prisma as any).$queryRawUnsafe(`SELECT sub_features FROM "TenantPlanInfo" WHERE id = 1`);
      planSubs = Array.isArray(ps[0]?.sub_features) ? ps[0].sub_features : [];
    } catch { planSubs = null; }
  }

  const modules = MODULE_CATALOG.map(m => {
    const enabled = m.core ? true : (settingByKey.get(m.key) ?? true);
    // Locked = optional module NOT included in the assigned plan (upsell target).
    // Owner-disabled in-plan modules stay hidden (enabled=false, locked=false).
    const inPlan = m.core || !planModules || planModules.includes(m.key);
    const locked = !m.core && !!planModules && !inPlan;
    const sub_features = SUB_FEATURE_CATALOG.filter(s => s.module_key === m.key).map(s => {
      const sEnabled = settingByKey.get(s.key) ?? true;
      const sInPlan = !planSubs || planSubs.includes(s.key);
      const sLocked = !!planSubs && !sInPlan;
      return {
        key: s.key, name_he: s.name_he, description_he: s.description_he,
        enabled: sEnabled, locked: sLocked, in_plan: sInPlan,
        unlock_plan: sLocked ? (unlockMap[s.key] || null) : null,
      };
    });
    return {
      key: m.key, name_he: m.name_he, description_he: m.description_he,
      category: m.category, icon: m.icon, core: m.core, pages: m.pages,
      enabled, locked, in_plan: inPlan, unlock_plan: locked ? (unlockMap[m.key] || null) : null,
      sub_features,
    };
  });
  return { modules, plan_key: planInfo?.plan_key || null, plan_name: planInfo?.plan_name || null };
});

// D2 — dynamic PWA manifest. The browser fetches this without auth on page
// load. Reads the tenant's RestaurantProfile for name/logo/colors and returns
// a valid Web App Manifest. Falls back to the platform default when empty.
registerFn('getManifest', async () => {
  let profile: any = null;
  try {
    profile = await (prisma as any).restaurantProfile.findFirst({});
  } catch { /* schema not ready or no rows — falls through */ }

  const name = profile?.restaurant_name || 'TOP APOLLO';
  const shortName = String(name).slice(0, 12);
  const colors = profile?.brand_colors || {};
  const themeColor = colors.primary || '#3a4a1f';
  const logo = profile?.logo_url;

  const icons = logo
    ? [
        { src: logo, sizes: '192x192', type: 'image/png', purpose: 'any' as const },
        { src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' as const },
      ]
    : [
        { src: '/icons/icon-192.png?v=1', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
        { src: '/icons/icon-512.png',     sizes: '512x512', type: 'image/png', purpose: 'any' as const },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
      ];

  return {
    name,
    short_name: shortName,
    description: `מערכת ניהול — ${name}`,
    lang: 'he',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: themeColor,
    icons,
  };
}, { public: true });

// D5 — returns this tenant's current-month AI usage: total tokens, total
// cost in ILS, breakdown by day (for a chart) and by fn (for a top-N list).
registerFn('getMyAiUsage', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  const usage = await getMyMonthlyUsage();
  return usage;
});

// BP — Suggest kitchen preps (base mises-en-place) tailored to the tenant's
// menu style. Reads business_context + optional recent menu items and asks
// Gemini for 5-8 prep recipes commonly needed for that cuisine.
registerFn('suggestKitchenPreps', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const ctx = await businessContextBlock();
  const brand = await getBrandName();
  // Best-effort — sample a few existing dishes for grounding.
  let dishSample = '';
  try {
    const dishes: any[] = await (db as any).recipe.findMany({ where: { kind: 'DISH' }, take: 12, select: { name: true } });
    if (dishes.length) dishSample = `\n\nמנות קיימות בתפריט: ${dishes.map(d => d.name).join(', ')}`;
  } catch { /* no dishes yet */ }
  const prompt = `${ctx}הצע 6-10 הכנות מטבח (base preps / mise en place) שאופייניות למסעדה כמו "${brand}". לכל הכנה: שם קצר, יחידת מדידה (ק"ג/ליטר/יח׳), ורשימה קצרה של רכיבים.${dishSample}\n\nהחזר JSON: { preps: [{ name, unit, ingredients: string[], notes }] }`;
  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        preps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              unit: { type: 'string' },
              ingredients: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' },
            },
          },
        },
      },
      required: ['preps'],
    },
    _ctx: { fn_name: 'suggestKitchenPreps' },
  });
  return result;
});

// BP — Extract a seating map from an uploaded image (sketch / photo of
// floorplan / tablet screenshot). Gemini vision returns a list of tables
// with rough (x, y) coordinates + capacity. Owner then drags to adjust.
registerFn('extractSeatingFromImage', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const url = String(b.file_url || '').trim();
  if (!url) throw new Error('file_url required');
  const prompt = `אתה מקבל תמונה של מפת מסעדה — יכולה להיות סקיצה יד חופשית, צילום, או צילום מסך של תכנת ניהול (כמו BeeComm, Panel, Yaad וכו').

**המשימה שלך:** חלץ את **כל** השולחנות שאתה מזהה בתמונה, כולל שולחנות בברים, פינות ישיבה, אזורי חוץ ואזורי VIP. אל תדלג על שולחנות רק כי הם קטנים או בפינה.

**איך לזהות שולחן:**
- מלבן/עיגול/צורה עם מספר או שם
- מספר קטן ליד השם = קיבולת (למשל "2" ליד "10" = שולחן 10 ל-2 סועדים)
- אזורים גדולים עם שם ("בר זוהרה", "כניסה", "מטבח") — הבנת אזורים, אבל **לא שולחנות בפני עצמם**

**פורמט הפלט הנדרש:**
- label: המספר או השם של השולחן ("10", "בר 1", "S3")
- capacity: מספר הסועדים המקסימלי (אם רואים מספר קטן ליד השולחן, זה הקיבולת. אם לא רואים — הערך שגרתי: 2 לשולחן קטן, 4 לבינוני, 6-12 לגדול)
- x: מיקום אופקי בטווח 0-100 (0 = שמאל, 100 = ימין)
- y: מיקום אנכי בטווח 0-100 (0 = למעלה, 100 = למטה)
- shape: אחד מ- "table" (רגיל), "bar" (בר), "booth" (פינה), "outdoor" (חוץ)

**חשוב:**
- החזר **כל שולחן** שאתה רואה. אל תסכם. אל תדלג.
- אם התמונה מכילה עשרות שולחנות — החזר את כולם.
- אל תמציא שולחנות שלא רואים. רק מה שקיים בתמונה.`;

  let result: any;
  try {
    result = await invokeLLM({
      prompt,
      fileUrls: [url],
      responseSchema: {
        type: 'object',
        properties: {
          tables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                capacity: { type: 'number' },
                x: { type: 'number' },
                y: { type: 'number' },
                shape: { type: 'string' },
              },
              required: ['label'],
            },
          },
        },
        required: ['tables'],
      },
      maxOutputTokens: 32768, // Complex maps can have 40+ tables — was capped at 8k before
      timeoutMs: 90_000,
      _ctx: { fn_name: 'extractSeatingFromImage' },
    });
  } catch (e: any) {
    throw new Error(`extractSeatingFromImage: ${e?.message || 'unknown_llm_error'}`);
  }
  // Diagnostic: if we got a raw text response (schema parse failed), surface it
  // so the frontend can show the operator what Gemini actually said.
  if (result?.raw && !result?.tables) {
    console.warn('[extractSeatingFromImage] Gemini returned unstructured text:', String(result.raw).slice(0, 500));
    return { tables: [], _raw_llm_response: String(result.raw).slice(0, 800), _debug: 'schema_parse_failed' };
  }
  const tables = Array.isArray(result?.tables) ? result.tables : [];
  if (tables.length === 0) {
    console.warn('[extractSeatingFromImage] Gemini returned zero tables. File URL:', url.slice(0, 120));
    return { tables: [], _debug: 'gemini_returned_zero_tables', _file_url_prefix: url.slice(0, 60) };
  }
  return { tables };
});

// ── Generic team-join link ──────────────────────────────────────────────
// One shareable URL per restaurant (https://<slug>.topalena.com/JoinTeam):
// the owner drops it in the staff WhatsApp group, each employee fills
// name/phone/email/role, lands as status='pending_approval', and the owner
// one-click-approves in ניהול עובדים. Replaces typing employees one by one.

// PUBLIC — the JoinTeam form needs the role list before login exists.
registerFn('getJoinTeamInfo', async () => {
  let roles: string[] = [];
  try {
    const rows: any[] = await (db as any).role.findMany({ where: { is_active: true } });
    roles = rows.map((r: any) => r.name).filter(Boolean);
  } catch { /* Role table may not exist yet */ }
  if (!roles.length) roles = ['מלצר/ית', 'טבח/ית', 'ברמן/ית', 'אחמ"ש', 'שוטף כלים', 'מארח/ת'];
  return { roles, brand: await getBrandName() };
}, { public: true });

// PUBLIC — employee self-signup from the JoinTeam page.
registerFn('joinTeamRequest', async ({ body }) => {
  const b = (body || {}) as any;
  const fullName = String(b.full_name || '').trim();
  const phone = String(b.phone || '').replace(/[^\d+]/g, '');
  const email = String(b.email || '').trim().toLowerCase();
  const role = String(b.role || '').trim();
  if (fullName.length < 2) throw new Error('שם מלא חובה');
  if (phone.length < 9) throw new Error('מספר טלפון לא תקין');
  if (!/\S+@\S+\.\S+/.test(email)) throw new Error('מייל לא תקין');
  if (!role) throw new Error('בחר תפקיד');
  // Dedupe — an employee who already exists (any status) shouldn't pile up.
  const existing = await (db as any).employee.findFirst({
    where: { OR: [{ email }, { phone }] },
  }).catch(() => null);
  if (existing) {
    if (existing.status === 'pending_approval') return { ok: true, already: 'pending' };
    throw new Error('כבר קיים עובד עם המייל או הטלפון הזה');
  }
  await (db as any).employee.create({
    data: { full_name: fullName, email, phone, role, status: 'pending_approval' },
  });
  // Ping the owner so approval doesn't wait for him to stumble on it.
  try {
    const { pushoverToAdmins } = await import('../lib/pushover.js');
    await pushoverToAdmins('👥 עובד חדש ממתין לאישור', `${fullName} (${role}) נרשם דרך קישור ההצטרפות. אשר בניהול עובדים.`);
  } catch { /* non-fatal */ }
  return { ok: true };
}, { public: true });

// ADMIN — approve/reject a pending self-signup. Approval activates the
// Employee row, creates a User login with a temp password, and WhatsApps
// the employee their credentials.
registerFn('approveEmployee', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const emp = await (db as any).employee.findUnique({ where: { id: String(b.employee_id || '') } });
  if (!emp) throw new Error('employee_not_found');
  if (b.approve === false) {
    await (db as any).employee.update({ where: { id: emp.id }, data: { status: 'rejected' } });
    return { ok: true, status: 'rejected' };
  }
  await (db as any).employee.update({ where: { id: emp.id }, data: { status: 'active' } });
  // Login account — update-then-insert on email (see resendTenantWelcome for
  // why not ON CONFLICT).
  const tempPassword = `Team-${Math.floor(1000 + Math.random() * 9000)}`;
  let credsSent = false;
  try {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(tempPassword, 10);
    const existingUser = await (db as any).user.findFirst({ where: { email: emp.email } });
    if (existingUser) {
      await (db as any).user.update({ where: { id: existingUser.id }, data: { passwordHash: hash } });
    } else {
      await (db as any).user.create({
        data: { email: emp.email, passwordHash: hash, role: 'user', fullName: emp.full_name },
      });
    }
    if (emp.phone) {
      const brand = await getBrandName();
      const origin = process.env.PUBLIC_BASE_URL || `https://${process.env.TENANT_SLUG || 'topalena'}.topalena.com`;
      const { sendWhatsApp } = await import('../lib/twilio.js');
      await sendWhatsApp(emp.phone,
        `🎉 ${emp.full_name}, אושרת לצוות ${brand}!\n\n🔗 כניסה: ${origin}\n📧 מייל: ${emp.email}\n🔑 סיסמה זמנית: *${tempPassword}*\n(שנה/י אותה אחרי הכניסה הראשונה)`,
      );
      credsSent = true;
    }
  } catch (e: any) {
    console.warn('[approveEmployee] user/creds failed:', e?.message);
  }
  return { ok: true, status: 'active', creds_sent: credsSent };
});

// BP — Invite a new employee via WhatsApp. Owner enters name+phone, we
// create a PendingInvitation row + shoot the employee a WhatsApp with a
// link to a public completion form.
registerFn('inviteEmployeeViaWhatsApp', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const fullName = String(b.full_name || '').trim();
  const phone = String(b.phone || '').trim();
  if (!fullName || !phone) throw new Error('full_name and phone required');
  const brand = await getBrandName();
  const token = randomUUID().replace(/-/g, '').slice(0, 24);
  try {
    await (db as any).pendingInvitation.create({
      data: {
        token,
        full_name: fullName,
        phone,
        status: 'sent',
      },
    });
  } catch (e: any) {
    // Table might be missing — create it lazily
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PendingInvitation" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "token" TEXT NOT NULL UNIQUE,
        "full_name" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "email" TEXT,
        "role" TEXT,
        "status" TEXT NOT NULL DEFAULT 'sent',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TIMESTAMP(3)
      );
    `);
    await (db as any).pendingInvitation.create({
      data: { token, full_name: fullName, phone, status: 'sent' },
    });
  }
  const origin = process.env.PUBLIC_BASE_URL || `https://${process.env.TENANT_SLUG || 'topalena'}.topalena.com`;
  const link = `${origin}/EmployeeComplete?t=${token}`;
  const msg = `שלום ${fullName} 🌿\nהוזמנת להצטרף לצוות ${brand}.\nכדי להשלים את הפרטים (תפקיד, מייל) — לחץ כאן:\n${link}\n\nזה ייקח דקה 🚀`;
  try {
    const { sendWhatsApp } = await import('../lib/twilio.js');
    await sendWhatsApp(phone, msg);
  } catch (e: any) {
    console.warn('[inviteEmployeeViaWhatsApp] WhatsApp send failed:', e?.message);
  }
  return { ok: true, token, link };
});

// Public completion for an employee invitation. No auth — just the token.
registerFn('completeEmployeeInvitation', async ({ body }) => {
  const b = (body || {}) as any;
  const token = String(b.token || '');
  if (!token) throw new Error('token required');
  const invite: any = await (db as any).pendingInvitation.findFirst({ where: { token } }).catch(() => null);
  if (!invite) throw new Error('invitation not found');
  if (invite.status === 'completed') throw new Error('already completed');
  const email = String(b.email || '').trim();
  const role = String(b.role || '').trim();
  if (!email || !role) throw new Error('email and role required');
  await (db as any).pendingInvitation.update({
    where: { id: invite.id },
    data: { email, role, status: 'completed', completed_at: new Date() },
  });
  // Create the Employee row
  await (db as any).employee.create({
    data: {
      employee_name: invite.full_name,
      phone: invite.phone,
      email,
      role,
      status: 'active',
    },
  });
  return { ok: true };
}, { public: true });

// BP — Reset events/waiter Sales Kit system_prompt to the platform's
// default template. Used by the /EventsPrivate "אפס לפי הפרופיל שלי" button
// so tenants can wipe an inherited Alena-era prompt in one click.
registerFn('resetKitPrompt', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const kind = String(b.kind || 'events').toLowerCase();
  const table = kind === 'waiter' ? 'waiterKit' : 'eventSalesKit';
  const defaultPrompt = kind === 'waiter' ? WAITER_DEFAULT_PROMPT : DEFAULT_EVENTS_PROMPT;
  const existing: any = await (db as any)[table].findFirst({ where: { singleton: true } }).catch(() => null);
  if (existing?.id) {
    await (db as any)[table].update({ where: { id: existing.id }, data: { system_prompt: defaultPrompt } });
  } else {
    await (db as any)[table].create({ data: { singleton: true, system_prompt: defaultPrompt } });
  }
  return { ok: true, template: defaultPrompt };
});

// BP — Suggest job roles tailored to this tenant's business profile.
// Reads business_context and asks Gemini for 6-10 roles with sensible
// defaults (color, hourly rate, which shift types they typically work).
// The owner picks which to import → creates WorkPosition rows.
registerFn('suggestRoles', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const ctx = await businessContextBlock();
  const brand = await getBrandName();
  const prompt = `${ctx}הצע 6-10 תפקידים אופייניים לצוות של "${brand}" — לפי סוג העסק והמטבח. **חובה** להתייחס לפרופיל למעלה: בר יין → סומליה/ברמנים; בורגר בר → מלצרים/טבחים על הגריל; קפה → ברסיטות. אל תמציא תפקיד אקזוטי אם אין לו קונטקסט בפרופיל.\n\nלכל תפקיד: שם קצר בעברית, אימוג׳י, צבע (hex), שכר לשעה משוער בשקלים, ובאילו סוגי משמרות הוא נדרש (morning/noon/evening/night — כמערך).\n\nהחזר JSON: { roles: [{ name, emoji, color, hourly_rate_ils, shifts: string[] }] }`;
  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        roles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              emoji: { type: 'string' },
              color: { type: 'string' },
              hourly_rate_ils: { type: 'number' },
              shifts: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['roles'],
    },
    _ctx: { fn_name: 'suggestRoles' },
  });
  return result;
});

// BP — Suggest daily checklists per shift type based on business profile.
// Owner can import any subset → creates Checklist rows.
registerFn('suggestChecklists', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const ctx = await businessContextBlock();
  const brand = await getBrandName();
  const prompt = `${ctx}הצע צ'ק-ליסטים יומיים לצוות של "${brand}". **חובה** להתייחס לפרופיל למעלה: בר יין = ניקוי כוסות, בדיקת טמפרטורת מקררים, סידור בקבוקים. בורגר בר = ניקוי גריל, בדיקת שמנים. קפה = כיול מכונת אספרסו.\n\nחזור 3-5 צ׳ק-ליסטים סה"כ. לכל אחד: שם, מחלקה (מטבח/בר/מלצרים/מנהלים), משמרת (בוקר/ערב/סגירה/כל היום), ורשימת משימות (tasks) 4-8.\n\nהחזר JSON: { checklists: [{ name, department, shift, tasks: string[] }] }`;
  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        checklists: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              department: { type: 'string' },
              shift: { type: 'string' },
              // `tasks`, NOT `items` (Gemini keyword collision empties it).
              tasks: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['checklists'],
    },
    _ctx: { fn_name: 'suggestChecklists' },
  });
  const checklists = (result?.checklists || []).map((c: any) => ({
    name: c?.name, department: c?.department, shift: c?.shift,
    items: Array.isArray(c?.tasks) ? c.tasks : (Array.isArray(c?.items) ? c.items : []),
  }));
  return { checklists };
});

// BP — Import employees from an uploaded PDF/image/spreadsheet. Uses Gemini
// vision to extract structured rows. Returns candidates for owner review
// before writing to Employee table.
registerFn('importEmployeesFromFile', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const url = String(b.file_url || '').trim();
  if (!url) throw new Error('file_url required');
  const brand = await getBrandName();
  const prompt = `הקובץ המצורף הוא רשימת עובדים של מסעדת "${brand}". חלץ כל שורה כרשומת עובד.\n\nלכל עובד: שם מלא, טלפון (אם נמצא — normalize ל-05X-XXXXXXX), אימייל (אם נמצא), תפקיד (אם נמצא — מלצר/טבח/ברמן/מנהל וכו׳), סטטוס (active אם ברור, אחרת null).\n\nהחזר JSON בלבד: { employees: [{ full_name, phone, email, role, status }] }. אם שדה חסר — null.`;
  const result: any = await invokeLLM({
    prompt,
    fileUrls: [url],
    responseSchema: {
      type: 'object',
      properties: {
        employees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              full_name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
      required: ['employees'],
    },
    _ctx: { fn_name: 'importEmployeesFromFile' },
  });
  return result;
});

// BP — AI-assisted business profile composer. Takes whatever fields the
// owner has already filled in, plus the restaurant name, and asks Gemini
// to guess/complete the missing pieces so the owner sees a first draft they
// can edit. Returns { suggested: { business_type, cuisine_style, ... } }.
registerFn('composeBusinessProfileWithAi', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const cur = b.current || {};
  const brand = await getBrandName();
  const knownJson = JSON.stringify({
    restaurant_name: cur.restaurant_name || brand,
    business_type: cur.business_type || null,
    cuisine_style: cur.cuisine_style || null,
    address: cur.address || null,
    city: cur.city || null,
    target_audience: cur.target_audience || null,
    description: cur.description || null,
    menu_description: cur.menu_description || null,
    unique_selling_points: cur.unique_selling_points || null,
  }, null, 2);
  const prompt = `אתה יועץ מיתוג. הבעלים של המסעדה "${cur.restaurant_name || brand}" ממלא פרופיל עסק במערכת ניהול.
הנה מה שהוא כבר מילא (שדות null = ריקים):
${knownJson}

תפקידך: להשלים את השדות הריקים בהצעה סבירה על סמך שם המסעדה + מה שכבר יש. **אל תמציא שקרים** — אם אין מספיק מידע להעריך שדה, השאר null. הצעות טובות = משפט אחד, ספציפי, אמין. אל תכתוב "בקושי אפשר לדעת" — פשוט השאר null.

החזר JSON:
{
  "suggested": {
    "business_type": string או null,
    "cuisine_style": string או null,
    "target_audience": string או null,
    "description": string או null,
    "menu_description": string או null,
    "unique_selling_points": string או null   (שורה לכל אחד)
  }
}`;
  const result: any = await invokeLLM({
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        suggested: {
          type: 'object',
          properties: {
            business_type: { type: 'string' },
            cuisine_style: { type: 'string' },
            target_audience: { type: 'string' },
            description: { type: 'string' },
            menu_description: { type: 'string' },
            unique_selling_points: { type: 'string' },
          },
        },
      },
      required: ['suggested'],
    },
    _ctx: { fn_name: 'composeBusinessProfileWithAi' },
  });
  // Save the AI-composed context to the profile so getBusinessContext caches it
  // for subsequent AI calls (bright + coherent).
  try {
    const merged = { ...cur, ...(result?.suggested || {}) };
    const contextLines: string[] = [];
    contextLines.push(`שם המסעדה: ${cur.restaurant_name || brand}`);
    if (merged.business_type) contextLines.push(`סוג עסק: ${merged.business_type}`);
    if (merged.cuisine_style) contextLines.push(`סגנון מטבח: ${merged.cuisine_style}`);
    if (merged.target_audience) contextLines.push(`קהל יעד: ${merged.target_audience}`);
    if (merged.description) contextLines.push(`תיאור: ${merged.description}`);
    if (merged.menu_description) contextLines.push(`תפריט: ${merged.menu_description}`);
    if (merged.unique_selling_points) contextLines.push(`יתרונות ייחודיים: ${merged.unique_selling_points}`);
    const businessContext = contextLines.join('\n');
    // Only write if a profile row exists; otherwise wait for the owner to Save.
    const existing: any = await (db as any).restaurantProfile.findFirst({});
    if (existing?.id) {
      await (db as any).restaurantProfile.update({
        where: { id: existing.id },
        data: { business_context: businessContext },
      });
    }
    invalidateBusinessContextCache();
  } catch (e: any) {
    console.warn('[composeBusinessProfileWithAi] cache write failed', e?.message);
  }
  return result;
});

// Admin only. Toggles a single module for this tenant.
// Core modules cannot be toggled — the function throws for them.
registerFn('updateMyTenantModule', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole((user as any)?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const module_key = String(b.module_key || '');
  const enabled = !!b.enabled;
  if (!module_key) throw new Error('module_key required');
  const def = MODULE_CATALOG.find(m => m.key === module_key);
  if (!def) throw new Error('unknown module');
  if (def.core) throw new Error('core module cannot be toggled');
  await ensureModuleSettingTable();
  await (prisma as any).moduleSetting.upsert({
    where: { module_key },
    update: { enabled, enabled_at: new Date() },
    create: { module_key, enabled, enabled_at: new Date() },
  });
  return { ok: true, module_key, enabled };
});

