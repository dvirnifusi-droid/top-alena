// The one place the shell's colours are defined.
//
// Every value here already existed in ApolloHero — this file doesn't introduce a
// new brand, it just stops each screen from re-declaring the palette inline.
// Semantic colours are deliberately separate from `gold`: gold is the brand and
// the primary action, and it can't also mean "this is wrong" without making
// everything look equally important.
export const T = {
  gold: '#C9A15A',
  goldHi: '#EBD08A',
  goldLo: '#7C5626',
  espresso: '#241811',
  cream: '#F6ECD6',
  creamHi: '#FFFDF7',
  line: '#E3D3AC',
  muted: '#8A755A',

  good: '#5F8B3D',
  warn: '#B5822C',
  bad: '#A8442A',

  alertBg: '#F6E3D8',
  alertFg: '#7A3A22',
  warnBg: '#F7EBD2',
  warnFg: '#6B4E14',
  goodBg: '#E7EFDC',
  goodFg: '#3D5B26',
};

export const TONE = {
  bad: { bg: T.alertBg, fg: T.alertFg, dot: T.bad },
  warn: { bg: T.warnBg, fg: T.warnFg, dot: T.warn },
  good: { bg: T.goodBg, fg: T.goodFg, dot: T.good },
};

export const ils = (n) => `₪${Math.round(Number(n) || 0).toLocaleString()}`;
