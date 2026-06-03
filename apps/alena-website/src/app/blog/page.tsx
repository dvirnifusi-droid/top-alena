import { Container } from "@/components/layout/Container";
import { BlogCard } from "@/components/blog/BlogCard";
import { sanity } from "../../../sanity/lib/client";
import { blogIndexQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;

export const metadata = pageMetadata({
  title: "בלוג עלינא — אוכל, אירועים, ראשון לציון",
  description: "כתבות וטיפים מבית עלינא: אוכל ים-תיכוני, חמארה, אירועים פרטיים בראשון לציון.",
  path: "/בלוג",
});

type Post = {
  _id: string;
  title: string;
  excerpt?: string;
  slug: { current: string };
  heroImage?: unknown;
};

export default async function BlogIndex() {
  let posts: Post[] = [];
  try {
    posts = ((await sanity.fetch(blogIndexQuery)) as Post[]) ?? [];
  } catch {
    posts = [];
  }
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">בלוג</h1>
      {posts.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-cream p-6 text-charcoal/70">פוסטים יתעדכנו בקרוב.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <BlogCard key={p._id} post={p} />
          ))}
        </div>
      )}
    </Container>
  );
}
