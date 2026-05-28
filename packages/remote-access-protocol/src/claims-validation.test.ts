import { describe, expect, it } from 'bun:test';
import { ClaimError, generateToken, RESERVED_NAMES, validateName } from './claims-validation';

describe('validateName', () => {
  it('accepts simple lowercase names', () => {
    expect(validateName('maxime')).toBe('maxime');
    expect(validateName('home-hub-1')).toBe('home-hub-1');
  });

  it('lower-cases the input', () => {
    expect(validateName('MAXIME')).toBe('maxime');
  });

  it('rejects too-short names', () => {
    expect(() => validateName('abc')).toThrow(ClaimError);
  });

  it('rejects too-long names', () => {
    expect(() => validateName('a'.repeat(33))).toThrow(ClaimError);
  });

  it('rejects names with invalid chars', () => {
    expect(() => validateName('with space')).toThrow(ClaimError);
    expect(() => validateName('with_under')).toThrow(ClaimError);
    expect(() => validateName('with.dot')).toThrow(ClaimError);
  });

  it('rejects names that start with a digit or hyphen', () => {
    expect(() => validateName('1abcd')).toThrow(ClaimError);
    expect(() => validateName('-abcd')).toThrow(ClaimError);
  });

  it('rejects names that end with a hyphen', () => {
    expect(() => validateName('abcd-')).toThrow(ClaimError);
  });

  it('rejects reserved names', () => {
    for (const reserved of RESERVED_NAMES) {
      expect(() => validateName(reserved)).toThrow(ClaimError);
    }
  });
});

describe('generateToken', () => {
  it('produces a non-empty URL-safe string', () => {
    const tok = generateToken();
    expect(tok.length).toBeGreaterThanOrEqual(32);
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is unique across invocations (best-effort)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100);
  });
});
