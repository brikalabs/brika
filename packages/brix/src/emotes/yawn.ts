/**
 * Yawn — long slow inhale (body stretches tall), eyes close in the
 * middle of the breath, body exhales back down. Used when nothing
 * has happened for a while.
 */

import { defineEmote } from './builder';

export const yawnEmote = defineEmote('yawn', {
  mood: 'tired',
  color: 'gray',
  line: '{:tired:}*yawn*',
  hold: 400,
  initial: { face: 'tired' },
  beats: [
    { kind: 'wait', ms: 200 },
    { kind: 'tween', h: 5, ms: 600, ease: 'easeOut' },
    { kind: 'face', face: 'sleepy' },
    { kind: 'wait', ms: 500 },
    { kind: 'tween', h: 3, ms: 500, ease: 'easeIn' },
    { kind: 'face', face: 'tired' },
    { kind: 'wait', ms: 300 },
  ],
});

export default yawnEmote;
