/**
 * Small randomness helpers scoped to the boot splash.
 *
 * `crypto.getRandomValues` is overkill for cosmetic UI but it keeps
 * SonarQube's S2245 ("don't use Math.random for anything") quiet, and
 * it costs nothing on this code path.
 */

import { EMOTE_LIBRARY, type EmoteName } from '@brika/brix';

/** Random int in `[0, max)`. Returns `0` for non-positive `max`. */
export function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}

/** Pick a random emote from the library for Brix's boot greeting. */
export function pickGreeting(): EmoteName {
  const names = Object.keys(EMOTE_LIBRARY) as ReadonlyArray<EmoteName>;
  return names[randomInt(names.length)] ?? 'wave';
}
