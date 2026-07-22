// The single source of truth for engagement-tier cutoffs. Shared so the marketing
// segments ('silver'/'gold') target EXACTLY the customers the member card labels
// as such — one definition, no drift between what a member sees and who a campaign
// reaches.
export const TIER_THRESHOLDS = {
    gold: { visits: 25, coins: 300 },
    silver: { visits: 10, coins: 100 },
};
export function computeTier(visitCount, coinBalance) {
    if (visitCount >= TIER_THRESHOLDS.gold.visits || coinBalance >= TIER_THRESHOLDS.gold.coins)
        return 'gold';
    if (visitCount >= TIER_THRESHOLDS.silver.visits || coinBalance >= TIER_THRESHOLDS.silver.coins)
        return 'silver';
    return 'regular';
}
// 100 ש"ח = 1 נקודה (כל נקודה שווה 4 ש"ח בקופה = ~4% cashback)
export const COINS_PER_ILS_RATE = 1 / 100;
export const ILS_PER_COIN_REDEEM = 4;
export function coinsForOrder(orderTotalIls) {
    if (!Number.isFinite(orderTotalIls) || orderTotalIls <= 0)
        return 0;
    return Math.floor(orderTotalIls * COINS_PER_ILS_RATE);
}
//# sourceMappingURL=clubTier.js.map