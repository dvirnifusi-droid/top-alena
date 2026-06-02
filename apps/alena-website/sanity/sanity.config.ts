import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemas";

export default defineConfig({
  basePath: "/studio",
  name: "alena",
  title: "עלינא — ניהול תוכן",
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "s7tmtm0m",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  plugins: [structureTool(), visionTool()],
  schema: { types: schemaTypes },
});
