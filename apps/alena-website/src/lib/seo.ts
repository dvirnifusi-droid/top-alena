import type { Metadata } from "next";
import { env } from "./env";

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const url = `${env.NEXT_PUBLIC_SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: "website",
      locale: "he_IL",
      images: opts.image ? [opts.image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}
