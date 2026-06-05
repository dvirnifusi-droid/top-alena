"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export function GiftBand() {
  return (
    <section className="py-20 md:py-24">
      <Container className="max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="overflow-hidden rounded-3xl bg-gradient-to-bl from-charcoal via-charcoal to-olive text-cream shadow-2xl shadow-charcoal/20 ring-1 ring-brass/30"
        >
          <div className="grid items-center gap-8 p-8 md:grid-cols-[1fr_1.1fr] md:gap-12 md:p-12">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brass/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brass-soft">
                🎁 שובר מתנה
              </p>
              <h2 className="mt-4 font-display text-4xl leading-tight md:text-5xl">
                ערב בעלינא — מתנה למישהו אהוב
              </h2>
              <p className="mt-4 text-cream/85">
                שובר דיגיטלי בערך ₪200 / ₪350 / ₪500. המקבל בוחר מה לאכול ומה לשתות. מתאים ליום
                הולדת, יום נישואים, הוקרה לעובד, או סתם כדי להפתיע.
              </p>
              <Link
                href="/gift"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-7 py-3.5 font-bold text-charcoal shadow-xl transition hover:bg-brass hover:text-charcoal"
              >
                לרכישת שובר <span aria-hidden="true">←</span>
              </Link>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-brass/30">
              <Image
                src="/gallery/IMG_6904.JPG"
                alt="קוקטיילים על הבר של עלינא"
                fill
                sizes="(min-width:768px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
