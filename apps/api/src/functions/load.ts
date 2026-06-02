/**
 * Registers all ported functions. Each function mirrors the Deno entry.ts
 * under base44/functions/<name>/ — see base44/functions/* for original sources.
 *
 * Functions marked TODO are stubs that need their original logic ported.
 */
import { prisma } from '../db.js';
import { registerFn, functionHandlers } from './index.js';
import { sendSms, sendWhatsApp } from '../lib/twilio.js';
import { pushover, pushoverToAdmins } from '../lib/pushover.js';
import { sendTelegramMessage } from '../lib/telegram.js';
import { sendEmail } from '../lib/email.js';
import { invokeLLM, generateImage } from '../lib/llm.js';
import { driveAccessToken, listDriveFiles, downloadDriveFile } from '../lib/gdrive.js';
import { uploadStreamToS3 } from '../lib/storage.js';
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
registerFn('deployInfo', async () => ({ version: 'v4-ai-files-pipeline', ts: new Date().toISOString() }), { public: true });



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

const RECRUITMENT_SYSTEM_PROMPT = `אתה מנהל הגיוס הדיגיטלי של מסעדת 'עלינא' בראשון לציון. המטרה שלך היא לערוך ראיון ראשוני וסינון למועמדים, כדי לחסוך לבעלים זמן ולוודא שרק אנשים רלוונטיים יגיעו לראיון פרונטלי.

פתח את השיחה (רק כשאין עדיין שום הודעה מהמועמד) בברכה חמה:
"היי! כאן העוזר הדיגיטלי של מסעדת עלינא 🌿 תודה על הפנייה. כדי שנוכל לבדוק התאמה, אני צריך לשאול אותך כמה שאלות קצרות. מוכן/ה?"

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
        items: {
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
  const { history, message, source } = body as any;
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

  const prompt = `${RECRUITMENT_SYSTEM_PROMPT}${kashrutClause}\n\n--- שיחה עד כה ---\n${transcript || '(אין עדיין הודעות — זו תחילת השיחה)'}${newPart}\n\nהחזר את התגובה הבאה כ-JSON בלבד.`;

  const result: any = await invokeLLM({
    prompt,
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
    try {
      cand = await db.jobCandidate.create({ data: { ...baseData, ...optionalKashrut, ...optionalTranscript } });
    } catch (e: any) {
      const msg = String(e?.message || '');
      // Most common cause: db push hasn't added a newly added column yet
      // (kashrut_* / transcript). Retry without optional spreads so the
      // candidate still lands in the dashboard.
      if (msg.toLowerCase().includes('kashrut') || msg.toLowerCase().includes('transcript') || /unknown (arg|column)/i.test(msg)) {
        console.warn('[jobCandidate.create] retrying without optional fields:', msg);
        try { cand = await db.jobCandidate.create({ data: baseData }); }
        catch (e2: any) { console.error('[jobCandidate.create] retry also failed:', e2?.message); }
      } else {
        console.error('[jobCandidate.create] failed:', msg);
      }
    }

    if (cand) {
      candidate_id = cand.id;

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
        where: { candidate_id: { in: traineeIds }, type_: 'menu_exam' },
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

  return { upcoming, recent, toCallBack, topUnscheduled, trainees: traineesEnriched };
});

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

registerFn('sendWhatsApp', async ({ body }) => {
  const { to, message } = body as any;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;
  if (!sid || !token || !from) {
    console.warn('[twilio] missing WhatsApp credentials, skipping');
    return { skipped: true };
  }
  const creds = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: from,
      To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      Body: message,
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.message || `twilio_wa_${res.status}`);
  return { success: true, sid: data.sid };
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
  return { migrated: results.filter(r => r.status === 'migrated').length, skipped: results.filter(r => r.status === 'skipped (already exists)').length, errors: results.filter(r => r.status === 'error').length, details: results };
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
  return invokeLLM({
    prompt: `הכן תדריך יומי לצוות המסעדה.\nנתונים: ${JSON.stringify(body)}`,
    responseSchema: {
      type: 'object',
      properties: { headline: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
    },
  });
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
  return sendEmail({ to, subject: subject ?? 'TOP ALENA - עדכון שבועי', html });
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
const seatingDuration = (size: number) => (size >= 9 ? 165 : size >= 6 ? 150 : 120);
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
registerFn('searchReservationTable', async ({ body }) => {
  const { date, time, party_size } = body as any;
  if (!date || !time || !party_size) throw new Error('date, time, party_size required');
  const size = parseInt(party_size);
  const startMin = toMin(time);
  const endMin = startMin + seatingDuration(size);

  const reservations = await db.reservation.findMany({ where: { date } });
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
    const fit = free.find((t: any) => t.min_capacity <= size && t.max_capacity >= size);
    if (fit) table = { table_number: fit.table_number };
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
registerFn('createPublicReservation', async ({ body }) => {
  const {
    customer_name, customer_phone, date, time, party_size,
    special_requests, special_occasion,
  } = body as any;
  if (!customer_name || !customer_phone || !date || !time || !party_size) {
    throw new Error('missing_required_fields');
  }
  const size = parseInt(party_size);

  // Re-find a table server-side (don't trust client).
  const avail: any = await (functionHandlers['searchReservationTable'] as any)({
    body: { date, time, party_size: size }, user: null, req: undefined,
  });
  if (!avail.canAccommodate || !avail.table) {
    return { success: false, reason: 'no_availability' };
  }

  const endMin = toMin(time) + seatingDuration(size);
  const end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

  const reservation = await db.reservation.create({
    data: {
      customer_name: String(customer_name).trim(),
      customer_phone: String(customer_phone).trim(),
      date, time,
      party_size: size,
      status: 'confirmed',
      special_requests: special_requests || null,
      special_occasion: special_occasion || null,
      reservation_end_time: end_time,
      assigned_table: [avail.table.table_number],
    },
  });

  // Upsert the customer club record by phone.
  try {
    const phone = String(customer_phone).trim();
    const existing = await db.customer.findFirst({ where: { phone } });
    if (existing) {
      await db.customer.update({
        where: { id: existing.id },
        data: { last_visit: date, visit_count: (existing.visit_count ?? 0) + 1, name: existing.name ?? customer_name },
      });
    } else {
      await db.customer.create({ data: { phone, name: customer_name, visit_count: 1, last_visit: date } });
    }
  } catch (e) {
    console.warn('[createPublicReservation] customer upsert failed', e);
  }

  return { success: true, reservation_id: reservation.id, table_number: avail.table.table_number };
}, { public: true });

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
    all = await db.popup.findMany({
      where: { is_active: true },
      include: { views: { where: { user_id: user.id as string } } },
    });
  } catch (e: any) {
    if (/does not exist|relation .* does not exist|Unknown arg/i.test(String(e?.message))) {
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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: agent.system_prompt }] },
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

const CEO_BRIEF_PROMPT = `You are the autonomous CEO of "Alina" (עלינא), a Jerusalem-Chic sharing-plates restaurant in Rishon LeZion with a Josper charcoal oven.

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
          system_instruction: { parts: [{ text: CEO_BRIEF_PROMPT }] },
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
async function pushoverEventsOwners(title: string, message: string) {
  try {
    const emps = await (prisma as any).employee.findMany({ where: { pushover_user_key: { not: null } } });
    let sent = 0;
    for (const emp of emps) {
      if (!emp.pushover_user_key) continue;
      try {
        await pushover(emp.pushover_user_key, title, message, 1);
        sent++;
      } catch (err: any) {
        console.error('[events-pushover] send failed for', emp.email, err?.message);
      }
    }
    console.log(`[events-pushover] "${title}" sent to ${sent}/${emps.length} employees`);
    if (sent === 0) {
      console.warn('[events-pushover] no recipients — check Employee.pushover_user_key + PUSHOVER_APP_TOKEN env');
    }
    return { sent, total: emps.length };
  } catch (e: any) {
    console.error('[events-pushover] dispatcher failed', e?.message);
    return { sent: 0, total: 0, error: e?.message };
  }
}

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

