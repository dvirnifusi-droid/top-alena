import { Container } from "@/components/layout/Container";
import { MenuList } from "@/components/menu/MenuList";
import { sanity } from "../../../sanity/lib/client";
import { menuQuery } from "../../../sanity/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

export const revalidate = 600;

export const metadata = pageMetadata({
  title: "תפריט עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
  description:
    "התפריט המלא של עלינא: חמארה, בשרים על האש, המבורגרים, סלטים, פיתות, אלכוהול. רוטשילד 104, ראשון לציון.",
  path: "/תפריט",
});

type Category = { _id: string; name: string; slug?: { current: string } };
type Item = {
  _id: string;
  name: string;
  description?: string;
  price?: number;
  image?: unknown;
  tags?: string[];
  category?: { _id: string };
};

export default async function MenuPage() {
  let categories: Category[] = [];
  let items: Item[] = [];
  try {
    const data = (await sanity.fetch(menuQuery)) as { categories: Category[]; items: Item[] };
    categories = data.categories ?? [];
    items = data.items ?? [];
  } catch {
    /* empty */
  }

  const menuLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "תפריט עלינא",
    hasMenuSection: categories.map((c) => ({
      "@type": "MenuSection",
      name: c.name,
      hasMenuItem: items
        .filter((i) => i.category?._id === c._id)
        .map((i) => ({
          "@type": "MenuItem",
          name: i.name,
          description: i.description,
          offers: i.price ? { "@type": "Offer", price: i.price, priceCurrency: "ILS" } : undefined,
        })),
    })),
  };

  return (
    <Container className="py-16">
      <h1 className="mb-3 font-display text-5xl">תפריט עלינא</h1>
      <p className="mb-10 text-charcoal/80">
        חמארה, בשרים על האש, ארוחות בוקר וברים — הכול תחת הכשר.
      </p>

      {categories.length === 0 ? (
        <div className="rounded-2xl bg-cream p-8 text-center">
          <p className="text-charcoal/80">התפריט יתעדכן בקרוב.</p>
          <p className="mt-2 text-sm text-charcoal/60">
            עד אז — מומלץ לחייג ולשאול את הצוות, או להזמין שולחן ולגלות בעצמך.
          </p>
          <div className="mt-6 inline-block">
            <ReservationCTA />
          </div>
        </div>
      ) : (
        <MenuList categories={categories} items={items} />
      )}

      <JsonLd data={menuLd} />
    </Container>
  );
}
