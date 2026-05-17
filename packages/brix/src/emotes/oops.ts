/**
 * Oops — Brix recoils back a step, sinks into a sheepish squat, then
 * settles. The recoil and recovery use real horizontal motion via
 * `cx` tweens.
 */

import { defineEmote } from './builder';

export const oopsEmote = defineEmote('oops', {
  mood: 'oops',
  color: 'yellow',
  line: '{:oops:}whoops…',
  hold: 500,
  initial: { face: 'oops' },
  beats: [
    { kind: 'tween', cx: 5, ms: 140, ease: 'easeOut' },
    { kind: 'tween', h: 2, ms: 220, ease: 'easeIn' },
    { kind: 'face', face: 'shy' },
    { kind: 'wait', ms: 240 },
    { kind: 'tween', h: 3, cx: 7, ms: 280, ease: 'easeOut' },
    { kind: 'face', face: 'neutral' },
    { kind: 'wait', ms: 160 },
  ],
});

export default oopsEmote;
