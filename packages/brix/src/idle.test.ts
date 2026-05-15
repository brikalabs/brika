import { describe, expect, test } from 'bun:test';
import { DEFAULT_IDLE_PROGRAM, type IdleEmote, makeRng, pickIdleEmote } from './idle';

describe('makeRng', () => {
  test('deterministic for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect(a()).toBeCloseTo(b());
    expect(a()).toBeCloseTo(b());
  });

  test('returns numbers in [0, 1)', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 100; i += 1) {
      const r = rng();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe('pickIdleEmote', () => {
  test('returns null for an empty pool', () => {
    expect(pickIdleEmote([], makeRng(1))).toBeNull();
  });

  test('returns null when every emote has weight 0', () => {
    const pool: IdleEmote[] = [
      { kind: 'blink', weight: 0 },
      { kind: 'wink', weight: 0 },
    ];
    expect(pickIdleEmote(pool, makeRng(1))).toBeNull();
  });

  test('always returns the single positive-weight emote', () => {
    const pool: IdleEmote[] = [
      { kind: 'blink', weight: 0 },
      { kind: 'wink', weight: 5 },
      { kind: 'glance', weight: 0 },
    ];
    for (const seed of [1, 7, 13, 99, 1024]) {
      expect(pickIdleEmote(pool, makeRng(seed))).toBe('wink');
    }
  });

  test('respects weights — heavily-weighted emotes dominate over many draws', () => {
    const pool: IdleEmote[] = [
      { kind: 'blink', weight: 90 },
      { kind: 'wink', weight: 10 },
    ];
    const counts: Record<string, number> = {};
    const rng = makeRng(0xdead);
    for (let i = 0; i < 1000; i += 1) {
      const k = pickIdleEmote(pool, rng);
      if (k) {
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    const blinks = counts.blink ?? 0;
    const winks = counts.wink ?? 0;
    expect(blinks).toBeGreaterThan(winks);
    // Should be roughly 9:1 — allow generous slack for the seeded RNG.
    expect(blinks / Math.max(1, winks)).toBeGreaterThan(4);
  });

  test('default program picks from baseline animation list', () => {
    const rng = makeRng(0xc0ffee);
    const k = pickIdleEmote(DEFAULT_IDLE_PROGRAM.emotes, rng);
    expect(k).not.toBeNull();
    expect(DEFAULT_IDLE_PROGRAM.emotes.some((e) => e.kind === k)).toBe(true);
  });
});

describe('DEFAULT_IDLE_PROGRAM', () => {
  test('has baseline breathing and non-empty emote pool', () => {
    expect(DEFAULT_IDLE_PROGRAM.baseline).toBe('breathing');
    expect(DEFAULT_IDLE_PROGRAM.emotes.length).toBeGreaterThan(0);
  });

  test('emote chance is a probability in (0, 1)', () => {
    expect(DEFAULT_IDLE_PROGRAM.emoteChance).toBeGreaterThan(0);
    expect(DEFAULT_IDLE_PROGRAM.emoteChance).toBeLessThan(1);
  });

  test('every emote has positive weight', () => {
    for (const e of DEFAULT_IDLE_PROGRAM.emotes) {
      expect(e.weight).toBeGreaterThan(0);
    }
  });
});
