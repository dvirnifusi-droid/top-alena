import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { heebo, frankRuhl, inter } from "@/lib/fonts";
import { Header } from "@/components/layout/Header";
import { TopBanner } from "@/components/layout/TopBanner";
import { Footer } from "@/components/layout/Footer";
import { StickyMobileCTA } from "@/components/layout/StickyMobileCTA";
import { FloatingWhatsApp } from "@/components/shared/FloatingWhatsApp";
import { WelcomeModal } from "@/components/layout/WelcomeModal";
import { SkipLink } from "@/components/layout/SkipLink";
import { AccessibilityWidget } from "@/components/shared/AccessibilityWidget";
import { Analytics as GA } from "@/lib/analytics";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { env } from "@/lib/env";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://alena.topalena.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "עלינא",
  title: {
    default: "עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
    template: "%s | עלינא",
  },
  description:
    "עלינא · חמארה ים-תיכונית כשרה ברוטשילד 104, ראשון לציון. בשרים על ג'וספר 600°, ערבי יין ו-Burger Night, אירועים פרטיים. ★ 4.9 · הזמן שולחן.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    shortcut: "/favicon.png",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: "עלינא",
    title: "עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
    description:
      "בר-מסעדה כשר ברוטשילד 104. בשרים על ג'וספר 600°, ערבי יין, Burger Night ואירועים פרטיים.",
  },
  twitter: {
    card: "summary_large_image",
    title: "עלינא — חמארה ים-תיכונית כשרה",
    description: "ברוטשילד 104, ראשון לציון. ג'וספר 600° · בר מלא · אירועים פרטיים.",
  },
  verification: {
    google: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

// JSON-LD: WebSite + Organization at the root level
// — declares site name "עלינא" + logo to Google's Knowledge Panel
// — enables Sitelinks Search Box (search bar inside the search result)
const rootJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: "עלינא",
      alternateName: ["Alena", "עלינא ראשון לציון"],
      inLanguage: "he-IL",
      publisher: { "@id": `${SITE_URL}#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "עלינא",
      alternateName: "Alena",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon-512.png`,
        width: 512,
        height: 512,
      },
      sameAs: [
        "https://alenabepita.co.il",
        "https://topalena.com",
        "https://www.instagram.com/alena.hamara",
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${frankRuhl.variable} ${inter.variable}`}>
      <body className="font-body bg-cream text-charcoal antialiased pb-20 md:pb-0">
        <Script
          id="root-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(rootJsonLd) }}
        />
        <SkipLink />
        <TopBanner />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <StickyMobileCTA />
        <FloatingWhatsApp />
        <AccessibilityWidget />
        <WelcomeModal />
        <GA />
        <VercelAnalytics />
        <SpeedInsights />
        {/* Microsoft Clarity — free heatmaps + session recordings */}
        {env.NEXT_PUBLIC_CLARITY_ID ? (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${env.NEXT_PUBLIC_CLARITY_ID}");`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
