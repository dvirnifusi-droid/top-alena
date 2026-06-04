"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export function JobsCallout() {
  return (
    <section className="bg-charcoal py-20 text-cream md:py-24">
      <Container className="max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]"
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brass/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brass-soft">
              💼 דרושים עובדים
            </p>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              אנחנו מגייסים לכל התפקידים
            </h2>
            <p className="mt-4 max-w-xl text-cream/80">
              מלצרים · ברמנים · מנהלי משמרת · ראנרים · צוות מטבח · מארחת. סוכן AI חכם מתאים אתכם
              לתפקיד הנכון בשיחה אחת.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brass px-7 py-3.5 font-bold text-charcoal shadow-xl transition hover:bg-cream"
            >
              להגשת מועמדות <span>←</span>
            </Link>
            <p className="text-xs text-cream/55">מענה מיידי · 24/7</p>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
