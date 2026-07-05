import { describe, it, expect } from 'vitest';
import { READ_BLOCKED_ENTITIES, stripProtectedFields } from '../entityGuards.js';

describe('READ_BLOCKED_ENTITIES', () => {
  it('blocks EmployeePay from the generic route', () => {
    expect(READ_BLOCKED_ENTITIES.has('EmployeePay')).toBe(true);
  });
  it('does not block ordinary models', () => {
    expect(READ_BLOCKED_ENTITIES.has('Employee')).toBe(false);
    expect(READ_BLOCKED_ENTITIES.has('Invoice')).toBe(false);
  });
});

describe('stripProtectedFields', () => {
  it('removes pay_access_scope from Employee writes', () => {
    expect(stripProtectedFields('Employee', { full_name: 'A', pay_access_scope: 'all' }))
      .toEqual({ full_name: 'A' });
  });
  it('leaves Employee writes without the field untouched', () => {
    expect(stripProtectedFields('Employee', { full_name: 'A' })).toEqual({ full_name: 'A' });
  });
  it('does not touch other models', () => {
    expect(stripProtectedFields('Customer', { pay_access_scope: 'x' })).toEqual({ pay_access_scope: 'x' });
  });
  it('is null-safe', () => {
    expect(stripProtectedFields('Employee', null)).toBe(null);
  });
});
