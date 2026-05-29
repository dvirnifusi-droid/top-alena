// Generates TOP ALENA PWA icons as PNGs with no external deps (pure Node + zlib).
// Brand: dark olive background, gold crown. Outputs to public/icons/.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// --- tiny PNG encoder (RGBA) ---
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rows with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- drawing helpers ---
function makeIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [58, 74, 31, 255];      // dark olive #3a4a1f
  const gold = [212, 175, 55, 255];  // #d4af37
  const radius = maskable ? 0 : Math.round(size * 0.18);

  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };
  const inRounded = (x, y) => {
    if (radius <= 0) return true;
    const minx = radius, maxx = size - radius, miny = radius, maxy = size - radius;
    let cx = x, cy = y;
    if (x < minx) cx = minx; else if (x > maxx) cx = maxx;
    if (y < miny) cy = miny; else if (y > maxy) cy = maxy;
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  // background
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (inRounded(x, y)) set(x, y, bg);

  // crown: drawn within a centered box (safe area for maskable)
  const safe = maskable ? 0.62 : 0.74;
  const cw = size * safe;
  const ox = (size - cw) / 2;
  const oy = (size - cw) / 2 + cw * 0.08;
  const baseTop = oy + cw * 0.66;       // top of crown base band
  const baseBot = oy + cw * 0.80;       // bottom of base band
  const peaksTop = oy + cw * 0.18;      // top of the peaks
  const px = [ox, ox + cw * 0.5, ox + cw]; // three peak x's
  const valleyY = oy + cw * 0.46;

  const goldAt = (x, y) => {
    // base band
    if (y >= baseTop && y <= baseBot && x >= ox && x <= ox + cw) return true;
    // crown body (between baseTop and peaks) via zig-zag: fill under the
    // triangle silhouette formed by 3 peaks and 2 valleys.
    if (y < baseTop && y >= peaksTop) {
      const seg = (x1, y1, x2, y2) => {
        if (x < Math.min(x1, x2) || x > Math.max(x1, x2)) return null;
        const t = (x - x1) / (x2 - x1);
        return y1 + t * (y2 - y1);
      };
      // silhouette top edge across x: peak-valley-peak-valley-peak
      const v1x = ox + cw * 0.25, v2x = ox + cw * 0.75;
      let top = null;
      top = seg(px[0], peaksTop + cw * 0.0, v1x, valleyY) ??
            seg(v1x, valleyY, px[1], peaksTop) ??
            seg(px[1], peaksTop, v2x, valleyY) ??
            seg(v2x, valleyY, px[2], peaksTop + cw * 0.0);
      if (top !== null && y >= top) return true;
    }
    return false;
  };

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (inRounded(x, y) && goldAt(x, y)) set(x, y, gold);

  // three gold dots on the peaks (jewels)
  const dot = (cx, cy, r) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) set(Math.round(cx + x), Math.round(cy + y), gold);
  };
  const jr = Math.max(2, size * 0.035);
  dot(px[0], peaksTop, jr); dot(px[1], peaksTop - cw * 0.04, jr); dot(px[2], peaksTop, jr);

  return encodePNG(size, size, buf);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of targets) {
  fs.writeFileSync(path.join(OUT, name), makeIcon(size, maskable));
  console.log('wrote', name, size);
}
console.log('done');
