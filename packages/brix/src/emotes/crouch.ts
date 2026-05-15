/**
 * Crouch — Brix squats low and stays there briefly, then pops back
 * up. Used by the game when the player ducks under a flying obstacle.
 */

import { defineEmote } from './builder';

export const crouchEmote = defineEmote('crouch', {
  mood: 'shy',
  color: 'cyan',
  line: '{:shy:}duck!',
  hold: 300,
  initial: { face: 'happy', h: 3 },
  beats: [
    { kind: 'tween', h: 2, ms: 90, ease: 'easeIn' },
    { kind: 'face', face: 'shy' },
    { kind: 'wait', ms: 500 },
    { kind: 'tween', h: 3, ms: 140, ease: 'easeOut' },
    { kind: 'face', face: 'happy' },
  ],
});

export default crouchEmote;
