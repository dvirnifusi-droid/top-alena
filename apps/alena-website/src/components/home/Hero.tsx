"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { featuredPhotos } from "@/lib/gallery";

const bgPhoto =
  featuredPhotos.find((p) => p.src.includes("IMG_4682")) ??
  featuredPhotos.find((p) => p.src.includes("IMG_6904")) ??
  featuredPhotos[0];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-charcoal text-cream">
      <div className="absolute inset-0">
        <Image
          src={bgPhoto.src}
          alt={bgPhoto.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Calm gradient — bottom-weighted so the headline floats over a darker base */}
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/40 to-charcoal/85" />
      </div>

      <div className="relative mx-auto flex min-h-[80vh] max-w-5xl flex-col items-center justify-end px-6 pb-20 pt-32 text-center md:pb-28 md:pt-40">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-xs uppercase tracking-[0.4em] text-brass-soft"
        >
          רוטשילד 104 · ראשון לציון
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6"
          aria-label="עלינא"
        >
          <Image
            src="/logo-alena-light.png"
            alt="עלינא"
            width={900}
            height={520}
            priority
            className="mx-auto h-auto w-[78vw] max-w-[640px] drop-shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          />
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.7 }}
          className="mt-6 flex items-center gap-4 text-sm font-medium uppercase tracking-[0.3em] text-cream/85 md:text-base"
        >
          <span className="h-px w-10 bg-brass-soft" />
          <span>חמארה ים-תיכונית · כשרה</span>
          <span className="h-px w-10 bg-brass-soft" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1 }}
          className="mt-12"
        >
          <ReservationCTA />
        </motion.div>
      </div>
    </section>
  );
}
