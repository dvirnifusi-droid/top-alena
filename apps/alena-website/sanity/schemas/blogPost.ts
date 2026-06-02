import { defineType, defineField } from "sanity";

export default defineType({
  name: "blogPost",
  title: "פוסט בלוג",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "title" } }),
    defineField({ name: "heroImage", type: "image", options: { hotspot: true } }),
    defineField({ name: "excerpt", type: "text", rows: 3 }),
    defineField({
      name: "body",
      type: "array",
      of: [{ type: "block" }, { type: "image", options: { hotspot: true } }],
    }),
    defineField({ name: "publishedAt", type: "datetime" }),
    defineField({ name: "seoTitle", type: "string" }),
    defineField({ name: "seoDescription", type: "text", rows: 2 }),
  ],
});
