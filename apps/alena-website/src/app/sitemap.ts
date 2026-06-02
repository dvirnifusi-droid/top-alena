import type { MetadataRoute } from "next";
import { sanity } from "../../sanity/lib/client";
import { allLandingSlugsQuery, blogIndexQuery } from "../../sanity/lib/queries";
import { env } from "@/lib/env";
import { routes } from "@/lib/routes";

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

  let posts: MetadataRoute.Sitemap = [];
  try {
    const blog = (await sanity.fetch(blogIndexQuery)) as { slug: { current: string }; publishedAt: string }[];
    posts = (blog ?? []).map((p) => ({
      url: `${base}/בלוג/${p.slug.current}`,
      lastModified: new Date(p.publishedAt),
      priority: 0.6,
    }));
  } catch {
    posts = [];
  }

  return [...fixed, ...landings, ...posts];
}
