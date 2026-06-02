import { Container } from "@/components/layout/Container";
import { EventInquiryForm } from "@/components/events/EventInquiryForm";
import { EventPackages } from "@/components/events/EventPackages";
import { sanity } from "../../../sanity/lib/client";
import { eventPackagesQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "אירועים פרטיים בעלינא — אולם פרטי בראשון לציון",
  description:
    "אירועים פרטיים בעלינא — ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה. אולם פרטי עד 50 איש ברוטשילד 104, ראשון לציון.",
  path: "/אירועים",
});

export default async function EventsPage() {
  let packages: Parameters<typeof EventPackages>[0]["packages"] = [];
  try {
    packages = (await sanity.fetch(eventPackagesQuery)) ?? [];
  } catch {
    packages = [];
  }
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">אירועים פרטיים</h1>
      <p className="mt-3 max-w-2xl text-charcoal/80">
        אולם פרטי עד 50 איש, מנות שף ים-תיכוניות, ברים מלאים. ימי הולדת, אירועי חברה, אירוסים, בר/בת מצווה.
      </p>

      {packages.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl text-olive">חבילות</h2>
          <EventPackages packages={packages} />
        </section>
      ) : null}

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-4 font-display text-3xl">השאר פרטים</h2>
          <EventInquiryForm />
        </div>
        <aside className="rounded-2xl bg-olive/10 p-6 h-fit">
          <p className="font-semibold">צריך תשובה מהירה?</p>
          <p className="mt-2 text-sm">חייגו אלינו ישירות:</p>
          <a href="tel:03-622-8055" className="mt-3 inline-block font-display text-3xl text-terracotta">
            03-622-8055
          </a>
        </aside>
      </section>
    </Container>
  );
}
