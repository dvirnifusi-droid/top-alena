import { describe, it, expect } from 'vitest';
import { normalizePhone, resolveAudienceCustomerIds } from '../reviewAudience.js';

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('054-123-4567')).toBe('0541234567');
  });
  it('folds +972 / 972 to a leading 0', () => {
    expect(normalizePhone('+972541234567')).toBe('0541234567');
    expect(normalizePhone('972541234567')).toBe('0541234567');
  });
  it('returns empty for junk', () => {
    expect(normalizePhone(null as any)).toBe('');
    expect(normalizePhone('abc')).toBe('');
  });
});

describe('resolveAudienceCustomerIds', () => {
  const customers = [
    { id: 'c1', phone: '0541234567' },
    { id: 'c2', phone: '972-52-999-0000' },
  ];
  it('matches reservations by customer_id first', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: 'c1', customer_phone: '' }],
      events: [],
      customers,
    });
    expect(ids).toEqual(['c1']);
  });
  it('matches by normalized phone when no id', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: null, customer_phone: '+972541234567' }],
      events: [{ customer_phone: '052-999-0000' }],
      customers,
    });
    expect(ids.sort()).toEqual(['c1', 'c2']);
  });
  it('dedupes a guest appearing in both a reservation and an event', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: 'c1', customer_phone: '0541234567' }],
      events: [{ customer_phone: '0541234567' }],
      customers,
    });
    expect(ids).toEqual(['c1']);
  });
  it('ignores phones with no matching customer', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: null, customer_phone: '0500000000' }],
      events: [],
      customers,
    });
    expect(ids).toEqual([]);
  });
});
