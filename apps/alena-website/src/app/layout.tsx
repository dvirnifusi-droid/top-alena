import "./globals.css";
import type { Metadata } from "next";
import { heebo, frankRuhl, inter } from "@/lib/fonts";
import { Header } from "@/components/layout/Header";
import { TopBanner } from "@/components/layout/TopBanner";
import { Footer } from "@/components/layout/Footer";
import { StickyMobileCTA } from "@/components/layout/StickyMobileCTA";
import { FloatingWhatsApp } from "@/components/shared/FloatingWhatsApp";
import { Analytics as GA } from "@/lib/analytics";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
      <body className="font-body bg-cream text-charcoal antialiased pb-20 md:pb-0">
        <TopBanner />
        <Header />
        {children}
        <Footer />
        <StickyMobileCTA />
        <FloatingWhatsApp />
        <GA />
        <VercelAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
