import { defineType, defineField } from "sanity";

export default defineType({
  name: "eventPackage",
  title: "חבילת אירוע",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string" }),
    defineField({ name: "description", type: "text", rows: 4 }),
    defineField({ name: "minGuests", type: "number" }),
    defineField({ name: "maxGuests", type: "number" }),
    defineField({ name: "pricePerHead", type: "number" }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
  ],
});
