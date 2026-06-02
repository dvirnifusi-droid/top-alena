import Link from "next/link";
import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

type Post = {
  _id: string;
  title: string;
  excerpt?: string;
  slug: { current: string };
  heroImage?: unknown;
};

export function BlogCard({ post }: { post: Post }) {
  return (
    <Link href={`/בלוג/${post.slug.current}`} className="group block overflow-hidden rounded-2xl bg-white shadow-sm">
      {post.heroImage ? (
        <div className="relative aspect-[16/9]">
          <Image
            src={urlFor(post.heroImage).width(800).url()}
            alt={post.title}
            fill
            sizes="(min-width:768px) 33vw, 100vw"
            className="object-cover transition group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-gradient-to-br from-olive/20 to-terracotta/20" />
      )}
      <div className="p-4">
        <h3 className="font-display text-xl">{post.title}</h3>
        {post.excerpt ? <p className="mt-1 text-sm text-charcoal/70">{post.excerpt}</p> : null}
      </div>
    </Link>
  );
}
