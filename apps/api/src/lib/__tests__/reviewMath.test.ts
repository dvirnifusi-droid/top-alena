import { describe, it, expect } from 'vitest';
import { reviewsToTarget, nextMilestones } from '../reviewMath.js';

describe('reviewsToTarget', () => {
  it('4.1 over 521 reviews needs 31 fives to display 4.2', () => {
    expect(reviewsToTarget(4.1, 521, 4.2)).toBe(31);
  });
  it('4.1 over 521 needs 105 for 4.3 and 332 for 4.5', () => {
    expect(reviewsToTarget(4.1, 521, 4.3)).toBe(105);
    expect(reviewsToTarget(4.1, 521, 4.5)).toBe(332);
  });
  it('returns 0 when already at or above target', () => {
    expect(reviewsToTarget(4.2, 521, 4.2)).toBe(0);
    expect(reviewsToTarget(4.6, 521, 4.5)).toBe(0);
  });
  it('handles a fresh listing (0 reviews)', () => {
    expect(reviewsToTarget(0, 0, 4.5)).toBe(0); // 0 reviews, 5s only -> already fine
  });
  it('target 5.0 is effectively unreachable -> returns null', () => {
    expect(reviewsToTarget(4.1, 521, 5.0)).toBeNull();
  });
});

describe('nextMilestones', () => {
  it('lists the next 0.1 steps above the current displayed rating with counts', () => {
    const m = nextMilestones(4.1, 521);
    expect(m[0]).toEqual({ target: 4.2, reviews: 31 });
    expect(m.find((x) => x.target === 4.3)).toEqual({ target: 4.3, reviews: 105 });
    // stops before 5.0 (unreachable)
    expect(m.some((x) => x.target === 5.0)).toBe(false);
  });
});
