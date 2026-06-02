# אתר חדש לאלנה (Alena Hamara) — Design Spec

**Status:** Draft, pending review
**Date:** 2026-06-03
**Owner:** Dvir Nifusi
**Stakeholder:** עלינא — חמארה ים-תיכונית כשרה, רוטשילד 104, ראשון לציון

---

## 1. Goal

Replace `alenabepita.co.il` with a new high-conversion, SEO-optimized restaurant website that:

1. Drives reservations via OnTopo, private-event leads, and delivery clicks (in that order of priority).
2. Ranks first on Google for high-intent local queries in Rishon LeZion: "בר מסעדה כשר בראשון", "חמארה ראשון", "המבורגר ראשון", "בשר ראשון", "סטייק ראשון", "ארוחת בוקר ראשון", and "אירועי חברה ראשון".
3. Presents a more "fancy" Mediterranean-kosher brand than the current site while staying inviting, fun, and colorful (not dark/moody).
4. Gives the owner (Dvir) self-service control over menu, hours, banners, and blog via a CMS he can run from his phone.

Out of scope: integration with the internal `topalena` operator app, a full e-commerce ordering system (delivery is link-out), multilingual content beyond Hebrew (v1).

## 2. Architecture

New standalone app inside the existing monorepo:

```
TOP ALENA/
└── apps/
    └── alena-website/        # NEW
```

It deploys independently from `apps/api` and the `topalena` migration project. The two share no runtime code or auth — they only coexist in the repo for developer convenience.

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSG + ISR = best-in-class SEO; React-based so familiar to the existing codebase |
| Language | TypeScript (strict) | Catch CMS-schema drift at build time |
| Styling | Tailwind CSS v4 | Mature RTL support, matches existing project conventions |
| Components | shadcn/ui (customized) | Accessible primitives, owned in-repo |
| Animation | Framer Motion | Subtle reveals and hover; do not block LCP |
| CMS | Sanity v3 (Studio embedded at `/studio`) | Free tier covers us; mobile-friendly editor; structured content with image hotspots |
| Forms | React Hook Form + Zod | Type-safe event-inquiry form |
| Email | Resend + React Email | Lead confirmation + internal notification |
| Reservations | OnTopo embed (existing widget: `https://ontopo.com/he/il/page/15703580`) | Owner-confirmed system |
| Search Console | Google Search Console + Bing Webmaster | Indexing + rank tracking |
| Analytics | Vercel Analytics + GA4 + Meta Pixel | Performance + conversion + remarketing |
| Hosting | Vercel | Native Next.js, free tier sufficient initially |

### Principles

- **RTL first.** All layouts, components, and utility classes assume RTL Hebrew. LTR is never the default.
- **Mobile-first.** Designed for iPhone/Android first; desktop is the secondary layout. Sticky bottom CTA bar on mobile is always visible.
- **Performance budget.** Lighthouse mobile scores ≥95 in Performance, SEO, Accessibility, Best Practices. LCP < 2.0s on 4G.
- **Schema.org markup on every page.** `Restaurant`, `Menu`, `MenuItem`, `LocalBusiness`, `Event`, `FAQPage`, `BreadcrumbList`, `Review` where applicable.

## 3. Sitemap

### Primary pages (7)
- `/` — Home
- `/תפריט` — Full menu
- `/אירועים` — Private events (lead form)
- `/משלוחים` — Delivery / Take Away (link-out to active services)
- `/גלריה` — Gallery (Instagram + curated)
- `/אודות` — Story, team, kashrut
- `/צור-קשר` — Map, phone, WhatsApp, hours, parking

### SEO landing pages (7)
Each is a unique long-form page (600–900 Hebrew words), not a duplicate of the home page. Each targets one keyword:

- `/חמארה-בראשון-לציון`
- `/בר-מסעדה-כשר-בראשון`
- `/המבורגר-בראשון`
- `/בשר-כשר-בראשון`
- `/סטייק-בראשון`
- `/ארוחת-בוקר-בראשון`
- `/אירועי-חברה-בראשון`

### Blog
- `/בלוג` — Index
- `/בלוג/[slug]` — Post

