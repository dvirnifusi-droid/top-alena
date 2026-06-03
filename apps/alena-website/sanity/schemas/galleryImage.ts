import { defineType, defineField } from "sanity";

export default defineType({
  name: "galleryImage",
  title: "תמונת גלריה",
  type: "document",
  fields: [
    defineField({
      name: "image",
      type: "image",
      options: { hotspot: true },
      validation: (r) => r.required(),
    }),
    defineField({ name: "alt", title: "תיאור (alt עברי)", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "category",
      type: "string",
      options: { list: ["אוכל", "פנים המסעדה", "ברים/אלכוהול", "אירועים", "צוות"] },
      initialValue: "אוכל",
    }),
    defineField({
      name: "featured",
      title: "להציג בעמוד הבית?",
      type: "boolean",
      initialValue: false,
    }),
    defineField({ name: "order", type: "number", initialValue: 0 }),
    defineField({
      name: "instagramUrl",
      title: "קישור לפוסט באינסטגרם (אופציונלי)",
      type: "url",
    }),
  ],
});
