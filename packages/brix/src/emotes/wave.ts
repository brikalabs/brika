/**
 * Wave — Brix wobbles side-to-side (no arms; the whole body shifts)
 * and finishes with a wink. The horizontal sweep is implemented by
 * tweening `cx`; physics keeps his feet on the floor automatically.
 */

import { defineEmote } from './builder';

export const waveEmote = defineEmote('wave', {
  mood: 'happy',
  color: 'green',
  line: '{:happy:}hi!',
  hold: 400,
  initial: { face: 'happy', cx: 7 },
  beats: [
    { kind: 'tween', cx: 5, ms: 140, ease: 'easeOut' },
    { kind: 'tween', cx: 9, ms: 200, ease: 'easeOut' },
    { kind: 'tween', cx: 5, ms: 200, ease: 'easeOut' },
    { kind: 'tween', cx: 7, ms: 140, ease: 'easeOut' },
    { kind: 'face', face: 'wink' },
    { kind: 'wait', ms: 220 },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 160 },
  ],
});
