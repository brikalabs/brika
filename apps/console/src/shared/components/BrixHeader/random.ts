/**
 * Cosmetic-only randomness for Brix's behaviour layer (line selection,
 * jump direction, idle scheduling, etc.). `crypto.getRandomValues` is
 * way overkill for UI sprinkles, but it keeps SonarQube's S2245
 * ("don't use `Math.random` for anything") quiet at zero perf cost.
 */

/** Random integer in `[0, max)`. Returns `0` for non-positive `max`. */
export function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}

/** Random float in `[0, 1)`. Uniform, never returns `1`. */
export function randomFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 0x1_0000_0000;
}

/** Pick a uniform random element from a non-empty array, with a fallback
 *  for the (statically impossible) empty case so callers can stay
 *  `as`-cast-free under `noUncheckedIndexedAccess`. */
export function pickFrom<T>(items: ReadonlyArray<T>, fallback: T): T {
  if (items.length === 0) {
    return fallback;
  }
  return items[randomInt(items.length)] ?? fallback;
}

/** `true` with probability `p` (clamped to `[0, 1]`). */
export function chance(p: number): boolean {
  return randomFloat() < Math.max(0, Math.min(1, p));
}
