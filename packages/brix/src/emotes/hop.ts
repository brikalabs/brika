/**
 * Hop — anticipation squat → stretch launch → ballistic arc → landing
 * squash → settle. The arc is real physics: gravity pulls Brix back
 * to the floor while horizontal velocity carries him forward.
 */

import { defineEmote } from './builder';

export const hopEmote = defineEmote('hop', {
  mood: 'cheeky',
  color: 'cyan',
  line: '{:cheeky:}wheee!',
  hold: 400,
  initial: { face: 'happy', cx: 5 },
  beats: [
    { kind: 'tween', h: 2, ms: 110, ease: 'easeIn' },
    { kind: 'tween', h: 4, ms: 100, ease: 'easeOut' },
    { kind: 'face', face: 'starry' },
    { kind: 'impulse', vx: 4, vy: 13 },
    { kind: 'waitLand', maxMs: 1500 },
    { kind: 'face', face: 'happy' },
    { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
    { kind: 'set', vx: 0 },
    { kind: 'tween', h: 3, ms: 150, ease: 'easeOut' },
    { kind: 'wait', ms: 220 },
  ],
});
