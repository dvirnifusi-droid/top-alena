import { Container } from "@/components/layout/Container";
import { InstagramGrid } from "@/components/gallery/InstagramGrid";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "גלריה — עלינא ראשון לציון",
  description: "תמונות מהמסעדה, האוכל והאווירה בעלינא. ישירות מהאינסטגרם שלנו @alena.hamara.",
  path: "/גלריה",
});

export default function GalleryPage() {
  return (
    <Container className="py-16">
      <h1 className="font-display text-5xl">גלריה</h1>
      <p className="mt-3 text-charcoal/80">
        כל הטעמים, האווירה והרגעים — ישירות מ-
        <a className="text-terracotta" href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">
          @alena.hamara
        </a>
      </p>
      <div className="mt-10">
        <InstagramGrid />
      </div>
    </Container>
  );
}
