/**
 * Nod — two emphatic vertical bounces in place. Brix nods "yes" by
 * jumping a tiny amount; each crouch on landing reinforces the beat.
 */

import { defineEmote } from './builder';

export const nodEmote = defineEmote('nod', {
  mood: 'happy',
  color: 'green',
  line: '{:happy:}yes.',
  hold: 300,
  initial: { face: 'happy' },
  beats: [
    { kind: 'tween', h: 2, ms: 80, ease: 'easeIn' },
    { kind: 'tween', h: 4, ms: 120, ease: 'easeOut' },
    { kind: 'impulse', vy: 8 },
    { kind: 'waitLand', maxMs: 600 },
    { kind: 'tween', h: 2, ms: 80, ease: 'easeIn' },
    { kind: 'tween', h: 4, ms: 120, ease: 'easeOut' },
    { kind: 'impulse', vy: 8 },
    { kind: 'waitLand', maxMs: 600 },
    { kind: 'tween', h: 3, ms: 120, ease: 'easeOut' },
  ],
});

export default nodEmote;
