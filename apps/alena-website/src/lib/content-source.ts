// Bridge between Sanity (owner-editable) and the static seeds.
// Each helper tries Sanity first and falls back to the static file
// so the site never breaks even if Sanity is empty or unreachable.

import { sanity } from "../../sanity/lib/client";
import { menuQuery, blogIndexQuery, blogPostQuery, allBlogSlugsQuery } from "../../sanity/lib/queries";
import { menu as staticMenu, drinks, softDrinks, type MenuItem, type MenuSection } from "@/content/menu";
import { posts as staticPosts, postBySlug as staticPostBySlug, allSlugs as staticAllSlugs, type Post } from "@/content/blog";

// ─── MENU ──────────────────────────────────────────────────────────────────

type SanityMenuFetch = {
  categories: { _id: string; name: string; id?: string }[];
  items: {
    _id: string;
    name: string;
    description?: string;
    price?: number;
    image?: unknown;
    tags?: string[];
    categoryId: string;
  }[];
};

// Build a name→image lookup from the static seed so owner-edited Sanity
// items keep their hero image without re-uploading.
const staticItemImages = new Map<string, string>();
for (const sec of staticMenu) {
  for (const it of sec.items) {
    if (it.image) staticItemImages.set(it.name, it.image);
  }
}

export async function getMenu(): Promise<MenuSection[]> {
  try {
    const data = (await sanity.fetch(menuQuery)) as SanityMenuFetch | null;
    if (!data || !data.categories?.length) return staticMenu;
    const sections: MenuSection[] = data.categories.map((c) => ({
      id: c.id ?? c._id,
      title: c.name,
      items: data.items
        .filter((i) => i.categoryId === c._id)
        .map((i) => ({
          name: i.name,
          description: i.description ?? "",
          price: i.price ?? 0,
          tags: (i.tags ?? []) as MenuItem["tags"],
          image: staticItemImages.get(i.name), // enrich from static seed
        })),
    }));
    if (!sections.some((s) => s.items.length > 0)) return staticMenu;
    return sections;
  } catch {
    return staticMenu;
  }
}

export { drinks, softDrinks };
export type { MenuItem, MenuSection };

// ─── BLOG ──────────────────────────────────────────────────────────────────

type SanityPostIndex = {
  _id: string;
  title: string;
  excerpt?: string;
  slug: { current: string };
  publishedAt: string;
  seoTitle?: string;
  seoDescription?: string;
}[];

export async function getBlogIndex(): Promise<Post[]> {
  try {
    const data = (await sanity.fetch(blogIndexQuery)) as SanityPostIndex | null;
    if (!data || !data.length) return staticPosts;
    // Merge: prefer Sanity metadata but enrich body/category/keywords/related/image from static
    return data
      .map((p) => {
        const fromStatic = staticPostBySlug(p.slug.current);
        if (!fromStatic) return null;
        return {
          ...fromStatic,
          title: p.title || fromStatic.title,
          excerpt: p.excerpt || fromStatic.excerpt,
          publishedAt: p.publishedAt || fromStatic.publishedAt,
          seoTitle: p.seoTitle || fromStatic.seoTitle,
          seoDescription: p.seoDescription || fromStatic.seoDescription,
        };
      })
      .filter((p): p is Post => Boolean(p));
  } catch {
    return staticPosts;
  }
}

export async function getBlogPost(slug: string): Promise<Post | null> {
  try {
    const sanityDoc = (await sanity.fetch(blogPostQuery, { slug })) as
      | { title?: string; excerpt?: string; publishedAt?: string; seoTitle?: string; seoDescription?: string }
      | null;
    const fromStatic = staticPostBySlug(slug);
    if (!fromStatic) return null;
    if (!sanityDoc) return fromStatic;
    return {
      ...fromStatic,
      title: sanityDoc.title || fromStatic.title,
      excerpt: sanityDoc.excerpt || fromStatic.excerpt,
      publishedAt: sanityDoc.publishedAt || fromStatic.publishedAt,
      seoTitle: sanityDoc.seoTitle || fromStatic.seoTitle,
      seoDescription: sanityDoc.seoDescription || fromStatic.seoDescription,
    };
  } catch {
    return staticPostBySlug(slug) ?? null;
  }
}

export async function getAllBlogSlugs(): Promise<string[]> {
  try {
    const slugs = (await sanity.fetch(allBlogSlugsQuery)) as string[] | null;
    if (!slugs || !slugs.length) return staticAllSlugs;
    return slugs;
  } catch {
    return staticAllSlugs;
  }
}

export { staticPosts as fallbackPosts };
