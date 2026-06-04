import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { menu } from "@/content/menu";
import { FadeIn, StaggerGroup, StaggerItem } from "@/components/shared/MotionSection";

// Pull a curated "what's hot" lineup from the real menu — items with photos
// are surfaced first so the section feels visual.
function pickFeatured() {
  const all = menu.flatMap((s) => s.items);
  const withImage = all.filter((i) => i.image);
  const recommended = all.filter((i) => i.tags?.includes("מומלץ") && !i.image);
  return [...withImage, ...recommended].slice(0, 6);
}

export function MenuTeaser() {
  const featured = pickFeatured();
  return (
    <section className="py-24">
      <Container>
        <FadeIn>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
                <span className="h-px w-8 bg-brass" />
                תפריט
              </p>
              <h2 className="font-display text-5xl text-charcoal md:text-6xl">המומלצים</h2>
              <p className="mt-3 max-w-xl text-charcoal/70">
                מה שאוכלים אצלנו השבוע. הכל בא מהג׳וספר על 600 מעלות.
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-terracotta"
            >
              לתפריט המלא <span>←</span>
            </Link>
          </div>
        </FadeIn>
        <StaggerGroup className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <StaggerItem
              key={item.name}
              className="group relative overflow-hidden rounded-3xl bg-cream-soft shadow-lg shadow-charcoal/5 ring-1 ring-brass/15 transition hover:shadow-2xl"
            >
              {item.image ? (
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(min-width:1024px) 33vw, (min-width:768px) 50vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-110"
                  />
                  {item.tags?.includes("מומלץ") ? (
                    <span className="absolute right-3 top-3 rounded-full bg-brass px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-cream shadow-lg">
                      מומלץ
                    </span>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/85 via-charcoal/35 to-transparent p-5 text-cream">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-2xl">{item.name}</h3>
                      <span className="font-numeric whitespace-nowrap text-xl font-bold text-brass-soft">
                        ₪{item.price}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-2xl text-charcoal">{item.name}</h3>
                    <span className="font-numeric whitespace-nowrap text-xl font-bold text-terracotta">
                      ₪{item.price}
                    </span>
                  </div>
                </div>
              )}
              <div className="p-5 pt-3">
                <p className="text-sm leading-relaxed text-charcoal/75">{item.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </Container>
    </section>
  );
}
