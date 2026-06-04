// Welcome modal content. Edit at any time — tags after the heading.
// Set `enabled: false` to hide the popup entirely.

export const welcome = {
  enabled: true,
  // Bump this version (`v2`, `v3`...) whenever you want every visitor to
  // see the popup again — even repeat visitors who already dismissed it.
  version: "v1",
  // Top eyebrow chip
  eyebrow: "ברוכים הבאים",
  // Main lines (Hebrew display serif)
  lines: [
    "🎉 ערב חדש בעלינא",
    "ראשון בערב — Burger Night",
  ],
  // Body paragraph
  body:
    "ועוד עניין חשוב — עלינא עברה לכתובת חדשה: רוטשילד 104, ראשון לציון. אותו צוות, אותו אוכל, אבל בית חדש ויפה יותר.",
  // Primary CTA (sends to OnTopo by default)
  ctaPrimary: { label: "להזמנת שולחן", href: "https://ontopo.com/he/il/page/15703580" },
  // Secondary CTA
  ctaSecondary: { label: "לצפייה בתפריט", href: "/menu" },
  // Optional inline image (path under /public). null to hide.
  image: "/gallery/burger-hero.jpg",
};
