import { Phone, MessageCircle } from "lucide-react";
import { env } from "@/lib/env";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-brass/30 bg-charcoal text-cream md:hidden">
      <a
        href={`tel:${env.NEXT_PUBLIC_PHONE}`}
        className="flex flex-col items-center justify-center gap-0.5 py-2.5"
      >
        <Phone className="size-5 text-brass" />
        <span className="text-[0.7rem]">התקשר</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_WHATSAPP_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center gap-0.5 border-x border-brass/15 py-2.5"
      >
        <MessageCircle className="size-5 text-[#25D366]" />
        <span className="text-[0.7rem]">WhatsApp</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_ONTOPO_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center gap-0.5 bg-terracotta py-2.5 font-bold"
      >
        <span className="text-base">🍽️</span>
        <span className="text-[0.7rem]">הזמן שולחן</span>
      </a>
    </div>
  );
}
