import { describe, it, expect } from 'vitest';
import { selectExamplesForReview, overrideToLabel, attentionItems } from '../checklistReview.js';

const ex = (id: string, label: string, createdAt: string) => ({ id, label, photo_url: `u/${id}`, createdAt: new Date(createdAt) });

describe('selectExamplesForReview', () => {
  const rows = [
    ex('g1', 'good', '2026-06-01'), ex('g2', 'good', '2026-06-03'), ex('g3', 'good', '2026-06-02'),
    ex('b1', 'bad', '2026-06-01'), ex('b2', 'bad', '2026-06-04'),
  ];
  it('splits good/bad and keeps the most-recent up to the cap', () => {
    const r = selectExamplesForReview(rows, 2);
    expect(r.good).toEqual(['u/g2', 'u/g3']); // newest two good
    expect(r.bad).toEqual(['u/b2', 'u/b1']);  // newest two bad
  });
  it('handles empty', () => {
    expect(selectExamplesForReview([], 5)).toEqual({ good: [], bad: [] });
  });
});

describe('overrideToLabel', () => {
  it('approved → good, rejected → bad', () => {
    expect(overrideToLabel('approved')).toBe('good');
    expect(overrideToLabel('rejected')).toBe('bad');
  });
});

describe('attentionItems', () => {
  it('returns items whose ai_review verdict is attention', () => {
    const results = [
      { item_order: 1, task: 'בר', ai_review: { verdict: 'ok' } },
      { item_order: 2, task: 'מקרר', ai_review: { verdict: 'attention', feedback: 'לא סגור' } },
      { item_order: 3, task: 'רצפה', ai_review: { verdict: 'unknown' } },
    ];
    const a = attentionItems(results);
    expect(a.map(i => i.item_order)).toEqual([2]);
    expect(a[0].feedback).toBe('לא סגור');
  });
});
