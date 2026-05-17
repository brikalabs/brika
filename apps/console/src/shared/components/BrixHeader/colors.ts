/**
 * Bubble tint mapped from the high-level `Mood` enum the CLI provider
 * exposes. Keeping this in its own module — instead of a `switch`
 * sprinkled across components — makes it easy to retheme the mascot
 * without grepping for colour literals.
 */

import type { Mood } from '@brika/brix';

const MOOD_TINTS: Readonly<Record<string, string>> = {
  happy: 'green',
  success: 'green',
  proud: 'green',
  error: 'red',
  panic: 'red',
  dead: 'red',
  angry: 'red',
  sad: 'gray',
  tired: 'gray',
  sleep: 'gray',
  oops: 'yellow',
  suspicious: 'yellow',
  starry: 'yellow',
  love: 'magenta',
  shy: 'magenta',
  cheeky: 'magenta',
  boop: 'magenta',
  wink: 'magenta',
};

const FALLBACK_TINT = 'cyan';

export function colorForMood(m: Mood): string {
  return MOOD_TINTS[m] ?? FALLBACK_TINT;
}
