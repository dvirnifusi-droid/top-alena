"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { welcome } from "@/content/welcome";

const STORAGE_KEY = `alena-welcome-${welcome.version}`;

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!welcome.enabled) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (seen) return;
    // Open with a small delay so the hero animates first
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!welcome.enabled) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="סגור"
            onClick={close}
            className="absolute inset-0 bg-charcoal/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl bg-cream-soft shadow-2xl shadow-charcoal/40 md:grid-cols-[1fr_1.1fr]"
          >
            {/* Image */}
            {welcome.image ? (
              <div className="relative hidden md:block">
                <Image
                  src={welcome.image}
                  alt="עלינא"
                  fill
                  sizes="(min-width:768px) 50vw, 100vw"
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-bl from-transparent to-charcoal/30" />
              </div>
            ) : null}

            {/* Content */}
            <div className="relative p-8 md:p-12">
              <button
                onClick={close}
                aria-label="סגור"
                className="absolute right-4 top-4 rounded-full bg-charcoal/5 p-2 text-charcoal/60 transition hover:bg-charcoal/10 hover:text-charcoal"
              >
                <X className="size-5" />
              </button>

              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-brass">
                <span className="h-px w-8 bg-brass" />
                {welcome.eyebrow}
              </p>

              <h2 className="mt-5 font-display text-4xl leading-[1.05] text-charcoal md:text-5xl">
                {welcome.lines.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </h2>

              <p className="mt-5 text-charcoal/80 leading-relaxed">
                {welcome.body}
              </p>

              {/* Address row */}
              <div className="mt-6 flex items-center gap-2 rounded-2xl bg-olive/10 px-4 py-3 text-sm">
                <span className="text-base">📍</span>
                <div>
                  <p className="font-semibold text-olive">רוטשילד 104, ראשון לציון</p>
                  <p className="text-xs text-charcoal/60">חניות סמוכות במרכז בן גוריון</p>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={welcome.ctaPrimary.href}
                  target={welcome.ctaPrimary.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener"
                  onClick={close}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-3 font-semibold text-cream shadow-xl shadow-terracotta/25 transition hover:bg-terracotta-600"
                >
                  {welcome.ctaPrimary.label} <span>←</span>
                </a>
                <a
                  href={welcome.ctaSecondary.href}
                  onClick={close}
                  className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-charcoal/15 px-6 py-3 font-semibold text-charcoal hover:border-brass hover:text-brass"
                >
                  {welcome.ctaSecondary.label}
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
