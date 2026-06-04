"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

export function Chef() {
  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-5xl">
        <div className="grid items-center gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-cream-soft shadow-xl shadow-charcoal/10"
          >
            <Image
              src="/gallery/IMG_6785.JPG"
              alt="הצוות של עלינא"
              fill
              sizes="(min-width:768px) 40vw, 100vw"
              className="object-cover"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.1 }}
          >
            <p className="text-xs uppercase tracking-[0.35em] text-brass">הצוות</p>
            <h2 className="mt-4 font-display text-5xl leading-[1.05] text-charcoal md:text-6xl">
              המטבח שלנו —
              <br />
              <span className="text-terracotta">לא מתפשר.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-charcoal/75">
              הצוות במטבח עלינא בא לעבודה לפני שהמסעדה נפתחת, חותך את הירקות ביד, מכין את הפרנה
              מאפס, ושומר על השילוש הקדוש שלנו (מרווה, טימין, אורגנו) כמו על מתכון משפחתי.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-charcoal/75">
              גוספר 600 מעלות בעבודה כל שעות הפעילות. הבשרים — טריים מבית קצב יומי. שום מנה לא יוצאת
              מהמטבח בלי שהיא מתאימה למה שאנחנו נרצה לקבל בעצמנו.
            </p>
            <blockquote className="mt-8 border-r-4 border-brass pe-5 ps-2 text-lg italic text-charcoal/80">
              ״כל מנה צריכה לזכור את עצמה. שאם תאכל אותה עוד שבוע — אתה תספר על זה לחברים.״
            </blockquote>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
