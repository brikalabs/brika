/**
 * Nom — body squashes rhythmically as Brix chomps. Face cycles
 * between neutral, happy, and excited on each chew.
 */

import { defineEmote } from './builder';

export const nomEmote = defineEmote('nom', {
  mood: 'cheeky',
  color: 'green',
  line: '{:cheeky:}om nom nom…',
  hold: 500,
  initial: { face: 'neutral' },
  beats: [
    { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
    { kind: 'face', face: 'happy' },
    { kind: 'tween', h: 3, ms: 110, ease: 'easeOut' },
    { kind: 'face', face: 'excited' },
    { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
    { kind: 'face', face: 'happy' },
    { kind: 'tween', h: 3, ms: 110, ease: 'easeOut' },
    { kind: 'face', face: 'neutral' },
    { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
    { kind: 'face', face: 'happy' },
    { kind: 'tween', h: 4, ms: 220, ease: 'easeOut' },
    { kind: 'face', face: 'excited' },
    { kind: 'tween', h: 3, ms: 180, ease: 'easeIn' },
  ],
});

export default nomEmote;
