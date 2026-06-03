import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { menuQuery } from "../../../sanity/lib/queries";
import { urlFor } from "../../../sanity/lib/image";
import { FadeIn, StaggerGroup, StaggerItem } from "@/components/shared/MotionSection";

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
      <section className="py-20">
        <Container>
          <FadeIn>
            <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
              <span className="h-px w-8 bg-brass" />
              תפריט
            </p>
            <h2 className="font-display text-4xl text-charcoal md:text-5xl">מה בתפריט</h2>
            <p className="mt-4 max-w-xl rounded-2xl bg-cream-soft p-6 text-charcoal/70">
              התפריט המלא יתעדכן בקרוב.{" "}
              <Link href="/menu" className="text-terracotta underline decoration-brass underline-offset-2">
                למידע נוסף
              </Link>
              .
            </p>
          </FadeIn>
        </Container>
      </section>
    );
  }
  return (
    <section className="py-20">
      <Container>
        <FadeIn>
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
                <span className="h-px w-8 bg-brass" />
                תפריט
              </p>
              <h2 className="font-display text-4xl text-charcoal md:text-5xl">מה בתפריט</h2>
            </div>
            <Link href="/menu" className="text-sm font-medium text-terracotta hover:underline">
              לתפריט המלא ←
            </Link>
          </div>
        </FadeIn>
        <StaggerGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <StaggerItem
              key={item._id}
              className="group overflow-hidden rounded-3xl bg-cream-soft shadow-sm ring-1 ring-brass/10 transition hover:shadow-lg"
            >
              {item.image ? (
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={urlFor(item.image).width(800).url()}
                    alt={item.name}
                    fill
                    sizes="(min-width:1024px) 30vw, 50vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                </div>
              ) : null}
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl text-charcoal">{item.name}</h3>
                  {item.price ? (
                    <span className="font-numeric font-semibold text-terracotta">₪{item.price}</span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-2 text-sm text-charcoal/70">{item.description}</p>
                ) : null}
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </Container>
    </section>
  );
}
