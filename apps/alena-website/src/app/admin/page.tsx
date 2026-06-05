import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ExternalLink } from "lucide-react";
import { env } from "@/lib/env";
import { posts } from "@/content/blog";
import { menu } from "@/content/menu";
import { reviews } from "@/content/reviews";
import { galleryPhotos } from "@/lib/gallery";

// This is intentionally unlisted in the public nav. Owner accesses it
// directly. No PII here — just outbound links and counts.
export const metadata = { title: "אדמין | עלינא", robots: { index: false, follow: false } };

const tools = [
  {
    group: "ניהול תוכן",
    items: [
      {
        title: "Sanity Studio",
        desc: "תפריט, ביקורות, באנרים, פוסטי בלוג",
        href: "/studio",
        external: false,
      },
      {
        title: "Vercel Dashboard",
        desc: "פריסות, env vars, דומיינים",
        href: "https://vercel.com/dashboard",
        external: true,
      },
      {
        title: "GitHub",
        desc: "מקור הקוד",
        href: "https://github.com/dvirnifusi",
        external: true,
      },
    ],
  },
  {
    group: "אנליטיקס",
    items: [
      {
        title: "Vercel Analytics",
        desc: "תנועה, מהירות, Web Vitals",
        href: "https://vercel.com/dvirnifusi-3249s-projects/alena-website/analytics",
        external: true,
      },
      {
        title: "Google Analytics 4",
        desc: env.NEXT_PUBLIC_GA_ID ? "מותקן ופעיל" : "טרם הוגדר",
        href: "https://analytics.google.com",
        external: true,
      },
      {
        title: "Microsoft Clarity",
        desc: env.NEXT_PUBLIC_CLARITY_ID
          ? "פעיל — Heatmaps + הקלטות"
          : "לא פעיל — צריך Project ID",
        href: "https://clarity.microsoft.com",
        external: true,
      },
      {
        title: "Meta Pixel",
        desc: env.NEXT_PUBLIC_META_PIXEL_ID ? "מותקן" : "טרם הוגדר",
        href: "https://business.facebook.com/events_manager",
        external: true,
      },
    ],
  },
  {
    group: "SEO",
    items: [
      {
        title: "Google Search Console",
        desc: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? "מאומת" : "טרם אומת",
        href: "https://search.google.com/search-console",
        external: true,
      },
      {
        title: "Bing Webmaster Tools",
        desc: env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? "מאומת" : "טרם אומת",
        href: "https://www.bing.com/webmasters",
        external: true,
      },
      {
        title: "Google Business Profile",
        desc: "ניהול עסק בגוגל ובגוגל מפות",
        href: "https://business.google.com",
        external: true,
      },
      {
        title: "sitemap.xml שלנו",
        desc: "אינדקס מלא של דפי האתר",
        href: "/sitemap.xml",
        external: false,
      },
    ],
  },
  {
    group: "תפעול",
    items: [
      {
        title: "OnTopo (הזמנות)",
        desc: "ניהול הזמנות שולחנות",
        href: "https://ontopo.com",
        external: true,
      },
      {
        title: "ValueCard (משלוחים)",
        desc: "ניהול הזמנות משלוח",
        href: "https://valuecard.co.il/Orders/alenabepita",
        external: true,
      },
      {
        title: "סוכן AI אירועים",
        desc: "סגירת אירועים פרטיים",
        href: "https://topalena.com/EventsInquiry?utm_source=admin",
        external: true,
      },
      {
        title: "סוכן AI גיוס",
        desc: "מיון מועמדים",
        href: "https://topalena.com/apply?utm_source=admin",
        external: true,
      },
    ],
  },
  {
    group: "תוכן + מדיה",
    items: [
      {
        title: "Instagram @alena.hamara",
        desc: "פיד הראשי",
        href: "https://instagram.com/alena.hamara",
        external: true,
      },
      {
        title: "Spotify Playlist",
        desc: "המוזיקה של עלינא",
        href: `https://open.spotify.com/playlist/${env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID}`,
        external: true,
      },
      {
        title: "Google Drive — תמונות",
        desc: "מקור התמונות לאתר",
        href: "https://drive.google.com/drive/folders/1RS9I7IvOflO9oD981cwD4Tm_13NHFV9R",
        external: true,
      },
    ],
  },
];

const stats = [
  { label: "פוסטי בלוג", value: posts.length },
  {
    label: "מנות בתפריט",
    value: menu.reduce((s, sec) => s + sec.items.length, 0),
  },
  { label: "ביקורות", value: reviews.length },
  { label: "תמונות גלריה", value: galleryPhotos.length },
];

export default function AdminPage() {
  return (
    <Container className="py-16">
      <header className="mb-12">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">פאנל ניהול</p>
        <h1 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">מאחורי הקלעים</h1>
        <p className="mt-3 text-charcoal/65">
          קישורים לכל המערכות המחוברות לאתר. הדף הזה לא מקושר מהתפריט הציבורי, רק דרך URL.
        </p>
      </header>

      {/* Quick stats */}
      <section className="mb-16 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-cream-soft p-5 text-center ring-1 ring-brass/15"
          >
            <p className="font-numeric text-4xl font-black text-terracotta">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-charcoal/60">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Tool groups */}
      <div className="space-y-12">
        {tools.map((g) => (
          <section key={g.group}>
            <h2 className="mb-5 font-display text-2xl text-charcoal">{g.group}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((t) => {
                const Tag = t.external ? "a" : Link;
                const tagProps = {
                  href: t.href,
                  target: t.external ? ("_blank" as const) : undefined,
                  rel: t.external ? "noopener" : undefined,
                  className:
                    "group flex items-start justify-between rounded-2xl border border-brass/15 bg-cream-soft p-5 transition hover:border-brass hover:shadow-md",
                };
                return (
                  <Tag key={t.title} {...tagProps}>
                    <div>
                      <p className="font-display text-lg text-charcoal group-hover:text-terracotta">
                        {t.title}
                      </p>
                      <p className="mt-1 text-sm text-charcoal/65">{t.desc}</p>
                    </div>
                    <ExternalLink
                      aria-hidden="true"
                      className="size-4 shrink-0 text-charcoal/40 transition group-hover:text-terracotta"
                    />
                  </Tag>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-16 rounded-3xl bg-olive p-8 text-cream md:p-10">
        <p className="text-xs uppercase tracking-[0.25em] text-brass-soft">סטטוס</p>
        <h2 className="mt-2 font-display text-3xl">מה עוד צריך לחבר</h2>
        <ul className="mt-5 space-y-2 text-cream/85">
          {!env.NEXT_PUBLIC_CLARITY_ID && (
            <li>• Microsoft Clarity — חינם, מעניק heatmaps + הקלטות session</li>
          )}
          {!env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && (
            <li>• Google Search Console — להגשת המפת אתר לגוגל</li>
          )}
          {!env.NEXT_PUBLIC_GA_ID && <li>• Google Analytics 4 — למעקב פירוט</li>}
          {!env.NEXT_PUBLIC_META_PIXEL_ID && <li>• Meta Pixel — לרימרקטינג בפייסבוק/אינסטגרם</li>}
          {!env.RESEND_API_KEY && (
            <li>• Resend — לשליחת מיילים מטופס אירועים + רשימת תפוצה</li>
          )}
        </ul>
        <p className="mt-5 text-sm text-cream/65">
          לכל חיבור חדש: ההגדרה היא בערך ENV משתנה ב-Vercel + פריסה מחדש. אני מטפל בקוד, אתה
          רק שולח את ה-ID.
        </p>
      </section>
    </Container>
  );
}
