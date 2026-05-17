import { describe, expect, test } from 'bun:test';
import { chance, pickFrom, randomFloat, randomInt } from './random';

describe('randomInt', () => {
  test('returns 0 for non-positive max', () => {
    expect(randomInt(0)).toBe(0);
    expect(randomInt(-5)).toBe(0);
  });

  test('stays in [0, max) across many samples', () => {
    const max = 7;
    for (let i = 0; i < 200; i += 1) {
      const n = randomInt(max);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(max);
    }
  });

  test('eventually hits every bucket below max', () => {
    const max = 5;
    const seen = new Set<number>();
    for (let i = 0; i < 500 && seen.size < max; i += 1) {
      seen.add(randomInt(max));
    }
    expect(seen.size).toBe(max);
  });
});

describe('randomFloat', () => {
  test('stays in [0, 1) across many samples', () => {
    for (let i = 0; i < 200; i += 1) {
      const f = randomFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('pickFrom', () => {
  test('returns the fallback for an empty array', () => {
    expect(pickFrom<number>([], 42)).toBe(42);
  });

  test('returns the only element when length is 1', () => {
    expect(pickFrom(['solo'], 'fallback')).toBe('solo');
  });

  test('always returns one of the listed elements', () => {
    const pool = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i += 1) {
      expect(pool).toContain(pickFrom(pool, 'fallback'));
    }
  });
});

describe('chance', () => {
  test('p=0 is always false', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(chance(0)).toBe(false);
    }
  });

  test('p=1 is always true', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(chance(1)).toBe(true);
    }
  });

  test('p outside [0,1] is clamped', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(chance(-3)).toBe(false);
      expect(chance(5)).toBe(true);
    }
  });
});
