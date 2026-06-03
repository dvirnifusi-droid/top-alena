import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="grid items-center gap-12 py-20 md:grid-cols-2 md:py-32">
        <div className="text-center md:text-right">
          <p className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
            <span className="h-px w-8 bg-brass" />
            רוטשילד 104 · ראשון לציון
          </p>
          <h1 className="font-display text-5xl leading-[1.05] text-charcoal md:text-7xl">
            חמארה ים-תיכונית
            <span className="block text-terracotta">כשרה ומדויקת</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-charcoal/75">
            בר רחוב שמח · בשרים על האש · אירועים פרטיים. חוויה ים-תיכונית עכשווית, מבושלת בעבודת יד, מוגשת בלי פשרות.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 md:justify-start">
            <ReservationCTA />
            <a
              href="/menu"
              className="inline-flex items-center justify-center rounded-full border-2 border-charcoal/15 px-6 py-3 font-medium text-charcoal hover:border-brass hover:text-brass"
            >
              צפה בתפריט
            </a>
          </div>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-olive/15 to-terracotta/10 shadow-2xl shadow-charcoal/15 ring-1 ring-brass/20">
          <Image
            src="/hero-placeholder.svg"
            alt="צלחת אוכל בעלינא"
            fill
            priority
            sizes="(min-width:768px) 45vw, 100vw"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cream/30" />
        </div>
      </Container>
    </section>
  );
}
