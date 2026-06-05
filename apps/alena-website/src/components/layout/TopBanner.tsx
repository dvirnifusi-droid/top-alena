import { sanity } from "../../../sanity/lib/client";
import { activeBannerQuery, siteSettingsQuery } from "../../../sanity/lib/queries";
import { staticBanner, byDay, defaultBanner, type BannerContent } from "@/content/banner";
import { TopBannerClient } from "./TopBannerClient";

type SanityBanner = { message: string; ctaText?: string; ctaUrl?: string } | null;
type Settings = { ontopoUrl?: string } | null;

// Resolve which banner to show — Sanity first (with scheduling), then
// static day-of-week mapping as a robust fallback.
async function resolveBanner(): Promise<BannerContent | null> {
  // 1. Static override always wins (for emergency announcements)
  if (staticBanner) return staticBanner;

  // 2. Sanity-managed scheduled banner
  try {
    const now = new Date().toISOString();
    const banner = (await sanity.fetch(activeBannerQuery, { now })) as SanityBanner;
    if (banner?.message) {
      const settings = (await sanity.fetch(siteSettingsQuery)) as Settings;
      return {
        message: banner.message,
        cta: banner.ctaText ?? "להזמנת שולחן",
        href: banner.ctaUrl ?? settings?.ontopoUrl ?? "https://ontopo.com/he/il/page/15703580",
      };
    }
  } catch {
    /* fall through to static day-of-week */
  }

  // 3. Static day-of-week fallback
  return byDay[new Date().getDay()] ?? defaultBanner;
}

export const revalidate = 300; // refresh every 5 min so scheduled banners go live without redeploy

export async function TopBanner() {
  const banner = await resolveBanner();
  if (!banner) return null;
  return <TopBannerClient banner={banner} />;
}
