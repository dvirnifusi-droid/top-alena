import { defineType, defineField } from "sanity";

export default defineType({
  name: "menuCategory",
  title: "קטגוריית תפריט",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" } }),
    defineField({ name: "order", type: "number", initialValue: 0 }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
  ],
});
