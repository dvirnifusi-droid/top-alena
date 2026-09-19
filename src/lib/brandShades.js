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

// Platform default = the TOP APOLLO "neon identity" (flat navy base, one
// glowing cyan accent, teal lines). Used only when a tenant hasn't picked its
// own brand colours — a tenant with colours gets the SAME design language in
// ITS palette (Alena stays terracotta/gold, Juiceph stays green/lime).
export const DEFAULT_BRAND = { primary: '#1e2834', secondary: '#36879e', accent: '#4fd6ee' };

function rgba([r, g, b], a) { return `rgba(${r},${g},${b},${a})`; }
function hslTriplet(h, s, l) { return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`; }

// The full design-token set for the app chrome, derived from a tenant's
// {primary, secondary, accent}. Every token is a CSS colour string; Layout
// writes them to :root as --brand-* and the chrome (sidebar, ApolloHero,
// buttons, login) reads them — so a tenant changing a colour on /Branding
// restyles the whole app, and the platform default is TOP APOLLO's palette.
//   bg / bgDeep / bgElev : the flat dark base and its two elevations
//   accent / accentHi    : the one glowing accent + its lighter highlight
//   line / glow          : accent at low alpha (hairlines) and the neon halo
//   secondary            : quiet lines, icons, category labels
//   text / muted         : light copy that sits on the dark base
//   primaryHsl / primaryFg : the same accent as a shadcn --primary triplet
export function brandTokens(colors) {
  const c = colors || {};
  const pRgb = hexToRgb(c.primary) || hexToRgb(DEFAULT_BRAND.primary);
  const aRgb = hexToRgb(c.accent) || hexToRgb(DEFAULT_BRAND.accent);
  const sRgb = hexToRgb(c.secondary) || hexToRgb(DEFAULT_BRAND.secondary);
  const [ph, ps] = rgbToHsl(pRgb);
  const [ah, as, al] = rgbToHsl(aRgb);
  const [sh, ss] = rgbToHsl(sRgb);
  const sat = Math.min(ps, 0.38);                 // same cap as the rail: calm, not a colour block
  const accent = hslToHex(ah, as, al);
  const accentHi = hslToHex(ah, Math.max(as * 0.7, 0.3), Math.min(0.88, al + 0.22));
  return {
    bgDeep: hslToHex(ph, sat, 0.10),
    bg: hslToHex(ph, sat, 0.14),
    bgElev: hslToHex(ph, sat, 0.19),
    bgElev2: hslToHex(ph, sat, 0.24),
    accent,
    accentHi,
    line: rgba(aRgb, 0.18),
    glow: `0 0 18px ${rgba(aRgb, 0.45)}, 0 0 46px ${rgba(aRgb, 0.18)}`,
    secondary: hslToHex(sh, Math.min(ss, 0.5), 0.42),
    text: hslToHex(ph, Math.min(sat, 0.15), 0.94),
    muted: hslToHex(ph, Math.min(sat, 0.12), 0.68),
    // shadcn hook: default <Button> / focus ring become the brand accent.
    // Light accents (cyan, gold, lime) need dark text on them, not white.
    primaryHsl: hslTriplet(ah, as, al),
    primaryFg: al > 0.5 ? hslTriplet(ph, sat, 0.08) : '0 0% 100%',
    // Full-dark surfaces (phase 2): the same base as HSL triplets so shadcn's
    // hsl(var(--background)) etc. paint the whole app in the brand's dark tone.
    surfaces: {
      background: hslTriplet(ph, sat, 0.12),
      card: hslTriplet(ph, sat, 0.17),
      popover: hslTriplet(ph, sat, 0.20),
      muted: hslTriplet(ph, sat, 0.22),
      border: hslTriplet(ph, Math.min(sat, 0.30), 0.27),
      foreground: hslTriplet(ph, Math.min(sat, 0.15), 0.94),
      mutedFg: hslTriplet(ph, Math.min(sat, 0.12), 0.66),
    },
  };
}

export function sidebarShades(primary) {
  const rgb = hexToRgb(primary) || hexToRgb(DEFAULT_BRAND.primary);
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
