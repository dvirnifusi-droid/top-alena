import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { env } from "@/lib/env";
import { sanity } from "../../../sanity/lib/client";
import { siteSettingsQuery } from "../../../sanity/lib/queries";
import { PlaylistClient } from "./PlaylistClient";

// Extract the playlist ID from any Spotify share URL like
// https://open.spotify.com/playlist/1Bxgi1ARW99FL0CQJcbb5u?si=...
function extractPlaylistId(url: string | undefined | null): string | null {
  if (!url) return null;
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export const revalidate = 300;

export async function Playlist() {
  let id: string | null = null;
  try {
    const settings = (await sanity.fetch(siteSettingsQuery)) as { spotifyPlaylistUrl?: string } | null;
    id = extractPlaylistId(settings?.spotifyPlaylistUrl);
  } catch {
    /* fall through to env */
  }
  if (!id) id = env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID;
  return <PlaylistClient playlistId={id} />;
}
