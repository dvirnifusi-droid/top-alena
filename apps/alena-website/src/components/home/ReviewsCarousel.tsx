import { Container } from "@/components/layout/Container";
import { sanity } from "../../../sanity/lib/client";
import { reviewsQuery } from "../../../sanity/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { reviewSchema } from "@/components/seo/schemas";

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
    <section className="py-16">
      <Container>
        <h2 className="mb-8 font-display text-4xl text-charcoal">מה אומרים עלינו</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.slice(0, 6).map((r) => (
            <figure key={r._id} className="rounded-2xl border border-charcoal/10 bg-cream p-6">
              <div className="text-lemon">{"★".repeat(r.rating)}</div>
              <blockquote className="mt-2 text-charcoal/80">{r.body}</blockquote>
              <figcaption className="mt-3 text-sm font-medium">— {r.author}</figcaption>
              <JsonLd data={reviewSchema(r)} />
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
