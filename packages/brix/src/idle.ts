/**
 * Idle program — the data spec `<BrixIdle>` consumes. A baseline
 * animation Brix sits on (almost always `breathing`) plus a weighted
 * pool of "emote" interjections that fire occasionally to make him
 * look alive.
 *
 *   <BrixIdle program={DEFAULT_IDLE_PROGRAM} />
 *   <BrixIdle program={{ baseline: 'breathing', emotes: [], emoteChance: 0 }} />
 *
 * The picker is a pure function so the weighting can be tested
 * without rendering.
 */

import type { AnimationKind } from './animations';

export interface IdleEmote {
  readonly kind: AnimationKind;
  /** Relative weight in the weighted-random pick. 0 disables this emote. */
  readonly weight: number;
}

export interface IdleProgram {
  /** The looping animation Brix sits on between emotes. */
  readonly baseline: AnimationKind;
  /** Pool of one-shot emotes the idle loop sprinkles in. */
  readonly emotes: ReadonlyArray<IdleEmote>;
  /** Probability per baseline tick of starting an emote. 0..1. */
  readonly emoteChance: number;
}

/**
 * Sensible default: gentle breathing baseline, mostly blinks with
 * the occasional glance + wink + tiny scoot. `emoteChance` is low
 * enough that Brix mostly just breathes; tics are a treat, not a tic.
 */
export const DEFAULT_IDLE_PROGRAM: IdleProgram = {
  baseline: 'breathing',
  emotes: [
    { kind: 'blink', weight: 6 },
    { kind: 'glance', weight: 3 },
    { kind: 'wink', weight: 2 },
    { kind: 'hop', weight: 1 },
    { kind: 'nom', weight: 1 },
  ],
  emoteChance: 0.09,
};

/**
 * Weighted-random pick from a pool of emotes. Returns `null` for an
 * empty pool, or when every entry has weight ≤ 0. `rng` is expected
 * to return a number in [0, 1) — pass the seeded `makeRng()` rng for
 * production, a deterministic-seed rng for tests.
 */
export function pickIdleEmote(
  emotes: ReadonlyArray<IdleEmote>,
  rng: () => number
): AnimationKind | null {
  let total = 0;
  for (const e of emotes) {
    if (e.weight > 0) {
      total += e.weight;
    }
  }
  if (total <= 0) {
    return null;
  }
  let r = rng() * total;
  for (const e of emotes) {
    if (e.weight <= 0) {
      continue;
    }
    r -= e.weight;
    if (r < 0) {
      return e.kind;
    }
  }
  // Floating-point straggler — fall through to the last positive-weight emote.
  for (let i = emotes.length - 1; i >= 0; i -= 1) {
    const e = emotes[i];
    if (e && e.weight > 0) {
      return e.kind;
    }
  }
  return null;
}

/**
 * Small linear-congruential RNG. Used inside `<BrixIdle>` so two
 * mascots mounted at the same tick still desynchronize naturally
 * (and tests can pass a deterministic seed).
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x100000000;
  };
}
