import { notFound } from "next/navigation";
import { sanity } from "../../../sanity/lib/client";
import { allLandingSlugsQuery, landingBySlugQuery } from "../../../sanity/lib/queries";
import { LandingTemplate, type LandingDoc } from "@/components/landing/LandingTemplate";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;

export async function generateStaticParams() {
  try {
    const slugs = (await sanity.fetch(allLandingSlugsQuery)) as string[];
    return slugs.map((s) => ({ landingSlug: s }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ landingSlug: string }> }) {
  const { landingSlug } = await params;
  const slug = decodeURIComponent(landingSlug);
  let doc: (LandingDoc & { seoTitle?: string; seoDescription?: string }) | null = null;
  try {
    doc = (await sanity.fetch(landingBySlugQuery, { slug })) as typeof doc;
  } catch {
    doc = null;
  }
  if (!doc) return {};
  return pageMetadata({
    title: doc.seoTitle ?? doc.h1,
    description: doc.seoDescription ?? doc.intro?.slice(0, 160) ?? "",
    path: `/${slug}`,
  });
}

export default async function LandingPage({ params }: { params: Promise<{ landingSlug: string }> }) {
  const { landingSlug } = await params;
  const slug = decodeURIComponent(landingSlug);
  let doc: LandingDoc | null = null;
  try {
    doc = (await sanity.fetch(landingBySlugQuery, { slug })) as LandingDoc | null;
  } catch {
    doc = null;
  }
  if (!doc) notFound();
  return <LandingTemplate doc={doc} />;
}