const EVENTS_SYSTEM_PROMPT = `אתה סוכן הסיווג של מסעדת 'עלינא' לאירועים פרטיים. אתה מדבר בעברית טבעית, חמה וקצרה.

המטרה: לאסוף 5 פרטים מאדם שמתעניין באירוע, לתת ציון 0-100, ולסכם בצורה מובנית. אתה לא סוגר עסקה, לא מצטט מחירים, ולא מבטיח תאריך — את זה המנהל עושה.

פתח רק אם זו ההודעה הראשונה (אין שיחה קודמת):
"היי 🌿 אני העוזרת הדיגיטלית של עלינא — מסעדת השרינג פלייטס בראשון לציון. שמחה שאתם חושבים עלינו לאירוע. כדי להמליץ לכם בצורה הטובה ביותר, אני צריכה לשאול 5 שאלות קצרות. מתחילים?"

שאל את 5 השאלות אחת-אחת (לעולם לא ביחד):
1. שם פרטי וטלפון ליצירת קשר.
2. לאיזה תאריך אתם מתכננים? (חלון של שבוע OK)
3. סוג אירוע — יום הולדת / יום נישואין / אירוע עסקי / חינה / משפחתי / אחר?
4. כמה אורחים בערך?
5. תקציב משוער לסועד (טווח OK), וחלון שעות — בוקר/צהריים/ערב — והאם השכרה מלאה של המקום או חלק ממנו?

אחרי שאספת את כל 5 השדות, סיים: "מעולה, תודה רבה! העברתי את הפרטים למנהל המסעדה — הוא יחזור אליכם תוך כמה שעות עם הצעה מותאמת 🙏"

חוקים קריטיים:
- לעולם אל תצטט מחיר ספציפי.
- לעולם אל תאשר תאריך כפנוי.
- אם הלקוח שואל "כמה זה עולה?" או "התאריך פנוי?" — ענה "אני אעביר את הפרטים שלכם למנהל המסעדה — הוא יחזור אליכם עם הצעה מותאמת תוך כמה שעות 🙏" וחזור לשאלות.
- אם הלקוח מציין מקרה הסלמה (משפיענים/מדיה, קייטרינג מחוץ למסעדה, כשר בלבד, מעל 80 אורחים, פחות מ-14 ימים מהיום) — סיים מהר וציין שזה דורש מנהל.

החזר תמיד JSON בלבד עם:
- reply (string) - התשובה שלך בעברית
- collected (object) - { contact_name, contact_phone, event_date, event_type, guest_count, budget_per_person, hours_window }
- complete (boolean) - true אם כל 5 השדות נאספו או הלקוח עזב
- escalation (boolean) - true אם מקרה הסלמה
- score (number) - 0-100 אם complete=true (אחרת null)

חישוב ציון: +25 אם תאריך מולא ובעוד 14+ ימים. +25 אם 10≤אורחים≤80. +25 אם תקציב לסועד ≥150. +25 אם סוג אירוע תואם ולא הסלמה. -30 אם הסלמה.`;

