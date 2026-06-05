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
  { href: routes.blog, label: "בלוג" },
  { href: routes.gift, label: "🎁 שובר מתנה" },
  { href: routes.jobs, label: "דרושים" },
  { href: routes.contact, label: "צור קשר" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

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
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "סגור תפריט" : "פתח תפריט"}
        className="rounded-full p-2 text-charcoal/80 hover:bg-charcoal/5 md:hidden"
      >
        {open ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            // Full viewport overlay — uses dvh so iOS Safari renders correctly
            className="fixed inset-0 z-[60] bg-cream md:hidden"
            style={{ height: "100dvh" }}
          >
            <div className="flex h-full flex-col">
              {/* Internal header — replaces site header while open */}
              <div className="flex items-center justify-between border-b border-brass/15 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="סגור תפריט"
                  className="rounded-full p-2 text-charcoal/80 hover:bg-charcoal/5"
                >
                  <X className="size-6" />
                </button>
                <Link href="/" onClick={() => setOpen(false)} className="block">
                  <Logo withTagline={false} />
                </Link>
                <span className="w-10" /> {/* spacer for centering */}
              </div>

              {/* Nav links — scrollable */}
              <nav className="flex-1 overflow-y-auto px-5 py-6">
                <ul className="space-y-1">
                  {nav.map((n, i) => (
                    <motion.li
                      key={n.href}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.04 + i * 0.025 }}
                    >
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between border-b border-brass/10 px-2 py-4 font-display text-2xl text-charcoal transition active:bg-cream-soft active:text-terracotta"
                      >
                        <span>{n.label}</span>
                        <span className="text-brass">←</span>
                      </Link>
                    </motion.li>
                  ))}
                </ul>

                <motion.a
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.35 }}
                  href={env.NEXT_PUBLIC_ONTOPO_URL}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-4 text-lg font-bold text-cream shadow-xl shadow-terracotta/25"
                >
                  🍽️ הזמן שולחן
                </motion.a>
              </nav>

              {/* Pinned footer — contacts */}
              <div className="shrink-0 border-t border-brass/15 bg-cream-soft px-5 py-4">
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${env.NEXT_PUBLIC_PHONE}`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <Phone className="size-5 text-terracotta" />
                    <span>חיוג</span>
                  </a>
                  <a
                    href={env.NEXT_PUBLIC_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <MessageCircle className="size-5 text-[#25D366]" />
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href="https://instagram.com/alena.hamara"
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                  >
                    <Instagram className="size-5 text-terracotta" />
                    <span>Instagram</span>
                  </a>
                </div>
                <p className="mt-3 text-center text-[0.7rem] text-charcoal/55">
                  רוטשילד 104, ראשון לציון
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
