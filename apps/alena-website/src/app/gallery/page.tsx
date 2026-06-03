import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { galleryPhotos } from "@/lib/gallery";

export const metadata = pageMetadata({
  title: "גלריה — עלינא ראשון לציון",
  description:
    "תמונות מהמסעדה, האוכל, האווירה והברים של עלינא. ברוטשילד 104, ראשון לציון.",
  path: "/gallery",
});

export default function GalleryPage() {
  return (
    <Container className="py-16">
      <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
        <span className="h-px w-8 bg-brass" />
        גלריה
      </p>
      <h1 className="font-display text-5xl text-charcoal md:text-6xl">רגעים מעלינא</h1>
      <p className="mt-3 text-charcoal/80">
        אוכל, אווירה ואנשים מתוך המסעדה. עוקבים אחרינו ב-
        <a className="text-terracotta" href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">
          @alena.hamara
        </a>
        .
      </p>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {galleryPhotos.map((p) => (
          <div
            key={p.src}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-cream-soft ring-1 ring-brass/15"
          >
            <Image
              src={p.src}
              alt={p.alt}
              fill
              sizes="(min-width:768px) 25vw, 50vw"
              className="object-cover transition duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-x-0 bottom-0 translate-y-full bg-charcoal/80 px-3 py-2 text-xs text-cream transition group-hover:translate-y-0">
              {p.alt}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
