import { Phone, MessageCircle, Bike } from "lucide-react";
import { env } from "@/lib/env";

// Owner's ordering system on valuecard.co.il — direct link to the Alena Bepita menu.
const DELIVERY_URL = "https://valuecard.co.il/Orders/alenabepita";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-brass/30 bg-charcoal text-cream md:hidden">
      <a
        href={`tel:${env.NEXT_PUBLIC_PHONE}`}
        className="flex flex-col items-center justify-center gap-0.5 py-2.5"
        aria-label="התקשר"
      >
        <Phone className="size-5 text-brass" />
        <span className="text-[0.65rem]">התקשר</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_WHATSAPP_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center gap-0.5 border-r border-brass/15 py-2.5"
        aria-label="WhatsApp"
      >
        <MessageCircle className="size-5 text-[#25D366]" />
        <span className="text-[0.65rem]">WhatsApp</span>
      </a>
      <a
        href={DELIVERY_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center gap-0.5 border-x border-brass/15 bg-olive/90 py-2.5 font-bold"
        aria-label="הזמן משלוח"
      >
        <Bike className="size-5 text-brass-soft" />
        <span className="text-[0.65rem]">משלוח</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_ONTOPO_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center gap-0.5 bg-terracotta py-2.5 font-bold"
        aria-label="הזמן שולחן"
      >
        <span className="text-base">🍽️</span>
        <span className="text-[0.65rem]">שולחן</span>
      </a>
    </div>
  );
}
