import { defineType, defineField } from "sanity";

export default defineType({
  name: "siteSettings",
  title: "הגדרות אתר",
  type: "document",
  fields: [
    defineField({ name: "phone", title: "טלפון", type: "string", initialValue: "03-622-8055" }),
    defineField({ name: "whatsapp", title: "וואטסאפ (E.164)", type: "string", initialValue: "+972503962976" }),
    defineField({ name: "address", title: "כתובת", type: "string", initialValue: "רוטשילד 104, ראשון לציון" }),
    defineField({ name: "addressLat", title: "Lat", type: "number" }),
    defineField({ name: "addressLng", title: "Lng", type: "number" }),
    defineField({ name: "ontopoUrl", title: "OnTopo URL", type: "url", initialValue: "https://ontopo.com/he/il/page/15703580" }),
    defineField({ name: "instagramUrl", title: "Instagram", type: "url", initialValue: "https://instagram.com/alena.hamara" }),
    defineField({ name: "facebookUrl", title: "Facebook", type: "url" }),
    defineField({ name: "kashrutBody", title: "גוף הכשרות", type: "string" }),
    defineField({ name: "kashrutImage", title: "תעודת כשרות", type: "image" }),
    defineField({
      name: "deliveryLinks",
      title: "קישורי משלוחים",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "name", type: "string", title: "שם" },
            { name: "url", type: "url", title: "קישור" },
          ],
        },
      ],
    }),
  ],
});
