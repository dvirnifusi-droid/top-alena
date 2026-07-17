export function computeTier(visitCount, coinBalance) {
    if (visitCount >= 25 || coinBalance >= 300)
        return 'gold';
    if (visitCount >= 10 || coinBalance >= 100)
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