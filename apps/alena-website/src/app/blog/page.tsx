import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { posts } from "@/content/blog";

export const metadata = pageMetadata({
  title: "בלוג עלינא — אוכל ים-תיכוני, אירועים, ראשון לציון",
  description:
    "כתבות וטיפים מבית עלינא: מדריכי המבורגרים, חמארה, ג׳וספר, אירועי חברה. אוכל ים-תיכוני וקולינריה בראשון לציון.",
  path: "/blog",
});

export default function BlogIndex() {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  return (
    <Container className="py-16">
      <header className="mb-16 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">בלוג עלינא</p>
        <h1 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">
          כתבות וסיפורים מהמטבח
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-charcoal/70">
          מדריכי אוכל, סיפורי תרבות קולינרית, ועצות מהשטח — מבית עלינא ברוטשילד 104.
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-2">
        {sorted.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-cream-soft ring-1 ring-brass/15">
              <Image
                src={p.heroImage}
                alt={p.title}
                fill
                sizes="(min-width:768px) 45vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-105"
              />
              <span className="absolute right-4 top-4 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold text-charcoal shadow-md">
                {p.category}
              </span>
            </div>
            <div className="mt-5">
              <h2 className="font-display text-3xl leading-tight text-charcoal group-hover:text-terracotta">
                {p.title}
              </h2>
              <p className="mt-3 text-charcoal/70">{p.excerpt}</p>
              <p className="mt-4 flex items-center gap-3 text-xs text-charcoal/50">
                <time>
                  {new Date(p.publishedAt).toLocaleDateString("he-IL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                <span>·</span>
                <span>{p.readMinutes} דק׳ קריאה</span>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
