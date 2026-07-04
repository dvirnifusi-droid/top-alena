import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from '../emailCrypto.js';

beforeAll(() => {
  process.env.EMAIL_TOKEN_ENC_KEY = 'a'.repeat(64); // 32 bytes hex, test-only
});

describe('emailCrypto', () => {
  it('round-trips a secret', () => {
    const enc = encryptToken('abcd wxyz 1234');
    expect(enc).not.toContain('abcd');
    expect(decryptToken(enc)).toBe('abcd wxyz 1234');
  });

  it('produces different ciphertext per call (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptToken('secret');
    const parts = enc.split(':');
    parts[2] = parts[2].replace(/^../, parts[2].startsWith('00') ? '11' : '00');
    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('throws when key env is missing or malformed', () => {
    const saved = process.env.EMAIL_TOKEN_ENC_KEY;
    process.env.EMAIL_TOKEN_ENC_KEY = 'short';
    expect(() => encryptToken('x')).toThrow();
    process.env.EMAIL_TOKEN_ENC_KEY = saved;
  });
});