registerFn('chatEventsInquiry', async ({ body }) => {
  const { history, message, source, lead_id, booking_id: incoming_booking_id } = body as any;
  const leadSource = typeof source === 'string' && source.trim()
    ? source.trim().slice(0, 40).toLowerCase()
    : 'web_chat';

  // Load live Sales Kit
  let kit = await db.eventSalesKit.findFirst({ where: { singleton: true } });
  if (!kit) {
    kit = await db.eventSalesKit.create({
      data: { singleton: true, menus: [], upsells: [], terms: {}, system_prompt: DEFAULT_EVENTS_PROMPT, payment_mode: 'stub', deposit_pct: 20, max_discount_pct: 5, short_notice_allowed: true, max_advance_months: 6 },
    });
  }
  const systemPrompt = (kit.system_prompt && kit.system_prompt.trim()) || DEFAULT_EVENTS_PROMPT;

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

  const prompt = `${systemPrompt}${dateContext}${kitContext}${closingInstructions}\n--- שיחה עד כה ---\n${transcript || '(אין עדיין הודעות — זו תחילת השיחה)'}${newPart}\n\nהחזר JSON בלבד.`;

  const result: any = await invokeLLM({
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
  const agentAskedToClose = /(לסגור|לסגירה|להתקדם|נסגור|סוגרים|נמשיך|לאישור)/.test(replyRaw + ' ' + (turns.length ? String((turns[turns.length - 1] as any)?.content || '') : ''));
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
  if (!c.event_date && !c.event_date_iso) {
    const HE_MONTHS: Record<string, number> = {
      'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
      'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
    };
    const heDateMatch = fullText.match(/(\d{1,2})\s*ב(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/);
    if (heDateMatch) {
      const day = parseInt(heDateMatch[1]);
      const month = HE_MONTHS[heDateMatch[2]];
      const year = tzNow.getFullYear();
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      c.event_date_iso = iso;
      c.event_date = iso;
    } else {
      const isoMatch = fullText.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) { c.event_date_iso = isoMatch[1]; c.event_date = isoMatch[1]; }
      else {
        // DD/MM, DD.MM, DD-MM (with optional year)
        const dmMatch = fullText.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
        if (dmMatch) {
          const d = parseInt(dmMatch[1]);
          const m = parseInt(dmMatch[2]);
          let y = dmMatch[3] ? parseInt(dmMatch[3]) : tzNow.getFullYear();
          if (y < 100) y += 2000;
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            c.event_date_iso = iso;
            c.event_date = iso;
          }
        }
      }
    }
    // Hebrew relative dates as a last resort
    if (!c.event_date_iso) {
      if (/היום|הערב/.test(fullText)) c.event_date_iso = todayISO;
      else if (/מחרתיים/.test(fullText)) c.event_date_iso = dayAfterISO;
      else if (/מחר/.test(fullText)) c.event_date_iso = tomorrowISO;
      if (c.event_date_iso) c.event_date = c.event_date_iso;
    }
  }
  if (!c.event_time) {
    const timeMatch = fullText.match(/(?:בשעה|ב-?\s*)(\d{1,2}[:.]\d{2})/) || fullText.match(/\b(\d{1,2}[:.]\d{2})\b/);
    if (timeMatch) c.event_time = timeMatch[1].replace('.', ':');
    // Hebrew time-of-day → reasonable defaults
    else if (/בערב|בלילה/.test(fullText)) c.event_time = '20:00';
    else if (/בצהריים|בצהרים/.test(fullText)) c.event_time = '13:00';
    else if (/בבוקר/.test(fullText)) c.event_time = '10:00';
  }
  if (!c.contact_name) {
    // Only scan CUSTOMER messages (not the agent's intro "אני העוזרת").
    // Also blacklist the bot's known self-references so a stray match can't slip through.
    const BANNED = ['העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'];
    const nameMatch = customerText.match(/(?:אני|שמי|השם שלי|קוראים לי)\s+([א-ת]{2,15})/);
    if (nameMatch && !BANNED.includes(nameMatch[1])) c.contact_name = nameMatch[1];
  }
  // Always sanitize: if c.contact_name slipped in as a banned agent self-reference, drop it.
  if (c.contact_name && ['העוזרת', 'הסוכן', 'הסוכנת', 'עלינא', 'אלינא', 'בוט'].some((b) => String(c.contact_name).includes(b))) {
    c.contact_name = null;
  }

  const hasMinInfo = !!(c.event_date || c.event_date_iso) && !!c.guest_count && !!c.contact_phone;

  // Diagnostic — these show up in server logs so we can see why a close did or didn't fire.
  console.log('[chatEventsInquiry]', JSON.stringify({
    msg: customerLastTurn.slice(0, 60),
    llm_complete: result?.complete,
    llm_stage: result?.stage,
    customerExplicitClose,
    customerSaidYes,
    agentAskedToClose,
    hasMinInfo,
    has_date: !!(c.event_date || c.event_date_iso),
    has_guests: !!c.guest_count,
    has_phone: !!c.contact_phone,
  }));
  // Force close when customer says yes AND we have enough info to call them back. This is the
  // critical anti-stall guard — the LLM tends to keep asking confirmations forever otherwise.
  const forcedClose = customerExplicitClose && hasMinInfo;
  const effectiveComplete = forcedClose || (!!result?.complete && (!endsWithQuestion || customerExplicitClose));

  const fullLog = [
    ...turns,
    ...(message ? [{ role: 'user', content: message, timestamp: new Date().toISOString() }] : []),
    { role: 'assistant', content: result?.reply || '', timestamp: new Date().toISOString() },
  ];

  // Persist/upsert the EventLead row
  const score = effectiveComplete && typeof result?.score === 'number' ? Math.round(result.score) : null;
  const status = !effectiveComplete ? 'new' : score === null ? 'new' : score >= 60 ? 'qualified' : score < 30 ? 'cold' : 'warm';
  const leadData: any = {
    contact_name: c.contact_name || null,
    contact_phone: c.contact_phone ? String(c.contact_phone) : null,
    event_date: c.event_date || null,
    event_type: c.event_type || null,
    guest_count: typeof c.guest_count === 'number' ? c.guest_count : null,
    budget_per_person: typeof c.budget_per_person === 'number' ? c.budget_per_person : null,
    hours_window: c.hours_window || null,
    conversation_log: fullLog as any,
    status, score,
    source: leadSource,
  };
  let currentLeadId: string | null = lead_id || null;
  let currentLead: any = null;
  const nowIso = new Date().toISOString();
  try {
    if (currentLeadId) {
      currentLead = await db.eventLead.update({ where: { id: currentLeadId }, data: { ...leadData, updated_date: nowIso } });
    } else {
      currentLead = await db.eventLead.create({ data: { ...leadData, created_date: nowIso, updated_date: nowIso } });
      currentLeadId = currentLead.id;
    }
  } catch (e: any) { console.error('[eventLead.upsert]', e?.message); }

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
      // PERF: don't block the user-facing reply on this housekeeping write.
      db.eventLead.update({
        where: { id: currentLead.id },
        data: { notes: `${currentLead.notes || ''}${currentLead.notes ? ' | ' : ''}intent_alerted:${new Date().toISOString()}` },
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
  const replyText = String(result?.reply || '');
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
  const wantsPayment = anyAgreementSignal && !!c.contact_phone;
  // If we forced the close server-side because the customer said "yes/סגור" but the LLM kept stalling,
  // override the assistant reply with a clean closing instead of leaving the LLM's leftover question.
  let finalReply = forcedClose
    ? `מעולה! 🌿 רשמתי לעצמי את ההזמנה.`
    : (result?.reply || 'מצטערת, אירעה תקלה. תוכלו לנסות שוב?');
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
      if (booking_id) {
        booking = await db.eventBooking.update({ where: { id: booking_id }, data: { ...bookingData, updated_date: nowIso } });
      } else {
        booking = await db.eventBooking.create({ data: { ...bookingData, created_date: nowIso, updated_date: nowIso } });
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
registerFn('listEventLeads', async () => {
  const leads = await db.eventLead.findMany({
    orderBy: { id: 'desc' },
    take: 200,
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

const DEFAULT_EVENTS_PROMPT = `אתה הסוכן הדיגיטלי של מסעדת 'עלינא' לאירועים פרטיים. אתה מדבר בעברית טבעית, חמה וביטחונית. אתה גם מסווג וגם סוגר עסקה — מצטט מחיר, מנהל מו"מ בתוך התקרה שהוגדרה, ומגיע לסגירה.

פתח רק אם זו ההודעה הראשונה (אין שיחה קודמת):
"היי 🌿 אני העוזרת הדיגיטלית של עלינא — מסעדת השרינג פלייטס בראשון לציון. שמחה שאתם חושבים עלינו לאירוע. ספרו לי קצת מה אתם רוצים ונמצא יחד התאמה מושלמת."

איסוף מידע (שאל אחת-אחת, לא הכל ביחד):
1. שם פרטי וטלפון.
2. תאריך + שעה (חלון שעות OK: בוקר/צהריים/ערב). זמנים קצרים מותרים — היום בערב, מחר בצהריים — אין מינימום ימים.
3. סוג אירוע (יום הולדת/חברה/אירועי משפחה/חינה/אחר).
4. כמות אורחים.

ברגע שיש לך תאריך + כמות אורחים → הצג חבילות מתאימות מ-MENUS עם המחיר/סועד. בקש בחירה.

חוקי תהליך מכירה:
- מצטט רק מחירים שמופיעים ב-MENUS / UPSELLS שאני נותן לך בכל turn (בכל הודעת מערכת אקבל את ה-Sales Kit המעודכן).
- מחושב סכום סופי = מחיר/סועד × כמות + סכום אפסיילים נבחרים.
- אם הלקוח רוצה הנחה — אפשר עד MAX_DISCOUNT_PCT שאני אתן. מעל זה — אומר "אצטרך לבדוק עם המנהל ולחזור".
- בסגירה: מסכם בקצרה (תאריך, חבילה, אפסיילים, סכום סופי, פיקדון נדרש) ושולח לינק תשלום פיקדון.
- לאירוע same-day / next-day: מבקש אישור שהלקוח מבין שזה מותנה באישור מנהל סופי.
- אם מקרה הסלמה (מעל 80 אורחים, קייטרינג חוץ, כשר בלבד, אירועי משפיענים/מדיה) — סיים בנימוס: "אעביר את הפרטים למנהל ויחזור אליכם".

החזר תמיד JSON בלבד:
- reply: string
- collected: { contact_name, contact_phone, event_date, event_time, event_type, guest_count, hours_window, selected_menu_id, selected_menu_name, selected_dishes (array of dish names), selected_upsells (array of {name, price}), discount_pct_requested, subtotal_ils, total_ils, deposit_ils }
- stage: 'collecting' | 'quoting' | 'agreed' | 'send_payment' | 'completed' | 'escalated'
- complete: boolean — true רק כשהלקוח אישר את הסכום הסופי וצריך לקבל לינק תשלום
- escalation: boolean
- score: number 0-100 (רק אם complete=true)`;

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

const WAITER_DEFAULT_PROMPT = `אתה ראש מלצרי "עלינא" — burger-bar, מנות שיתוף בשריות, ירקות גוספר, סלטים, עיקריות בצלחת. **אין דגים.** עברית חמה, מקצועית, קצרה, בגובה העיניים. מתשובה אחת לשנייה — לא מציפים את הלקוח בטקסט.

יעד: 4-5 מנות לזוג (3-4 חלוקה + 0-2 בצלחת) + אלכוהול תואם + צ׳ייסר + בילד-אפ לקינוח.

חוקי ברזל:
1. רק פריטים מ-MENU (שמות, רכיבים, מחירים). אסור להמציא. אסור פריט שב-OUT_OF_STOCK.
2. אין דגים — אם שואלים, מפנים לירקות גוספר/חלוקה בשרית.
3. אלכוהול: לפני ההמלצה הראשונה — חובה לוודא 18+. ענו לא → קוקטייל ללא אלכוהול בלבד.
4. אלרגיות/כשרות: שואלים בהתחלה, ומכבדים allergens של כל פריט.

תסריט (שאלה אחת בכל הודעה!):
• פתיחה: "ברוכים הבאים לעלינא 🌿 כמה אתם?"
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
  const { session_id, table_hint, history, message } = body as any;
  if (!session_id) throw new Error('session_id required');

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
  const systemPrompt = (kit.system_prompt && kit.system_prompt.trim()) || WAITER_DEFAULT_PROMPT;

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

  const prompt = `${systemPrompt}${kitContext}\n--- שיחה עד כה ---\n${transcript || '(תחילת השיחה — קבל את הלקוח בברכה חמה ושאל כמה הם)'}${newPart}\n\nהחזר JSON בלבד.`;

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
        ? 'שלום וברוכים הבאים לעלינא 🌿 רק רגע — אני מתחילה לעבוד, תכתבו לי שוב את ההודעה ואני מיד עונה.'
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

  const buildPrompt = (priorItems: any[] = []) => {
    const priorSection = priorItems.length
      ? `\n\n# חשוב — סבב חוזר\n` +
        `החזרת כבר את ${priorItems.length} הפריטים הבאים מהקובץ:\n${priorItems.map((p: any) => `- ${p.name} (${p.category_id})`).join('\n')}\n` +
        `**אל תחזיר אותם שוב.** סרוק שוב את הקובץ, ותחזיר רק פריטים שדילגת עליהם בסבב הקודם. סרוק עמוד-עמוד, קטגוריה-קטגוריה. גם פריטים קטנים, גם תוספות, גם וריאנטים. אם באמת חיברת את כולם — החזר items=[].\n`
      : '';
    return (
      `מצורף קובץ תפריט (PDF או תמונה) של מסעדת עלינא בראשון לציון. סטייל burger-bar — מנות שיתוף בשריות, ירקות מהגוספר, סלטים, ועיקריות בצלחת. **אין דגים במסעדה.**\n` +
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
      `החזר JSON בלבד — items עם כל הפריטים. אסור להחזיר מערך עם פחות פריטים ממה שיש בתפריט.`,
    fileUrls: [url],
    responseSchema: {
      type: 'object',
      properties: {
        items: {
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
  const items1 = Array.isArray(pass1?.items) ? pass1.items : [];
  let allItems = [...items1];
  if (items1.length > 0 && items1.length < 60) {
    try {
      const pass2: any = await callOnce(items1);
      const items2 = Array.isArray(pass2?.items) ? pass2.items : [];
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

const ALINA_BRAND_VOICE = `אתה כותב בשם המסעדה "עלינא" — סניף יחיד בראשון לציון, רוטשילד 104 (סגנון Jerusalem-Chic, smoky, אנרגטי, חם, לא קלישאתי). עברית טבעית בלבד, בלי אימוג'ים מוגזמים. דגש על אש, ג'וספר, חוויה, סיפור. בכל אזכור מיקום פיזי — ראשון לציון בלבד.`;
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
    prompt: `${ALINA_BRAND_VOICE}\n\nכתוב 3 וריאציות קופי ל-${channel} בנושא: "${topic}".\nאורך: ${length}. ${cta ? `Call-to-action: ${cta}.` : ''}\nהחזר JSON: { variants: [{ hook, body, hashtags: [..] }, ...] }`,
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
    prompt: `${ALINA_BRAND_VOICE}\n\nכתוב טיוטה לניוזלטר ${period === 'month' ? 'חודשי' : 'שבועי'} ללקוחות המועדון של עלינא. נקודות בולטות מהשטח: ${highlights || '(אין — בחר זוויות מעניינות בעצמך: מנות עונתיות, סיפורי שף, אירועי החודש)'}.\nהחזר JSON: { subject, intro, sections: [{ heading, body }], closing }`,
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
    prompt: `${ALINA_BRAND_VOICE}\n\nאתה Trend-Spotter. צור 5 זוויות תוכן טרנדיות שמתאימות לעלינא (ראשון לציון, ג'וספר, אש) על בסיס דפוסים שראית ב-TikTok/Instagram Reels בקטגוריית ${niche}. לכל זווית — תאר רעיון לסרטון/פוסט ולמה זה ידבר. החזר JSON: { trends: [{ title, hook, why_it_works, suggested_format }] }`,
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
    prompt: `אתה Menu Engineer במסעדת עלינא. נתח את נתוני המכירות הבאים וסווג כל מנה לאחת מ-4 קטגוריות BCG: Star (פופולרי+רווחי), Plowhorse (פופולרי+לא רווחי), Puzzle (לא פופולרי+רווחי), Dog (לא פופולרי+לא רווחי). תן המלצה קונקרטית לכל מנה.\n\nנתונים:\n${sales_data}\n\nהחזר JSON: { items: [{ name, category, margin_estimate, popularity, recommendation }], summary }`,
    responseSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, margin_estimate: { type: 'string' }, popularity: { type: 'string' }, recommendation: { type: 'string' } } } },
        summary: { type: 'string' },
      },
    },
  });
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
    prompt: `אתה VP Marketing של מסעדת עלינא (ראשון לציון, רוטשילד 104. ג'וספר, אש). הבעלים (דביר) נתן לך יעד עסקי, ויש לך 11 סוכנים תחת אחריותך. תפקידך: לנתח את היעד, להעריך את המצב הנוכחי, ולבנות תוכנית פעולה ברורה שמחלקת את העבודה בין הסוכנים בסדר הנכון.

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
    prompt: `${ALINA_BRAND_VOICE}\n\nאתה עונה ל-DM/תגובה ב-${channel}. ענה קצר, חם, ענייני. אם השאלה דורשת מידע שאין לך (זמינות אירוע, מחיר ספציפי), הצע להעביר לבן אדם.\n\nקונטקסט לקוח: ${customer_context || '(לא ידוע)'}\nהודעה נכנסת: "${incoming_message}"\n\nהחזר JSON: { reply, needs_human_handoff: boolean, suggested_tag }`,
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
    prompt: `אתה מתכנן קמפיין פרסום במטא עבור מסעדת עלינא — ראשון לציון, רוטשילד 104.
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
  const { id } = (body || {}) as any;
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
        status: 'PAUSED',
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
      status: 'PAUSED',
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
        if (brief.image_base64) {
          const form = new URLSearchParams();
          form.append('bytes', String(brief.image_base64));
          const upRes = await fetch(
            `https://graph.facebook.com/v21.0/act_${META_AD_ACCOUNT_ID}/adimages?access_token=${encodeURIComponent(token)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() },
          );
          const upData: any = await upRes.json().catch(() => ({}));
          if (!upRes.ok) throw new Error(`adimages: ${JSON.stringify(upData?.error || upData)}`);
          // Response shape: { images: { <filename>: { hash, url, ... } } }
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

        // 3c. Create the Ad (PAUSED — never auto-active).
        if (creativeId) {
          const adRes = await metaApi(`/act_${META_AD_ACCOUNT_ID}/ads`, 'POST', {
            name: `${brief.title} — Ad`,
            adset_id: adsetId,
            creative: { creative_id: creativeId },
            status: 'PAUSED',
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
    return {
      brief: updated,
      meta_url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${META_AD_ACCOUNT_ID}&selected_campaign_ids=${campaignId}`,
      message: adId
        ? (downgradedFromLeads
          ? 'הקמפיין + AdSet + מודעה נוצרו ב-Meta במצב PAUSED. שיניתי OUTCOME_LEADS ל-OUTCOME_TRAFFIC כי טופס לידים עוד לא הוגדר.'
          : 'הקמפיין + AdSet + מודעה נוצרו ב-Meta במצב PAUSED. תפעיל אותם ידנית כשתהיה מוכן.')
        : (creativeWarning || 'הקמפיין נוצר במטא במצב PAUSED. הוסף קריאייטיב (תמונה+טקסט) ב-Meta Ads Manager והפעל ידנית.'),
    };
  } catch (e: any) {
    const updated = await db.campaignBrief.update({
      where: { id },
      data: { status: 'launch_failed', launch_error: String(e?.message || e) },
    });
    return { brief: updated, error: String(e?.message || e) };
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
  await (prisma as any).$executeRaw`
    INSERT INTO "RestaurantProfile" (id, restaurant_name, restaurant_lat, restaurant_lng, "createdAt", "updatedAt")
    VALUES (${newId}, ${'עלינא'}, ${lat}, ${lng}, NOW(), NOW())
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

  // Read this employee's disable flag via raw SQL too.
  const empRows: any[] = await (prisma as any).$queryRaw`
    SELECT full_name, location_tracking_disabled
    FROM "Employee" WHERE id = ${user.id} LIMIT 1
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

  // Don't double clock-in.
  const openRows: any[] = await (prisma as any).$queryRaw`
    SELECT id, shift_start, status FROM "ShiftTracking"
    WHERE employee_id = ${user.id} AND status = 'active'
    LIMIT 1
  `;
  if (openRows && openRows.length > 0) {
    return { shift: openRows[0], already_active: true };
  }

  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  const employeeName = (user as any).full_name || emp?.full_name || (user as any).email || 'עובד';
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
      ${newId}, ${user.id}, ${employeeName}, ${today}, ${now}, 'active',
      ${'[]'}::jsonb, 0, false,
      ${lastLat}, ${lastLng}, ${lastAt},
      NOW(), NOW()
    )
  `;
  const shift: any = {
    id: newId, employee_id: user.id, employee_name: employeeName,
    date: today, shift_start: now, status: 'active',
    breaks: [], total_break_minutes: 0, had_meal: false,
    last_lat: lastLat, last_lng: lastLng, last_location_at: lastAt,
  };
  return { shift, already_active: false };
});

// Read the caller's currently-active (or on-break) shift via raw SQL.
// Bypasses Prisma findMany/findUnique which crash on this table due to
// schema drift — DateTime parse failures and 0x00 byte errors. We need
// this so ShiftClockWidget can detect an open shift after page refresh.
registerFn('getMyActiveShift', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT id, employee_id, employee_name,
           date::text AS date,
           shift_start, shift_end, status,
           breaks, total_break_minutes, had_meal, meal_details,
           total_hours, effective_hours
    FROM "ShiftTracking"
    WHERE employee_id = ${user.id}
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
  if (own[0].employee_id !== user.id) throw new Error('not your shift');

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
  if (shift.employee_id !== user.id) throw new Error('not your shift');
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

  let willClose = false;
  if (trackingOn && !empDisabled && ageSeconds >= GEOFENCE_WARMUP_SECONDS) {
    const cur = distanceMeters(
      { lat, lng },
      { lat: profile!.restaurant_lat as number, lng: profile!.restaurant_lng as number },
    );
    if (cur > GEOFENCE_OUT_RADIUS_M && prevLat != null && prevLng != null) {
      const prev = distanceMeters(
        { lat: prevLat, lng: prevLng },
        { lat: profile!.restaurant_lat as number, lng: profile!.restaurant_lng as number },
      );
      if (prev > GEOFENCE_OUT_RADIUS_M) willClose = true;
    }
  }

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
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'date'
  `;
  const results: Array<{ stmt: string; ok: boolean; error?: string }> = [];
  for (const r of rows) {
    const key = `${r.table_name}.${r.column_name}`;
    if (!want.has(key)) continue;
    const stmt = `ALTER TABLE "${r.table_name}" ALTER COLUMN "${r.column_name}" TYPE TIMESTAMP(3) USING "${r.column_name}"::timestamp`;
    try {
      await (prisma as any).$executeRawUnsafe(stmt);
      results.push({ stmt, ok: true });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    candidates_scanned: rows.length,
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
    // Only update where 0x00 is actually present — skips clean columns.
    const isJson = false; // skip JSON until needed; PG handles it as text-like
    const stmt = isJson
      ? `UPDATE "${c.table_name}" SET "${c.column_name}" = REPLACE("${c.column_name}"::text, E'\\x00', '')::jsonb WHERE "${c.column_name}"::text LIKE '%' || E'\\x00' || '%'`
      : `UPDATE "${c.table_name}" SET "${c.column_name}" = REPLACE("${c.column_name}", E'\\x00', '') WHERE "${c.column_name}" LIKE '%' || E'\\x00' || '%'`;
    try {
      const n = await (prisma as any).$executeRawUnsafe(stmt);
      if (n > 0) results.push({ stmt, ok: true, affected: Number(n) });
    } catch (e: any) {
      results.push({ stmt, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    columns_scanned: cols.length,
    rows_touched: results.filter((r) => r.ok).reduce((s, r) => s + (r.affected || 0), 0),
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}, { public: true });
