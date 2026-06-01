import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public chat backend for the events Qualifier agent.
// Frontend: src/pages/EventsInquiry.jsx calls this via invokePublic.
// Each turn: { history, message, source } → { reply, complete?, score?, lead_id?, rejected? }.

const SYSTEM_PROMPT = `אתה סוכן הסיווג של מסעדת "עלינא" לאירועים פרטיים. אתה מדבר בעברית טבעית, חמה וקצרה.

המטרה: לאסוף 5 פרטים מאדם שמתעניין באירוע, לתת ציון 0-100, ולסכם בצורה מובנית. אתה לא סוגר עסקה, לא מצטט מחירים, ולא מבטיח תאריך — את זה המנהל עושה.

תהליך השיחה:
1. אם זו ההודעה הראשונה (אין היסטוריה) — פתח בברכה קצרה ושאל את השאלה הראשונה.
   נוסח פתיחה: "היי 🌿 אני העוזרת הדיגיטלית של עלינא — מסעדת השרינג פלייטס בראשון לציון. שמחה שאתם חושבים עלינו לאירוע. כדי להמליץ לכם בצורה הטובה ביותר, אני צריכה לשאול 5 שאלות קצרות. מתחילים?"
2. שאל את 5 השאלות אחת-אחת (לעולם לא ביחד):
   ש1. שם פרטי וטלפון ליצירת קשר.
   ש2. לאיזה תאריך אתם מתכננים? (חלון של שבוע OK)
   ש3. סוג אירוע — יום הולדת / יום נישואין / אירוע עסקי / חינה / משפחתי / אחר?
   ש4. כמה אורחים בערך?
   ש5. תקציב משוער לסועד (טווח OK), וחלון שעות — בוקר/צהריים/ערב — והאם השכרה מלאה של המקום או חלק ממנו?
3. אחרי שאספת את כל 5 השדות, סיים את השיחה בנימוס: "מעולה, תודה רבה! העברתי את הפרטים למנהל המסעדה — הוא יחזור אליכם תוך כמה שעות עם הצעה מותאמת 🙏"

חוקים קריטיים (אסור לעבור):
- לעולם אל תצטט מחיר ספציפי.
- לעולם אל תאשר תאריך כפנוי.
- לעולם אל תמציא תפריט, יכולות, או מדיניות שלא נאמרה.
- אם הלקוח שואל "כמה זה עולה?" או "התאריך פנוי?" — ענה: "אני אעביר את הפרטים שלכם למנהל המסעדה — הוא יחזור אליכם עם הצעה מותאמת תוך כמה שעות. תודה על הסבלנות 🙏" וחזור לשאלות.
- אם הלקוח מציין מקרה הסלמה (אירוע משפיענים/מדיה, קייטרינג מחוץ למסעדה, כשר בלבד, מעל 80 אורחים, פחות מ-14 ימים מהיום) — סיים את השיחה מהר, וציין במפורש שזה דורש מנהל.

פלט מובנה — אחרי כל הודעה תחזיר JSON תקין בלבד (בלי טקסט מסביב):
{
  "reply_he": "<התשובה שלך בעברית טבעית למשתמש>",
  "extracted": {
    "contact_name": "<שם או null>",
    "contact_phone": "<טלפון או null>",
    "event_date": "<תאריך כמחרוזת חופשית או null>",
    "event_type": "<סוג אירוע או null>",
    "guest_count": <מספר או null>,
    "budget_per_person": <מספר או null>,
    "hours_window": "<חלון שעות או null>"
  },
  "complete": <true אם כל 5 השאלות נענו או הלקוח עזב, אחרת false>,
  "escalation_flag": <true אם מקרה הסלמה זוהה, אחרת false>
}`;

interface ExtractedAnswers {
  contact_name?: string | null;
  contact_phone?: string | null;
  event_date?: string | null;
  event_type?: string | null;
  guest_count?: number | null;
  budget_per_person?: number | null;
  hours_window?: string | null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { history = [], message = '', source = null, lead_id = null } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
    }

    const contents = [];
    for (const m of history) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
    if (message) contents.push({ role: 'user', parts: [{ text: message }] });
    if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: '__START__' }] });

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
    );
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.error?.message || 'Gemini error' }, { status: 500 });
    }
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ reply: raw || 'מצטערת, יש בעיה זמנית — נסו שוב.', complete: false });
    }

    const reply = parsed.reply_he || parsed.reply || '';
    const extracted: ExtractedAnswers = parsed.extracted || {};
    const complete = !!parsed.complete;
    const escalation = !!parsed.escalation_flag;

    // Always upsert a Lead row so we never lose a conversation
    const conversationLog = [
      ...history.map((m: any) => ({ role: m.role, content: m.content, timestamp: new Date().toISOString() })),
      ...(message ? [{ role: 'user', content: message, timestamp: new Date().toISOString() }] : []),
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ];

    const qualifier_answers = {
      event_date: extracted.event_date ?? null,
      event_type: extracted.event_type ?? null,
      guest_count: extracted.guest_count ?? null,
      budget_per_person: extracted.budget_per_person ?? null,
      hours_window: extracted.hours_window ?? null,
    };

    const score = complete ? computeScore(qualifier_answers, escalation) : null;
    const status = score === null
      ? 'NEW'
      : score >= 60
        ? 'QUALIFIED'
        : score < 30
          ? 'COLD'
          : 'NEW';

    const leadFields = {
      source_unit: 'UNIT_EVENTS_PRIVATE',
      channel: 'APP_INQUIRY',
      contact_name: extracted.contact_name || undefined,
      contact_phone: extracted.contact_phone || undefined,
      qualifier_answers,
      conversation_log: conversationLog,
      status,
      score: score ?? undefined,
      assigned_to_agent: 'EVENTS_QUALIFIER',
      utm: source ? { source } : undefined,
    };

    let currentLeadId = lead_id;
    if (currentLeadId) {
      await base44.asServiceRole.entities.Lead.update(currentLeadId, leadFields);
    } else {
      const created = await base44.asServiceRole.entities.Lead.create(leadFields);
      currentLeadId = created.id;
    }

    // On completion + hot score, fire Pushover (best-effort, never blocks reply)
    if (complete && score !== null && score >= 60) {
      try {
        const lead = await base44.asServiceRole.entities.Lead.get(currentLeadId);
        await base44.functions.pushoverOnHotEventLead({ lead });
      } catch (e) {
        console.error('pushoverOnHotEventLead failed', e);
      }
    }

    return Response.json({
      reply,
      complete,
      score,
      lead_id: currentLeadId,
      rejected: complete && score !== null && score < 30,
    });
  } catch (error) {
    console.error('chatEventsInquiry error', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

function computeScore(q: any, escalation: boolean): number {
  let s = 0;
  if (q.event_date) s += 25;
  if (typeof q.guest_count === 'number' && q.guest_count >= 10 && q.guest_count <= 80) s += 25;
  if (typeof q.budget_per_person === 'number' && q.budget_per_person >= 150) s += 25;
  if (q.event_type && !escalation) s += 25;
  if (escalation) s -= 30;
  return Math.max(0, Math.min(100, s));
}
