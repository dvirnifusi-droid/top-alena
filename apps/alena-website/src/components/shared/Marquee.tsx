"use client";

import { motion } from "framer-motion";

const ITEMS = [
  "🍔 ראשון · Burger Night",
  "🍷 שני · יין ללא תחתית מ-61₪",
  "🥩 שלישי · ערב קצבים",
  "✨ Happy Hour א'-ה' עד 20:00 · 40% הנחה",
  "🎉 אולם אירועים פרטי עד 50 איש",
  "🔥 תנור ג'וספר 600° · כשר למהדרין",
];

export function Marquee() {
  // Duplicate the list so the loop is seamless
  const items = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-brass/20 bg-charcoal py-3 text-cream">
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        initial={{ x: 0 }}
        animate={{ x: "-50%" }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
      >
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-3 text-sm font-medium tracking-wide">
            <span>{it}</span>
            <span className="text-brass">•</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
