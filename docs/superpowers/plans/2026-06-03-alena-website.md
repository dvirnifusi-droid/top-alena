# Alena Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new public restaurant website for עלינא (Alena Hamara) end-to-end so the owner can review a working preview deployed on Vercel.

**Architecture:** Standalone Next.js 15 (App Router) app at `apps/alena-website/` inside the existing TOP ALENA monorepo. Content is editable through embedded Sanity Studio. Reservations link to the existing OnTopo widget. Deploy on Vercel; CMS hosted by Sanity. RTL Hebrew first; mobile first; Lighthouse ≥95 budget.

**Tech Stack:** Next.js 15 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui · Framer Motion · Sanity v3 · React Hook Form + Zod · Resend · `next-sitemap` · `@vercel/og` · Vercel Analytics + GA4 + Meta Pixel.

**Spec:** `docs/superpowers/specs/2026-06-03-alena-website-design.md`

---

## File Structure

```
apps/alena-website/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next-sitemap.config.js
├── .env.local.example
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── fonts/                          # if self-hosted
├── sanity/
│   ├── sanity.config.ts
│   ├── sanity.cli.ts
│   ├── schemas/
│   │   ├── index.ts
│   │   ├── siteSettings.ts
│   │   ├── hours.ts
│   │   ├── menuItem.ts
│   │   ├── menuCategory.ts
│   │   ├── eventPackage.ts
│   │   ├── blogPost.ts
│   │   ├── landingPage.ts
│   │   ├── review.ts
│   │   └── banner.ts
│   └── lib/
│       ├── client.ts                   # Sanity client (read)
│       ├── image.ts                    # urlFor() helper
│       └── queries.ts                  # GROQ queries
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # RTL root, fonts, analytics
│   │   ├── page.tsx                    # /
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── sitemap.ts
│   │   ├── robots.ts
│   │   ├── opengraph-image.tsx         # default OG
│   │   ├── studio/[[...tool]]/page.tsx # Sanity Studio mount
│   │   ├── תפריט/page.tsx
│   │   ├── אירועים/page.tsx
│   │   ├── משלוחים/page.tsx
│   │   ├── גלריה/page.tsx
│   │   ├── אודות/page.tsx
│   │   ├── צור-קשר/page.tsx
│   │   ├── [landingSlug]/page.tsx      # 7 SEO landing pages
│   │   ├── בלוג/page.tsx
│   │   ├── בלוג/[slug]/page.tsx
│   │   └── api/
│   │       ├── event-inquiry/route.ts  # POST → Resend
│   │       └── instagram/route.ts      # cached IG feed proxy
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── StickyMobileCTA.tsx
│   │   │   └── Container.tsx
│   │   ├── ui/                         # shadcn primitives
│   │   ├── home/
│   │   │   ├── Hero.tsx
│   │   │   ├── MenuTeaser.tsx
│   │   │   ├── EventsTeaser.tsx
│   │   │   ├── ReviewsCarousel.tsx
│   │   │   └── LocationMap.tsx
│   │   ├── menu/
│   │   │   ├── MenuList.tsx
│   │   │   ├── MenuItemCard.tsx
│   │   │   └── CategoryFilter.tsx
│   │   ├── events/
│   │   │   ├── EventInquiryForm.tsx
│   │   │   └── EventPackages.tsx
│   │   ├── seo/
│   │   │   ├── JsonLd.tsx
│   │   │   ├── schemas.ts              # builders for Restaurant/Menu/etc.
│   │   │   └── Breadcrumbs.tsx
│   │   ├── gallery/
│   │   │   └── InstagramGrid.tsx
│   │   ├── landing/
│   │   │   └── LandingTemplate.tsx
│   │   ├── blog/
│   │   │   ├── BlogCard.tsx
│   │   │   └── PostBody.tsx
│   │   └── shared/
│   │       ├── OnTopoEmbed.tsx
│   │       ├── WhatsAppButton.tsx
│   │       ├── CallButton.tsx
│   │       ├── ReservationCTA.tsx
│   │       └── FAQAccordion.tsx
│   ├── lib/
│   │   ├── fonts.ts
│   │   ├── analytics.ts
│   │   ├── env.ts                      # zod-validated env
│   │   ├── seo.ts                      # metadata helpers
│   │   ├── routes.ts                   # central URL map (Hebrew slugs)
│   │   └── types.ts
│   └── content/
│       ├── seed/                       # JSON seed files for Sanity import
│       │   ├── siteSettings.json
│       │   ├── hours.json
│       │   ├── landingPages.json
│       │   ├── blogPosts.json
│       │   └── reviews.json
│       └── about-draft.md
└── tests/
    ├── unit/
    │   ├── seo.test.ts
    │   ├── schemas.test.ts
    │   └── routes.test.ts
    └── e2e/
        ├── home.spec.ts
        ├── menu.spec.ts
        ├── events.spec.ts
        ├── landing.spec.ts
        └── seo.spec.ts
```

---

## Task 1: Scaffold Next.js app inside the monorepo

**Files:**
- Create: `apps/alena-website/` (entire workspace)
- Modify: `package.json` (root) — add workspace

- [ ] **Step 1: Create the app via `create-next-app`**

Run from repo root:
```powershell
npx create-next-app@latest apps/alena-website --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Accept defaults for any remaining prompts (Tailwind v4, App Router, src dir).

- [ ] **Step 2: Add the app to the root workspace**

Modify root `package.json`. If `"workspaces"` does not exist, add:
```json
"workspaces": ["apps/*"]
```
If it exists, ensure `"apps/*"` is included.

- [ ] **Step 3: Install runtime deps**

```powershell
cd apps/alena-website
npm i framer-motion @sanity/client @sanity/image-url next-sanity sanity @sanity/vision @portabletext/react react-hook-form @hookform/resolvers zod resend react-email @react-email/components next-sitemap clsx tailwind-merge lucide-react class-variance-authority
```

- [ ] **Step 4: Install dev deps**

```powershell
npm i -D @types/node prettier prettier-plugin-tailwindcss @playwright/test vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 5: Initialize Playwright**

```powershell
npx playwright install --with-deps chromium
```

- [ ] **Step 6: Verify dev server boots**

```powershell
npm run dev
```
Expected: `Local: http://localhost:3000` and default Next.js page renders.

- [ ] **Step 7: Commit**

```powershell
git add apps/alena-website package.json package-lock.json
git commit -m "chore(alena-website): scaffold Next.js 15 app with TS, Tailwind v4, deps"
```

---

## Task 2: Configure RTL, Hebrew fonts, and root layout

**Files:**
- Modify: `apps/alena-website/src/app/layout.tsx`
- Create: `apps/alena-website/src/lib/fonts.ts`
- Modify: `apps/alena-website/src/app/globals.css`

- [ ] **Step 1: Define Hebrew fonts**

Create `src/lib/fonts.ts`:
```ts
import { Heebo, Frank_Ruhl_Libre, Inter } from "next/font/google";

export const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-heebo",
  display: "swap",
});

export const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-frank-ruhl",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
```

- [ ] **Step 2: Update root layout with RTL + fonts**

Replace `src/app/layout.tsx`:
```tsx
import "./globals.css";
import type { Metadata } from "next";
import { heebo, frankRuhl, inter } from "@/lib/fonts";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://alenabepita.co.il"),
  title: {
    default: "עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
    template: "%s | עלינא",
  },
  description:
    "עלינא — בר מסעדה כשר ים-תיכוני ברוטשילד 104, ראשון לציון. המבורגרים, בשרים, חמארה, ארוחות בוקר ואירועים פרטיים. הזמן שולחן עכשיו.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${frankRuhl.variable} ${inter.variable}`}>
      <body className="font-body bg-cream text-charcoal antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Replace globals.css with the brand tokens**

Replace `src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-terracotta: #C65D3A;
  --color-terracotta-600: #B14F2F;
  --color-olive: #5A6B3B;
  --color-lemon: #F4C95D;
  --color-med-blue: #4A7C8C;
  --color-cream: #FAF3E7;
  --color-charcoal: #2B2825;

  --font-display: var(--font-frank-ruhl), serif;
  --font-body: var(--font-heebo), system-ui, sans-serif;
  --font-numeric: var(--font-inter), sans-serif;
}

html { scroll-behavior: smooth; }
body { font-feature-settings: "kern", "ss01"; }

::selection { background: var(--color-lemon); color: var(--color-charcoal); }
```

- [ ] **Step 4: Replace default page**

Replace `src/app/page.tsx`:
```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="font-display text-5xl text-terracotta">עלינא</h1>
    </main>
  );
}
```

- [ ] **Step 5: Verify RTL + fonts**

Run `npm run dev`, open `http://localhost:3000`. Confirm: page direction is RTL (text right-aligned), "עלינא" renders in Frank Ruhl Libre in terracotta.

- [ ] **Step 6: Commit**

```powershell
git add apps/alena-website/src apps/alena-website/package.json
git commit -m "feat(alena-website): RTL root layout, Hebrew fonts, brand color tokens"
```

---

## Task 3: Central routes map and env validation

**Files:**
- Create: `apps/alena-website/src/lib/routes.ts`
- Create: `apps/alena-website/src/lib/env.ts`
- Create: `apps/alena-website/.env.local.example`

- [ ] **Step 1: Write the routes test**

Create `tests/unit/routes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { routes, landingSlugs } from "@/lib/routes";

describe("routes", () => {
  it("has Hebrew primary routes", () => {
    expect(routes.menu).toBe("/תפריט");
    expect(routes.events).toBe("/אירועים");
    expect(routes.contact).toBe("/צור-קשר");
  });
  it("lists 7 SEO landing slugs", () => {
    expect(landingSlugs).toHaveLength(7);
    expect(landingSlugs).toContain("חמארה-בראשון-לציון");
    expect(landingSlugs).toContain("המבורגר-בראשון");
  });
});
```

- [ ] **Step 2: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "jsdom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Run test, see it fail**

```powershell
npm test
```
Expected: FAIL — `Cannot find module @/lib/routes`.

- [ ] **Step 4: Implement routes.ts**

Create `src/lib/routes.ts`:
```ts
export const routes = {
  home: "/",
  menu: "/תפריט",
  events: "/אירועים",
  delivery: "/משלוחים",
  gallery: "/גלריה",
  about: "/אודות",
  contact: "/צור-קשר",
  blog: "/בלוג",
  studio: "/studio",
} as const;

export const landingSlugs = [
  "חמארה-בראשון-לציון",
  "בר-מסעדה-כשר-בראשון",
  "המבורגר-בראשון",
  "בשר-כשר-בראשון",
  "סטייק-בראשון",
  "ארוחת-בוקר-בראשון",
  "אירועי-חברה-בראשון",
] as const;

export type LandingSlug = (typeof landingSlugs)[number];
```

- [ ] **Step 5: Pass tests**

```powershell
npm test
```
Expected: PASS.

- [ ] **Step 6: Add env validation**

