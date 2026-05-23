/**
 * Sleep — Brix rests with closed eyes, breathing in a layered rhythm:
 * two quiet shallow breaths, a small dream-twitch (face flickers to
 * "tired" and the body sways one cell), then a long audible snore that
 * rises a cell taller and is held at the peak. Width is pinned, and
 * height never dips below 3 so the face stays clear of the top edge.
 * zZz particles drift up throughout.
 */

import { type Origin, zZz } from '../particleEmitters';
import { defineEmote } from './builder';

export const sleepEmote = defineEmote('sleep', {
  mood: 'sleep',
  color: 'gray',
  line: '{:sleep:}zzz…',
  hold: 1200,
  loop: true,
  particles: (o: Origin) => zZz({ x: o.x + o.w - 4, y: o.y + 2, w: 2, h: 2 }, { color: 'gray' }),
  initial: { face: 'sleepy', h: 3, w: 5 },
  beats: [
    // Two shallow breaths.
    { kind: 'wait', ms: 500 },
    { kind: 'tween', h: 4, ms: 650, ease: 'easeOut' },
    { kind: 'wait', ms: 180 },
    { kind: 'tween', h: 3, ms: 650, ease: 'easeIn' },
    { kind: 'wait', ms: 350 },
    { kind: 'tween', h: 4, ms: 650, ease: 'easeOut' },
    { kind: 'wait', ms: 180 },
    { kind: 'tween', h: 3, ms: 650, ease: 'easeIn' },

    // Dream twitch — eyes half-open for a beat, body sways one cell.
    { kind: 'wait', ms: 400 },
    { kind: 'face', face: 'tired' },
    { kind: 'tween', cx: 8, ms: 240 },
    { kind: 'face', face: 'sleepy' },
    { kind: 'tween', cx: 7, ms: 280, ease: 'easeOut' },
    { kind: 'wait', ms: 300 },

    // Deep snore — one cell taller, held at the peak, slow release.
    { kind: 'tween', h: 5, ms: 1100, ease: 'easeOut' },
    { kind: 'wait', ms: 450 },
    { kind: 'tween', h: 3, ms: 1200, ease: 'easeIn' },
    { kind: 'wait', ms: 700 },
  ],
});
