import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_WRITE_TOKEN;

if (!projectId) throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID required");
if (!token) throw new Error("SANITY_WRITE_TOKEN required (create at https://sanity.io/manage)");

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const load = (f: string) =>
  JSON.parse(readFileSync(path.join("src", "content", "seed", f), "utf8"));

const docs = [
  load("siteSettings.json"),
  ...load("hours.json"),
  ...load("landingPages.json"),
  ...load("blogPosts.json"),
  ...load("reviews.json"),
];

(async () => {
  const tx = client.transaction();
  for (const d of docs) tx.createOrReplace(d);
  await tx.commit();
  console.log(`Seeded ${docs.length} documents.`);
})();
