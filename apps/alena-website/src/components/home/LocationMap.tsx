import { Container } from "@/components/layout/Container";

export function LocationMap() {
  const q = encodeURIComponent("עלינא רוטשילד 104 ראשון לציון");
  return (
    <section className="py-16">
      <Container className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl">איפה אנחנו</h2>
          <p className="mt-2 text-charcoal/80">
            רוטשילד 104, ראשון לציון
            <br />
            חניות סמוכות במרכז בן גוריון.
          </p>
          <a
            href={`https://waze.com/ul?q=${q}`}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-block rounded-full bg-med-blue px-5 py-2 text-sm font-semibold text-cream"
          >
            נווט אלי ב-Waze
          </a>
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
