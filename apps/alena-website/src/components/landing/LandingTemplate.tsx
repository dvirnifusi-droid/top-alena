import Image from "next/image";
import { PortableText, type PortableTextBlock } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { MenuItemCard, type MenuItemData } from "@/components/menu/MenuItemCard";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  restaurantSchema,
  faqSchema,
  breadcrumbSchema,
  reviewSchema,
} from "@/components/seo/schemas";
import { urlFor } from "../../../sanity/lib/image";
import { env } from "@/lib/env";

type Review = { _id: string; author: string; rating: number; body: string; date?: string };

export type LandingDoc = {
  slug: { current: string };
  h1: string;
  intro?: string;
  heroImage?: unknown;
  body?: PortableTextBlock[];
  relatedMenuItems?: MenuItemData[];
  reviews?: Review[];
  faqs?: { q: string; a: string }[];
};

export function LandingTemplate({ doc }: { doc: LandingDoc }) {
  const path = `/${doc.slug.current}`;
  return (
    <Container className="py-16">
      <header className="grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="font-display text-5xl text-charcoal">{doc.h1}</h1>
          {doc.intro ? <p className="mt-4 text-lg text-charcoal/80">{doc.intro}</p> : null}
          <div className="mt-6">
            <ReservationCTA />
          </div>
        </div>
        {doc.heroImage ? (
          <div className="relative aspect-video overflow-hidden rounded-3xl">
            <Image
              src={urlFor(doc.heroImage).width(1200).url()}
              alt={doc.h1}
              fill
              sizes="(min-width:768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-3xl bg-gradient-to-br from-terracotta/30 to-lemon/30" />
        )}
      </header>

      {doc.body ? (
        <section className="prose prose-charcoal mt-12 max-w-3xl">
          <PortableText value={doc.body} />
        </section>
      ) : null}

      {doc.relatedMenuItems && doc.relatedMenuItems.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl text-olive">מה בתפריט</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {doc.relatedMenuItems.map((m) => (
              <MenuItemCard key={m._id} item={m} />
            ))}
          </div>
        </section>
      ) : null}

      {doc.reviews && doc.reviews.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl">מה אומרים עלינו</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {doc.reviews.map((r) => (
              <figure key={r._id} className="rounded-2xl border border-charcoal/10 bg-cream p-6">
                <div className="text-lemon">{"★".repeat(r.rating)}</div>
                <blockquote className="mt-2 text-charcoal/80">{r.body}</blockquote>
                <figcaption className="mt-3 text-sm">— {r.author}</figcaption>
                <JsonLd data={reviewSchema(r)} />
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {doc.faqs && doc.faqs.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-6 font-display text-3xl">שאלות נפוצות</h2>
          <FAQAccordion items={doc.faqs} />
        </section>
      ) : null}

      <JsonLd
        data={[
          restaurantSchema({
            name: "עלינא",
            phone: env.NEXT_PUBLIC_PHONE,
            address: "רוטשילד 104, ראשון לציון",
            url: env.NEXT_PUBLIC_SITE_URL,
          }),
          breadcrumbSchema([
            { name: "בית", url: env.NEXT_PUBLIC_SITE_URL },
            { name: doc.h1, url: `${env.NEXT_PUBLIC_SITE_URL}${path}` },
          ]),
          ...(doc.faqs && doc.faqs.length > 0 ? [faqSchema(doc.faqs)] : []),
        ]}
      />
    </Container>
  );
}
