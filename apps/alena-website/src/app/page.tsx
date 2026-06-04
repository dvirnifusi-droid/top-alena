import { Hero } from "@/components/home/Hero";
import { NextNight } from "@/components/home/NextNight";
import { Story } from "@/components/home/Story";
import { MenuTeaser } from "@/components/home/MenuTeaser";
import { InstagramStrip, type StripImage } from "@/components/home/InstagramStrip";
import { Chef } from "@/components/home/Chef";
import { EventsTeaser } from "@/components/home/EventsTeaser";
import { Playlist } from "@/components/home/Playlist";
import { ReviewsCarousel } from "@/components/home/ReviewsCarousel";
import { Newsletter } from "@/components/home/Newsletter";
import { JobsCallout } from "@/components/home/JobsCallout";
import { LocationMap } from "@/components/home/LocationMap";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema } from "@/components/seo/schemas";
import { env } from "@/lib/env";
import { featuredPhotos } from "@/lib/gallery";

export const revalidate = 600;

export default function HomePage() {
  const stripImages: StripImage[] = featuredPhotos.map((p, i) => ({
    _id: `local-${i}`,
    url: p.src,
    alt: p.alt,
  }));

  return (
    <>
      <Hero />
      <NextNight />
      <Story />
      <MenuTeaser />
      <InstagramStrip images={stripImages} />
      <Chef />
      <EventsTeaser />
      <Playlist />
      <ReviewsCarousel />
      <JobsCallout />
      <Newsletter />
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
