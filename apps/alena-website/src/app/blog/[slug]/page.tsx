import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { BlogBody } from "@/components/blog/BlogBody";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { postBySlug, allSlugs } from "@/content/blog";
import { env } from "@/lib/env";

export async function generateStaticParams() {
  return allSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(decodeURIComponent(slug));
  if (!post) return {};
  return pageMetadata({
    title: post.seoTitle,
    description: post.seoDescription,
    path: `/blog/${slug}`,
    image: post.heroImage,
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(decodeURIComponent(slug));
  if (!post) notFound();

  const related = (post.related ?? [])
    .map((s) => postBySlug(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 2);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription,
    image: `${env.NEXT_PUBLIC_SITE_URL}${post.heroImage}`,
    datePublished: post.publishedAt,
    author: { "@type": "Organization", name: "עלינא" },
    publisher: {
      "@type": "Organization",
      name: "עלינא",
      logo: { "@type": "ImageObject", url: `${env.NEXT_PUBLIC_SITE_URL}/logo.svg` },
    },
    keywords: post.keywords.join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": `${env.NEXT_PUBLIC_SITE_URL}/blog/${slug}` },
  };

  return (
    <Container className="py-16">
      <article className="mx-auto max-w-3xl">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-brass">{post.category}</p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-charcoal md:text-6xl">
            {post.title}
          </h1>
          <p className="mt-5 flex items-center justify-center gap-3 text-sm text-charcoal/55">
            <time>
              {new Date(post.publishedAt).toLocaleDateString("he-IL", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{post.readMinutes} דק׳ קריאה</span>
          </p>
        </header>

        <div className="relative mt-12 aspect-[16/9] overflow-hidden rounded-3xl bg-cream-soft ring-1 ring-brass/20">
          <Image
            src={post.heroImage}
            alt={post.title}
            fill
            sizes="(min-width:768px) 768px, 100vw"
            className="object-cover"
            priority
          />
        </div>

        <p className="mx-auto mt-10 max-w-prose text-xl leading-relaxed text-charcoal/80">
          {post.excerpt}
        </p>

        <div className="mx-auto mt-12 max-w-prose">
          <BlogBody blocks={post.body} />
        </div>
      </article>

      {related.length > 0 ? (
        <section className="mt-24">
          <p className="text-center text-xs uppercase tracking-[0.3em] text-brass">המשך לקרוא</p>
          <h2 className="mt-3 text-center font-display text-3xl text-charcoal md:text-4xl">
            כתבות נוספות
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-2">
            {related.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-cream-soft ring-1 ring-brass/15">
                  <Image
                    src={r.heroImage}
                    alt={r.title}
                    fill
                    sizes="(min-width:768px) 45vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-4 font-display text-2xl text-charcoal group-hover:text-terracotta">
                  {r.title}
                </h3>
                <p className="mt-2 text-sm text-charcoal/65">{r.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <JsonLd data={articleLd} />
    </Container>
  );
}
