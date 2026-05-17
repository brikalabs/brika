/**
 * Think — Brix stays put, cycles through "studying the problem"
 * faces, and breathes long and slow.
 */

import { defineEmote } from './builder';

export const thinkEmote = defineEmote('think', {
  mood: 'thinking',
  color: 'cyan',
  line: '{:thinking:}hmm…',
  hold: 600,
  loop: true,
  initial: { face: 'thinking' },
  beats: [
    { kind: 'tween', h: 4, ms: 500, ease: 'easeOut' },
    { kind: 'face', face: 'curious' },
    { kind: 'wait', ms: 300 },
    { kind: 'face', face: 'suspicious' },
    { kind: 'tween', h: 3, ms: 500, ease: 'easeIn' },
    { kind: 'face', face: 'thinking' },
    { kind: 'wait', ms: 300 },
  ],
});

export default thinkEmote;
