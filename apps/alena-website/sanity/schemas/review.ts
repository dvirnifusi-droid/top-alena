import { defineType, defineField } from "sanity";

export default defineType({
  name: "review",
  title: "ביקורת",
  type: "document",
  fields: [
    defineField({ name: "author", type: "string", validation: (r) => r.required() }),
    defineField({ name: "rating", type: "number", validation: (r) => r.min(1).max(5) }),
    defineField({ name: "body", type: "text", rows: 3 }),
    defineField({
      name: "source",
      type: "string",
      options: { list: ["Google", "Direct", "Facebook"] },
    }),
    defineField({ name: "date", type: "date" }),
  ],
});
