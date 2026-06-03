import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { siteSettingsQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "משלוחים — עלינא, ראשון לציון",
  description:
    "משלוחים מעלינא בראשון לציון — Wolt, תן ביס, 10bis. כל החמארה, הבשרים והסלטים — עד הבית.",
  path: "/משלוחים",
});

type Settings = { deliveryLinks?: { name: string; url: string }[] } | null;

export default async function DeliveryPage() {
  let settings: Settings = null;
  try {
    settings = (await sanity.fetch(siteSettingsQuery)) as Settings;
  } catch {
    settings = null;
  }
  const links = settings?.deliveryLinks ?? [];
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">משלוחים</h1>
      <p className="mt-3 max-w-2xl text-charcoal/80">
        כל החמארה והבשרים שאתם אוהבים — עד הבית או למשרד. הזמינו דרך אחת מהאפליקציות:
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {links.length === 0 ? (
          <p className="col-span-full rounded-2xl bg-cream p-6 text-charcoal/70">
            קישורי משלוחים יתעדכנו בקרוב. בינתיים — חייגו{" "}
            <a href="tel:03-622-8055" className="text-terracotta">
              03-622-8055
            </a>
            .
          </p>
        ) : (
          links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener"
              className="rounded-2xl border border-charcoal/10 bg-white p-6 text-center font-semibold hover:border-terracotta"
            >
              {l.name}
            </a>
          ))
        )}
      </div>
    </Container>
  );
}
