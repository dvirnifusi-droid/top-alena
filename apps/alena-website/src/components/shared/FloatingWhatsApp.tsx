"use client";

import { useEffect, useState } from "react";
import { wa } from "@/lib/whatsapp";

// Desktop-only floating WhatsApp — mobile already has the sticky bottom bar.
// Pre-filled "I'd like to book a table" so the conversation opens with intent.
export function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={wa.reserve()}
      target="_blank"
      rel="noopener"
      aria-label="פתחו צ'אט WhatsApp להזמנת שולחן"
      className={`fixed bottom-6 left-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-charcoal/30 transition-all md:flex ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-7" aria-hidden="true">
        <path d="M17.6 6.32A8.78 8.78 0 0 0 11.5 3.7 8.86 8.86 0 0 0 2.6 12.6c0 1.56.41 3.07 1.18 4.41L2.5 21.5l4.62-1.21a8.84 8.84 0 0 0 4.36 1.11h.01c4.88 0 8.85-3.97 8.85-8.85a8.78 8.78 0 0 0-2.74-6.23ZM11.5 19.92h-.01a7.34 7.34 0 0 1-3.74-1.03l-.27-.16-2.78.73.75-2.71-.17-.28a7.33 7.33 0 0 1-1.13-3.91 7.36 7.36 0 0 1 12.55-5.21 7.3 7.3 0 0 1 2.16 5.2 7.36 7.36 0 0 1-7.36 7.37Zm4.04-5.51c-.22-.11-1.31-.65-1.51-.72-.2-.07-.35-.11-.5.11-.15.22-.57.72-.7.87-.13.15-.26.16-.48.05-.22-.11-.93-.34-1.78-1.1a6.7 6.7 0 0 1-1.24-1.54c-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.05-.11-.5-1.2-.68-1.64-.18-.43-.36-.37-.5-.38h-.43c-.15 0-.39.05-.59.28-.2.22-.78.76-.78 1.85 0 1.09.8 2.14.91 2.29.11.15 1.57 2.4 3.81 3.36.53.23.95.37 1.27.47.53.17 1.01.15 1.39.09.42-.06 1.31-.54 1.49-1.06.18-.52.18-.96.13-1.06-.05-.1-.2-.16-.42-.27Z" />
      </svg>
    </a>
  );
}
