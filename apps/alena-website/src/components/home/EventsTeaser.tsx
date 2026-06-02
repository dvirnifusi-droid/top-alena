import Link from "next/link";
import { Container } from "@/components/layout/Container";

export function EventsTeaser() {
  return (
    <section className="bg-olive/10 py-16">
      <Container className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl text-olive">אירועים פרטיים</h2>
          <p className="mt-3 text-charcoal/80">
            אולם פרטי עד 50 איש · חבילות גמישות · ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה.
          </p>
          <Link
            href="/אירועים"
            className="mt-6 inline-block rounded-full bg-olive px-6 py-3 font-semibold text-cream hover:bg-olive/90"
          >
            ספרו לי עוד
          </Link>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-gradient-to-br from-olive/30 to-terracotta/20" />
      </Container>
    </section>
  );
}
