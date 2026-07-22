import { describe, it, expect } from 'vitest';
import { prepCostPerUnit, rawCostPerUnit, internalPrice, marginPct, effectiveMarkup } from '../commissary.js';

describe('prepCostPerUnit', () => {
  it('spreads total cost over the batch yield', () => {
    expect(prepCostPerUnit({ total_cost: 100, yield_qty: 4 })).toBe(25);
  });
  it('treats missing/zero yield as a batch of 1', () => {
    expect(prepCostPerUnit({ total_cost: 30, yield_qty: 0 })).toBe(30);
    expect(prepCostPerUnit({ total_cost: 30, yield_qty: null })).toBe(30);
  });
  it('returns 0 when there is no cost', () => {
    expect(prepCostPerUnit({ total_cost: null, yield_qty: 5 })).toBe(0);
  });
});

describe('rawCostPerUnit', () => {
  it('waste-adjusts the purchase price', () => {
    // 10 / (1 - 0.2) = 12.5
    expect(rawCostPerUnit({ price_per_unit: 10, waste_percent: 0.2 })).toBe(12.5);
  });
  it('ignores absent/invalid waste', () => {
    expect(rawCostPerUnit({ price_per_unit: 10, waste_percent: 0 })).toBe(10);
    expect(rawCostPerUnit({ price_per_unit: 10, waste_percent: null })).toBe(10);
  });
  it('returns 0 with no price', () => {
    expect(rawCostPerUnit({ price_per_unit: null })).toBe(0);
  });
});

describe('internalPrice', () => {
  it('applies markup over cost', () => {
    expect(internalPrice(20, 30, null)).toBe(26); // 20 * 1.3
  });
  it('a manual override wins over markup', () => {
    expect(internalPrice(20, 30, 40)).toBe(40);
  });
  it('rounds to 2 decimals', () => {
    expect(internalPrice(3.333, 0, null)).toBe(3.33); // 3.333 → 3.33
  });
});

describe('marginPct', () => {
  it('is margin as a share of the selling price', () => {
    expect(marginPct(20, 26)).toBeCloseTo(23.1, 1); // (26-20)/26
  });
  it('is null when there is no price', () => {
    expect(marginPct(20, 0)).toBeNull();
  });
});

describe('effectiveMarkup', () => {
  it('uses the item markup when set', () => {
    expect(effectiveMarkup(50, 30)).toBe(50);
    expect(effectiveMarkup(0, 30)).toBe(0);
  });
  it('falls back to the default', () => {
    expect(effectiveMarkup(null, 30)).toBe(30);
    expect(effectiveMarkup(undefined, 30)).toBe(30);
  });
});
