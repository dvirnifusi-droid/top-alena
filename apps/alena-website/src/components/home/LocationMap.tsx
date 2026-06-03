import { Container } from "@/components/layout/Container";
import { FadeIn } from "@/components/shared/MotionSection";

export function LocationMap() {
  const q = encodeURIComponent("עלינא רוטשילד 104 ראשון לציון");
  return (
    <section className="py-20">
      <Container className="grid gap-10 md:grid-cols-2">
        <FadeIn>
          <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
            <span className="h-px w-8 bg-brass" />
            כתובת
          </p>
          <h2 className="font-display text-4xl text-charcoal md:text-5xl">איפה אנחנו</h2>
          <p className="mt-4 text-charcoal/80">
            רוטשילד 104, ראשון לציון
            <br />
            חניות סמוכות במרכז בן גוריון ובכבישים המקבילים.
          </p>
          <a
            href={`https://waze.com/ul?q=${q}`}
            target="_blank"
            rel="noopener"
            className="mt-6 inline-block rounded-full bg-med-blue px-6 py-3 text-sm font-semibold text-cream hover:bg-med-blue/90"
          >
            נווט אלי ב-Waze
          </a>
        </FadeIn>
        <FadeIn delay={0.15}>
          <iframe
            title="מפת מיקום עלינא"
            className="aspect-video w-full rounded-3xl border-0 ring-1 ring-brass/20"
            src={`https://www.google.com/maps?q=${q}&output=embed`}
            loading="lazy"
          />
        </FadeIn>
      </Container>
    </section>
  );
}
