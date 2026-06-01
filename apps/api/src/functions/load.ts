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
import { invokeLLM } from '../lib/llm.js';
import { driveAccessToken, listDriveFiles, downloadDriveFile } from '../lib/gdrive.js';
import { uploadStreamToS3 } from '../lib/storage.js';
import { Readable } from 'node:stream';
import webpush from 'web-push';

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

    let cand: any = null;
    try {
      cand = await db.jobCandidate.create({ data: { ...baseData, ...optionalKashrut } });
    } catch (e: any) {
      const msg = String(e?.message || '');
      // Most common cause: db push hasn't added the new kashrut_* columns yet.
      // Retry without them so the candidate still lands in the dashboard.
      if (msg.toLowerCase().includes('kashrut') || /unknown (arg|column)/i.test(msg)) {
        console.warn('[jobCandidate.create] retrying without kashrut fields:', msg);
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
  for (let i = 1; i <= 14; i++) {
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
    await db.interviewSlotTemplate.createMany({
      data: templates.map((t: any) => ({
        weekday: parseInt(t.weekday),
        time: String(t.time),
        duration_minutes: typeof t.duration_minutes === 'number' ? t.duration_minutes : 30,
        active: t.active !== false,
      })),
    });
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
