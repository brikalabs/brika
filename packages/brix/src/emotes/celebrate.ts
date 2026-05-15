/**
 * Celebrate — anticipation squat, big vertical jump (no forward
 * momentum), starry eyes at the apex, landing squash, then a quick
 * settling bounce. Confetti rains down through the whole thing.
 */

import { confetti, type Origin } from '../particleEmitters';
import { defineEmote } from './builder';

export const celebrateEmote = defineEmote('celebrate', {
  mood: 'starry',
  color: 'yellow',
  line: '{:excited:}yes!! {:starry:}deployed.',
  hold: 700,
  priority: 5,
  particles: (o: Origin) => confetti({ x: o.x + 1, y: o.y, w: o.w - 2, h: o.h }),
  initial: { face: 'excited' },
  beats: [
    { kind: 'tween', h: 2, ms: 120, ease: 'easeIn' },
    { kind: 'tween', h: 4, ms: 100, ease: 'easeOut' },
    { kind: 'face', face: 'starry' },
    { kind: 'impulse', vy: 14 },
    { kind: 'waitLand', maxMs: 1800 },
    { kind: 'face', face: 'excited' },
    { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
    { kind: 'tween', h: 3, ms: 120, ease: 'easeOut' },
    { kind: 'face', face: 'starry' },
    { kind: 'impulse', vy: 10 },
    { kind: 'waitLand', maxMs: 800 },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 300 },
  ],
});

export default celebrateEmote;
