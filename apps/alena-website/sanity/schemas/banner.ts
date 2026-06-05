import { defineType, defineField } from "sanity";

export default defineType({
  name: "banner",
  title: "באנר עליון",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "שם פנימי (לזיהוי בלבד)",
      type: "string",
      description: "למשל: ערב יום העצמאות 2026, מבצע חמישי, וכו'",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "message",
      title: "טקסט הבאנר",
      type: "string",
      description: "מה הלקוח רואה. למשל: '🍷 הערב: ערב יין ללא תחתית מ-₪61'",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "ctaText",
      title: "טקסט הכפתור",
      type: "string",
      initialValue: "להזמנת שולחן",
    }),
    defineField({
      name: "ctaUrl",
      title: "קישור הכפתור",
      type: "url",
      initialValue: "https://ontopo.com/he/il/page/15703580",
    }),
    defineField({
      name: "active",
      title: "פעיל?",
      description: "סמן כדי להציג. ניתן לכבות בלי למחוק את הבאנר.",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "startsAt",
      title: "מתחיל להופיע ב-",
      description: "תאריך ושעה. אם ריק — הבאנר מופיע מיד.",
      type: "datetime",
    }),
    defineField({
      name: "endsAt",
      title: "מסתיים ב-",
      description: "תאריך ושעה. אם ריק — לא נגמר. ניתן לתזמן באנר 48 שעות קדימה לפני אירוע.",
      type: "datetime",
    }),
    defineField({
      name: "priority",
      title: "עדיפות",
      description: "מספר גבוה = יוצג ראשון אם יש כמה באנרים פעילים בו זמנית.",
      type: "number",
      initialValue: 0,
    }),
  ],
  preview: {
    select: { title: "title", message: "message", active: "active" },
    prepare: ({ title, message, active }) => ({
      title: title || message,
      subtitle: active ? "✅ פעיל" : "⏸️ כבוי",
    }),
  },
});
