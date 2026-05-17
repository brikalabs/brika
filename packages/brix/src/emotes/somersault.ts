/**
 * Somersault — a big arcing leap across the stage with face cycling
 * mid-air to suggest rotation. Wind-up squat → launch → faces cycle
 * (shy → cheeky → starry) while gravity does the arc → landing squash.
 */

import { defineEmote } from './builder';

export const somersaultEmote = defineEmote('somersault', {
  mood: 'starry',
  color: 'cyan',
  line: '{:starry:}wheee!',
  hold: 600,
  loop: true,
  initial: { face: 'starry', cx: 3 },
  beats: [
    { kind: 'wait', ms: 200 },
    // Wind-up.
    { kind: 'tween', h: 2, ms: 110, ease: 'easeIn' },
    { kind: 'tween', h: 4, w: 4, ms: 130, ease: 'easeOut' },
    // Launch.
    { kind: 'impulse', vx: 6, vy: 16 },
    // Mid-air face cycle — body keeps arcing under gravity.
    { kind: 'wait', ms: 200 },
    { kind: 'face', face: 'shy' },
    { kind: 'wait', ms: 200 },
    { kind: 'face', face: 'cheeky' },
    { kind: 'wait', ms: 200 },
    { kind: 'face', face: 'starry' },
    // Finish the arc.
    { kind: 'waitLand', maxMs: 1500 },
    { kind: 'set', vx: 0 },
    // Landing squash + recovery.
    { kind: 'tween', h: 2, w: 6, ms: 90, ease: 'easeIn' },
    { kind: 'tween', h: 3, w: 5, ms: 180, ease: 'easeOut' },
    { kind: 'wait', ms: 350 },
  ],
});

export default somersaultEmote;
