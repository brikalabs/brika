/**
 * Love — body pumps like a heartbeat (squash then stretch on each
 * beat) while hearts drift up around it.
 */

import { hearts, type Origin } from '../particleEmitters';
import { defineEmote } from './builder';

export const loveEmote = defineEmote('love', {
  mood: 'love',
  color: 'magenta',
  line: '{:love:}i love you, runtime.',
  hold: 1100,
  loop: true,
  particles: (o: Origin) => hearts({ x: o.x + 4, y: o.y + 1, w: o.w - 8, h: 2 }),
  initial: { face: 'love', h: 3 },
  beats: [
    { kind: 'wait', ms: 250 },
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'tween', h: 4, ms: 120, ease: 'easeOut' },
    { kind: 'tween', h: 3, ms: 200, ease: 'easeIn' },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 220 },
    { kind: 'face', face: 'love' },
  ],
});

export default loveEmote;