Seed posts at launch:
1. "המבורגר הכי טוב בראשון לציון — איפה ולמה"
2. "מה זה חמארה? המדריך הקצר לאוכל ים-תיכוני"
3. "איך להפיק אירוע פרטי לחברה במסעדה — צ'קליסט מנהל משאבי אנוש"

## 4. SEO strategy

### Per-page technical
- `next-sitemap` for `sitemap.xml` and `robots.txt`
- Per-page `<title>`, `<meta description>`, OG/Twitter cards (auto-generated from CMS fields, with manual override)
- Canonical URLs everywhere
- Dynamic Open Graph images via `@vercel/og` (Hebrew, restaurant branding)
- `next/image` for every image with explicit alt text in Hebrew (CMS-editable)
- Font subsetting (Hebrew glyphs only) via `next/font/google`

### Landing page template
Each of the 7 SEO landing pages uses the same structure but unique content:
1. Hero with H1 containing target keyword exactly
2. 600–900 word body addressing intent (what it is, why Alena, what's on offer)
3. Curated sub-menu (e.g. burger page shows only burgers)
4. 3–5 customer reviews with `Review` schema
5. 5–8 FAQs with `FAQPage` schema
6. Map + hours + phone (`LocalBusiness` schema)
7. Dual CTA: OnTopo embed + click-to-call

### Off-page
- Google Business Profile claimed + synced with site hours
- Submit sitemap to Google Search Console + Bing Webmaster
- 301 redirects from every existing `alenabepita.co.il` URL to the closest equivalent on the new site (preserves existing authority)

## 5. Visual design system

**Brand summary:** Inviting Mediterranean kosher hummusiya — colorful but minimal, fancy but not stuffy, warm not loud.

### Colors

| Role | Name | Hex |
|---|---|---|
| Primary | Terracotta | `#C65D3A` |
| Secondary | Olive | `#5A6B3B` |
| Accent | Lemon | `#F4C95D` |
| Accent 2 | Mediterranean Blue | `#4A7C8C` |
| Background | Cream | `#FAF3E7` |
| Text | Charcoal | `#2B2825` |

### Typography

- Hebrew headings: **Frank Ruhl Libre** (serif, refined, distinctly Israeli)
- Hebrew body: **Heebo** (high legibility on mobile)
- Numbers / prices: **Inter** (commercial clarity)

### Components

- Generous whitespace; cream not white
- Oversized food photography as the visual hero
- Subtle fade-in-on-scroll and slow image zoom on hover
- Bold rounded CTA buttons (terracotta on cream)
- Menu cards: image + name + short description + price; hover reveals "הזמן עכשיו"
- Mobile sticky bottom bar: 📞 התקשר · 💬 WhatsApp · 🍽️ הזמן שולחן

### Anti-patterns

- No generic stock photography
- No cartoonish or hand-drawn backgrounds
- No emoji in headlines without contextual reason
- No glowing gradients or neon
- No dark/moody steakhouse aesthetic

## 6. Integrations

| Service | Purpose | Status |
|---|---|---|
| OnTopo | Reservations | Existing widget: `https://ontopo.com/he/il/page/15703580` |
| WhatsApp Business | Direct chat | Existing: `https://wa.me/972503962976` |
| Google Business Profile | Hours, reviews, photo sync | Needs owner-claim verification |
| Google Maps Embed | Map + navigation | Address: רוטשילד 104, ראשון לציון |
| Waze deep-link | Mobile navigation CTA | `https://waze.com/ul?ll=...` from address |
| Instagram Basic Display API | Pull 12 latest from [@alena.hamara](https://instagram.com/alena.hamara) | Needs Instagram app + access token |
| Wolt / 10bis / תן ביס | Delivery link-out | Owner to confirm active services |
| Resend | Event-lead emails | New Resend account on alena domain |
| GA4 | Analytics + conversion goals | New property |
| Meta Pixel | Facebook/Instagram remarketing | Owner Facebook Business Manager |
| Vercel Analytics | Core Web Vitals tracking | Built-in to Vercel deploy |

## 7. CMS schema (Sanity)

Sanity Studio mounted at `/studio` (password-protected; owner has admin login).

Editable document types:

- `menuItem` — name (he), description (he), price (₪), image with hotspot, category, tags (חדש/מומלץ/חריף/טבעוני), allergens, available (bool)
- `menuCategory` — name, order, image
- `eventPackage` — name, description, min/max guests, price-per-head, image
- `blogPost` — title, slug, hero image, body (Portable Text), publishedAt, SEO fields
- `landingPage` — slug, H1, hero image, body (Portable Text), FAQs (array), reviews to show, related menu items, SEO fields
- `review` — author, rating, body, source (Google / direct), date
- `banner` — message, CTA text, CTA link, active (bool), priority
- `hours` — day, open/close ranges, special-day overrides
- `siteSettings` — phone, WhatsApp, address, social URLs, kashrut certificate image

## 8. Known facts (auto-collected for content seed)

From `alenabepita.co.il`, the OnTopo page, and project memory:

- **Name:** עלינא (Alena)
- **Tagline (current):** "חמארה ים תיכונית כשרה, בר רחוב שהוא שמח"
- **Address:** רוטשילד 104, ראשון לציון
- **Phone:** 03-622-8055
- **WhatsApp:** +972-50-396-2976
- **Reservation:** OnTopo, page 15703580
- **Hours (from OnTopo):**
  - Sun, Mon, Wed: 12:00–00:00 (lunch + dinner + late drinks)
  - Tue: 12:00–00:00 (Butcher Night 19:00–23:00)
  - Thu: 12:00–open-end
  - Fri: closed
  - Sat: 20:15–02:00 (motzaei shabbat)
- **Private room:** up to 50 guests
- **Social:** Instagram @alena.hamara, Facebook ALENA.BIGASDHOD
- **Theme nights:** Sunday burger night, Monday wine, Tuesday butcher

**Still needed from owner (to be collected before launch, not before plan-writing):**
1. Kashrut certificate (photo + certifying body)
2. Active delivery services (Wolt / 10bis / תן ביס / other)
3. Private-event T&Cs document, if any
4. Owner approval on auto-drafted "About" text
5. Domain registrar access for final DNS cutover

## 9. Delivery approach

Owner request: **one-shot delivery**, not phase-by-phase review. Build the entire site end-to-end, present a fully working preview, then iterate.

Internal build order (for the implementation plan):

1. Scaffold Next.js + Tailwind + shadcn + Sanity in `apps/alena-website/`
2. Design system (colors, fonts, base components, RTL primitives, sticky mobile CTA)
3. Sanity schemas + seed scripts (from §8 facts + Instagram scrape)
4. Primary pages (Home, Menu, Events, Delivery, Gallery, About, Contact)
5. 7 SEO landing pages (shared template, unique CMS-driven content)
6. Blog (index + post template + 3 seed posts)
7. Schema.org markup, sitemap, robots, OG image generation
8. Analytics, Search Console, Meta Pixel wiring
9. Performance pass to Lighthouse 95+
10. Preview deploy on Vercel for owner review

Cutover to the production domain is the final step and is decided after owner reviews the preview.

## 10. Hosting and cost

- **Vercel Hobby**: free for the preview and initial launch. Upgrade to Pro (~$20/mo) only if traffic exceeds free-tier limits.
- **Sanity Free**: 3 users, 10K documents — well within scope.
- **Resend Free**: 3,000 emails/month.
- **Domain**: ~₪50/year if a new domain is registered; otherwise reuse `alenabepita.co.il`.
- **Initial monthly run-rate:** effectively ₪0.

## 11. Domain decision (deferred)

Three options, to be resolved after preview review:

1. **Replace `alenabepita.co.il`** — preserves accumulated SEO via 301 redirects. **Recommended.**
2. **New domain** (e.g. `alena.co.il`, `alenahamara.co.il`) — clean slate, slower SEO ramp.
3. **Temporary subdomain** (`new.alenabepita.co.il`) — staging only.

## 12. Success criteria

- Lighthouse mobile ≥95 on all four axes
- All 14 pages indexed by Google within 30 days of launch
- First-page Google ranking for at least 3 of the 7 target keywords within 90 days
- ≥30% increase in OnTopo reservations attributable to the site within 60 days (baseline: current site traffic)
- Owner can publish a new blog post or update the menu from their phone in under 5 minutes without engineering help

---

## Next step

After owner approval of this spec, the next action is to invoke the `superpowers:writing-plans` skill to produce a step-by-step implementation plan against this design.
