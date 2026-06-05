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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://alena.topalena.com"),
  title: {
    default: "עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
    template: "%s | עלינא",
  },
  description:
    "עלינא — בר מסעדה כשר ים-תיכוני ברוטשילד 104, ראשון לציון. המבורגרים, בשרים, חמארה, ארוחות בוקר ואירועים פרטיים. הזמן שולחן עכשיו.",
  verification: {
    google: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${frankRuhl.variable} ${inter.variable}`}>
      <body className="font-body bg-cream text-charcoal antialiased pb-20 md:pb-0">
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