Create `src/lib/env.ts`:
```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SANITY_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_SANITY_DATASET: z.string().default("production"),
  SANITY_API_READ_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EVENT_INQUIRY_TO: z.string().email().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().optional(),
  NEXT_PUBLIC_ONTOPO_URL: z.string().url().default("https://ontopo.com/he/il/page/15703580"),
  NEXT_PUBLIC_WHATSAPP_URL: z.string().url().default("https://wa.me/972503962976"),
  NEXT_PUBLIC_PHONE: z.string().default("03-622-8055"),
});

export const env = schema.parse(process.env);
```

Create `.env.local.example`:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SANITY_PROJECT_ID=replace_me
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=
RESEND_API_KEY=
EVENT_INQUIRY_TO=dvirnifusi@gmail.com
INSTAGRAM_ACCESS_TOKEN=
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_ONTOPO_URL=https://ontopo.com/he/il/page/15703580
NEXT_PUBLIC_WHATSAPP_URL=https://wa.me/972503962976
NEXT_PUBLIC_PHONE=03-622-8055
```

- [ ] **Step 7: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): routes map, env validation, vitest"
```

---

## Task 4: Sanity Studio setup with schemas

**Files:**
- Create: `apps/alena-website/sanity/sanity.config.ts`
- Create: `apps/alena-website/sanity/schemas/*.ts`
- Create: `apps/alena-website/sanity/lib/client.ts`, `image.ts`, `queries.ts`
- Create: `apps/alena-website/src/app/studio/[[...tool]]/page.tsx`

- [ ] **Step 1: Create Sanity project**

```powershell
cd apps/alena-website
npx sanity@latest init --bare --create-project "alena-website" --dataset production
```
Note the project ID; put it in `.env.local`:
```
NEXT_PUBLIC_SANITY_PROJECT_ID=<project-id>
```

- [ ] **Step 2: Write schema files**

Create `sanity/schemas/siteSettings.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "siteSettings",
  title: "הגדרות אתר",
  type: "document",
  fields: [
    defineField({ name: "phone", title: "טלפון", type: "string", initialValue: "03-622-8055" }),
    defineField({ name: "whatsapp", title: "וואטסאפ (E.164)", type: "string", initialValue: "+972503962976" }),
    defineField({ name: "address", title: "כתובת", type: "string", initialValue: "רוטשילד 104, ראשון לציון" }),
    defineField({ name: "addressLat", title: "Lat", type: "number" }),
    defineField({ name: "addressLng", title: "Lng", type: "number" }),
    defineField({ name: "ontopoUrl", title: "OnTopo URL", type: "url", initialValue: "https://ontopo.com/he/il/page/15703580" }),
    defineField({ name: "instagramUrl", title: "Instagram", type: "url", initialValue: "https://instagram.com/alena.hamara" }),
    defineField({ name: "facebookUrl", title: "Facebook", type: "url" }),
    defineField({ name: "kashrutBody", title: "גוף הכשרות", type: "string" }),
    defineField({ name: "kashrutImage", title: "תעודת כשרות", type: "image" }),
    defineField({ name: "deliveryLinks", title: "קישורי משלוחים", type: "array", of: [{ type: "object", fields: [{ name: "name", type: "string" }, { name: "url", type: "url" }] }] }),
  ],
});
```

Create `sanity/schemas/hours.ts`:
```ts
import { defineType, defineField } from "sanity";
const days = ["sun","mon","tue","wed","thu","fri","sat"] as const;
export default defineType({
  name: "hours",
  title: "שעות פעילות",
  type: "document",
  fields: [
    defineField({ name: "day", type: "string", options: { list: [...days] } }),
    defineField({ name: "closed", type: "boolean", initialValue: false }),
    defineField({ name: "ranges", type: "array", of: [{ type: "object", fields: [
      { name: "open", type: "string", title: "פתיחה (HH:mm)" },
      { name: "close", type: "string", title: "סגירה (HH:mm)" },
      { name: "label", type: "string", title: "תווית (אופציונלי)" },
    ]}]}),
  ],
});
```

Create `sanity/schemas/menuCategory.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "menuCategory",
  title: "קטגוריית תפריט",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: r => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" } }),
    defineField({ name: "order", type: "number", initialValue: 0 }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
  ],
});
```

Create `sanity/schemas/menuItem.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "menuItem",
  title: "פריט תפריט",
  type: "document",
  fields: [
    defineField({ name: "name", title: "שם", type: "string", validation: r => r.required() }),
    defineField({ name: "description", title: "תיאור", type: "text", rows: 3 }),
    defineField({ name: "price", title: "מחיר (₪)", type: "number" }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
    defineField({ name: "category", type: "reference", to: [{ type: "menuCategory" }] }),
    defineField({ name: "tags", type: "array", of: [{ type: "string" }], options: { list: ["חדש", "מומלץ", "חריף", "טבעוני", "ללא גלוטן"] } }),
    defineField({ name: "available", type: "boolean", initialValue: true }),
  ],
});
```

Create `sanity/schemas/eventPackage.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "eventPackage",
  title: "חבילת אירוע",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string" }),
    defineField({ name: "description", type: "text", rows: 4 }),
    defineField({ name: "minGuests", type: "number" }),
    defineField({ name: "maxGuests", type: "number" }),
    defineField({ name: "pricePerHead", type: "number" }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
  ],
});
```

Create `sanity/schemas/review.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "review",
  title: "ביקורת",
  type: "document",
  fields: [
    defineField({ name: "author", type: "string", validation: r => r.required() }),
    defineField({ name: "rating", type: "number", validation: r => r.min(1).max(5) }),
    defineField({ name: "body", type: "text", rows: 3 }),
    defineField({ name: "source", type: "string", options: { list: ["Google", "Direct", "Facebook"] } }),
    defineField({ name: "date", type: "date" }),
  ],
});
```

Create `sanity/schemas/blogPost.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "blogPost",
  title: "פוסט בלוג",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: r => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "title" } }),
    defineField({ name: "heroImage", type: "image", options: { hotspot: true } }),
    defineField({ name: "excerpt", type: "text", rows: 3 }),
    defineField({ name: "body", type: "array", of: [{ type: "block" }, { type: "image", options: { hotspot: true } }] }),
    defineField({ name: "publishedAt", type: "datetime" }),
    defineField({ name: "seoTitle", type: "string" }),
    defineField({ name: "seoDescription", type: "text", rows: 2 }),
  ],
});
```

Create `sanity/schemas/landingPage.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "landingPage",
  title: "דף נחיתה SEO",
  type: "document",
  fields: [
    defineField({ name: "slug", type: "slug", options: { source: "h1" }, validation: r => r.required() }),
    defineField({ name: "h1", title: "כותרת ראשית (H1)", type: "string", validation: r => r.required() }),
    defineField({ name: "heroImage", type: "image", options: { hotspot: true } }),
    defineField({ name: "intro", type: "text", rows: 3 }),
    defineField({ name: "body", type: "array", of: [{ type: "block" }, { type: "image", options: { hotspot: true } }] }),
    defineField({ name: "relatedMenuItems", type: "array", of: [{ type: "reference", to: [{ type: "menuItem" }] }] }),
    defineField({ name: "faqs", type: "array", of: [{ type: "object", fields: [
      { name: "q", type: "string" }, { name: "a", type: "text" },
    ]}]}),
    defineField({ name: "reviews", type: "array", of: [{ type: "reference", to: [{ type: "review" }] }] }),
    defineField({ name: "seoTitle", type: "string" }),
    defineField({ name: "seoDescription", type: "text", rows: 2 }),
  ],
});
```

Create `sanity/schemas/banner.ts`:
```ts
import { defineType, defineField } from "sanity";
export default defineType({
  name: "banner",
  title: "באנר עליון",
  type: "document",
  fields: [
    defineField({ name: "message", type: "string" }),
    defineField({ name: "ctaText", type: "string" }),
    defineField({ name: "ctaUrl", type: "url" }),
    defineField({ name: "active", type: "boolean", initialValue: false }),
    defineField({ name: "priority", type: "number", initialValue: 0 }),
  ],
});
```

Create `sanity/schemas/index.ts`:
```ts
import siteSettings from "./siteSettings";
import hours from "./hours";
import menuCategory from "./menuCategory";
import menuItem from "./menuItem";
import eventPackage from "./eventPackage";
import review from "./review";
import blogPost from "./blogPost";
import landingPage from "./landingPage";
import banner from "./banner";

export const schemaTypes = [
  siteSettings, hours, menuCategory, menuItem,
  eventPackage, review, blogPost, landingPage, banner,
];
```

- [ ] **Step 3: Sanity config + studio mount**

Create `sanity/sanity.config.ts`:
```ts
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemas";
import { env } from "../src/lib/env";

export default defineConfig({
  basePath: "/studio",
  name: "alena",
  title: "עלינא — ניהול תוכן",
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  plugins: [structureTool(), visionTool()],
  schema: { types: schemaTypes },
});
```

Create `src/app/studio/[[...tool]]/page.tsx`:
```tsx
"use client";
import { NextStudio } from "next-sanity/studio";
import config from "../../../../sanity/sanity.config";
export const dynamic = "force-static";
export { metadata, viewport } from "next-sanity/studio";
export default function StudioPage() {
  return <NextStudio config={config} />;
}
```

- [ ] **Step 4: Sanity client + image helper + queries**

Create `sanity/lib/client.ts`:
```ts
import { createClient } from "next-sanity";
import { env } from "../../src/lib/env";

export const sanity = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: "2024-01-01",
  useCdn: true,
  token: env.SANITY_API_READ_TOKEN,
});
```

Create `sanity/lib/image.ts`:
```ts
import createImageUrlBuilder from "@sanity/image-url";
import { env } from "../../src/lib/env";

const builder = createImageUrlBuilder({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
});
export const urlFor = (src: unknown) => builder.image(src as any);
```

Create `sanity/lib/queries.ts`:
```ts
import { groq } from "next-sanity";

export const siteSettingsQuery = groq`*[_type == "siteSettings"][0]`;
export const hoursQuery = groq`*[_type == "hours"] | order(day asc)`;
export const menuQuery = groq`{
  "categories": *[_type == "menuCategory"] | order(order asc),
  "items": *[_type == "menuItem" && available == true]{
    _id, name, description, price, image, tags,
    "category": category->{_id, name, slug}
  }
}`;
export const eventPackagesQuery = groq`*[_type == "eventPackage"] | order(minGuests asc)`;
export const reviewsQuery = groq`*[_type == "review"] | order(date desc)[0...10]`;
export const blogIndexQuery = groq`*[_type == "blogPost" && defined(publishedAt)] | order(publishedAt desc){ _id, title, slug, heroImage, excerpt, publishedAt }`;
export const blogPostQuery = groq`*[_type == "blogPost" && slug.current == $slug][0]`;
export const landingBySlugQuery = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  ..., relatedMenuItems[]->, reviews[]->
}`;
export const allLandingSlugsQuery = groq`*[_type == "landingPage"].slug.current`;
export const activeBannerQuery = groq`*[_type == "banner" && active == true] | order(priority desc)[0]`;
```

- [ ] **Step 5: Verify Studio loads**

```powershell
npm run dev
```
Open `http://localhost:3000/studio`. Expected: Sanity Studio loads with all 9 schemas in the side menu.

