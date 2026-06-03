import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { reviewsQuery } from "../../../sanity/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { reviewSchema } from "@/components/seo/schemas";
import { FadeIn, StaggerGroup, StaggerItem } from "@/components/shared/MotionSection";

type Review = { _id: string; author: string; rating: number; body: string; date?: string };

export async function ReviewsCarousel() {
  let reviews: Review[] = [];
  try {
    reviews = ((await sanity.fetch(reviewsQuery)) as Review[]) ?? [];
  } catch {
    reviews = [];
  }
  if (!reviews.length) return null;
  return (
    <section className="py-20">
      <Container>
        <FadeIn>
          <div className="mb-12 text-center">
            <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
              <span className="h-px w-8 bg-brass" />
              עדויות
              <span className="h-px w-8 bg-brass" />
            </p>
            <h2 className="font-display text-4xl text-charcoal md:text-5xl">מה אומרים עלינו</h2>
          </div>
        </FadeIn>
        <StaggerGroup className="grid gap-6 md:grid-cols-3">
          {reviews.slice(0, 6).map((r) => (
            <StaggerItem
              key={r._id}
              className="rounded-3xl border border-brass/20 bg-cream-soft p-7 shadow-sm shadow-charcoal/5"
            >
              <div className="text-lg tracking-widest text-brass">{"★".repeat(r.rating)}</div>
              <blockquote className="mt-3 leading-relaxed text-charcoal/85">{r.body}</blockquote>
              <figcaption className="mt-4 text-sm font-semibold text-olive">— {r.author}</figcaption>
              <JsonLd data={reviewSchema(r)} />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </Container>
    </section>
  );
}
