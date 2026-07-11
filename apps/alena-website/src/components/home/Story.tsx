"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";

// Text lives here; images can be overridden per-chapter via Sanity ("תמונות באתר" → Story · פרק N).
const DEFAULT_CHAPTERS = [
  {
    eyebrow: "המקום",
    title: "בית. רוטשילד 104.",
    body:
      "פינה קטנה ברוטשילד שמרגישה גדולה כשנכנסים. אבן חשופה, אורות חמים, מוזיקה ישראלית שעושה טוב בלב. אתם תאכלו טוב, תשתו טוב, ותצאו שמחים. זה הכל.",
    image: "/gallery/IMG_6770.JPG",
  },
  {
    eyebrow: "המטבח",
    title: "ג'וספר. 600 מעלות.",
    body:
      "המטבח שלנו בנוי סביב תנור פחמים יפני אחד גדול. הוא מגיע ל-600 מעלות והוא לוקח את הזמן שלו. הוא צורב את הסטייקים, הוא מעשן את הירקות, הוא עושה את הלחמים פריכים מבחוץ ורכים מבפנים. הוא הסיבה שאי אפשר לזייף את הטעם.",
    image: "/gallery/burger-hero.jpg",
  },
  {
    eyebrow: "הבר",
    title: "ערקים מתובלים בבית.",
    body:
      "שחור (קינמון, ליקריץ, אניס). אדום (ליצ'י, חמוציות). מתובל (תפוח ורוזטה). הקוקטיילים בית — חמסה עליך ופלאייה פפאיה — שתי הסיבות שאנשים חוזרים אחרי שבוע. כל יום שני, יין ללא תחתית מ-61 ₪.",
    image: "/gallery/IMG_4682.JPG",
  },
];

export function Story({ imageOverrides }: { imageOverrides?: [string?, string?, string?] } = {}) {
  const chapters = DEFAULT_CHAPTERS.map((c, i) => ({
    ...c,
    image: imageOverrides?.[i] ?? c.image,
  }));
  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="mb-20 text-center"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-brass">הסיפור הקצר</p>
          <h2 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">למה בעצם לבוא</h2>
        </motion.div>

        <div className="space-y-24 md:space-y-32">
          {chapters.map((c, i) => (
            <div
              key={c.title}
              className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${
                i % 2 === 1 ? "md:[direction:ltr]" : ""
              }`}
            >
              <motion.div
                initial={{ opacity: 0, x: i % 2 === 0 ? 20 : -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="md:[direction:rtl]"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-brass">{c.eyebrow}</p>
                <h3 className="mt-3 font-display text-4xl leading-[1.1] text-charcoal md:text-5xl">
                  {c.title}
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-charcoal/75">{c.body}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-cream-soft shadow-2xl shadow-charcoal/10 md:[direction:rtl]"
              >
                <Image
                  src={c.image}
                  alt={c.title}
                  fill
                  sizes="(min-width:768px) 45vw, 100vw"
                  className="object-cover"
                  unoptimized={c.image.startsWith("http")}
                />
              </motion.div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
