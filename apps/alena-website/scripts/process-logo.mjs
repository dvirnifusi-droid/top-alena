// Process the hand-drawn Alena logo.
// Reads RGBA directly so that an already-transparent source isn't misread.
// Builds an alpha mask where dark pixels (the hand-drawn strokes) become ink.

import sharp from "sharp";
import path from "node:path";

const SRC = path.resolve("public/logo-alena.png");
const OUT_DIR = path.resolve("public");

const DARK_INK = { r: 0x1F, g: 0x1B, b: 0x17 };  // charcoal
const LIGHT_INK = { r: 0xF4, g: 0xEC, b: 0xD8 }; // cream

async function buildMask() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4
  const mask = Buffer.alloc(width * height);
  for (let p = 0, i = 0; p < mask.length; p++, i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 16) {
      mask[p] = 0;
      continue;
    }
    const brightness = (r + g + b) / 3;
    // Soft mask: ink darkness drives opacity. Anything close to white -> 0.
    // 220+ brightness is treated as paper. Below 220, fade in linearly.
    if (brightness >= 220) {
      mask[p] = 0;
    } else {
      const m = Math.round((220 - brightness) * (255 / 220));
      mask[p] = Math.min(255, m);
    }
  }
  return { mask, width, height };
}

async function emit(color, outPath) {
  const { mask, width, height } = await buildMask();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    const j = i * 4;
    if (m > 0) {
      rgba[j] = color.r;
      rgba[j + 1] = color.g;
      rgba[j + 2] = color.b;
      rgba[j + 3] = m;
    } else {
      rgba[j + 3] = 0;
    }
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 10 })
    .png()
    .toFile(outPath);
  console.log("✓", path.basename(outPath));
}

async function emitFavicon() {
  const { mask, width, height } = await buildMask();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    const j = i * 4;
    if (m > 0) {
      rgba[j] = DARK_INK.r;
      rgba[j + 1] = DARK_INK.g;
      rgba[j + 2] = DARK_INK.b;
      rgba[j + 3] = m;
    } else {
      rgba[j + 3] = 0;
    }
  }
  const baseTrimmed = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 10 })
    .png()
    .toBuffer();
  await sharp(baseTrimmed)
    .resize(256, 256, {
      fit: "contain",
      background: { r: 0xF4, g: 0xEC, b: 0xD8, alpha: 1 },
    })
    .png()
    .toFile(path.join(OUT_DIR, "favicon-256.png"));
  await sharp(baseTrimmed)
    .resize(64, 64, {
      fit: "contain",
      background: { r: 0xF4, g: 0xEC, b: 0xD8, alpha: 1 },
    })
    .png()
    .toFile(path.join(OUT_DIR, "favicon.png"));
  console.log("✓ favicon.png + favicon-256.png");
}

(async () => {
  await emit(DARK_INK, path.join(OUT_DIR, "logo-alena-dark.png"));
  await emit(LIGHT_INK, path.join(OUT_DIR, "logo-alena-light.png"));
  await emitFavicon();
  console.log("\nDone.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
