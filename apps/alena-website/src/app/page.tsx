import { Hero } from "@/components/home/Hero";
import { MenuTeaser } from "@/components/home/MenuTeaser";
import { EventsTeaser } from "@/components/home/EventsTeaser";
import { ReviewsCarousel } from "@/components/home/ReviewsCarousel";
import { LocationMap } from "@/components/home/LocationMap";
import { InstagramStrip, type StripImage } from "@/components/home/InstagramStrip";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema } from "@/components/seo/schemas";
import { env } from "@/lib/env";
import { heroPhoto, featuredPhotos } from "@/lib/gallery";

export const revalidate = 600;

export default function HomePage() {
  const stripImages: StripImage[] = featuredPhotos.map((p, i) => ({
    _id: `local-${i}`,
    url: p.src,
    alt: p.alt,
  }));

  return (
    <>
      <Hero heroImageUrl={heroPhoto.src} heroAlt={heroPhoto.alt} />
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
