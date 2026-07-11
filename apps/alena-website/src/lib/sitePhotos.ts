// Site-wide photo slots — read from Sanity singleton, fall back to hardcoded defaults.
// Owner edits at /studio → "תמונות באתר" (sitePhotos type).
// Every page component can call `await getSitePhoto("eventsAgentImage", "/gallery/IMG_6770.JPG")`
// and it'll return either the Sanity URL or the default.

import { sanity } from "../../sanity/lib/client";
import { urlFor } from "../../sanity/lib/image";

// Slot names must match sanity/schemas/sitePhotos.ts fields.
export type SitePhotoSlot =
  | "homeHeroBg"
  | "homeStoryImage"
  | "homeChefImage"
  | "homeMenuTeaserImage"
  | "homeEventsTeaserImage"
  | "homeGiftBandImage"
  | "eventsHeroImage"
  | "eventsAgentImage"
  | "eventsGallery1"
  | "eventsGallery2"
  | "eventsGallery3"
  | "aboutHeroImage"
  | "aboutStoryImage"
  | "menuHeroImage"
  | "menuFeatureImage"
  | "giftHeroImage"
  | "deliveryHeroImage"
  | "reserveHeroImage";

type SitePhotos = Partial<Record<SitePhotoSlot, unknown>>;

// Cached fetch — avoids N Sanity requests per page. Revalidated by Next when the
// caller sets `revalidate` on its route.
let cached: Promise<SitePhotos | null> | null = null;

async function fetchSitePhotos(): Promise<SitePhotos | null> {
  if (cached) return cached;
  cached = sanity
    .fetch<SitePhotos | null>(`*[_type == "sitePhotos"][0]`)
    .catch(() => null);
  return cached;
}

/**
 * Get a photo URL for a named slot. Returns the fallback if Sanity has no override.
 * Optionally pass width for automatic resize.
 */
export async function getSitePhoto(
  slot: SitePhotoSlot,
  fallback: string,
  width = 1600,
): Promise<string> {
  try {
    const doc = await fetchSitePhotos();
    const asset = doc?.[slot];
    if (asset) {
      return urlFor(asset).width(width).auto("format").url();
    }
  } catch {
    // fall through
  }
  return fallback;
}
