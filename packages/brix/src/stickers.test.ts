import { describe, expect, test } from 'bun:test';
import { HEARTS, NOTES, pickSticker, SPARKLES } from './stickers';

describe('pickSticker', () => {
  test('returns a member of the requested set', () => {
    const out = pickSticker('joy', 0);
    expect(SPARKLES).toContain(out as (typeof SPARKLES)[number]);
  });

  test('seed selects deterministically (same seed → same sticker)', () => {
    expect(pickSticker('love', 1)).toBe(pickSticker('love', 1));
  });

  test('seed wraps around the pool', () => {
    expect(pickSticker('love', HEARTS.length)).toBe(pickSticker('love', 0));
  });

  test('different kinds pick from different pools', () => {
    const j = pickSticker('joy', 0);
    const t = pickSticker('tune', 0);
    expect(NOTES).toContain(t as (typeof NOTES)[number]);
    expect(SPARKLES).toContain(j as (typeof SPARKLES)[number]);
  });
});
