import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { menu } from "@/content/menu";
import { FadeIn, StaggerGroup, StaggerItem } from "@/components/shared/MotionSection";

function pickFeatured() {
  const all = menu.flatMap((s) => s.items);
  return all.filter((i) => i.image).slice(0, 6);
}

export function MenuTeaser() {
  const featured = pickFeatured();
  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-6xl">
        <FadeIn>
          <div className="mb-16 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-brass">תפריט</p>
            <h2 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">המנות שאנחנו אוהבים</h2>
            <p className="mx-auto mt-4 max-w-xl text-charcoal/70">
              שש מנות שמסבירות מי אנחנו. התפריט המלא ארוך יותר.
            </p>
          </div>
        </FadeIn>
        <StaggerGroup className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <StaggerItem key={item.name} className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-cream-soft">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(min-width:1024px) 30vw, (min-width:768px) 45vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl text-charcoal">{item.name}</h3>
                <span className="font-numeric whitespace-nowrap text-lg font-semibold text-terracotta">
                  ₪{item.price}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-charcoal/65">{item.description}</p>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <FadeIn delay={0.3}>
          <div className="mt-16 text-center">
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 border-b border-charcoal/30 pb-1 text-sm uppercase tracking-[0.25em] text-charcoal hover:border-terracotta hover:text-terracotta"
            >
              לתפריט המלא ←
            </Link>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
