import { env } from "@/lib/env";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 gap-px border-t border-brass/30 bg-charcoal text-cream backdrop-blur md:hidden">
      <a
        href={`tel:${env.NEXT_PUBLIC_PHONE}`}
        className="flex flex-col items-center justify-center py-2.5 text-[0.7rem]"
      >
        <span className="text-lg">📞</span>
        <span>התקשר</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_WHATSAPP_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center border-x border-brass/15 py-2.5 text-[0.7rem]"
      >
        <span className="text-lg">💬</span>
        <span>WhatsApp</span>
      </a>
      <a
        href={env.NEXT_PUBLIC_ONTOPO_URL}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center justify-center bg-terracotta py-2.5 text-[0.7rem] font-semibold"
      >
        <span className="text-lg">🍽️</span>
        <span>הזמן שולחן</span>
      </a>
    </div>
  );
}
