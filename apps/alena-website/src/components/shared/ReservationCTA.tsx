import { env } from "@/lib/env";

export function ReservationCTA({
  className,
  label = "הזמן שולחן",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={env.NEXT_PUBLIC_ONTOPO_URL}
      target="_blank"
      rel="noopener"
      aria-label={`${label} — נפתח בחלון חדש`}
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-semibold text-cream shadow-xl shadow-terracotta/25 ring-1 ring-inset ring-brass/30 transition hover:bg-terracotta-600 hover:shadow-2xl hover:shadow-terracotta/40 ${className ?? ""}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-brass-soft transition group-hover:translate-x-0.5">
        ←
      </span>
    </a>
  );
}
