/**
 * Tiny "stickers" — single-cell decorations Brix can wear next to a
 * line for tone. Each set is intentionally short so callers can pick
 * one at a glance:
 *
 *   import { sparkle, heart, pickSticker } from '@brika/brix';
 *   brix.ok(`workflow deployed ${pickSticker('joy')}`);
 *   // (^◡^) workflow deployed ✦
 *
 * Use sparingly — stickers are seasoning, not the meal.
 */

export const SPARKLES = ['✦', '✧', '⋆', '✩', '✺'] as const;
export const HEARTS = ['♡', '♥', '❤', '❥'] as const;
export const NOTES = ['♪', '♫', '♩', '♬'] as const;
export const STARS = ['★', '☆', '✦'] as const;
export const PETALS = ['❀', '✿', '✾'] as const;

export type StickerKind = 'joy' | 'love' | 'tune' | 'win' | 'bloom';

const KINDS: Readonly<Record<StickerKind, ReadonlyArray<string>>> = {
  joy: SPARKLES,
  love: HEARTS,
  tune: NOTES,
  win: STARS,
  bloom: PETALS,
};

/**
 * Pick a sticker for the given mood. Random by default; pass a seed
 * (e.g. a workflow id) for stable output across re-renders.
 */
export function pickSticker(kind: StickerKind, seed?: number): string {
  const pool = KINDS[kind];
  if (pool.length === 0) {
    return '';
  }
  const idx = seed === undefined ? Math.floor(Math.random() * pool.length) : seed % pool.length;
  return pool[idx] ?? '';
}
