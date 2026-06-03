"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export function EventsTeaser() {
  return (
    <section className="relative overflow-hidden bg-olive py-20 text-cream">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-brass/15 via-transparent to-terracotta/10" />
      <Container className="relative grid items-center gap-10 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass-soft">
            <span className="h-px w-8 bg-brass-soft" />
            אירוח פרטי
          </p>
          <h2 className="font-display text-4xl text-cream md:text-5xl">אירועים פרטיים</h2>
          <p className="mt-4 max-w-md text-cream/85">
            אולם פרטי עד 50 איש. חבילות גמישות, מנות שף ים-תיכוניות, ברים מלאים — לימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה.
          </p>
          <Link
            href="/events"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-6 py-3 font-semibold text-olive transition hover:bg-brass hover:text-cream"
          >
            ספרו לי עוד <span>←</span>
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-gradient-to-br from-brass/25 to-charcoal/40 ring-1 ring-brass/30"
        />
      </Container>
    </section>
  );
}
