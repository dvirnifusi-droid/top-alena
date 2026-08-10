// Direct link to the owner's WooCommerce delivery site.
// Kept as its own component (mirrors ReservationCTA) so we can style/route
// consistently everywhere it's used — hero, sticky mobile bar, footer, delivery page.

const DELIVERY_URL = "https://alenabepita.co.il/shop/";

export function DeliveryCTA({
  className,
  label = "הזמן משלוח",
  variant = "outline",
}: {
  className?: string;
  label?: string;
  /**
   * "outline" pairs with a bright `ReservationCTA` alongside it (secondary look).
   * "solid" is stand-alone / dark-background hero blocks.
   */
  variant?: "outline" | "solid";
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold shadow-xl transition";
  const styles =
    variant === "solid"
      ? "bg-olive text-cream shadow-olive/25 ring-1 ring-inset ring-brass/30 hover:bg-olive/90 hover:shadow-2xl hover:shadow-olive/40"
      : "bg-cream text-charcoal ring-1 ring-inset ring-brass/50 shadow-charcoal/15 hover:bg-brass-soft/40 hover:shadow-2xl hover:shadow-charcoal/25";
  return (
    <a
      href={DELIVERY_URL}
      target="_blank"
      rel="noopener"
      aria-label={`${label} — נפתח בחלון חדש`}
      className={`${base} ${styles} ${className ?? ""}`}
    >
      <span aria-hidden="true" className="text-lg leading-none">🚲</span>
      <span>{label}</span>
      <span aria-hidden="true" className="text-brass transition group-hover:translate-x-0.5">
        ←
      </span>
    </a>
  );
}
