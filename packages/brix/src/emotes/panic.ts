/**
 * Panic — Brix vibrates rapidly left/right with tiny vertical hops
 * for emphasis. Red sparkles burst around him. High-priority so a
 * real failure can interrupt anything on stage.
 */

import { type Origin, sparkles } from '../particleEmitters';
import { defineEmote } from './builder';

export const panicEmote = defineEmote('panic', {
  mood: 'panic',
  color: 'red',
  line: '{:panic:}aaa!',
  hold: 500,
  priority: 8,
  loop: true,
  particles: (o: Origin) =>
    sparkles(
      { x: o.x + 2, y: o.y + 1, w: o.w - 4, h: 2 },
      { color: 'red', rate: 16, duration: 900 }
    ),
  initial: { face: 'panic' },
  beats: [
    { kind: 'set', cx: 6 },
    { kind: 'impulse', vy: 9 },
    { kind: 'waitLand', maxMs: 400 },
    { kind: 'set', cx: 8 },
    { kind: 'impulse', vy: 9 },
    { kind: 'waitLand', maxMs: 400 },
    { kind: 'set', cx: 5.5 },
    { kind: 'impulse', vy: 11 },
    { kind: 'waitLand', maxMs: 400 },
    { kind: 'set', cx: 8.5 },
    { kind: 'impulse', vy: 11 },
    { kind: 'waitLand', maxMs: 400 },
  ],
});
