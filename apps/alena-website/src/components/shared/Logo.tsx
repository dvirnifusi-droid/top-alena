// Brand wordmark — Hebrew "עלינא" in display serif with olive-branch flourish
// and tracking-spaced kosher tagline. Designed against the cream palette.

export function Logo({ className, withTagline = true }: { className?: string; withTagline?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`} aria-label="עלינא">
      {/* Olive-branch flourish */}
      <svg
        viewBox="0 0 56 32"
        className="h-7 w-12 shrink-0 text-brass"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M2 18 Q14 8 28 14 Q42 20 54 12"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="10" cy="14" rx="3.5" ry="2" transform="rotate(-25 10 14)" fill="#44512C" />
        <ellipse cx="22" cy="11.5" rx="3.5" ry="2" transform="rotate(-5 22 11.5)" fill="#44512C" />
        <ellipse cx="34" cy="14.5" rx="3.5" ry="2" transform="rotate(15 34 14.5)" fill="#44512C" />
        <ellipse cx="46" cy="13.5" rx="3.5" ry="2" transform="rotate(-10 46 13.5)" fill="#44512C" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-3xl font-black tracking-wide text-terracotta sm:text-4xl">
          עלינא
        </span>
        {withTagline ? (
          <span className="mt-1 text-[0.55rem] uppercase tracking-[0.35em] text-brass">
            חמארה · רוטשילד 104
          </span>
        ) : null}
      </span>
    </span>
  );
}
