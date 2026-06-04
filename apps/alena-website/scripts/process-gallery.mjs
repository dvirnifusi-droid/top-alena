// One-off: normalize EXIF rotation + downscale food photos for the gallery.
// Reads from /public/gallery-pool/<sourceId>.jpg and writes to /public/gallery/<name>.jpg
// Run from apps/alena-website: node scripts/process-gallery.mjs

import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const POOL = path.resolve("public/gallery-pool");
const OUT = path.resolve("public/gallery");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const jobs = [
  { src: "1PzLjuTWF7B32_ZQmm63ASXMTNWuJZiHD.jpg", dst: "burger-hero.jpg" },
  { src: "1DZRBwn8rU0uyCE3AkjtvhCYWqGhyN3wz.jpg", dst: "burger-1.jpg" },
  { src: "1IBU1WoE84lAcku86d4JiNBJ2FKdDHnDI.jpg", dst: "burger-2.jpg" },
  { src: "1-Cgua5eCAT1v8lQOx3qygVCGGjtqfJPo.jpg", dst: "fries-dip.jpg" },
  { src: "1O1S7pTuI9WsjiNuRwHW7rbjqAB_lOfl1.jpg", dst: "fries-side.jpg" },
  { src: "1uhX1lrhclekVudSmE3CSFUhl8TpvjQLt.jpg", dst: "carpaccio.jpg" },
  { src: "18sueelrkQyAy6jRE06f_XmfaSn4JTWSs.jpg", dst: "carpaccio-2.jpg" },
  { src: "1LSH9beWi6z5cVdiytmJsz33j6my_LP3y.jpg", dst: "spread.jpg" },
  { src: "1lA5IR-gv2O7xDWxTbI4r8qhB5x54zXAp.jpg", dst: "spread-2.jpg" },
];

for (const { src, dst } of jobs) {
  const inPath = path.join(POOL, src);
  const outPath = path.join(OUT, dst);
  try {
    await sharp(inPath)
      .rotate() // applies EXIF orientation then strips it
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);
    console.log(`✓ ${dst}`);
  } catch (e) {
    console.error(`✗ ${dst}: ${e.message}`);
  }
}
