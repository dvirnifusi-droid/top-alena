export type ClubTier = 'regular' | 'silver' | 'gold';

export function computeTier(visitCount: number, coinBalance: number): ClubTier {
  if (visitCount >= 25 || coinBalance >= 300) return 'gold';
  if (visitCount >= 10 || coinBalance >= 100) return 'silver';
  return 'regular';
}

// 1 ש"ח = 1 נקודה (ניתן לכוונון בעתיד מבלי לשבור clients)
export function coinsForOrder(orderTotalIls: number): number {
  if (!Number.isFinite(orderTotalIls) || orderTotalIls <= 0) return 0;
  return Math.floor(orderTotalIls);
}
