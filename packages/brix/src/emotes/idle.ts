/**
 * Idle — Brix breathes calmly, blinks now and then. Loops forever.
 * The body subtly grows on inhale (face rises) and shrinks on exhale
 * (face drops) — feet stay glued to the floor.
 */

import { defineEmote } from './builder';

export const idleEmote = defineEmote('idle', {
  mood: 'idle',
  color: 'cyan',
  loop: true,
  initial: { face: 'neutral', w: 5, h: 3 },
  beats: [
    { kind: 'wait', ms: 1800 },
    { kind: 'face', face: 'blink' },
    { kind: 'wait', ms: 120 },
    { kind: 'face', face: 'neutral' },
    { kind: 'wait', ms: 1100 },
    { kind: 'tween', h: 4, ms: 700, ease: 'easeOut' },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 400 },
    { kind: 'face', face: 'neutral' },
    { kind: 'tween', h: 2, ms: 600, ease: 'easeIn' },
    { kind: 'tween', h: 3, ms: 400, ease: 'easeOut' },
    { kind: 'wait', ms: 1200 },
    { kind: 'face', face: 'blink' },
    { kind: 'wait', ms: 110 },
    { kind: 'face', face: 'neutral' },
  ],
});

export default idleEmote;
