export type ClubTier = 'regular' | 'silver' | 'gold';

// The single source of truth for engagement-tier cutoffs. Shared so the marketing
// segments ('silver'/'gold') target EXACTLY the customers the member card labels
// as such — one definition, no drift between what a member sees and who a campaign
// reaches.
// Owner's call, 2026-08-15: 5 orders for silver ("לקוח קבוע"), 15 for gold
// ("מהמשפחה") — the old 10/25 left almost every real customer on regular.
// Coin cutoffs are unchanged: they are an OR with visits and 100 coins is
// ~₪10,000 of spend, so they only ever promote someone the visit count would
// have promoted already.
export const TIER_THRESHOLDS = {
  gold: { visits: 15, coins: 300 },
  silver: { visits: 5, coins: 100 },
} as const;

export function computeTier(visitCount: number, coinBalance: number): ClubTier {
  if (visitCount >= TIER_THRESHOLDS.gold.visits || coinBalance >= TIER_THRESHOLDS.gold.coins) return 'gold';
  if (visitCount >= TIER_THRESHOLDS.silver.visits || coinBalance >= TIER_THRESHOLDS.silver.coins) return 'silver';
  return 'regular';
}

// 100 ש"ח = 1 נקודה (כל נקודה שווה 4 ש"ח בקופה = ~4% cashback)
export const COINS_PER_ILS_RATE = 1 / 100;
export const ILS_PER_COIN_REDEEM = 4;

export function coinsForOrder(orderTotalIls: number): number {
  if (!Number.isFinite(orderTotalIls) || orderTotalIls <= 0) return 0;
  return Math.floor(orderTotalIls * COINS_PER_ILS_RATE);
}
