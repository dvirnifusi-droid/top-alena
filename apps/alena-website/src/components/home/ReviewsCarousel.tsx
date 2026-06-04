"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { JsonLd } from "@/components/seo/JsonLd";
import { reviewSchema } from "@/components/seo/schemas";
import { reviews, aggregateRating } from "@/content/reviews";

const SOURCE_LABEL: Record<string, string> = {
  Google: "Google",
  Facebook: "Facebook",
  Direct: "ישיר",
};

export function ReviewsCarousel() {
  if (!reviews.length) return null;
  const top = reviews.slice(0, 6);
  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="mb-12 text-center"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-brass">העדויות</p>
          <h2 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">
            מה אומרים עלינו
          </h2>
          {/* Aggregate rating proof */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-cream-soft px-5 py-2 ring-1 ring-brass/20">
            <span className="text-lg tracking-widest text-brass">★★★★★</span>
            <span className="font-semibold text-charcoal">
              {aggregateRating.ratingValue.toFixed(1)}
            </span>
            <span className="text-sm text-charcoal/60">
              ({aggregateRating.reviewCount} ביקורות Google)
            </span>
          </div>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {top.map((r, i) => (
            <motion.figure
              key={r.author + r.date}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="rounded-3xl border border-brass/15 bg-cream-soft p-7 shadow-sm shadow-charcoal/5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-lg tracking-widest text-brass">{"★".repeat(r.rating)}</div>
                <span className="text-[0.7rem] uppercase tracking-wider text-charcoal/45">
                  {SOURCE_LABEL[r.source]}
                </span>
              </div>
              <blockquote className="mt-4 text-charcoal/85 leading-relaxed">{r.body}</blockquote>
              <figcaption className="mt-5 flex items-center justify-between text-sm">
                <span className="font-semibold text-olive">— {r.author}</span>
                <time className="text-xs text-charcoal/45">
                  {new Date(r.date).toLocaleDateString("he-IL", {
                    year: "numeric",
                    month: "short",
                  })}
                </time>
              </figcaption>
              <JsonLd data={reviewSchema({ ...r, rating: r.rating })} />
            </motion.figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
