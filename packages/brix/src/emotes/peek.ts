/**
 * Peek — Brix slides on from off-stage left, glances right then left,
 * and slips back off the way he came. Demonstrates that `cx` outside
 * the stage just gets clipped by the composer, so we can stage entries
 * and exits without any special "off-screen" mode.
 */

import { defineEmote } from './builder';

export const peekEmote = defineEmote('peek', {
  mood: 'curious',
  color: 'yellow',
  line: '{:curious:}…hello?',
  hold: 600,
  loop: true,
  // Start off-stage left.
  initial: { face: 'curious', cx: -3 },
  beats: [
    { kind: 'wait', ms: 300 },
    // Edge into view.
    { kind: 'tween', cx: 3, ms: 520, ease: 'easeOut' },
    { kind: 'wait', ms: 300 },
    // Peek right.
    { kind: 'face', face: 'suspicious' },
    { kind: 'tween', cx: 5, ms: 220 },
    { kind: 'wait', ms: 400 },
    // Peek left.
    { kind: 'face', face: 'curious' },
    { kind: 'tween', cx: 2, ms: 280 },
    { kind: 'wait', ms: 400 },
    // Vanish back off.
    { kind: 'tween', cx: -5, ms: 520, ease: 'easeIn' },
    { kind: 'wait', ms: 800 },
  ],
});
