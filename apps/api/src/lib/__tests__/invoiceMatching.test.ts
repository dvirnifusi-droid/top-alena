import { describe, it, expect } from 'vitest';
import { normalizeForMatch, similarity, matchInventoryItem } from '../invoiceExtraction.js';

describe('normalizeForMatch', () => {
  it('strips punctuation, collapses spaces, lowercases', () => {
    expect(normalizeForMatch("  ביסקוטי-קלאסי  200 גר'!")).toBe('ביסקוטי קלאסי 200 גר');
  });
});

describe('similarity', () => {
  it('exact match is 1', () => {
    expect(similarity('קמח כוסמין', 'קמח כוסמין')).toBe(1);
  });
  it('substring is high', () => {
    expect(similarity('ביסקוטי קלאסי', 'ביסקוטי קלאסי 200 גרם')).toBeGreaterThanOrEqual(0.9);
  });
  it('unrelated is low', () => {
    expect(similarity('קמח', 'שמן זית')).toBeLessThan(0.5);
  });
});

describe('matchInventoryItem', () => {
  const inventory = [
    { id: 'inv1', item_name: 'ביסקוטי קלאסי' },
    { id: 'inv2', item_name: 'קמח כוסמין מלא' },
  ];
  const aliases = [{ alias_name: normalizeForMatch('ביסקוטי קלאסיק 200 גר'), inventory_item_id: 'inv1' }];

  it('alias hit wins over fuzzy', () => {
    expect(matchInventoryItem('ביסקוטי קלאסיק 200 גר', aliases, inventory))
      .toEqual({ action: 'add_existing', inventory_item_id: 'inv1', via: 'alias' });
  });

  it('fuzzy match >= 0.75 maps to existing item', () => {
    const r = matchInventoryItem('קמח כוסמין', [], inventory);
    expect(r.action).toBe('add_existing');
    expect(r.inventory_item_id).toBe('inv2');
  });

  it('no match suggests create_new', () => {
    expect(matchInventoryItem('שמן קוקוס אורגני', [], inventory)).toEqual({ action: 'create_new' });
  });

  it('generic single-token inventory item does not swallow specific products', () => {
    const generic = [{ id: 'invK', item_name: 'קמח' }];
    expect(matchInventoryItem('קמח כוסמין אורגני טחון', [], generic)).toEqual({ action: 'create_new' });
  });

  it('token-reorder still matches via jaccard', () => {
    const inv = [{ id: 'inv3', item_name: 'שמן זית כתית' }];
    const r = matchInventoryItem('כתית זית שמן', [], inv);
    expect(r.action).toBe('add_existing');
    expect(r.inventory_item_id).toBe('inv3');
  });
});
