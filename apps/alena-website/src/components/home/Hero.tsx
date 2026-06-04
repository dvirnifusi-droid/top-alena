"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { featuredPhotos } from "@/lib/gallery";

// Pick a curated set for the hero mosaic — center is the main "money" shot.
const mosaic = [
  featuredPhotos[0], // burger-hero (large center)
  featuredPhotos[2], // carpaccio
  featuredPhotos[3], // fries-dip
  featuredPhotos[5], // cocktails
  featuredPhotos[1], // spread
  featuredPhotos[4], // burger-1
];

export function Hero() {
  const center = mosaic[0];
  return (
    <section className="relative overflow-hidden bg-charcoal text-cream">
      {/* Full-bleed background — center photo, dimmed */}
      <div className="absolute inset-0">
        <Image
          src={center.src}
          alt={center.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/70 via-charcoal/55 to-charcoal/85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(184,149,86,0.18),transparent_60%)]" />
      </div>

      <div className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-6 inline-flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-brass"
        >
          <span className="h-px w-10 bg-brass" />
          רוטשילד 104 · ראשון לציון
          <span className="h-px w-10 bg-brass" />
        </motion.p>

        {/* Huge headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[3.5rem] font-black leading-[0.95] tracking-tight text-cream sm:text-7xl md:text-[8rem]"
        >
          <span className="block">בר רחוב</span>
          <span className="block text-brass">שמח</span>
          <span className="block text-3xl font-medium tracking-normal text-cream/85 sm:text-4xl md:text-5xl">
            חמארה ים-תיכונית · כשרה למהדרין
          </span>
        </motion.h1>

        {/* Body */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-cream/80 md:text-xl"
        >
          תנור ג'וספר על 600 מעלות. השילוש הקדוש שלנו על כל מנה.
          קוקטיילים בית, ערבי נושא, ואולם פרטי לאירועים. בואו לאכול.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <ReservationCTA />
          <a
            href="/menu"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-cream/30 px-7 py-3.5 font-semibold text-cream backdrop-blur-sm transition hover:border-brass hover:text-brass"
          >
            לתפריט המלא <span>←</span>
          </a>
        </motion.div>

        {/* Floating photo cards — peek-around vibe */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <motion.div
            initial={{ opacity: 0, x: -40, rotate: -12 }}
            animate={{ opacity: 1, x: 0, rotate: -8 }}
            transition={{ duration: 1, delay: 1 }}
            className="absolute right-8 top-24 h-44 w-36 overflow-hidden rounded-2xl ring-2 ring-brass/40 shadow-2xl shadow-charcoal/50"
          >
            <Image src={mosaic[1].src} alt={mosaic[1].alt} fill sizes="160px" className="object-cover" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40, rotate: 14 }}
            animate={{ opacity: 1, x: 0, rotate: 10 }}
            transition={{ duration: 1, delay: 1.15 }}
            className="absolute left-12 top-40 h-52 w-40 overflow-hidden rounded-2xl ring-2 ring-brass/40 shadow-2xl shadow-charcoal/50"
          >
            <Image src={mosaic[3].src} alt={mosaic[3].alt} fill sizes="180px" className="object-cover" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -40, rotate: 16 }}
            animate={{ opacity: 1, x: 0, rotate: 12 }}
            transition={{ duration: 1, delay: 1.3 }}
            className="absolute bottom-20 right-20 h-40 w-32 overflow-hidden rounded-2xl ring-2 ring-brass/40 shadow-2xl shadow-charcoal/50"
          >
            <Image src={mosaic[2].src} alt={mosaic[2].alt} fill sizes="140px" className="object-cover" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40, rotate: -16 }}
            animate={{ opacity: 1, x: 0, rotate: -10 }}
            transition={{ duration: 1, delay: 1.45 }}
            className="absolute bottom-16 left-24 h-48 w-36 overflow-hidden rounded-2xl ring-2 ring-brass/40 shadow-2xl shadow-charcoal/50"
          >
            <Image src={mosaic[4].src} alt={mosaic[4].alt} fill sizes="160px" className="object-cover" />
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-cream/60"
        >
          ↓ גוללו לתפריט
        </motion.div>
      </div>

      {/* Mobile-only mosaic strip beneath the headline since the floating cards are hidden */}
      <div className="relative grid grid-cols-3 gap-1 px-1 pb-1 lg:hidden">
        {mosaic.slice(1, 4).map((p) => (
          <div key={p.src} className="relative aspect-square overflow-hidden rounded-lg">
            <Image src={p.src} alt={p.alt} fill sizes="33vw" className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
