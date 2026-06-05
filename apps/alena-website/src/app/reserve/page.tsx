import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";
import { SmartReserveBanner } from "@/components/reserve/SmartReserveBanner";
import { HappyHourCallout } from "@/components/reserve/HappyHourCallout";

export const metadata = pageMetadata({
  title: "הזמנת שולחן — עלינא, ראשון לציון",
  description:
    "הזמינו שולחן בעלינא ברוטשילד 104. אישור מיידי, ערבי נושא, Happy Hour 12-20, חניות סמוכות במרכז בן גוריון.",
  path: "/reserve",
});

const WAZE = `https://waze.com/ul?q=${encodeURIComponent("עלינא רוטשילד 104 ראשון לציון")}`;
const GOOGLE_MAPS = `https://www.google.com/maps?q=${encodeURIComponent("עלינא רוטשילד 104 ראשון לציון")}&output=embed`;
const PARKING_LOT_WAZE = `https://waze.com/ul?q=${encodeURIComponent("מרכז בן גוריון ראשון לציון חניון")}`;

export default function ReservePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-charcoal py-16 text-cream md:py-24">
        <div className="absolute inset-0 opacity-40">
          <Image
            src="/gallery/IMG_4682.JPG"
            alt="הבר של עלינא"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/30 to-charcoal/85" />
        </div>
        <Container className="relative text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-brass-soft">הזמנת שולחן</p>
          <h1 className="mt-6 font-display text-5xl text-cream md:text-7xl">תפסו מקום</h1>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">
            רוטשילד 104 · אישור מיידי · ערבי נושא קבועים.
          </p>
        </Container>
      </section>

      <Container className="max-w-3xl py-12">
        <div className="space-y-6">
          {/* Day-aware welcome */}
          <SmartReserveBanner />

          {/* Happy Hour live callout */}
          <HappyHourCallout />

          {/* OnTopo widget */}
          <div className="overflow-hidden rounded-3xl bg-cream-soft shadow-xl ring-1 ring-brass/15">
            <iframe
              title="הזמנת שולחן בעלינא"
              src={env.NEXT_PUBLIC_ONTOPO_URL}
              width="100%"
              height="900"
              frameBorder="0"
              className="block w-full"
              loading="lazy"
            />
          </div>

          {/* Special occasion prompt */}
          <div className="rounded-3xl border border-brass/20 bg-cream-soft p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-brass">אירוע מיוחד?</p>
            <h3 className="mt-2 font-display text-2xl text-charcoal">
              חוגגים יום הולדת או יום נישואים?
            </h3>
            <p className="mt-2 text-charcoal/75">
              ספרו לנו בשדה ה״הערות״ בטופס למעלה ונתאים את הערב — קינוח על הבית, ברכה מהשף,
              שיר מהמוזיקה שאתם אוהבים.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-charcoal/80">
              <li>🎂 יום הולדת — קינוח עם נר על הבית</li>
              <li>💍 יום נישואים — קוקטיילים בית במתנה</li>
              <li>👨‍💼 אירוע עסקי — שולחן שקט באזור הפנימי</li>
              <li>🎉 חברים — בקשו מקום על הבר</li>
            </ul>
          </div>

          {/* Parking + directions */}
          <div className="rounded-3xl bg-olive p-6 text-cream md:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-brass-soft">הגעה</p>
            <h3 className="mt-2 font-display text-2xl">חניה ונסיעה</h3>
            <p className="mt-2 text-cream/85">
              מקומות חניה בתשלום ברחוב רוטשילד עצמו, וחניון רחב במרכז בן גוריון
              (כ-3 דקות הליכה). מומלץ לחניון בשעות העומס.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={WAZE}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-2 rounded-full bg-cream px-5 py-3 font-semibold text-olive hover:bg-brass hover:text-cream"
              >
                <span>🚗</span> נווט לעלינא ב-Waze
              </a>
              <a
                href={PARKING_LOT_WAZE}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-2 rounded-full border-2 border-cream/30 px-5 py-3 font-semibold text-cream hover:border-brass hover:text-brass"
              >
                <span>🅿️</span> נווט לחניון
              </a>
            </div>
            <iframe
              title="מפת מיקום עלינא"
              src={GOOGLE_MAPS}
              className="mt-5 aspect-video w-full rounded-2xl border-0"
              loading="lazy"
            />
          </div>

          {/* Theme nights cheat sheet */}
          <div className="rounded-3xl bg-cream-soft p-6 ring-1 ring-brass/15 md:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-brass">סדר השבוע</p>
            <h3 className="mt-2 font-display text-2xl text-charcoal">ערבי נושא בעלינא</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["ראשון", "🍔 Burger Night — ספיישלים שלא בתפריט"],
                ["שני", "🍷 ערב יין ללא תחתית מ-₪61"],
                ["שלישי", "🥩 Butcher Night — נתחי הפתעה"],
                ["רביעי", "✨ Happy Hour עד 20:00"],
                ["חמישי", "🔥 פתוחים עד 02:00 — האווירה בשיא"],
                ["שבת", "🌙 מוצ״ש מ-20:15 עד הלקוח האחרון"],
              ].map(([day, desc]) => (
                <li key={day} className="flex gap-3 rounded-xl bg-cream p-3">
                  <span className="font-display text-lg text-olive">{day}</span>
                  <span className="text-sm text-charcoal/80">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-charcoal/55">
              שישי סגור · שעות פתיחה: ראשון–רביעי 12:00–00:00 · חמישי 12:00–02:00 · שבת 20:15–02:00
            </p>
          </div>

          {/* Final reassurance + human fallback */}
          <div className="grid gap-3 rounded-3xl border border-brass/20 bg-cream-soft p-6 sm:grid-cols-3">
            <a
              href={`tel:${env.NEXT_PUBLIC_PHONE}`}
              className="flex flex-col items-center gap-1 rounded-2xl bg-cream py-4 text-center"
            >
              <span className="text-2xl">📞</span>
              <span className="text-sm font-semibold text-charcoal">חיוג</span>
              <span className="text-xs text-charcoal/65">{env.NEXT_PUBLIC_PHONE}</span>
            </a>
            <a
              href={env.NEXT_PUBLIC_WHATSAPP_URL}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 rounded-2xl bg-cream py-4 text-center"
            >
              <span className="text-2xl">💬</span>
              <span className="text-sm font-semibold text-charcoal">WhatsApp</span>
              <span className="text-xs text-charcoal/65">מענה מהיר</span>
            </a>
            <a
              href="/events"
              className="flex flex-col items-center gap-1 rounded-2xl bg-cream py-4 text-center"
            >
              <span className="text-2xl">🎉</span>
              <span className="text-sm font-semibold text-charcoal">אירוע פרטי</span>
              <span className="text-xs text-charcoal/65">אולם עד 50</span>
            </a>
          </div>
        </div>
      </Container>
    </>
  );
}
