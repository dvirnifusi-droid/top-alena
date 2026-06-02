import { defineType, defineField } from "sanity";

export default defineType({
  name: "menuItem",
  title: "פריט תפריט",
  type: "document",
  fields: [
    defineField({ name: "name", title: "שם", type: "string", validation: (r) => r.required() }),
    defineField({ name: "description", title: "תיאור", type: "text", rows: 3 }),
    defineField({ name: "price", title: "מחיר (₪)", type: "number" }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
    defineField({ name: "category", type: "reference", to: [{ type: "menuCategory" }] }),
    defineField({
      name: "tags",
      type: "array",
      of: [{ type: "string" }],
      options: { list: ["חדש", "מומלץ", "חריף", "טבעוני", "ללא גלוטן"] },
    }),
    defineField({ name: "available", type: "boolean", initialValue: true }),
  ],
});