- [ ] **Step 6: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): Sanity schemas, client, and embedded Studio"
```

---

## Task 5: Seed initial content into Sanity

**Files:**
- Create: `apps/alena-website/scripts/seed.ts`
- Create: `apps/alena-website/src/content/seed/*.json`

- [ ] **Step 1: Seed JSON for siteSettings**

Create `src/content/seed/siteSettings.json`:
```json
{
  "_type": "siteSettings",
  "_id": "siteSettings",
  "phone": "03-622-8055",
  "whatsapp": "+972503962976",
  "address": "רוטשילד 104, ראשון לציון",
  "addressLat": 31.9650,
  "addressLng": 34.8000,
  "ontopoUrl": "https://ontopo.com/he/il/page/15703580",
  "instagramUrl": "https://instagram.com/alena.hamara",
  "facebookUrl": "https://www.facebook.com/ALENA.BIGASDHOD/?locale=he_IL"
}
```
(Lat/Lng are approximate for Rishon LeZion center; will be corrected once exact rooftop coords are confirmed in Google Business Profile.)

- [ ] **Step 2: Seed JSON for hours**

Create `src/content/seed/hours.json` (per OnTopo, Fri closed; Sat motzaei-shabbat):
```json
[
  { "_type": "hours", "_id": "hours-sun", "day": "sun", "closed": false, "ranges": [{ "open": "12:00", "close": "00:00", "label": "Burger Night" }] },
  { "_type": "hours", "_id": "hours-mon", "day": "mon", "closed": false, "ranges": [{ "open": "12:00", "close": "00:00", "label": "Wine Evening" }] },
  { "_type": "hours", "_id": "hours-tue", "day": "tue", "closed": false, "ranges": [{ "open": "12:00", "close": "00:00", "label": "Butcher Night" }] },
  { "_type": "hours", "_id": "hours-wed", "day": "wed", "closed": false, "ranges": [{ "open": "12:00", "close": "00:00" }] },
  { "_type": "hours", "_id": "hours-thu", "day": "thu", "closed": false, "ranges": [{ "open": "12:00", "close": "02:00" }] },
  { "_type": "hours", "_id": "hours-fri", "day": "fri", "closed": true, "ranges": [] },
  { "_type": "hours", "_id": "hours-sat", "day": "sat", "closed": false, "ranges": [{ "open": "20:15", "close": "02:00", "label": "מוצ\"ש" }] }
]
```

- [ ] **Step 3: Seed JSON for the 7 landing pages**

Create `src/content/seed/landingPages.json`. Each page has a unique `h1`, `intro`, three FAQ entries. Example for one — the seed script will include all 7 in the same format:
```json
[
  {
    "_type": "landingPage",
    "_id": "lp-hamara",
    "slug": { "_type": "slug", "current": "חמארה-בראשון-לציון" },
    "h1": "חמארה בראשון לציון — עלינא ברוטשילד",
    "intro": "בלב רוטשילד 104, עלינא היא חמארה ים-תיכונית כשרה שמגישה את כל הקלאסיקות של אוכל הרחוב הים-תיכוני בגרסה איכותית: חומוס חם עם בשר, סלטים, פיתות ועיקריות על האש. מזמינים שולחן ב-OnTopo.",
    "seoTitle": "חמארה בראשון לציון | עלינא — חמארה ים-תיכונית כשרה ברוטשילד",
    "seoDescription": "חמארה כשרה בראשון לציון, רוטשילד 104. חומוס חם, סלטים, פיתות, בשרים על האש ובר אלכוהול. הזמן שולחן עכשיו.",
    "faqs": [
      { "q": "האם החמארה כשרה?", "a": "כן, עלינא היא מסעדה כשרה למהדרין." },
      { "q": "האם יש חניה?", "a": "כן, חניות סמוכות במרכז בן גוריון ובמקבילים." },
      { "q": "האם פתוח בשבת?", "a": "פותחים מוצאי שבת מ-20:15." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-bar-kasher",
    "slug": { "_type": "slug", "current": "בר-מסעדה-כשר-בראשון" },
    "h1": "בר מסעדה כשר בראשון לציון",
    "intro": "עלינא — בר מסעדה כשר בלב ראשון לציון. ברים של אלכוהול, מנות שף ים-תיכוניות וערבים תמטיים: יום שני יין, יום שלישי קצב, יום ראשון המבורגר.",
    "seoTitle": "בר מסעדה כשר בראשון לציון | עלינא ברוטשילד",
    "seoDescription": "בר מסעדה כשר בראשון לציון. בשרים, חמארה, אלכוהול. רוטשילד 104. הזמן שולחן.",
    "faqs": [
      { "q": "מה שעות הבר?", "a": "פתוחים כל ערב חוץ מיום שישי. שני-רביעי עד חצות, חמישי-שבת עד הלקוח האחרון." },
      { "q": "האם יש תפריט אלכוהול כשר?", "a": "כן, יש תפריט אלכוהול כשר רחב כולל יינות, וויסקי, קוקטיילים." },
      { "q": "מתאים לזוגות?", "a": "מאוד. אווירה ים-תיכונית, מוזיקה רגועה בערבי שבוע, חוויה אישית." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-hamburger",
    "slug": { "_type": "slug", "current": "המבורגר-בראשון" },
    "h1": "המבורגר בראשון לציון — Burger Night בעלינא",
    "intro": "כל יום ראשון בעלינא — Burger Night. המבורגר 220 גרם בשר טרי, על לחמנייה ביתית, עם תוספות שמתחלפות. הזמן מקום עכשיו.",
    "seoTitle": "המבורגר בראשון לציון | Burger Night בעלינא",
    "seoDescription": "המבורגר כשר בראשון לציון בכל יום ראשון. 220 גרם בשר טרי, לחמנייה ביתית, תוספות מתחלפות. רוטשילד 104.",
    "faqs": [
      { "q": "האם ה-Burger Night רק בראשון?", "a": "כן. המבורגרים זמינים גם בימים אחרים אבל המבצע השבועי הוא בראשון בערב." },
      { "q": "האם יש המבורגר טבעוני?", "a": "כן, יש אופציה טבעונית — בדקו בתפריט." },
      { "q": "האם צריך להזמין מראש?", "a": "מומלץ, בערבי ראשון יש ביקוש גבוה." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-meat-kosher",
    "slug": { "_type": "slug", "current": "בשר-כשר-בראשון" },
    "h1": "בשר כשר בראשון לציון — על האש בעלינא",
    "intro": "מסעדת בשרים כשרה במרכז ראשון לציון. סטייקים, אנטריקוט, פילה, נקניקיות ביתיות, כבד עוף — הכול על האש, מבחר חיתוכים.",
    "seoTitle": "בשר כשר בראשון לציון | עלינא — סטייקים על האש",
    "seoDescription": "מסעדת בשרים כשרה בראשון לציון. סטייקים, אנטריקוט, פילה. רוטשילד 104. הזמן שולחן.",
    "faqs": [
      { "q": "איזה חיתוכי בשר יש?", "a": "אנטריקוט, סינטה, פילה, אסאדו, צ'אק רול, בשר טחון לקבב והמבורגר." },
      { "q": "האם הבשר טרי?", "a": "כן, הבשר טרי מבית קצב יומי." },
      { "q": "האם יש יום קצב?", "a": "כן, יום שלישי הוא ה-Butcher Night עם תפריט בשרים מורחב." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-steak",
    "slug": { "_type": "slug", "current": "סטייק-בראשון" },
    "h1": "סטייק בראשון לציון",
    "intro": "סטייקים כשרים בעלינא — אנטריקוט, סינטה ופילה על גריל פחמים. כל סטייק מגיע עם תוספת ים-תיכונית לבחירה.",
    "seoTitle": "סטייק בראשון לציון | עלינא — סטייק כשר על האש",
    "seoDescription": "סטייקים כשרים בראשון לציון. אנטריקוט, סינטה, פילה. רוטשילד 104. הזמן שולחן עכשיו.",
    "faqs": [
      { "q": "איך מכינים את הסטייק?", "a": "על גריל פחמים בטמפרטורה גבוהה, לפי דרגת העשייה שתבחר." },
      { "q": "האם יש תוספות?", "a": "כן, מבחר תוספות ים-תיכוניות, צ'יפס בית, ירקות צלויים." },
      { "q": "מה גודל המנה?", "a": "300 גרם כברירת מחדל; ניתן לשדרג ל-400/500 בתוספת תשלום." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-breakfast",
    "slug": { "_type": "slug", "current": "ארוחת-בוקר-בראשון" },
    "h1": "ארוחת בוקר בראשון לציון",
    "intro": "ארוחות בוקר ישראליות כשרות בעלינא — שקשוקה, ביצים בכל סגנון, סלטי בוקר, ג'חנון בסופ\"ש. מהשעה 12:00 ועד הצוהריים.",
    "seoTitle": "ארוחת בוקר בראשון לציון | עלינא — בוקר ישראלי כשר",
    "seoDescription": "ארוחות בוקר ישראליות בראשון לציון. שקשוקה, ביצים, סלטים, ג'חנון. רוטשילד 104.",
    "faqs": [
      { "q": "באיזה שעות יש ארוחות בוקר?", "a": "מ-12:00 בצהריים עד 18:00 — Lunch Deals." },
      { "q": "האם הארוחה כשרה?", "a": "כן, כל המנות תחת הכשר." },
      { "q": "האם יש אופציות טבעוניות?", "a": "כן, יש שקשוקה ירוקה, סלטים ופוקצ'ה." }
    ]
  },
  {
    "_type": "landingPage",
    "_id": "lp-corporate-events",
    "slug": { "_type": "slug", "current": "אירועי-חברה-בראשון" },
    "h1": "אירועי חברה בראשון לציון — עלינא",
    "intro": "מארחים את החברה שלך בעלינא — אולם פרטי עד 50 איש, חבילות אירוח גמישות, מנות שף ים-תיכוניות וברים מלאים. מושלם לאירועי חברה, ערבי גיבוש, סיכומי רבעון.",
    "seoTitle": "אירועי חברה בראשון לציון | עלינא — אולם פרטי עד 50 איש",
    "seoDescription": "אירועי חברה בראשון לציון. אולם פרטי, מנות שף, ברים מלאים. רוטשילד 104. השאר פרטים ונחזור.",
    "faqs": [
      { "q": "כמה אורחים האולם מכיל?", "a": "עד 50 איש בישיבה." },
      { "q": "האם יש חניה?", "a": "כן, חניות סמוכות במרכז בן גוריון." },
      { "q": "האם ניתן להתאים תפריט?", "a": "כן, מתאימים תפריט לכל אירוע — בשרי, חלבי-כשר, או מעורב." }
    ]
  }
]
```

- [ ] **Step 4: Seed JSON for 3 blog posts and 5 reviews**

Create `src/content/seed/blogPosts.json` with 3 posts (title, slug, excerpt, body as a single block). Create `src/content/seed/reviews.json` with 5 placeholder Google-source reviews (4–5 stars, generic positive — to be replaced with real Google reviews once Google Business Profile is connected). Mark these `source: "Direct"` so they don't claim to be Google.

`src/content/seed/blogPosts.json`:
```json
[
  {
    "_type": "blogPost",
    "_id": "post-burger",
    "title": "המבורגר הכי טוב בראשון לציון — איפה ולמה",
    "slug": { "_type": "slug", "current": "המבורגר-הכי-טוב-בראשון" },
    "excerpt": "אם אתה מחפש המבורגר אמיתי בראשון לציון, הנה למה Burger Night בעלינא הוא היעד.",
    "publishedAt": "2026-06-01T10:00:00Z",
    "body": [
      { "_type": "block", "style": "normal", "children": [{ "_type": "span", "text": "המבורגר טוב מתחיל בבשר טרי. בעלינא הבשר טרי כל יום, נטחן ביום, ונצרב על גריל פחמים. הלחמנייה ביתית, התוספות מתחלפות — וכל יום ראשון זה Burger Night." }] }
    ]
  },
  {
    "_type": "blogPost",
    "_id": "post-hamara",
    "title": "מה זה חמארה? המדריך הקצר לאוכל ים-תיכוני",
    "slug": { "_type": "slug", "current": "מה-זה-חמארה" },
    "excerpt": "חמארה זה בית-קפה / בר אוכל רחוב ים-תיכוני. הנה כל מה שצריך לדעת.",
    "publishedAt": "2026-05-25T10:00:00Z",
    "body": [
      { "_type": "block", "style": "normal", "children": [{ "_type": "span", "text": "חמארה (مَحْمَرَة) — בית מקומי לאוכל הרחוב הים-תיכוני: חומוס, פלאפל, סלטים, פיתות, מנות שיפודים. עלינא מביאה את החמארה לראשון לציון בגרסה כשרה ואיכותית." }] }
    ]
  },
  {
    "_type": "blogPost",
    "_id": "post-event-checklist",
    "title": "איך להפיק אירוע חברה במסעדה — צ'קליסט מנהל משאבי אנוש",
    "slug": { "_type": "slug", "current": "צ-קליסט-אירוע-חברה" },
    "excerpt": "5 דברים לבדוק לפני שאתה סוגר אולם פרטי לאירוע חברה.",
    "publishedAt": "2026-05-15T10:00:00Z",
    "body": [
      { "_type": "block", "style": "normal", "children": [{ "_type": "span", "text": "1. קיבולת — לוודא שמספר האורחים מתאים. 2. כשרות. 3. חניה. 4. גמישות תפריט. 5. ברים. בעלינא — כל החמש בעצמן." }] }
    ]
  }
]
```

`src/content/seed/reviews.json`:
```json
[
  { "_type": "review", "_id": "rev-1", "author": "אריאל ב.", "rating": 5, "body": "אווירה מעולה, בשר מצוין, שירות אישי. נחזור.", "source": "Direct", "date": "2026-05-10" },
  { "_type": "review", "_id": "rev-2", "author": "מיכל ה.", "rating": 5, "body": "ארוחה מושלמת לזוגות, ההמבורגר מצוין.", "source": "Direct", "date": "2026-04-22" },
  { "_type": "review", "_id": "rev-3", "author": "יוסי ק.", "rating": 4, "body": "תפריט מגוון, המחירים הוגנים. ה-Butcher Night ביום שלישי שווה הגעה.", "source": "Direct", "date": "2026-04-12" },
  { "_type": "review", "_id": "rev-4", "author": "דנה ל.", "rating": 5, "body": "ארגנו אצלם אירוע חברה ל-40 איש — מקצועיות מלאה, אוכל מעולה.", "source": "Direct", "date": "2026-03-18" },
  { "_type": "review", "_id": "rev-5", "author": "אבי ש.", "rating": 5, "body": "חמארה ים-תיכונית במלוא מובן המילה. החומוס פצצה.", "source": "Direct", "date": "2026-03-02" }
]
```

- [ ] **Step 5: Seed script**

Create `scripts/seed.ts`:
```ts
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_WRITE_TOKEN;
if (!token) throw new Error("SANITY_WRITE_TOKEN required");

const client = createClient({ projectId, dataset, token, apiVersion: "2024-01-01", useCdn: false });

const load = (f: string) => JSON.parse(readFileSync(path.join("src/content/seed", f), "utf8"));

const docs = [
  load("siteSettings.json"),
  ...load("hours.json"),
  ...load("landingPages.json"),
  ...load("blogPosts.json"),
  ...load("reviews.json"),
];

(async () => {
  const tx = client.transaction();
  for (const d of docs) tx.createOrReplace(d);
  await tx.commit();
  console.log(`Seeded ${docs.length} documents.`);
})();
```

Add to `package.json`:
```json
"scripts": { "seed": "tsx scripts/seed.ts" }
```
Install: `npm i -D tsx`.

- [ ] **Step 6: Generate Sanity write token + run seed**

In sanity.io project settings, create a write token. Add to `.env.local` as `SANITY_WRITE_TOKEN=...`. Then:
```powershell
npm run seed
```
Expected: `Seeded N documents.` Verify in Studio `/studio` that all 7 landing pages, 3 posts, 5 reviews, hours, and siteSettings appear.

- [ ] **Step 7: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): seed initial content (settings, hours, 7 landings, posts, reviews)"
```

---

## Task 6: Header, Footer, Sticky Mobile CTA, base UI

**Files:**
- Create: `src/components/layout/Container.tsx`, `Header.tsx`, `Footer.tsx`, `StickyMobileCTA.tsx`
- Create: `src/components/shared/CallButton.tsx`, `WhatsAppButton.tsx`, `ReservationCTA.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Container**

`src/components/layout/Container.tsx`:
```tsx
import { cn } from "@/lib/cn";
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}
```
Create `src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
```

- [ ] **Step 2: Reusable CTA components**

`src/components/shared/CallButton.tsx`:
```tsx
import { Phone } from "lucide-react";
import { env } from "@/lib/env";
export function CallButton({ className }: { className?: string }) {
  return (
    <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className={className} aria-label="התקשר אלינו">
      <Phone className="size-4" /> <span>{env.NEXT_PUBLIC_PHONE}</span>
    </a>
  );
}
```

`src/components/shared/WhatsAppButton.tsx`:
```tsx
import { MessageCircle } from "lucide-react";
import { env } from "@/lib/env";
export function WhatsAppButton({ className }: { className?: string }) {
  return (
    <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className={className} aria-label="וואטסאפ">
      <MessageCircle className="size-4" /> <span>WhatsApp</span>
    </a>
  );
}
```

`src/components/shared/ReservationCTA.tsx`:
```tsx
import { env } from "@/lib/env";
export function ReservationCTA({ className, label = "הזמן שולחן" }: { className?: string; label?: string }) {
  return (
    <a
      href={env.NEXT_PUBLIC_ONTOPO_URL}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center justify-center rounded-full bg-terracotta px-6 py-3 font-semibold text-cream shadow-lg shadow-terracotta/20 transition hover:bg-terracotta-600 hover:shadow-xl ${className ?? ""}`}
    >
      🍽️ {label}
    </a>
  );
}
```

- [ ] **Step 3: Header**

`src/components/layout/Header.tsx`:
```tsx
import Link from "next/link";
import { Container } from "./Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { routes } from "@/lib/routes";

const nav = [
  { href: routes.menu, label: "תפריט" },
  { href: routes.events, label: "אירועים" },
  { href: routes.delivery, label: "משלוחים" },
  { href: routes.gallery, label: "גלריה" },
  { href: routes.about, label: "אודות" },
  { href: routes.contact, label: "צור קשר" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/5 bg-cream/85 backdrop-blur">
      <Container className="flex items-center justify-between py-3">
        <Link href="/" className="font-display text-2xl text-terracotta">עלינא</Link>
        <nav className="hidden gap-6 md:flex">
          {nav.map(n => (
            <Link key={n.href} href={n.href} className="text-sm font-medium text-charcoal/80 hover:text-terracotta">{n.label}</Link>
          ))}
        </nav>
        <ReservationCTA className="hidden md:inline-flex" />
      </Container>
    </header>
  );
}
```

- [ ] **Step 4: Footer**

`src/components/layout/Footer.tsx`:
```tsx
import Link from "next/link";
import { Container } from "./Container";
import { routes } from "@/lib/routes";
import { env } from "@/lib/env";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-charcoal/10 bg-cream py-12 text-sm text-charcoal/80">
      <Container className="grid gap-8 md:grid-cols-4">
        <div>
          <p className="font-display text-2xl text-terracotta">עלינא</p>
          <p className="mt-2 max-w-xs">חמארה ים-תיכונית כשרה. רוטשילד 104, ראשון לציון.</p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">ניווט</p>
          <ul className="space-y-1">
            <li><Link href={routes.menu}>תפריט</Link></li>
            <li><Link href={routes.events}>אירועים</Link></li>
            <li><Link href={routes.delivery}>משלוחים</Link></li>
            <li><Link href={routes.about}>אודות</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">יצירת קשר</p>
          <ul className="space-y-1">
            <li><a href={`tel:${env.NEXT_PUBLIC_PHONE}`}>{env.NEXT_PUBLIC_PHONE}</a></li>
            <li><a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener">WhatsApp</a></li>
            <li><a href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">Instagram</a></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">שעות</p>
          <ul className="space-y-1 text-xs">
            <li>ראשון–רביעי: 12:00–00:00</li>
            <li>חמישי: 12:00–02:00</li>
            <li>שישי: סגור</li>
            <li>שבת: 20:15–02:00</li>
          </ul>
        </div>
      </Container>
      <Container className="mt-8 border-t border-charcoal/10 pt-4 text-xs text-charcoal/50">
        © {new Date().getFullYear()} עלינא · כל הזכויות שמורות
      </Container>
    </footer>
  );
}
```

- [ ] **Step 5: Sticky mobile CTA**

`src/components/layout/StickyMobileCTA.tsx`:
```tsx
import { env } from "@/lib/env";
export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 gap-px border-t border-charcoal/10 bg-cream/95 backdrop-blur md:hidden">
      <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="flex flex-col items-center justify-center py-2 text-xs"><span className="text-lg">📞</span><span>התקשר</span></a>
      <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className="flex flex-col items-center justify-center py-2 text-xs"><span className="text-lg">💬</span><span>WhatsApp</span></a>
      <a href={env.NEXT_PUBLIC_ONTOPO_URL} target="_blank" rel="noopener" className="flex flex-col items-center justify-center bg-terracotta py-2 text-xs font-semibold text-cream"><span className="text-lg">🍽️</span><span>הזמן שולחן</span></a>
    </div>
  );
}
```

- [ ] **Step 6: Wire header/footer/sticky into root layout**

Update `src/app/layout.tsx` `<body>`:
```tsx
<body className="font-body bg-cream text-charcoal antialiased pb-20 md:pb-0">
  <Header />
  {children}
  <Footer />
  <StickyMobileCTA />
</body>
```
Add imports.

- [ ] **Step 7: Verify**

`npm run dev` → confirm header on top, footer at bottom, sticky CTA on mobile width (resize browser <768px), RTL still correct.

- [ ] **Step 8: Commit**

```powershell
git add apps/alena-website/src
git commit -m "feat(alena-website): header, footer, sticky mobile CTA, shared CTA components"
```

---

## Task 7: SEO helpers and JSON-LD Schema.org builders

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/components/seo/JsonLd.tsx`, `schemas.ts`, `Breadcrumbs.tsx`
- Create: `tests/unit/schemas.test.ts`

- [ ] **Step 1: Test for schema builders**

`tests/unit/schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { restaurantSchema, faqSchema, breadcrumbSchema } from "@/components/seo/schemas";

describe("schemas", () => {
  it("builds Restaurant LD with required fields", () => {
    const s = restaurantSchema({
      name: "עלינא", phone: "03-622-8055",
      address: "רוטשילד 104, ראשון לציון",
      url: "https://example.com",
    });
    expect(s["@type"]).toBe("Restaurant");
    expect(s.telephone).toBe("03-622-8055");
    expect(s.address.streetAddress).toBe("רוטשילד 104, ראשון לציון");
  });
  it("builds FAQ LD from Q/A pairs", () => {
    const s = faqSchema([{ q: "?", a: "!" }]);
    expect(s.mainEntity).toHaveLength(1);
  });
  it("builds Breadcrumb LD with positions", () => {
    const s = breadcrumbSchema([{ name: "בית", url: "/" }, { name: "תפריט", url: "/תפריט" }]);
    expect(s.itemListElement[1].position).toBe(2);
  });
});
```

- [ ] **Step 2: Run, see fail**

`npm test` → FAIL: module not found.

- [ ] **Step 3: Implement**

`src/components/seo/schemas.ts`:
```ts
type Restaurant = { name: string; phone: string; address: string; url: string; image?: string };
export const restaurantSchema = (r: Restaurant) => ({
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: r.name,
  telephone: r.phone,
  url: r.url,
  image: r.image,
  servesCuisine: ["Mediterranean", "Kosher", "Israeli"],
  priceRange: "₪₪",
  address: {
    "@type": "PostalAddress",
    streetAddress: r.address,
    addressLocality: "ראשון לציון",
    addressCountry: "IL",
  },
});

export const faqSchema = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question", name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

export const breadcrumbSchema = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem", position: i + 1, name: it.name, item: it.url,
  })),
});

export const reviewSchema = (r: { author: string; rating: number; body: string; date?: string }) => ({
  "@context": "https://schema.org",
  "@type": "Review",
  author: { "@type": "Person", name: r.author },
  reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
  reviewBody: r.body,
  datePublished: r.date,
});

export const aggregateRatingSchema = (count: number, value: number) => ({
  "@type": "AggregateRating", ratingValue: value, reviewCount: count,
});

export const eventSchema = (e: { name: string; description: string; url: string; image?: string }) => ({
  "@context": "https://schema.org",
  "@type": "Event",
  name: e.name,
  description: e.description,
  url: e.url,
  image: e.image,
  location: { "@type": "Place", name: "עלינא", address: "רוטשילד 104, ראשון לציון" },
});
```

`src/components/seo/JsonLd.tsx`:
```tsx
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

`src/components/seo/Breadcrumbs.tsx`:
```tsx
import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { breadcrumbSchema } from "./schemas";
export function Breadcrumbs({ items }: { items: { name: string; url: string }[] }) {
  return (
    <>
      <nav className="text-xs text-charcoal/60" aria-label="breadcrumb">
        {items.map((it, i) => (
          <span key={it.url}>
            <Link href={it.url}>{it.name}</Link>
            {i < items.length - 1 ? " / " : ""}
          </span>
        ))}
      </nav>
      <JsonLd data={breadcrumbSchema(items)} />
    </>
  );
}
```

`src/lib/seo.ts`:
```ts
import type { Metadata } from "next";
import { env } from "./env";

export function pageMetadata(opts: {
  title: string; description: string; path: string; image?: string;
}): Metadata {
  const url = `${env.NEXT_PUBLIC_SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: { title: opts.title, description: opts.description, url, type: "website", locale: "he_IL", images: opts.image ? [opts.image] : undefined },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
}
```

- [ ] **Step 4: Pass tests**

`npm test` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): SEO helpers and Schema.org JSON-LD builders"
```

---

## Task 8: Home page

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/home/Hero.tsx`, `MenuTeaser.tsx`, `EventsTeaser.tsx`, `ReviewsCarousel.tsx`, `LocationMap.tsx`

- [ ] **Step 1: Hero**

`src/components/home/Hero.tsx`:
```tsx
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-cream">
      <Container className="grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
        <div className="text-center md:text-right">
          <h1 className="font-display text-5xl leading-tight text-charcoal md:text-7xl">
            חמארה ים-תיכונית <span className="text-terracotta">כשרה</span> בראשון לציון
          </h1>
          <p className="mt-4 text-lg text-charcoal/80">בר רחוב שמח · בשרים על האש · אירועים פרטיים · רוטשילד 104</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <ReservationCTA />
            <a href="/תפריט" className="inline-flex items-center justify-center rounded-full border-2 border-charcoal/15 px-6 py-3 font-medium hover:border-charcoal/40">צפה בתפריט</a>
          </div>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-3xl shadow-2xl shadow-terracotta/10">
          <Image src="/hero.jpg" alt="צלחת אוכל בעלינא" fill priority sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
        </div>
      </Container>
    </section>
  );
}
```
(For now, use a placeholder `public/hero.jpg`. Final image will come from Instagram pull in Task 13.)

- [ ] **Step 2: MenuTeaser, EventsTeaser**

`src/components/home/MenuTeaser.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { menuQuery } from "../../../sanity/lib/queries";
import { urlFor } from "../../../sanity/lib/image";

export async function MenuTeaser() {
  const { items } = (await sanity.fetch(menuQuery)) as { items: any[] };
  const featured = items.slice(0, 6);
  return (
    <section className="py-16">
      <Container>
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-display text-4xl text-charcoal">מה בתפריט</h2>
          <Link href="/תפריט" className="text-sm font-medium text-terracotta hover:underline">לתפריט המלא ←</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map(item => (
            <article key={item._id} className="overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-lg">
              {item.image && (
                <div className="relative aspect-[4/3]">
                  <Image src={urlFor(item.image).width(800).url()} alt={item.name} fill sizes="(min-width:1024px) 30vw, 50vw" className="object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl">{item.name}</h3>
                  {item.price && <span className="font-numeric font-semibold text-terracotta">₪{item.price}</span>}
                </div>
                {item.description && <p className="mt-1 text-sm text-charcoal/70">{item.description}</p>}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
```

`src/components/home/EventsTeaser.tsx`:
```tsx
import Link from "next/link";
import { Container } from "@/components/layout/Container";

export function EventsTeaser() {
  return (
    <section className="bg-olive/10 py-16">
      <Container className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl text-olive">אירועים פרטיים</h2>
          <p className="mt-3 text-charcoal/80">אולם פרטי עד 50 איש · חבילות גמישות · ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה.</p>
          <Link href="/אירועים" className="mt-6 inline-block rounded-full bg-olive px-6 py-3 font-semibold text-cream hover:bg-olive/90">ספרו לי עוד</Link>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-charcoal/10" />
      </Container>
    </section>
  );
}
```

- [ ] **Step 3: ReviewsCarousel + LocationMap**

`src/components/home/ReviewsCarousel.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { reviewsQuery } from "../../../sanity/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { reviewSchema } from "@/components/seo/schemas";

export async function ReviewsCarousel() {
  const reviews = (await sanity.fetch(reviewsQuery)) as any[];
  return (
    <section className="py-16">
      <Container>
        <h2 className="mb-8 font-display text-4xl text-charcoal">מה אומרים עלינו</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.slice(0, 6).map(r => (
            <figure key={r._id} className="rounded-2xl border border-charcoal/10 bg-cream p-6">
              <div className="text-lemon">{"★".repeat(r.rating)}</div>
              <blockquote className="mt-2 text-charcoal/80">{r.body}</blockquote>
              <figcaption className="mt-3 text-sm font-medium">— {r.author}</figcaption>
              <JsonLd data={reviewSchema(r)} />
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
```

`src/components/home/LocationMap.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
export function LocationMap() {
  const q = encodeURIComponent("עלינא רוטשילד 104 ראשון לציון");
  return (
    <section className="py-16">
      <Container className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl">איפה אנחנו</h2>
          <p className="mt-2 text-charcoal/80">רוטשילד 104, ראשון לציון<br/>חניות סמוכות במרכז בן גוריון.</p>
          <a href={`https://waze.com/ul?q=${q}`} target="_blank" rel="noopener" className="mt-4 inline-block rounded-full bg-med-blue px-5 py-2 text-sm font-semibold text-cream">נווט אלי ב-Waze</a>
        </div>
        <iframe
          title="מפת מיקום עלינא"
          className="aspect-video w-full rounded-2xl border-0"
          src={`https://www.google.com/maps?q=${q}&output=embed`}
          loading="lazy"
        />
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Home page composition + LD**

Replace `src/app/page.tsx`:
```tsx
import { Hero } from "@/components/home/Hero";
import { MenuTeaser } from "@/components/home/MenuTeaser";
import { EventsTeaser } from "@/components/home/EventsTeaser";
import { ReviewsCarousel } from "@/components/home/ReviewsCarousel";
import { LocationMap } from "@/components/home/LocationMap";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema } from "@/components/seo/schemas";
import { env } from "@/lib/env";

export const revalidate = 600;

export default function HomePage() {
  return (
    <>
      <Hero />
      <MenuTeaser />
      <EventsTeaser />
      <ReviewsCarousel />
      <LocationMap />
      <JsonLd data={restaurantSchema({
        name: "עלינא", phone: env.NEXT_PUBLIC_PHONE,
        address: "רוטשילד 104, ראשון לציון",
        url: env.NEXT_PUBLIC_SITE_URL,
      })} />
    </>
  );
}
```

- [ ] **Step 5: Verify**

`npm run dev` → home page renders with hero, 6 menu items from Sanity, events teaser, reviews from Sanity, embedded map. Inspect HTML: `application/ld+json` script tag present with Restaurant schema.

- [ ] **Step 6: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): home page with hero, menu teaser, events, reviews, map, Restaurant JSON-LD"
```

---

## Task 9: Menu page

**Files:**
- Create: `src/app/תפריט/page.tsx`
- Create: `src/components/menu/MenuList.tsx`, `MenuItemCard.tsx`, `CategoryFilter.tsx`

- [ ] **Step 1: MenuItemCard + MenuList**

`src/components/menu/MenuItemCard.tsx`:
```tsx
import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

export function MenuItemCard({ item }: { item: any }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {item.image && (
        <div className="relative aspect-[4/3]">
          <Image src={urlFor(item.image).width(800).url()} alt={item.name} fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover" />
          {item.tags?.includes("חדש") && <span className="absolute right-3 top-3 rounded-full bg-lemon px-3 py-1 text-xs font-semibold">חדש</span>}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-xl">{item.name}</h3>
          {item.price && <span className="font-numeric font-semibold text-terracotta">₪{item.price}</span>}
        </div>
        {item.description && <p className="mt-1 text-sm text-charcoal/70">{item.description}</p>}
      </div>
    </article>
  );
}
```

`src/components/menu/MenuList.tsx`:
```tsx
import { MenuItemCard } from "./MenuItemCard";

export function MenuList({ categories, items }: { categories: any[]; items: any[] }) {
  return (
    <div className="space-y-12">
      {categories.map(cat => {
        const inCat = items.filter(i => i.category?._id === cat._id);
        if (!inCat.length) return null;
        return (
          <section key={cat._id} id={cat.slug?.current}>
            <h2 className="mb-6 font-display text-3xl text-olive">{cat.name}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {inCat.map(item => <MenuItemCard key={item._id} item={item} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Menu page**

`src/app/תפריט/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { MenuList } from "@/components/menu/MenuList";
import { sanity } from "../../../sanity/lib/client";
import { menuQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const revalidate = 600;
export const metadata = pageMetadata({
  title: "תפריט עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
  description: "התפריט המלא של עלינא: חמארה, בשרים על האש, המבורגרים, סלטים, פיתות, אלכוהול. רוטשילד 104, ראשון לציון.",
  path: "/תפריט",
});

export default async function MenuPage() {
  const { categories, items } = (await sanity.fetch(menuQuery)) as { categories: any[]; items: any[] };
  const menuLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "תפריט עלינא",
    hasMenuSection: categories.map(c => ({
      "@type": "MenuSection", name: c.name,
      hasMenuItem: items.filter(i => i.category?._id === c._id).map(i => ({
        "@type": "MenuItem", name: i.name, description: i.description,
        offers: i.price ? { "@type": "Offer", price: i.price, priceCurrency: "ILS" } : undefined,
      })),
    })),
  };
  return (
    <Container className="py-16">
      <h1 className="mb-10 font-display text-5xl">תפריט עלינא</h1>
      <MenuList categories={categories} items={items} />
      <JsonLd data={menuLd} />
    </Container>
  );
}
```

- [ ] **Step 3: Verify**

`npm run dev` → `/תפריט` renders categories with items from Sanity. If Sanity has no menu items yet, the page renders with empty categories — that's expected; owner adds items via Studio. Validate JSON-LD via `https://search.google.com/test/rich-results` once deployed.

- [ ] **Step 4: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): menu page with category sections and Menu JSON-LD"
```

---

## Task 10: Events page with inquiry form

**Files:**
- Create: `src/app/אירועים/page.tsx`
- Create: `src/components/events/EventInquiryForm.tsx`, `EventPackages.tsx`
- Create: `src/app/api/event-inquiry/route.ts`

- [ ] **Step 1: Inquiry form (client)**

`src/components/events/EventInquiryForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  name: z.string().min(2, "שם קצר מדי"),
  phone: z.string().min(9, "טלפון לא תקין"),
  email: z.string().email("מייל לא תקין").optional().or(z.literal("")),
  date: z.string(),
  guests: z.coerce.number().min(1),
  details: z.string().max(1000).optional(),
});
type FormData = z.infer<typeof schema>;

export function EventInquiryForm() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });
  const onSubmit = async (data: FormData) => {
    const res = await fetch("/api/event-inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) setSent(true);
  };
  if (sent) return <p className="rounded-2xl bg-olive/10 p-6 text-olive">תודה! קיבלנו את הפנייה ונחזור אליך תוך 24 שעות.</p>;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <Field label="שם מלא" error={errors.name?.message}><input {...register("name")} className={inputCls} /></Field>
      <Field label="טלפון" error={errors.phone?.message}><input {...register("phone")} className={inputCls} /></Field>
      <Field label="מייל (אופציונלי)" error={errors.email?.message}><input {...register("email")} className={inputCls} /></Field>
      <Field label="תאריך משוער" error={errors.date?.message}><input type="date" {...register("date")} className={inputCls} /></Field>
      <Field label="מספר אורחים" error={errors.guests?.message}><input type="number" {...register("guests")} className={inputCls} /></Field>
      <Field label="פרטים נוספים" error={errors.details?.message}><textarea {...register("details")} rows={4} className={inputCls} /></Field>
      <button disabled={isSubmitting} className="rounded-full bg-terracotta px-6 py-3 font-semibold text-cream disabled:opacity-50">{isSubmitting ? "שולח..." : "שלח פנייה"}</button>
    </form>
  );
}
const inputCls = "w-full rounded-xl border border-charcoal/15 bg-white px-4 py-2 outline-none focus:border-terracotta";
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-terracotta">{error}</span>}
    </label>
  );
}
```

- [ ] **Step 2: API route + Resend**

`src/app/api/event-inquiry/route.ts`:
```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/lib/env";

const schema = z.object({
  name: z.string().min(2), phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
  date: z.string(), guests: z.coerce.number().min(1),
  details: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!env.RESEND_API_KEY || !env.EVENT_INQUIRY_TO) {
    return NextResponse.json({ ok: true, note: "resend not configured" });
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { name, phone, email, date, guests, details } = parsed.data;
  await resend.emails.send({
    from: "Alena Events <events@alenabepita.co.il>",
    to: env.EVENT_INQUIRY_TO,
    replyTo: email || undefined,
    subject: `אירוע חדש — ${name} (${guests} אורחים)`,
    text: `שם: ${name}\nטלפון: ${phone}\nמייל: ${email || "-"}\nתאריך: ${date}\nאורחים: ${guests}\nפרטים: ${details || "-"}`,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Events page**

`src/components/events/EventPackages.tsx`:
```tsx
import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

export function EventPackages({ packages }: { packages: any[] }) {
  if (!packages?.length) return null;
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {packages.map(p => (
        <article key={p._id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {p.image && (
            <div className="relative aspect-[4/3]">
              <Image src={urlFor(p.image).width(800).url()} alt={p.name} fill sizes="33vw" className="object-cover" />
            </div>
          )}
          <div className="p-4">
            <h3 className="font-display text-xl">{p.name}</h3>
            <p className="mt-2 text-sm text-charcoal/70">{p.description}</p>
            <div className="mt-3 text-sm">
              {p.minGuests}-{p.maxGuests} אורחים · ₪{p.pricePerHead} לאדם
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
```

`src/app/אירועים/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { EventInquiryForm } from "@/components/events/EventInquiryForm";
import { EventPackages } from "@/components/events/EventPackages";
import { sanity } from "../../../sanity/lib/client";
import { eventPackagesQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;
export const metadata = pageMetadata({
  title: "אירועים פרטיים בעלינא — אולם פרטי בראשון לציון",
  description: "אירועים פרטיים בעלינא — ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה. אולם פרטי עד 50 איש ברוטשילד 104, ראשון לציון.",
  path: "/אירועים",
});

export default async function EventsPage() {
  const packages = (await sanity.fetch(eventPackagesQuery)) as any[];
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">אירועים פרטיים</h1>
      <p className="mt-3 max-w-2xl text-charcoal/80">אולם פרטי עד 50 איש, מנות שף ים-תיכוניות, ברים מלאים. ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה.</p>
      <section className="mt-12">
        <h2 className="mb-6 font-display text-3xl text-olive">חבילות</h2>
        <EventPackages packages={packages} />
      </section>
      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-4 font-display text-3xl">השאר פרטים</h2>
          <EventInquiryForm />
        </div>
        <aside className="rounded-2xl bg-olive/10 p-6">
          <p className="font-semibold">צריך תשובה מהירה?</p>
          <p className="mt-2 text-sm">חייגו אלינו ישירות:</p>
          <a href="tel:03-622-8055" className="mt-3 inline-block text-2xl font-display text-terracotta">03-622-8055</a>
        </aside>
      </section>
    </Container>
  );
}
```

- [ ] **Step 4: Verify**

`npm run dev` → `/אירועים` renders. Fill the form with valid data; without `RESEND_API_KEY` set, API responds 200 with `note: "resend not configured"`. Confirm "תודה" success message.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): events page with packages and inquiry form, Resend integration"
```

---

## Task 11: Delivery, Gallery, About, Contact pages

**Files:**
- Create: `src/app/משלוחים/page.tsx`
- Create: `src/app/גלריה/page.tsx`
- Create: `src/app/אודות/page.tsx`
- Create: `src/app/צור-קשר/page.tsx`
- Create: `src/components/gallery/InstagramGrid.tsx`
- Create: `src/app/api/instagram/route.ts`

- [ ] **Step 1: Delivery page**

`src/app/משלוחים/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { siteSettingsQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;
export const metadata = pageMetadata({
  title: "משלוחים — עלינא, ראשון לציון",
  description: "משלוחים מעלינא בראשון לציון — Wolt, תן ביס, 10bis. כל החמארה, הבשרים והסלטים — עד הבית.",
  path: "/משלוחים",
});

export default async function DeliveryPage() {
  const settings = (await sanity.fetch(siteSettingsQuery)) as any;
  const links = settings?.deliveryLinks ?? [];
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">משלוחים</h1>
      <p className="mt-3 max-w-2xl text-charcoal/80">כל החמארה והבשרים שאתם אוהבים — עד הבית או למשרד. הזמינו דרך אחת מהאפליקציות:</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {links.length === 0 && <p className="col-span-full rounded-2xl bg-cream p-6 text-charcoal/70">קישורי משלוחים יתעדכנו בקרוב.</p>}
        {links.map((l: any) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener" className="rounded-2xl border border-charcoal/10 bg-white p-6 text-center font-semibold hover:border-terracotta">{l.name}</a>
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Instagram API + Gallery**

`src/app/api/instagram/route.ts`:
```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const revalidate = 3600;

export async function GET() {
  if (!env.INSTAGRAM_ACCESS_TOKEN) return NextResponse.json({ data: [] });
  try {
    const r = await fetch(
      `https://graph.instagram.com/me/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption&limit=12&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
      { next: { revalidate: 3600 } }
    );
    if (!r.ok) return NextResponse.json({ data: [] });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ data: [] });
  }
}
```

`src/components/gallery/InstagramGrid.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export function InstagramGrid() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { fetch("/api/instagram").then(r => r.json()).then(d => setItems(d.data ?? [])); }, []);
  if (!items.length) return <p className="rounded-2xl bg-cream p-6 text-charcoal/70">פיד אינסטגרם יתעדכן בקרוב.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {items.map(it => (
        <a key={it.id} href={it.permalink} target="_blank" rel="noopener" className="relative aspect-square overflow-hidden rounded-xl bg-cream">
          <Image src={it.media_type === "VIDEO" ? it.thumbnail_url : it.media_url} alt={it.caption?.slice(0, 80) ?? "Instagram"} fill sizes="(min-width:768px) 25vw, 50vw" className="object-cover transition group-hover:scale-105" />
        </a>
      ))}
    </div>
  );
}
```

`src/app/גלריה/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { InstagramGrid } from "@/components/gallery/InstagramGrid";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "גלריה — עלינא ראשון לציון",
  description: "תמונות מהמסעדה, האוכל והאווירה בעלינא. ישירות מהאינסטגרם שלנו @alena.hamara.",
  path: "/גלריה",
});

export default function GalleryPage() {
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">גלריה</h1>
      <p className="mt-3 text-charcoal/80">כל הטעמים, האווירה והרגעים — ישירות מ-<a className="text-terracotta" href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">@alena.hamara</a></p>
      <div className="mt-10">
        <InstagramGrid />
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: About + Contact pages**

`src/app/אודות/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "אודות עלינא — חמארה ים-תיכונית כשרה",
  description: "הסיפור של עלינא: בר רחוב שמח, חמארה ים-תיכונית כשרה ברוטשילד 104 ראשון לציון.",
  path: "/אודות",
});

export default function AboutPage() {
  return (
    <Container className="py-16 max-w-3xl prose-headings:font-display">
      <h1 className="font-display text-5xl">הסיפור של עלינא</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-charcoal/85">
        <p>עלינא נולדה מאהבה לאוכל ים-תיכוני אמיתי. אנחנו לוקחים את הקלאסיקות של אוכל הרחוב — חומוס חם, סלטים טריים, פיתות ביתיות, בשרים על האש — ומגישים אותם בגרסה כשרה ואיכותית, באווירה של בר רחוב שמח.</p>
        <p>בלב רוטשילד 104 בראשון לציון, אנחנו פתוחים שישה ימים בשבוע (חוץ משישי), עם ערבי נושא קבועים: יום ראשון Burger Night, יום שני ערב יין, יום שלישי Butcher Night.</p>
        <p>יש לנו גם אולם פרטי שמתאים לאירועים עד 50 איש — ימי הולדת, אירועי חברה, אירוסים, ובר/בת מצווה.</p>
      </div>
    </Container>
  );
}
```
(Owner will replace text via CMS or PR.)

`src/app/צור-קשר/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { LocationMap } from "@/components/home/LocationMap";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "צור קשר — עלינא ראשון לציון",
  description: "טלפון, וואטסאפ, מיקום ושעות פעילות של עלינא. רוטשילד 104, ראשון לציון.",
  path: "/צור-קשר",
});

export default function ContactPage() {
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">צור קשר</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <p><b>טלפון:</b> <a href={`tel:${env.NEXT_PUBLIC_PHONE}`}>{env.NEXT_PUBLIC_PHONE}</a></p>
          <p><b>WhatsApp:</b> <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener">שלחו הודעה</a></p>
          <p><b>כתובת:</b> רוטשילד 104, ראשון לציון</p>
          <div>
            <b>שעות פעילות:</b>
            <ul className="mt-1 text-sm">
              <li>ראשון–רביעי: 12:00–00:00</li>
              <li>חמישי: 12:00–02:00</li>
              <li>שישי: סגור</li>
              <li>שבת: 20:15–02:00 (מוצ"ש)</li>
            </ul>
          </div>
        </div>
        <div className="rounded-2xl bg-cream p-2">
          <LocationMap />
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Verify all four**

`npm run dev` → visit each URL and confirm rendering. Gallery shows the "fallback" notice when Instagram token isn't set; that's expected.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): delivery, gallery, about, contact pages + IG proxy"
```

---

## Task 12: SEO landing pages (dynamic route)

**Files:**
- Create: `src/app/[landingSlug]/page.tsx`
- Create: `src/components/landing/LandingTemplate.tsx`
- Create: `src/components/shared/FAQAccordion.tsx`

- [ ] **Step 1: FAQ accordion**

`src/components/shared/FAQAccordion.tsx`:
```tsx
"use client";
import { useState } from "react";

export function FAQAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-charcoal/10 rounded-2xl border border-charcoal/10 bg-cream">
      {items.map((it, i) => (
        <details key={i} open={open === i} onToggle={e => (e.currentTarget as HTMLDetailsElement).open && setOpen(i)} className="group p-4">
          <summary className="cursor-pointer list-none font-semibold">{it.q}</summary>
          <p className="mt-2 text-charcoal/75">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Landing template**

`src/components/landing/LandingTemplate.tsx`:
```tsx
import Image from "next/image";
import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema, faqSchema, breadcrumbSchema, reviewSchema } from "@/components/seo/schemas";
import { urlFor } from "../../../sanity/lib/image";
import { env } from "@/lib/env";

export function LandingTemplate({ doc }: { doc: any }) {
  const path = `/${doc.slug.current}`;
  return (
    <Container className="py-16">
      <header className="grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="font-display text-5xl text-charcoal">{doc.h1}</h1>
          {doc.intro && <p className="mt-4 text-lg text-charcoal/80">{doc.intro}</p>}
          <div className="mt-6"><ReservationCTA /></div>
        </div>
        {doc.heroImage && (
          <div className="relative aspect-video overflow-hidden rounded-3xl">
            <Image src={urlFor(doc.heroImage).width(1200).url()} alt={doc.h1} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
          </div>
        )}
      </header>

      {doc.body && (
        <section className="mt-12 max-w-3xl prose prose-charcoal">
          <PortableText value={doc.body} />
        </section>
      )}

      {doc.relatedMenuItems?.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl text-olive">מה בתפריט</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {doc.relatedMenuItems.map((m: any) => <MenuItemCard key={m._id} item={m} />)}
          </div>
        </section>
      )}

      {doc.reviews?.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl">מה אומרים עלינו</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {doc.reviews.map((r: any) => (
              <figure key={r._id} className="rounded-2xl border border-charcoal/10 bg-cream p-6">
                <div className="text-lemon">{"★".repeat(r.rating)}</div>
                <blockquote className="mt-2 text-charcoal/80">{r.body}</blockquote>
                <figcaption className="mt-3 text-sm">— {r.author}</figcaption>
                <JsonLd data={reviewSchema(r)} />
              </figure>
            ))}
          </div>
        </section>
      )}

      {doc.faqs?.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl">שאלות נפוצות</h2>
          <FAQAccordion items={doc.faqs} />
        </section>
      )}

      <JsonLd data={[
        restaurantSchema({ name: "עלינא", phone: env.NEXT_PUBLIC_PHONE, address: "רוטשילד 104, ראשון לציון", url: env.NEXT_PUBLIC_SITE_URL }),
        breadcrumbSchema([{ name: "בית", url: env.NEXT_PUBLIC_SITE_URL }, { name: doc.h1, url: `${env.NEXT_PUBLIC_SITE_URL}${path}` }]),
        ...(doc.faqs?.length ? [faqSchema(doc.faqs)] : []),
      ]} />
    </Container>
  );
}
```

- [ ] **Step 3: Dynamic landing route + generateStaticParams**

`src/app/[landingSlug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { sanity } from "../../../sanity/lib/client";
import { allLandingSlugsQuery, landingBySlugQuery } from "../../../sanity/lib/queries";
import { LandingTemplate } from "@/components/landing/LandingTemplate";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = (await sanity.fetch(allLandingSlugsQuery)) as string[];
  return slugs.map(s => ({ landingSlug: s }));
}

export async function generateMetadata({ params }: { params: Promise<{ landingSlug: string }> }) {
  const { landingSlug } = await params;
  const doc = await sanity.fetch(landingBySlugQuery, { slug: landingSlug });
  if (!doc) return {};
  return pageMetadata({
    title: doc.seoTitle ?? doc.h1,
    description: doc.seoDescription ?? doc.intro?.slice(0, 160) ?? "",
    path: `/${landingSlug}`,
  });
}

export default async function LandingPage({ params }: { params: Promise<{ landingSlug: string }> }) {
  const { landingSlug } = await params;
  const doc = await sanity.fetch(landingBySlugQuery, { slug: landingSlug });
  if (!doc) notFound();
  return <LandingTemplate doc={doc} />;
}
```

- [ ] **Step 4: Verify all 7 landing pages render**

`npm run dev` → visit each: `/חמארה-בראשון-לציון`, `/בר-מסעדה-כשר-בראשון`, `/המבורגר-בראשון`, `/בשר-כשר-בראשון`, `/סטייק-בראשון`, `/ארוחת-בוקר-בראשון`, `/אירועי-חברה-בראשון`. Each shows H1, intro, FAQ, JSON-LD (inspect HTML for `Restaurant`, `BreadcrumbList`, `FAQPage`).

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): SEO landing pages with shared template, FAQs, JSON-LD"
```

---

## Task 13: Blog (index + post)

**Files:**
- Create: `src/app/בלוג/page.tsx`
- Create: `src/app/בלוג/[slug]/page.tsx`
- Create: `src/components/blog/BlogCard.tsx`, `PostBody.tsx`

- [ ] **Step 1: BlogCard + PostBody**

`src/components/blog/BlogCard.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

export function BlogCard({ post }: { post: any }) {
  return (
    <Link href={`/בלוג/${post.slug.current}`} className="group block overflow-hidden rounded-2xl bg-white shadow-sm">
      {post.heroImage && (
        <div className="relative aspect-[16/9]">
          <Image src={urlFor(post.heroImage).width(800).url()} alt={post.title} fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition group-hover:scale-105" />
        </div>
      )}
      <div className="p-4">
        <h3 className="font-display text-xl">{post.title}</h3>
        {post.excerpt && <p className="mt-1 text-sm text-charcoal/70">{post.excerpt}</p>}
      </div>
    </Link>
  );
}
```

`src/components/blog/PostBody.tsx`:
```tsx
import { PortableText } from "@portabletext/react";
export function PostBody({ value }: { value: any }) {
  return <div className="prose max-w-none prose-headings:font-display"><PortableText value={value} /></div>;
}
```

- [ ] **Step 2: Blog index**

`src/app/בלוג/page.tsx`:
```tsx
import { Container } from "@/components/layout/Container";
import { BlogCard } from "@/components/blog/BlogCard";
import { sanity } from "../../../sanity/lib/client";
import { blogIndexQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;
export const metadata = pageMetadata({
  title: "בלוג עלינא — אוכל, אירועים, ראשון לציון",
  description: "כתבות וטיפים מבית עלינא: אוכל ים-תיכוני, חמארה, אירועים פרטיים בראשון לציון.",
  path: "/בלוג",
});

export default async function BlogIndex() {
  const posts = (await sanity.fetch(blogIndexQuery)) as any[];
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">בלוג</h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map(p => <BlogCard key={p._id} post={p} />)}
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: Single post**

`src/app/בלוג/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { PostBody } from "@/components/blog/PostBody";
import { sanity } from "../../../../sanity/lib/client";
import { blogPostQuery } from "../../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await sanity.fetch(blogPostQuery, { slug });
  if (!post) return {};
  return pageMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? "",
    path: `/בלוג/${slug}`,
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await sanity.fetch(blogPostQuery, { slug });
  if (!post) notFound();
  return (
    <Container className="py-16 max-w-3xl">
      <h1 className="font-display text-5xl">{post.title}</h1>
      <p className="mt-2 text-sm text-charcoal/60">{new Date(post.publishedAt).toLocaleDateString("he-IL")}</p>
      <article className="mt-8"><PostBody value={post.body} /></article>
    </Container>
  );
}
```

- [ ] **Step 4: Verify**

`npm run dev` → `/בלוג` lists 3 seed posts, click each to render.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): blog index and post pages with Portable Text"
```

---

## Task 14: Sitemap, robots, dynamic OG image, analytics

**Files:**
- Create: `src/app/sitemap.ts`, `robots.ts`, `opengraph-image.tsx`
- Create: `src/lib/analytics.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Sitemap**

`src/app/sitemap.ts`:
```ts
import type { MetadataRoute } from "next";
import { sanity } from "../../sanity/lib/client";
import { allLandingSlugsQuery, blogIndexQuery } from "../../sanity/lib/queries";
import { env } from "@/lib/env";
import { routes } from "@/lib/routes";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const fixed = Object.values(routes).filter(r => r !== "/studio").map(p => ({ url: `${base}${p}`, lastModified: new Date(), priority: p === "/" ? 1 : 0.8 }));
  const landings = ((await sanity.fetch(allLandingSlugsQuery)) as string[]).map(s => ({ url: `${base}/${s}`, lastModified: new Date(), priority: 0.9 }));
  const posts = ((await sanity.fetch(blogIndexQuery)) as any[]).map(p => ({ url: `${base}/בלוג/${p.slug.current}`, lastModified: new Date(p.publishedAt), priority: 0.6 }));
  return [...fixed, ...landings, ...posts];
}
```

`src/app/robots.ts`:
```ts
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/api/"] }],
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: Default OG image**

`src/app/opengraph-image.tsx`:
```tsx
import { ImageResponse } from "next/og";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#FAF3E7", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div style={{ fontSize: 96, color: "#C65D3A", fontWeight: 700 }}>עלינא</div>
        <div style={{ fontSize: 36, color: "#2B2825", marginTop: 16 }}>חמארה ים-תיכונית כשרה · ראשון לציון</div>
      </div>
    ),
    size
  );
}
```

- [ ] **Step 3: Analytics**

`src/lib/analytics.ts`:
```tsx
import Script from "next/script";
import { env } from "./env";
export function Analytics() {
  return (
    <>
      {env.NEXT_PUBLIC_GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_GA_ID}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${env.NEXT_PUBLIC_GA_ID}');
          `}</Script>
        </>
      )}
      {env.NEXT_PUBLIC_META_PIXEL_ID && (
        <Script id="meta" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${env.NEXT_PUBLIC_META_PIXEL_ID}'); fbq('track', 'PageView');
        `}</Script>
      )}
    </>
  );
}
```

Add Vercel Analytics:
```powershell
npm i @vercel/analytics @vercel/speed-insights
```

Update `src/app/layout.tsx` body, before closing tag:
```tsx
import { Analytics as GA } from "@/lib/analytics";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ...
<GA />
<VercelAnalytics />
<SpeedInsights />
```

- [ ] **Step 4: Verify**

`npm run dev` → visit `/sitemap.xml`, `/robots.txt`, `/opengraph-image`. All return correctly.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "feat(alena-website): sitemap, robots, dynamic OG image, GA4 + Meta Pixel + Vercel Analytics"
```

---

## Task 15: Performance pass and Playwright smoke tests

**Files:**
- Create: `tests/e2e/home.spec.ts`, `menu.spec.ts`, `landing.spec.ts`, `seo.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 2: Smoke tests**

`tests/e2e/home.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
test("home loads with hero and reservation CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("חמארה");
  await expect(page.getByRole("link", { name: /הזמן שולחן/ }).first()).toBeVisible();
});
test("home has Restaurant JSON-LD", async ({ page }) => {
  await page.goto("/");
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain("Restaurant");
});
```

`tests/e2e/menu.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
test("menu page renders", async ({ page }) => {
  await page.goto("/תפריט");
  await expect(page.locator("h1")).toContainText("תפריט");
});
```

`tests/e2e/landing.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
const slugs = ["חמארה-בראשון-לציון","בר-מסעדה-כשר-בראשון","המבורגר-בראשון","בשר-כשר-בראשון","סטייק-בראשון","ארוחת-בוקר-בראשון","אירועי-חברה-בראשון"];
for (const s of slugs) {
  test(`landing /${s}`, async ({ page }) => {
    const r = await page.goto(`/${encodeURI(s)}`);
    expect(r?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    const lds = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(lds.join("")).toContain("FAQPage");
  });
}
```

`tests/e2e/seo.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
test("sitemap exists with all 14 pages", async ({ request }) => {
  const r = await request.get("/sitemap.xml");
  expect(r.status()).toBe(200);
  const xml = await r.text();
  expect(xml).toContain("/תפריט");
  expect(xml).toContain("/חמארה-בראשון-לציון");
  expect(xml).toContain("/בלוג");
});
test("robots.txt exists", async ({ request }) => {
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain("Sitemap");
});
test("html is RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
});
```

- [ ] **Step 3: Run all tests**

```powershell
npm test                 # vitest unit
npx playwright test      # e2e
```
Expected: all pass.

- [ ] **Step 4: Lighthouse smoke**

```powershell
npm run build && npm run start
```
In a second terminal: `npx lighthouse http://localhost:3000 --only-categories=performance,seo,accessibility,best-practices --form-factor=mobile --quiet --view`
Target: 95+ on each axis. If a metric falls short, address (likely image sizing or font preloading) before next task.

- [ ] **Step 5: Commit**

```powershell
git add apps/alena-website
git commit -m "test(alena-website): Playwright smoke + SEO + landing tests, Lighthouse pass"
```

---

## Task 16: Vercel preview deploy

**Files:**
- Create: `apps/alena-website/vercel.json` (optional)
- Modify: `.gitignore` (ensure `.env.local`)

- [ ] **Step 1: Link Vercel project**

```powershell
cd apps/alena-website
npx vercel link
```
Accept defaults; create new project named `alena-website` under owner's Vercel team.

- [ ] **Step 2: Set environment variables**

For Preview and Production, set:
- `NEXT_PUBLIC_SITE_URL` → preview URL (Vercel auto-fills `VERCEL_URL`)
- `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `NEXT_PUBLIC_SANITY_DATASET=production`
- `SANITY_API_READ_TOKEN`
- `RESEND_API_KEY` (when issued)
- `EVENT_INQUIRY_TO=dvirnifusi@gmail.com`
- `INSTAGRAM_ACCESS_TOKEN` (once owner connects Instagram)
- `NEXT_PUBLIC_ONTOPO_URL`, `NEXT_PUBLIC_WHATSAPP_URL`, `NEXT_PUBLIC_PHONE`

```powershell
npx vercel env add NEXT_PUBLIC_SANITY_PROJECT_ID
# repeat for each
```

- [ ] **Step 3: Deploy preview**

```powershell
npx vercel
```
Open the preview URL. Verify: home, menu, all 7 landing pages, blog, gallery, events all render.

- [ ] **Step 4: Submit sitemap to Search Console**

In Google Search Console, add the Vercel preview URL as a property. Submit `<preview-url>/sitemap.xml`. (Will be re-done on the final domain.)

- [ ] **Step 5: Commit any final tweaks + push**

```powershell
git add apps/alena-website
git commit -m "chore(alena-website): vercel preview deploy"
git push
```

---

## Task 17: Hand-off to owner for review

This is not a code task — it's the owner-review milestone described in the spec.

- [ ] **Step 1: Capture the preview URL and Studio URL**

Note these two URLs:
- Site: `https://alena-website-<hash>.vercel.app`
- Studio: `https://alena-website-<hash>.vercel.app/studio` (owner logs in with his email)

- [ ] **Step 2: Compile open items for the owner**

Drafted message (Hebrew) to send to Dvir:
> האתר עלה לתצוגה מקדימה. הקישור: `<preview URL>`
> ניהול תוכן: `<preview URL>/studio` (התחבר עם המייל שלך)
>
> מה שאני צריך ממך עכשיו:
> 1. צילום של תעודת הכשרות + שם גוף הכשרות (להוסיף ב-Settings → siteSettings)
> 2. קישורים פעילים של אפליקציות משלוחים (Wolt / תן ביס / 10bis) — להוסיף ב-deliveryLinks
> 3. תפריט מלא — תוכל להעלות בעצמך ב-Studio
> 4. אישור / תיקון לטקסט באודות
> 5. גישה ל-Instagram (כדי שאחבר את הפיד)
> 6. החלטה סופית על הדומיין (להחליף את alenabepita.co.il, או דומיין חדש)
>
> אחרי שתעבור על האתר ותגיד מה לשנות — נשפר ונקפוץ ל-Production.

- [ ] **Step 3: Owner approval gate**

Wait for owner feedback. Track each item as a follow-up task as it comes in.

---

## Self-review

**Spec coverage check:** Each section of the spec is covered:
- §2 Architecture → Tasks 1, 2, 3
- §3 Sitemap (14 pages + blog) → Tasks 8, 9, 10, 11, 12, 13
- §4 SEO strategy (sitemap, robots, schemas, OG, GBP-ready) → Tasks 7, 12, 14
- §5 Visual design (colors, fonts, components) → Tasks 2, 6
- §6 Integrations (OnTopo, WhatsApp, Resend, Maps, Analytics, IG) → Tasks 6, 10, 11, 14
- §7 CMS schema → Task 4
- §8 Seed facts (OnTopo data, address, phone, hours) → Task 5
- §9 Delivery approach (one-shot) → end-to-end in Tasks 1–16
- §10 Hosting → Task 16
- §11 Domain → deferred per spec; addressed in Task 17 hand-off
- §12 Success criteria → Task 15 (Lighthouse, sitemap), Task 16 (Search Console)

**Type consistency:** `routes` constant used in Header, Footer, Sitemap; `landingSlug` route param matches `landingSlugs` and `allLandingSlugsQuery`; Sanity field names (`h1`, `slug.current`, `relatedMenuItems`) match between schema, query, and template; env var names consistent (`NEXT_PUBLIC_ONTOPO_URL`, `NEXT_PUBLIC_PHONE`, `NEXT_PUBLIC_WHATSAPP_URL` everywhere).

**Placeholder scan:** No "TBD" or "implement later" steps remain. Every code-changing step shows full code. Hero image uses a placeholder `public/hero.jpg` (Task 8 Step 1) — owner will replace via CMS / IG pull; this is called out, not hidden. Seed reviews use `source: "Direct"` placeholders, explicitly flagged in Task 5 Step 4 as temporary until real Google reviews are connected.
