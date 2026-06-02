import { defineType, defineField } from "sanity";

const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export default defineType({
  name: "hours",
  title: "שעות פעילות",
  type: "document",
  fields: [
    defineField({
      name: "day",
      type: "string",
      options: { list: [...days] },
    }),
    defineField({ name: "closed", type: "boolean", initialValue: false }),
    defineField({
      name: "ranges",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "open", type: "string", title: "פתיחה (HH:mm)" },
            { name: "close", type: "string", title: "סגירה (HH:mm)" },
            { name: "label", type: "string", title: "תווית (אופציונלי)" },
          ],
        },
      ],
    }),
  ],
});
