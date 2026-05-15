/**
 * Wink — quick face flicker with a tiny squash on the wink itself.
 */

import { defineEmote } from './builder';

export const winkEmote = defineEmote('wink', {
  mood: 'wink',
  color: 'magenta',
  line: '{:wink:}😉',
  hold: 300,
  initial: { face: 'happy' },
  beats: [
    { kind: 'wait', ms: 160 },
    { kind: 'face', face: 'wink' },
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'tween', h: 3, ms: 120, ease: 'easeOut' },
    { kind: 'face', face: 'happy' },
    { kind: 'wait', ms: 200 },
  ],
});

export default winkEmote;
