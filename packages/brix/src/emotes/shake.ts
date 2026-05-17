/**
 * Shake — Brix wobbles his whole body left/right several times to
 * say "no". Pure horizontal `cx` tween work; feet stay grounded the
 * whole time.
 */

import { defineEmote } from './builder';

export const shakeEmote = defineEmote('shake', {
  mood: 'oops',
  color: 'red',
  line: '{:oops:}nope.',
  hold: 300,
  initial: { face: 'oops', cx: 7 },
  beats: [
    { kind: 'tween', cx: 5, ms: 100, ease: 'easeOut' },
    { kind: 'tween', cx: 9, ms: 140, ease: 'easeOut' },
    { kind: 'tween', cx: 5, ms: 140, ease: 'easeOut' },
    { kind: 'tween', cx: 9, ms: 140, ease: 'easeOut' },
    { kind: 'tween', cx: 7, ms: 120, ease: 'easeOut' },
    { kind: 'face', face: 'neutral' },
    { kind: 'wait', ms: 160 },
  ],
});

export default shakeEmote;
