import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { menuQuery } from "../../../sanity/lib/queries";
import { urlFor } from "../../../sanity/lib/image";

type Item = {
  _id: string;
  name: string;
  description?: string;
  price?: number;
  image?: unknown;
};

export async function MenuTeaser() {
  let items: Item[] = [];
  try {
    const data = (await sanity.fetch(menuQuery)) as { items: Item[] };
    items = data.items ?? [];
  } catch {
    items = [];
  }
  const featured = items.slice(0, 6);
  if (!featured.length) {
    return (
      <section className="py-16">
        <Container>
          <h2 className="font-display text-4xl text-charcoal">מה בתפריט</h2>
          <p className="mt-4 rounded-2xl bg-cream p-6 text-charcoal/70">
            התפריט יתעדכן בקרוב. בינתיים{" "}
            <Link href="/תפריט" className="text-terracotta underline">
              צפה בתפריט המלא
            </Link>
            .
          </p>
        </Container>
      </section>
    );
  }
  return (
    <section className="py-16">
      <Container>
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-display text-4xl text-charcoal">מה בתפריט</h2>
          <Link href="/תפריט" className="text-sm font-medium text-terracotta hover:underline">
            לתפריט המלא ←
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <article key={item._id} className="overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-lg">
              {item.image ? (
                <div className="relative aspect-[4/3]">
                  <Image
                    src={urlFor(item.image).width(800).url()}
                    alt={item.name}
                    fill
                    sizes="(min-width:1024px) 30vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <div className="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl">{item.name}</h3>
                  {item.price ? (
                    <span className="font-numeric font-semibold text-terracotta">₪{item.price}</span>
                  ) : null}
                </div>
                {item.description ? <p className="mt-1 text-sm text-charcoal/70">{item.description}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
