import { defineType, defineField } from "sanity";

export default defineType({
  name: "banner",
  title: "באנר עליון",
  type: "document",
  fields: [
    defineField({ name: "message", type: "string" }),
    defineField({ name: "ctaText", type: "string" }),
    defineField({ name: "ctaUrl", type: "url" }),
    defineField({ name: "active", type: "boolean", initialValue: false }),
    defineField({ name: "priority", type: "number", initialValue: 0 }),
  ],
});
