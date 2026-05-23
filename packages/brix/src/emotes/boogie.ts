/**
 * Boogie — a more energetic dance than `dance`: real hops with lateral
 * impulse, face cycling between cheeky and starry, and a big finisher
 * jump in the centre. Music-note particles spray throughout.
 */

import { notes, type Origin } from '../particleEmitters';
import { defineEmote } from './builder';

export const boogieEmote = defineEmote('boogie', {
  mood: 'cheeky',
  color: 'magenta',
  line: '{:cheeky:}♪ boogie ♪',
  hold: 500,
  loop: true,
  particles: (o: Origin) => notes({ x: o.x + 1, y: o.y, w: o.w - 2, h: 3 }),
  initial: { face: 'starry', cx: 7 },
  beats: [
    // Hop right with arc.
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'impulse', vx: 6, vy: 12 },
    { kind: 'waitLand', maxMs: 700 },
    { kind: 'set', vx: 0 },
    { kind: 'face', face: 'cheeky' },
    { kind: 'tween', h: 3, ms: 100, ease: 'easeOut' },
    { kind: 'wait', ms: 80 },

    // Hop left with arc.
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'impulse', vx: -6, vy: 12 },
    { kind: 'waitLand', maxMs: 700 },
    { kind: 'set', vx: 0 },
    { kind: 'face', face: 'happy' },
    { kind: 'tween', h: 3, ms: 100, ease: 'easeOut' },
    { kind: 'wait', ms: 80 },

    // Two tiny shimmies in place (no impulse).
    { kind: 'tween', cx: 5, h: 4, ms: 120 },
    { kind: 'tween', cx: 9, h: 3, ms: 200 },
    { kind: 'tween', cx: 7, h: 4, ms: 140 },
    { kind: 'face', face: 'cheeky' },
    { kind: 'wait', ms: 100 },

    // Big finisher: tall vertical hop with stars.
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'face', face: 'starry' },
    { kind: 'impulse', vy: 15 },
    { kind: 'waitLand', maxMs: 1000 },
    { kind: 'tween', h: 3, ms: 140, ease: 'easeOut' },
    { kind: 'wait', ms: 250 },
  ],
});
