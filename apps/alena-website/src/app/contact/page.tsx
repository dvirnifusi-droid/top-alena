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
          <p>
            <b>טלפון:</b>{" "}
            <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="text-terracotta">
              {env.NEXT_PUBLIC_PHONE}
            </a>
          </p>
          <p>
            <b>WhatsApp:</b>{" "}
            <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className="text-terracotta">
              שלחו הודעה
            </a>
          </p>
          <p>
            <b>כתובת:</b> רוטשילד 104, ראשון לציון
          </p>
          <div>
            <b>שעות פעילות:</b>
            <ul className="mt-1 text-sm">
              <li>ראשון–רביעי: 12:00–00:00</li>
              <li>חמישי: 12:00–02:00</li>
              <li>שישי: סגור</li>
              <li>שבת: 20:15–02:00 (מוצ&quot;ש)</li>
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
