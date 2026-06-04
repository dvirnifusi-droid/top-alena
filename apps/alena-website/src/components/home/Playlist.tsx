"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { env } from "@/lib/env";

// Playlist ID is read from NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID env var.
// To swap: edit .env.local (or Vercel env) and redeploy.
// The ID is the string between /playlist/ and ? in the Spotify share URL.

export function Playlist() {
  return (
    <section className="bg-cream-soft py-24 md:py-32">
      <Container className="max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-brass">המוזיקה שלנו</p>
          <h2 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">
            הסאונד של עלינא
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-charcoal/70">
            ים-תיכונית ישראלית שעושה טוב בלב. אם המוזיקה שלנו עושה לכם משהו, קחו אותה הביתה.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="mt-12 overflow-hidden rounded-3xl bg-charcoal shadow-xl shadow-charcoal/10"
        >
          <iframe
            title="פלייליסט עלינא"
            src={`https://open.spotify.com/embed/playlist/${env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID}?utm_source=alenabepita&theme=0`}
            width="100%"
            height="380"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            loading="lazy"
            className="block"
          />
        </motion.div>
      </Container>
    </section>
  );
}
