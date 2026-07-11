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
import { BlogTeaser } from "@/components/home/BlogTeaser";
import { GiftBand } from "@/components/home/GiftBand";
import { LocationMap } from "@/components/home/LocationMap";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantSchema } from "@/components/seo/schemas";
import { env } from "@/lib/env";
import { featuredPhotos } from "@/lib/gallery";
import { getSitePhoto } from "@/lib/sitePhotos";

export const revalidate = 60;

export default async function HomePage() {
  const stripImages: StripImage[] = featuredPhotos.map((p, i) => ({
    _id: `local-${i}`,
    url: p.src,
    alt: p.alt,
  }));

  const [storyImg1, storyImg2, storyImg3] = await Promise.all([
    getSitePhoto("homeStoryImage1", "/gallery/IMG_6770.JPG"),
    getSitePhoto("homeStoryImage2", "/gallery/burger-hero.jpg"),
    getSitePhoto("homeStoryImage3", "/gallery/IMG_4682.JPG"),
  ]);

  return (
    <>
      <Hero />
      <NextNight />
      <Story imageOverrides={[storyImg1, storyImg2, storyImg3]} />
      <MenuTeaser />
      <InstagramStrip images={stripImages} />
      <Chef />
      <EventsTeaser />
      <Playlist />
      <ReviewsCarousel />
      <GiftBand />
      <BlogTeaser />
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
