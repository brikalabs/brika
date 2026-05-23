/**
 * Shock — Brix recoils backward, body stretches up tall in surprise,
 * a beat of panic-frozen, then settles back. Used for unexpected
 * events: a crash, a stranger appearing, a button-press easter egg.
 */

import { defineEmote } from './builder';

export const shockEmote = defineEmote('shock', {
  mood: 'panic',
  color: 'red',
  line: '{:panic:}!!',
  hold: 500,
  initial: { face: 'panic', cx: 7 },
  beats: [
    { kind: 'tween', cx: 5, h: 5, ms: 100, ease: 'easeOut' },
    { kind: 'wait', ms: 300 },
    { kind: 'face', face: 'oops' },
    { kind: 'tween', h: 3, cx: 6, ms: 220, ease: 'easeIn' },
    { kind: 'face', face: 'shy' },
    { kind: 'tween', cx: 7, ms: 200, ease: 'easeOut' },
    { kind: 'face', face: 'neutral' },
  ],
});
