// Smart top announcement banner.
//
// `static`  — always shows this banner, ignores day-of-week.
// `byDay`   — picks the banner that matches today (0=Sun ... 6=Sat).
//             Friday (5) is skipped (closed). If no entry for a day,
//             falls back to `defaultBanner`.
//
// Set ALL to null to hide entirely.

export type BannerContent = {
  message: string;
  cta: string;
  href: string;
};

// If non-null, this always wins (use for short campaigns: chag, vendor outage etc.)
export const staticBanner: BannerContent | null = null;

// Day-of-week mapping (JS Date.getDay()): 0=Sunday, 6=Saturday
export const byDay: Record<number, BannerContent | undefined> = {
  0: {
    message: "🍔 הערב: Burger Night — ספיישלים שלא בתפריט הרגיל",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
  1: {
    message: "🍷 הערב: ערב יין — ללא תחתית מ-61 ₪ בכוסות",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
  2: {
    message: "🥩 הערב: Butcher Night — נתחי הפתעה ומנות שף",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
  3: {
    message: "✨ Happy Hour עד 20:00 — 40% הנחה על האלכוהול",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
  4: {
    message: "🔥 חמישי בעלינא — פתוחים עד 02:00, האווירה בשיא",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
  5: undefined, // Friday closed
  6: {
    message: "🌙 מוצ\"ש בעלינא — פותחים מ-20:15 עד הלקוח האחרון",
    cta: "להזמנת שולחן",
    href: "https://ontopo.com/he/il/page/15703580",
  },
};

export const defaultBanner: BannerContent = {
  message: "🍷 ערבי נושא בעלינא — ראשון בורגרים, שני יין, שלישי קצב",
  cta: "להזמנת שולחן",
  href: "https://ontopo.com/he/il/page/15703580",
};
