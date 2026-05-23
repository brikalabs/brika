/**
 * Bow — Brix stretches up tall, then collapses forward into a deep
 * bow (low, slightly squashed), pauses, and rises again. The "tilt"
 * is faked by shifting `cx` while the body shrinks, which reads as
 * a bow forward.
 */

import { defineEmote } from './builder';

export const bowEmote = defineEmote('bow', {
  mood: 'cheeky',
  color: 'cyan',
  line: '{:cheeky:}thank you.',
  hold: 500,
  initial: { face: 'happy', cx: 7 },
  beats: [
    { kind: 'tween', h: 4, ms: 240, ease: 'easeOut' },
    { kind: 'tween', h: 2, cx: 8, ms: 320, ease: 'easeIn' },
    { kind: 'face', face: 'shy' },
    { kind: 'wait', ms: 360 },
    { kind: 'tween', h: 3, cx: 7, ms: 280, ease: 'easeOut' },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 160 },
  ],
});
