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
          <p className="mt-4 text-lg text-charcoal/80">
            בר רחוב שמח · בשרים על האש · אירועים פרטיים · רוטשילד 104
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <ReservationCTA />
            <a
              href="/תפריט"
              className="inline-flex items-center justify-center rounded-full border-2 border-charcoal/15 px-6 py-3 font-medium hover:border-charcoal/40"
            >
              צפה בתפריט
            </a>
          </div>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-olive/10 shadow-2xl shadow-terracotta/10">
          {/* Hero image to be replaced via CMS / Instagram pull */}
          <Image
            src="/hero-placeholder.svg"
            alt="צלחת אוכל בעלינא"
            fill
            priority
            sizes="(min-width:768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </Container>
    </section>
  );
}
