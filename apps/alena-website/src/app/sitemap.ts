import type { MetadataRoute } from "next";
import { sanity } from "../../sanity/lib/client";
import { allLandingSlugsQuery } from "../../sanity/lib/queries";
import { env } from "@/lib/env";
import { routes } from "@/lib/routes";
import { posts } from "@/content/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;

  const fixed = Object.values(routes)
    .filter((r) => r !== "/studio")
    .map((p) => ({
      url: `${base}${p}`,
      lastModified: new Date(),
      priority: p === "/" ? 1 : 0.8,
    }));

  let landings: MetadataRoute.Sitemap = [];
  try {
    const slugs = (await sanity.fetch(allLandingSlugsQuery)) as string[];
    landings = slugs.map((s) => ({
      url: `${base}/${s}`,
      lastModified: new Date(),
      priority: 0.9,
    }));
  } catch {
    landings = [];
  }

  // Static blog posts from src/content/blog.ts
  const blogEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: new Date(p.publishedAt),
    priority: 0.7,
  }));

  return [...fixed, ...landings, ...blogEntries];
}
