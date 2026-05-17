/**
 * Tiny seeded linear-congruential RNG. Used wherever we need a
 * deterministic-but-cheap stream of pseudo-random values — particle
 * sims, idle-emote pickers, anything where two mascots / panels on the
 * same screen shouldn't sync up but tests need to pin the seed.
 *
 *   const rng = makeRng(0xc0ffee);
 *   rng(); // 0..1
 */

export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x100000000;
  };
}
