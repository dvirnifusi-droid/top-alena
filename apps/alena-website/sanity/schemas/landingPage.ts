import { defineType, defineField } from "sanity";

export default defineType({
  name: "landingPage",
  title: "דף נחיתה SEO",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "h1" },
      validation: (r) => r.required(),
    }),
    defineField({ name: "h1", title: "כותרת ראשית (H1)", type: "string", validation: (r) => r.required() }),
    defineField({ name: "heroImage", type: "image", options: { hotspot: true } }),
    defineField({ name: "intro", type: "text", rows: 3 }),
    defineField({
      name: "body",
      type: "array",
      of: [{ type: "block" }, { type: "image", options: { hotspot: true } }],
    }),
    defineField({
      name: "relatedMenuItems",
      type: "array",
      of: [{ type: "reference", to: [{ type: "menuItem" }] }],
    }),
    defineField({
      name: "faqs",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "q", type: "string", title: "שאלה" },
            { name: "a", type: "text", title: "תשובה" },
          ],
        },
      ],
    }),
    defineField({
      name: "reviews",
      type: "array",
      of: [{ type: "reference", to: [{ type: "review" }] }],
    }),
    defineField({ name: "seoTitle", type: "string" }),
    defineField({ name: "seoDescription", type: "text", rows: 2 }),
  ],
});
