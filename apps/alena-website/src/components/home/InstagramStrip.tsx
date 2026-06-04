"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export type StripImage = { _id: string; url: string; alt: string; href?: string };

export function InstagramStrip({ images }: { images: StripImage[] }) {
  if (!images.length) return null;
  // Show up to 8 in a varied grid
  const tiles = images.slice(0, 8);
  return (
    <section className="bg-cream-soft py-20">
      <Container>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
              <span className="h-px w-8 bg-brass" />
              מהאינסטגרם
            </p>
            <h2 className="font-display text-4xl text-charcoal md:text-5xl">@alena.hamara</h2>
            <p className="mt-2 text-charcoal/70">הצצה למה שמתבשל אצלנו השבוע</p>
          </div>
          <a
            href="https://instagram.com/alena.hamara"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-terracotta"
          >
            עקבו אחרינו <span>←</span>
          </a>
        </div>
        {/* Bento grid — first tile wide */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-2">
          {tiles.map((img, i) => {
            // First tile spans 2x2 on md
            const wide = i === 0 ? "md:col-span-2 md:row-span-2" : "";
            return (
              <motion.a
                key={img._id}
                href={img.href ?? "https://instagram.com/alena.hamara"}
                target="_blank"
                rel="noopener"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: i * 0.05 }}
                className={`group relative aspect-square overflow-hidden rounded-2xl bg-cream ring-1 ring-brass/15 ${wide}`}
              >
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  sizes={i === 0 ? "(min-width:768px) 50vw, 50vw" : "(min-width:768px) 25vw, 50vw"}
                  className="object-cover transition duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-charcoal/85 via-charcoal/60 to-transparent p-4 text-sm text-cream transition group-hover:translate-y-0">
                  {img.alt}
                </div>
              </motion.a>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
