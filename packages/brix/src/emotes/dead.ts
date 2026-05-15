/**
 * Dead — panic (stretches and shakes vertically), seizure (a brief
 * spasm), then collapses into a flat brick on the floor with `x_x`
 * eyes. High-priority — a real failure interrupts anything.
 */

import { defineEmote } from './builder';

export const deadEmote = defineEmote('dead', {
  mood: 'dead',
  color: 'red',
  line: '{:dead:}runtime did not recover.',
  hold: 1500,
  priority: 9,
  initial: { face: 'panic' },
  beats: [
    { kind: 'tween', h: 4, ms: 180, ease: 'easeOut' },
    { kind: 'impulse', vy: 10 },
    { kind: 'waitLand', maxMs: 600 },
    { kind: 'impulse', vy: 7 },
    { kind: 'waitLand', maxMs: 500 },
    { kind: 'face', face: 'dead' },
    { kind: 'tween', h: 2, ms: 320, ease: 'easeIn' },
    { kind: 'wait', ms: 1200 },
  ],
});

export default deadEmote;
