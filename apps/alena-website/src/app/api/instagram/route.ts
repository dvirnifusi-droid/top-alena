import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const revalidate = 3600;

export async function GET() {
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    return NextResponse.json({ data: [] });
  }
  try {
    const r = await fetch(
      `https://graph.instagram.com/me/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption&limit=12&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
      { next: { revalidate: 3600 } }
    );
    if (!r.ok) return NextResponse.json({ data: [] });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ data: [] });
  }
}
