// The shell's colours, in one place.
//
// Every value already existed in ApolloHero — this file doesn't introduce a new
// brand, it stops each screen from re-declaring the palette inline. Semantic
// colours are deliberately separate from `gold`: gold is the brand and the
// primary action, and it can't also mean "this is wrong" without flattening the
// hierarchy so nothing stands out.
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
};

export const ils = (n) => `₪${Math.round(Number(n) || 0).toLocaleString()}`;
