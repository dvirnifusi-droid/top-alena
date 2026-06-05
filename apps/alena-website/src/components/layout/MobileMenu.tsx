"use client";

import { useEffect, useRef, useState } from "react";
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
  const scrollYRef = useRef(0);

  // Bulletproof scroll lock for iOS Safari (older versions hate overflow:hidden alone).
  // Save scrollY, position:fixed the body, restore on close.
  useEffect(() => {
    const body = document.body;
    if (open) {
      scrollYRef.current = window.scrollY;
      body.style.position = "fixed";
      body.style.top = `-${scrollYRef.current}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    } else {
      const y = scrollYRef.current;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      if (y) window.scrollTo(0, y);
    }
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "סגור תפריט" : "פתח תפריט"}
        aria-expanded={open}
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/80 hover:bg-charcoal/5 active:bg-charcoal/10 md:hidden"
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
            // Belt-and-suspenders height: dvh for new Safari, vh for old.
            style={{ height: "100vh", minHeight: "100vh" }}
            className="fixed inset-0 z-[60] flex flex-col bg-cream md:hidden [height:100dvh]"
          >
            {/* Top bar inside the overlay — close + brand */}
            <div className="flex shrink-0 items-center justify-between border-b border-brass/15 bg-cream px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגור תפריט"
                style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/80 hover:bg-charcoal/5 active:bg-charcoal/10"
              >
                <X className="size-6" />
              </button>
              <Link href="/" onClick={() => setOpen(false)} className="block">
                <Logo withTagline={false} />
              </Link>
              <span className="w-11" />
            </div>

            {/* Scrollable nav region — uses flex:1 inside a known-height parent */}
            <nav
              className="flex-1 overflow-y-auto overscroll-contain px-5 py-6"
              style={{ WebkitOverflowScrolling: "touch" as never }}
            >
              <ul className="space-y-1">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      style={{ WebkitTapHighlightColor: "transparent" }}
                      className="flex items-center justify-between border-b border-brass/10 px-2 py-4 font-display text-2xl text-charcoal transition active:bg-cream-soft active:text-terracotta"
                    >
                      <span>{n.label}</span>
                      <span aria-hidden="true" className="text-brass">
                        ←
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <a
                href={env.NEXT_PUBLIC_ONTOPO_URL}
                target="_blank"
                rel="noopener"
                onClick={() => setOpen(false)}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-4 text-lg font-bold text-cream shadow-xl shadow-terracotta/25"
              >
                🍽️ הזמן שולחן
              </a>

              {/* extra bottom padding so the last item isn't kissing the contact footer */}
              <div className="h-4" />
            </nav>

            {/* Pinned footer */}
            <div className="shrink-0 border-t border-brass/15 bg-cream-soft px-5 py-4">
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={`tel:${env.NEXT_PUBLIC_PHONE}`}
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                >
                  <Phone className="size-5 text-terracotta" aria-hidden="true" />
                  <span>חיוג</span>
                </a>
                <a
                  href={env.NEXT_PUBLIC_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                >
                  <MessageCircle className="size-5 text-[#25D366]" aria-hidden="true" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href="https://instagram.com/alena.hamara"
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1 rounded-xl bg-cream py-2.5 text-xs text-charcoal/80 ring-1 ring-brass/15"
                >
                  <Instagram className="size-5 text-terracotta" aria-hidden="true" />
                  <span>Instagram</span>
                </a>
              </div>
              <p className="mt-3 text-center text-[0.7rem] text-charcoal/55">
                רוטשילד 104, ראשון לציון
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
