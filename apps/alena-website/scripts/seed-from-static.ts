// One-shot migration: pushes every piece of static content into Sanity so the
// owner can edit it from /studio without touching code.
//
// Usage (PowerShell):
//   $env:SANITY_WRITE_TOKEN="sk..."
//   npx tsx scripts/seed-from-static.ts
//
// Get a write token at https://sanity.io/manage → project s7tmtm0m →
// API → Tokens → Add API token (name: "migration", permissions: "Editor").

import { createClient } from "@sanity/client";
import { config as loadEnv } from "dotenv";
import { menu } from "../src/content/menu";
import { posts } from "../src/content/blog";
import { reviews } from "../src/content/reviews";

loadEnv({ path: ".env.local" });

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "s7tmtm0m";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_WRITE_TOKEN;

if (!token) {
  throw new Error(
    "SANITY_WRITE_TOKEN required. Generate one at sanity.io/manage → API → Tokens.",
  );
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2024-01-01",
  useCdn: false,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

async function run() {
  console.log("→ Site settings");
  await client.createOrReplace({
    _type: "siteSettings",
    _id: "siteSettings",
    phone: "03-622-8055",
    whatsapp: "+972503962976",
    address: "רוטשילד 104, ראשון לציון",
    ontopoUrl: "https://ontopo.com/he/il/page/15703580",
    instagramUrl: "https://instagram.com/alena.hamara",
    facebookUrl: "https://www.facebook.com/ALENA.BIGASDHOD/?locale=he_IL",
    spotifyPlaylistUrl: "https://open.spotify.com/playlist/1Bxgi1ARW99FL0CQJcbb5u",
  });

  console.log("→ Menu categories + items");
  const tx = client.transaction();
  for (let i = 0; i < menu.length; i++) {
    const section = menu[i];
    const categoryId = `menuCat-${section.id}`;
    tx.createOrReplace({
      _id: categoryId,
      _type: "menuCategory",
      name: section.title,
      slug: { _type: "slug", current: section.id },
      order: i,
    });
    for (let j = 0; j < section.items.length; j++) {
      const item = section.items[j];
      tx.createOrReplace({
        _id: `menuItem-${section.id}-${j}`,
        _type: "menuItem",
        name: item.name,
        description: item.description,
        price: item.price,
        tags: item.tags ?? [],
        available: true,
        category: { _type: "reference", _ref: categoryId },
      });
    }
  }

  console.log("→ Reviews");
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    tx.createOrReplace({
      _id: `review-${i}`,
      _type: "review",
      author: r.author,
      rating: r.rating,
      body: r.body,
      source: r.source,
      date: r.date,
    });
  }

  console.log("→ Blog posts");
  for (const p of posts) {
    tx.createOrReplace({
      _id: `post-${slugify(p.slug)}`,
      _type: "blogPost",
      title: p.title,
      slug: { _type: "slug", current: p.slug },
      excerpt: p.excerpt,
      publishedAt: new Date(p.publishedAt).toISOString(),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      // Body is converted from typed blocks to Portable Text blocks.
      body: p.body
        .filter((b) => b.type === "p" || b.type === "h2" || b.type === "h3")
        .map((b, idx) => ({
          _key: `b${idx}`,
          _type: "block",
          style: b.type === "h2" ? "h2" : b.type === "h3" ? "h3" : "normal",
          markDefs: [],
          children: [
            {
              _key: `s${idx}`,
              _type: "span",
              text: "text" in b ? b.text : "",
              marks: [],
            },
          ],
        })),
    });
  }

  console.log("→ Sample scheduled banner");
  tx.createOrReplace({
    _id: "banner-default",
    _type: "banner",
    title: "ערבי נושא — כללי",
    message: "🍷 ערבי נושא בעלינא — ראשון בורגרים, שני יין, שלישי קצב",
    ctaText: "להזמנת שולחן",
    ctaUrl: "https://ontopo.com/he/il/page/15703580",
    active: true,
    priority: 0,
  });

  await tx.commit();
  console.log("\n✓ Done. Visit /studio and start editing.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
