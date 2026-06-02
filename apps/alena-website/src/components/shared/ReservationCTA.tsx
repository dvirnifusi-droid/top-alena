import { env } from "@/lib/env";

export function ReservationCTA({ className, label = "הזמן שולחן" }: { className?: string; label?: string }) {
  return (
    <a
      href={env.NEXT_PUBLIC_ONTOPO_URL}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-3 font-semibold text-cream shadow-lg shadow-terracotta/20 transition hover:bg-terracotta-600 hover:shadow-xl ${className ?? ""}`}
    >
      🍽️ {label}
    </a>
  );
}
