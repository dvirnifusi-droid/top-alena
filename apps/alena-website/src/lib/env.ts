import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SANITY_PROJECT_ID: z.string().min(1).default("placeholder"),
  NEXT_PUBLIC_SANITY_DATASET: z.string().default("production"),
  SANITY_API_READ_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EVENT_INQUIRY_TO: z.string().email().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().optional(),
  NEXT_PUBLIC_ONTOPO_URL: z.string().url().default("https://ontopo.com/he/il/page/15703580"),
  NEXT_PUBLIC_WHATSAPP_URL: z.string().url().default("https://wa.me/972503962976"),
  NEXT_PUBLIC_PHONE: z.string().default("03-622-8055"),
  NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID: z.string().default("1Bxgi1ARW99FL0CQJcbb5u"),
  // Search engine verifications — set after registering at GSC + Bing.
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),
  // Microsoft Clarity — free heatmaps & session recordings.
  // Get an ID at https://clarity.microsoft.com/
  NEXT_PUBLIC_CLARITY_ID: z.string().optional(),
});

export const env = schema.parse(process.env);
