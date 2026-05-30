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
registerFn('deployInfo', async () => ({ version: 'v2-url-rewrite', ts: new Date().toISOString() }), { public: true });

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

registerFn('chatJobApplication', async ({ body }) => {
  const { history, message } = body as any;
  const turns: Array<{ role: string; content: string }> = Array.isArray(history) ? history : [];
  const transcript = turns
    .map((t) => `${t.role === 'assistant' ? 'עוזר' : 'מועמד'}: ${t.content}`)
    .join('\n');
  const newPart = message ? `\nמועמד: ${message}` : '';
  const prompt = `${RECRUITMENT_SYSTEM_PROMPT}\n\n--- שיחה עד כה ---\n${transcript || '(אין עדיין הודעות — זו תחילת השיחה)'}${newPart}\n\nהחזר את התגובה הבאה כ-JSON בלבד.`;

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
    const score = typeof result.score === 'number' ? Math.round(result.score) : null;

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
            ai_summary: { type: 'string' },
          },
        },
      }) as any;
    } catch (e: any) {
      console.error('extraction failed', e?.message);
    }

    // Merge: extracted (truth) wins; fall back to the chat-model's collected.
    const c = (result.collected || {}) as any;
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

    try {
      const cand = await db.jobCandidate.create({
        data: {
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
          source: 'web_chat',
        },
      });
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
        ];
        pushoverToAdmins('🎯 מועמד גיוס חדש (ציון גבוה)', lines.join('\n')).catch(() => {});
      }
    } catch (e: any) {
      console.error('jobCandidate.create failed', e?.message);
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
  return { upcoming, recent, toCallBack, topUnscheduled };
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
  const { candidate_id, date, time } = body as any;
  if (!candidate_id || !date || !time) throw new Error('missing_params');
  const cand = await db.jobCandidate.findUnique({ where: { id: candidate_id } });
  if (!cand) throw new Error('candidate_not_found');

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
  return { interview };
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

// Dvir AI chat. Includes the Drive files cached in GeminiFileCache so Gemini
// can answer from the team's uploaded documents. Matches the original Base44
// contract: { message, history, systemPrompt } -> { reply }.
registerFn('askGemini', async ({ body }) => {
  const { message, history, systemPrompt, prompt } = body as any;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const userMessage = message ?? prompt ?? '';

  const cached: any[] = await db.geminiFileCache.findMany();
  const supported = new Set([
    'application/pdf', 'text/plain', 'text/html', 'text/csv', 'text/markdown',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'audio/mpeg', 'audio/wav',
  ]);
  const fileParts = cached
    .filter((f) => f.gemini_file_uri && supported.has(f.mime_type))
    .map((f) => ({ file_data: { mime_type: f.mime_type, file_uri: f.gemini_file_uri } }));

  const contents: any[] = [];
  if (Array.isArray(history)) {
    for (const m of history) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
  }
  contents.push({ role: 'user', parts: [...fileParts, { text: userMessage }] });

  const reqBody: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 8192 } };
  if (systemPrompt) reqBody.system_instruction = { parts: [{ text: systemPrompt }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) },
  );
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini API error');
  return { reply: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
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

registerFn('awardAvailabilityCoins', async ({ body }) => {
  const b = body as any;
  const amount = b.coinsToAward ?? b.amount ?? 5;
  const reason = b.availableShifts
    ? `הגשת סידור זמינות - ${b.availableShifts} משמרות פנויות`
    : 'הגשת סידור זמינות';
  return awardCoins(b.employee_id, amount, reason);
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
