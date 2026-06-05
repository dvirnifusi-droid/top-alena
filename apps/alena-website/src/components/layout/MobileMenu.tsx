"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone, MessageCircle, Instagram } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { routes } from "@/lib/routes";
import { env } from "@/lib/env";

const nav = [
  { href: routes.home, label: "בית" },
  { href: routes.menu, label: "תפריט" },
  { href: routes.events, label: "אירועים" },
  { href: routes.delivery, label: "משלוחים" },
  { href: routes.gallery, label: "גלריה" },
  { href: routes.about, label: "אודות" },
  { href: routes.jobs, label: "דרושים" },
  { href: routes.blog, label: "בלוג" },
  { href: routes.contact, label: "צור קשר" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="פתח תפריט"
        className="rounded-full p-2 text-charcoal/80 hover:bg-charcoal/5 md:hidden"
      >
        <Menu className="size-6" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[55] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="סגור תפריט"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-cream shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-brass/15 px-5 py-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="סגור תפריט"
                  className="rounded-full p-2 text-charcoal/70 hover:bg-charcoal/5"
                >
                  <X className="size-6" />
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 overflow-y-auto px-5 py-6">
                <ul className="space-y-1">
                  {nav.map((n) => (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-2xl text-charcoal transition hover:bg-cream-soft hover:text-terracotta"
                      >
                        <span>{n.label}</span>
                        <span className="text-brass">←</span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* Hot CTA */}
                <a
                  href={env.NEXT_PUBLIC_ONTOPO_URL}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-3.5 font-bold text-cream shadow-xl shadow-terracotta/25"
                >
                  🍽️ הזמן שולחן
                </a>
              </nav>

              {/* Footer with contact */}
              <div className="border-t border-brass/15 bg-cream-soft px-5 py-5">
                <p className="text-[0.7rem] uppercase tracking-[0.25em] text-brass">צרו קשר</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${env.NEXT_PUBLIC_PHONE}`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-3 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <Phone className="size-5 text-terracotta" />
                    <span>חיוג</span>
                  </a>
                  <a
                    href={env.NEXT_PUBLIC_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-3 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <MessageCircle className="size-5 text-[#25D366]" />
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href="https://instagram.com/alena.hamara"
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-3 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <Instagram className="size-5 text-terracotta" />
                    <span>Instagram</span>
                  </a>
                </div>
                <p className="mt-4 text-center text-xs text-charcoal/55">
                  רוטשילד 104, ראשון לציון
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
