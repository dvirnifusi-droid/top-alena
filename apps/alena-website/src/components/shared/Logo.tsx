// Brand wordmark — owner's official hand-drawn "עָלֵינָא" PNG, with optional
// tracking-spaced tagline. Two color variants live in /public:
//   logo-alena-dark.png   →  charcoal ink, for cream/white backgrounds
//   logo-alena-light.png  →  cream ink, for charcoal/olive/terracotta backgrounds
//
// Pass `variant="light"` on dark backgrounds. Default is "dark".

import Image from "next/image";

type Props = {
  className?: string;
  withTagline?: boolean;
  variant?: "dark" | "light";
};

export function Logo({ className, withTagline = true, variant = "dark" }: Props) {
  const src = variant === "light" ? "/logo-alena-light.png" : "/logo-alena-dark.png";
  const taglineColor = variant === "light" ? "text-brass-soft" : "text-brass";
  return (
    <span className={`inline-flex flex-col items-center leading-none ${className ?? ""}`} aria-label="עלינא">
      <Image
        src={src}
        alt="עלינא"
        width={160}
        height={108}
        priority
        className="h-12 w-auto sm:h-14"
      />
      {withTagline ? (
        <span className={`mt-1.5 text-[0.55rem] uppercase tracking-[0.35em] ${taglineColor}`}>
          חמארה · רוטשילד 104
        </span>
      ) : null}
    </span>
  );
}
