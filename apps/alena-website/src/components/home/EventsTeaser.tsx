"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export function EventsTeaser() {
  return (
    <section className="bg-olive py-24 text-cream md:py-32">
      <Container className="max-w-6xl">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9 }}
          >
            <p className="text-xs uppercase tracking-[0.35em] text-brass-soft">אירועים</p>
            <h2 className="mt-4 font-display text-5xl leading-[1.05] text-cream md:text-6xl">
              האירוע שלכם.
              <br />
              אצלנו.
            </h2>
            <p className="mt-6 max-w-md text-cream/85">
              אולם פרטי עד 50 אורחים. תפריט מותאם, ברים מלאים, מוזיקה ים-תיכונית. סוכן AI חכם בונה איתכם
              את האירוע בשיחה אחת.
            </p>
            <Link
              href="/events"
              className="mt-10 inline-flex items-center gap-2 border-b border-cream/40 pb-1 text-sm uppercase tracking-[0.25em] text-cream hover:border-brass hover:text-brass"
            >
              לבניית האירוע ←
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1, delay: 0.15 }}
            className="relative aspect-[4/5] overflow-hidden rounded-3xl ring-1 ring-brass/30"
          >
            <Image
              src="/gallery/IMG_6892.JPG"
              alt="אורחות בעלינא"
              fill
              sizes="(min-width:768px) 45vw, 100vw"
              className="object-cover"
            />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
