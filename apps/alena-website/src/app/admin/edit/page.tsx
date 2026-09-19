// Owner edit hub — one place with quick deep-links into every editable area of the site.
// Everything routes into /studio (Sanity), so there's no separate auth system.
// Whenever a section reads from Sanity, the "edit" link points at the exact type there.

import Link from "next/link";
import { Container } from "@/components/layout/Container";

export const metadata = { title: "עריכה — עלינא", robots: { index: false, follow: false } };

type Item = {
  title: string;
  desc: string;
  href: string;
  emoji: string;
};

type Group = {
  title: string;
  eyebrow: string;
  items: Item[];
};

// Sanity Studio "desk" URL builder. `/studio/desk/<type>` opens the type's document list.
const S = (type: string) => `/studio/desk/${type}`;
// Singletons open the same list URL — Sanity Studio auto-focuses the single doc.
const SDoc = (type: string) => `/studio/desk/${type}`;

const groups: Group[] = [
  {
    eyebrow: "תמונות",
    title: "תמונות באתר · לפי מקום",
    items: [
      {
        title: "תמונות בעמוד הבית / אירועים / אודות / תפריט…",
        desc: "18 משבצות מסודרות לפי עמוד. Hero, Story, אירועים, תמונת סוכן AI ועוד.",
        href: SDoc("sitePhotos"),
        emoji: "🖼",
      },
      {
        title: "גלריה — הוסף / הסר / סדר מחדש",
        desc: "כל תמונה בעמוד /gallery. תוכל להעלות חדשות, למחוק ישנות, ולסמן אילו יופיעו גם בבית.",
        href: S("galleryImage"),
        emoji: "📸",
      },
    ],
  },
  {
    eyebrow: "תפריט",
    title: "מנות, מחירים ותמונות",
    items: [
      {
        title: "מנות — שם / תיאור / מחיר / תמונה",
        desc: "עורך כל מנה בנפרד. תוכל להוסיף מנה חדשה, להעלות תמונה, לשנות מחיר.",
        href: S("menuItem"),
        emoji: "🍽",
      },
      {
        title: "קטגוריות התפריט",
        desc: "פתיחות, עיקריות, המבורגרים, שתייה. שנה שם או סדר.",
        href: S("menuCategory"),
        emoji: "📋",
      },
      {
        title: "להסתיר / להראות מחירים בכל האתר",
        desc: "מתג אחד ב'הגדרות אתר' → 'להסתיר מחירים'. שנה למצב שאתה רוצה.",
        href: SDoc("siteSettings"),
        emoji: "₪",
      },
    ],
  },
  {
    eyebrow: "אירועים",
    title: "אירועים פרטיים",
    items: [
      {
        title: "חבילות אירועים",
        desc: "מחירים, מספרי אנשים, מה כלול בכל חבילה.",
        href: S("eventPackage"),
        emoji: "🎉",
      },
    ],
  },
  {
    eyebrow: "תוכן",
    title: "בלוג, ביקורות, דפי SEO",
    items: [
      {
        title: "פוסטים בבלוג",
        desc: "כתוב או ערוך פוסטים חדשים. כל פוסט מקבל URL משלו וקישור בגוגל.",
        href: S("blogPost"),
        emoji: "📝",
      },
      {
        title: "ביקורות",
        desc: "הוסף ביקורות מסועדים שכתבו לך בפרטי, או מגוגל. יופיעו בעמוד הבית.",
        href: S("review"),
        emoji: "⭐",
      },
      {
        title: "דפי SEO (Landing Pages)",
        desc: "19 דפים ייעודיים לחיפושים כמו 'ג'וספר ראשון' / 'ערב יין' / 'מוצ\"ש'. עריכת טקסט + FAQ.",
        href: S("landingPage"),
        emoji: "🎯",
      },
      {
        title: "באנר עליון",
        desc: "טקסט מתחלף למעלה (למשל 'ערב חדש בעלינא — ראשון בערב Burger Night').",
        href: S("banner"),
        emoji: "📢",
      },
    ],
  },
  {
    eyebrow: "פרטים כללים",
    title: "טלפון · כתובת · שעות · לינקים",
    items: [
      {
        title: "הגדרות האתר",
        desc: "טלפון, כתובת, WhatsApp, OnTopo, Instagram, פלייליסט Spotify, תעודת כשרות.",
        href: SDoc("siteSettings"),
        emoji: "⚙️",
      },
      {
        title: "שעות פתיחה",
        desc: "שנה שעות ליום ספציפי (חופשה, שינוי חד-פעמי).",
        href: S("hours"),
        emoji: "🕐",
      },
    ],
  },
];

export default function AdminEditHubPage() {
  return (
    <Container className="py-16">
      <div className="mb-12">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
          <span className="h-px w-8 bg-brass" />
          עריכה
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">מה תרצה לשנות?</h1>
        <p className="mt-4 max-w-2xl text-lg text-charcoal/75">
          כל מה שבאתר — תמונות, מנות, מחירים, בלוג, שעות פתיחה, ביקורות — נערך מפה. לחץ על כרטיס
          ותועבר ישר לעורך. השינויים חיים באתר תוך דקה עד 5.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/studio"
            className="rounded-full bg-charcoal px-5 py-2.5 text-sm font-semibold text-cream ring-1 ring-brass/40 hover:bg-charcoal/85"
          >
            פתח את מערכת הניהול המלאה →
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-brass/40 px-5 py-2.5 text-sm font-semibold text-charcoal hover:bg-cream-soft"
          >
            לוח בקרה של הזמנות ופניות
          </Link>
        </div>
      </div>

      <div className="space-y-14">
        {groups.map((g) => (
          <section key={g.title}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.3em] text-brass">{g.eyebrow}</p>
              <h2 className="mt-1 font-display text-3xl text-charcoal">{g.title}</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {g.items.map((it) => (
                <Link
                  key={it.title}
                  href={it.href}
                  target="_blank"
                  className="group flex items-start gap-4 rounded-2xl border border-brass/20 bg-cream-soft p-5 transition hover:border-brass hover:shadow-lg hover:shadow-brass/10"
                >
                  <div className="text-3xl">{it.emoji}</div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-charcoal group-hover:text-terracotta">
                      {it.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-charcoal/70">{it.desc}</p>
                  </div>
                  <div className="pt-1 text-brass transition group-hover:translate-x-0.5">←</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="mt-14 rounded-3xl bg-olive p-8 text-cream">
        <p className="text-xs uppercase tracking-[0.25em] text-brass-soft">טיפ</p>
        <h3 className="mt-2 font-display text-2xl">כל השינויים ב-Sanity חיים תוך דקה עד 5.</h3>
        <p className="mt-2 text-cream/85">
          Sanity שומר גם היסטוריה של כל שינוי. אם בטעות מחקת משהו — יש כפתור "History" בפינה של כל
          פריט שמאפשר לשחזר גרסה קודמת.
        </p>
      </aside>
    </Container>
  );
}
