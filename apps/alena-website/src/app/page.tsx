import { Hero } from "@/components/home/Hero";
import { MenuTeaser } from "@/components/home/MenuTeaser";
import { EventsTeaser } from "@/components/home/EventsTeaser";
import { ReviewsCarousel } from "@/components/home/ReviewsCarousel";
import { LocationMap } from "@/components/home/LocationMap";
import { InstagramStrip, type StripImage } from "@/components/home/InstagramStrip";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema } from "@/components/seo/schemas";
import { env } from "@/lib/env";
import { sanity } from "../../sanity/lib/client";
import { featuredGalleryQuery } from "../../sanity/lib/queries";
import { urlFor } from "../../sanity/lib/image";

export const revalidate = 600;

type GalleryDoc = { _id: string; image: unknown; alt: string; instagramUrl?: string };

export default async function HomePage() {
  let gallery: GalleryDoc[] = [];
  try {
    gallery = ((await sanity.fetch(featuredGalleryQuery)) as GalleryDoc[]) ?? [];
  } catch {
    gallery = [];
  }

  const stripImages: StripImage[] = gallery.map((g) => ({
    _id: g._id,
    url: urlFor(g.image).width(800).url(),
    alt: g.alt,
    href: g.instagramUrl,
  }));

  const heroImage = gallery[0]
    ? { url: urlFor(gallery[0].image).width(1200).url(), alt: gallery[0].alt }
    : undefined;

  return (
    <>
      <Hero heroImageUrl={heroImage?.url} heroAlt={heroImage?.alt} />
      <MenuTeaser />
      <InstagramStrip images={stripImages} />
      <EventsTeaser />
      <ReviewsCarousel />
      <LocationMap />
      <JsonLd
        data={restaurantSchema({
          name: "עלינא",
          phone: env.NEXT_PUBLIC_PHONE,
          address: "רוטשילד 104, ראשון לציון",
          url: env.NEXT_PUBLIC_SITE_URL,
        })}
      />
    </>
  );
}
