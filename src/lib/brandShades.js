// Derives the dark sidebar palette from a tenant's own brand colour.
//
// This is a multi-tenant product: hardcoding Alena's espresso would give every
// other business Alena's identity. Instead the sidebar takes the brand hue and
// forces it to a dark, low-saturation shade — so each business gets a sidebar
// that is recognisably theirs but still reads as chrome rather than as a large
// block of saturated colour.

function hexToRgb(hex) {
  const h = String(hex || '').trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Alena's espresso, used when a tenant hasn't set a brand colour.
// label lightness is 0.58, not something darker: at 0.48 the category
// headings measured 3.6-4.3:1 against the rail on most brand hues, under the
// 4.5:1 small-text minimum. Verified across gold, blue, olive and magenta.
const FALLBACK = {
  bg: '#241811', active: '#3B2A1E', fg: '#F6ECD6', dim: '#B9A88C', label: '#A08D6F', line: '#3B2A1E',
};

export function sidebarShades(primary) {
  const rgb = hexToRgb(primary);
  if (!rgb) return FALLBACK;
  const [h, s] = rgbToHsl(rgb);
  // Saturation is capped: a fully saturated dark panel is exhausting to sit
  // beside all day, and it fights every status colour placed on top of it.
  const sat = Math.min(s, 0.38);
  return {
    bg: hslToHex(h, sat, 0.11),
    active: hslToHex(h, sat, 0.19),
    line: hslToHex(h, sat, 0.19),
    fg: hslToHex(h, Math.min(sat, 0.25), 0.94),
    dim: hslToHex(h, Math.min(sat, 0.2), 0.72),
    label: hslToHex(h, Math.min(sat, 0.2), 0.58),
  };
}
