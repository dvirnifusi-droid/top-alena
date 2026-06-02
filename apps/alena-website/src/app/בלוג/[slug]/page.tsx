import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { PostBody } from "@/components/blog/PostBody";
import { sanity } from "../../../../sanity/lib/client";
import { blogPostQuery } from "../../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";
import type { PortableTextBlock } from "@portabletext/react";

export const revalidate = 600;

type Post = {
  title: string;
  publishedAt: string;
  excerpt?: string;
  body: PortableTextBlock[];
  seoTitle?: string;
  seoDescription?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  let post: Post | null = null;
  try {
    post = (await sanity.fetch(blogPostQuery, { slug: decoded })) as Post | null;
  } catch {
    post = null;
  }
  if (!post) return {};
  return pageMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? "",
    path: `/בלוג/${decoded}`,
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  let post: Post | null = null;
  try {
    post = (await sanity.fetch(blogPostQuery, { slug: decoded })) as Post | null;
  } catch {
    post = null;
  }
  if (!post) notFound();
  return (
    <Container className="max-w-3xl py-16">
      <h1 className="font-display text-5xl">{post.title}</h1>
      <p className="mt-2 text-sm text-charcoal/60">
        {new Date(post.publishedAt).toLocaleDateString("he-IL")}
      </p>
      <article className="mt-8">
        <PostBody value={post.body} />
      </article>
    </Container>
  );
}
