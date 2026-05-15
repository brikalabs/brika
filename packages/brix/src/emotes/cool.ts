/**
 * Cool — Brix puffs his chest (stretches up), lands on shades, holds.
 */

import { defineEmote } from './builder';

export const coolEmote = defineEmote('cool', {
  mood: 'cool',
  color: 'blue',
  line: '{:cool:}nice.',
  hold: 600,
  initial: { face: 'neutral' },
  beats: [
    { kind: 'wait', ms: 140 },
    { kind: 'tween', h: 4, ms: 220, ease: 'easeOut' },
    { kind: 'face', face: 'cool' },
    { kind: 'wait', ms: 480 },
  ],
});

export default coolEmote;
