"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { posts } from "@/content/blog";

export function BlogTeaser() {
  const latest = [...posts]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);

  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="mb-12 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-brass">בלוג</p>
            <h2 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">
              כתבות אחרונות
            </h2>
            <p className="mt-3 max-w-xl text-charcoal/70">
              מדריכי אוכל, סיפורי מטבח, ועצות מהשטח.
            </p>
          </div>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 border-b border-charcoal/30 pb-1 text-sm uppercase tracking-[0.25em] text-charcoal hover:border-terracotta hover:text-terracotta"
          >
            לכל הכתבות ←
          </Link>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {latest.map((p, i) => (
            <motion.div
              key={p.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <Link href={`/blog/${p.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-cream-soft ring-1 ring-brass/15">
                  <Image
                    src={p.heroImage}
                    alt={p.title}
                    fill
                    sizes="(min-width:768px) 33vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <span className="absolute right-3 top-3 rounded-full bg-cream/95 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-charcoal shadow-md">
                    {p.category}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-2xl leading-tight text-charcoal group-hover:text-terracotta">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-charcoal/65">{p.excerpt}</p>
                <p className="mt-3 text-xs text-charcoal/45">{p.readMinutes} דק׳ קריאה</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
