/**
 * Wraparound — Brix dashes off the right edge, "teleports" off-stage
 * to the far left (via a `set` beat), and slides back into the centre.
 * The illusion is that he's running around the back of the screen.
 */

import { defineEmote } from './builder';

export const wraparoundEmote = defineEmote('wraparound', {
  mood: 'cheeky',
  color: 'magenta',
  line: '{:cheeky:}round the back!',
  hold: 500,
  loop: true,
  initial: { face: 'cheeky' },
  beats: [
    { kind: 'wait', ms: 250 },
    // Lean back, then sprint off-right.
    { kind: 'tween', cx: 6, w: 4, ms: 160, ease: 'easeIn' },
    { kind: 'tween', cx: 20, w: 7, ms: 520, ease: 'easeOut' },
    // Reappear far off-left.
    { kind: 'set', cx: -6, w: 5 },
    { kind: 'wait', ms: 250 },
    // Slide back into the middle, easing into rest.
    { kind: 'tween', cx: 7, ms: 700, ease: 'easeOut' },
    { kind: 'wait', ms: 350 },
  ],
});

export default wraparoundEmote;
