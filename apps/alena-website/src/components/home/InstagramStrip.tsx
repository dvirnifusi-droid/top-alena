"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export type StripImage = { _id: string; url: string; alt: string; href?: string };

export function InstagramStrip({ images }: { images: StripImage[] }) {
  if (!images.length) return null;
  return (
    <section className="bg-cream-soft py-16">
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
              <span className="h-px w-8 bg-brass" />
              מהאינסטגרם
            </p>
            <h2 className="font-display text-3xl text-charcoal md:text-4xl">@alena.hamara</h2>
          </div>
          <a
            href="https://instagram.com/alena.hamara"
            target="_blank"
            rel="noopener"
            className="text-sm font-medium text-terracotta hover:underline"
          >
            עקבו אחרינו ←
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          {images.slice(0, 6).map((img, i) => (
            <motion.a
              key={img._id}
              href={img.href ?? "https://instagram.com/alena.hamara"}
              target="_blank"
              rel="noopener"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group relative aspect-square overflow-hidden rounded-xl bg-cream ring-1 ring-brass/15"
            >
              <Image
                src={img.url}
                alt={img.alt}
                fill
                sizes="(min-width:768px) 16vw, 50vw"
                className="object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-charcoal/0 transition group-hover:bg-charcoal/20" />
            </motion.a>
          ))}
        </div>
      </Container>
    </section>
  );
}
