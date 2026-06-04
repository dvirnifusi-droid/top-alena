"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

export function Hero({ heroImageUrl, heroAlt }: { heroImageUrl?: string; heroAlt?: string } = {}) {
  const src = heroImageUrl ?? "/hero-placeholder.svg";
  const alt = heroAlt ?? "צלחת אוכל בעלינא";
  return (
    <section className="relative overflow-hidden">
      <Container className="grid items-center gap-12 py-20 md:grid-cols-2 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center md:text-right"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass"
          >
            <span className="h-px w-8 bg-brass" />
            רוטשילד 104 · ראשון לציון
          </motion.p>
          <h1 className="font-display text-5xl leading-[1.05] text-charcoal md:text-7xl">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="block"
            >
              חמארה ים-תיכונית
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="block text-terracotta"
            >
              כשרה ומדויקת
            </motion.span>
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-6 text-lg leading-relaxed text-charcoal/75"
          >
            תנור ג׳וספר על 600 מעלות · בשרים על האש · קוקטיילים וערבי נושא · אולם פרטי לאירועים. חמארה כשרה למהדרין במלוא מובן המילה.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
            className="mt-10 flex flex-wrap justify-center gap-3 md:justify-start"
          >
            <ReservationCTA />
            <a
              href="/menu"
              className="inline-flex items-center justify-center rounded-full border-2 border-charcoal/15 px-6 py-3 font-medium text-charcoal transition hover:border-brass hover:text-brass"
            >
              צפה בתפריט
            </a>
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-olive/15 to-terracotta/10 shadow-2xl shadow-charcoal/15 ring-1 ring-brass/20"
        >
          <Image
            src={src}
            alt={alt}
            fill
            priority
            sizes="(min-width:768px) 45vw, 100vw"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cream/30" />
        </motion.div>
      </Container>
    </section>
  );
}
