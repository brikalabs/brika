/**
 * Dance — Brix bounces in tiny vertical hops left ↔ right, music
 * notes spray around him. Each hop is a small `vy` impulse so the
 * arcs read natural under gravity.
 */

import { notes, type Origin } from '../particleEmitters';
import { defineEmote } from './builder';

export const danceEmote = defineEmote('dance', {
  mood: 'cheeky',
  color: 'cyan',
  line: '{:cheeky:}♪ humming ♪',
  hold: 600,
  loop: true,
  particles: (o: Origin) => notes({ x: o.x + 2, y: o.y + 1, w: o.w - 4, h: 3 }),
  initial: { face: 'cheeky', cx: 7 },
  beats: [
    { kind: 'tween', cx: 6, ms: 60 },
    { kind: 'impulse', vy: 11 },
    { kind: 'waitLand', maxMs: 500 },
    { kind: 'face', face: 'excited' },
    { kind: 'tween', cx: 8, ms: 60 },
    { kind: 'impulse', vy: 11 },
    { kind: 'waitLand', maxMs: 500 },
    { kind: 'face', face: 'cheeky' },
    { kind: 'tween', cx: 5, ms: 60 },
    { kind: 'impulse', vy: 12 },
    { kind: 'waitLand', maxMs: 500 },
    { kind: 'face', face: 'excited' },
    { kind: 'tween', cx: 9, ms: 60 },
    { kind: 'impulse', vy: 12 },
    { kind: 'waitLand', maxMs: 500 },
    { kind: 'face', face: 'cheeky' },
    { kind: 'tween', cx: 7, ms: 100 },
  ],
});
