/**
 * Cry — Brix is sobbing. Body slumps lower than baseline, gently bobs
 * as the shoulders shake, and the face cycles between `sob` (`T_T`)
 * and `squint` (`>_<`) for the big sobs. No particles — the face +
 * breathing motion read as crying on their own without cluttering
 * the canvas. Loops forever so it can hold the screen for as long
 * as a "too small" / "error" state needs to.
 */

import { defineEmote } from './builder';

export const cryEmote = defineEmote('cry', {
  mood: 'sad',
  color: 'blue',
  line: '{:sad:}sniff…',
  hold: 0,
  loop: true,
  initial: { face: 'sob', h: 3 },
  beats: [
    // Slump down + slow inhale.
    { kind: 'tween', h: 2, ms: 600, ease: 'easeIn' },
    { kind: 'wait', ms: 240 },
    // Shoulders shake — quick rise + fall.
    { kind: 'tween', h: 3, ms: 380, ease: 'easeOut' },
    { kind: 'tween', h: 2, ms: 420, ease: 'easeIn' },
    { kind: 'wait', ms: 320 },
    // Bigger sob — body puffs up then deflates.
    { kind: 'tween', h: 4, ms: 520, ease: 'easeOut' },
    { kind: 'face', face: 'squint' },
    { kind: 'tween', h: 2, ms: 640, ease: 'easeIn' },
    { kind: 'face', face: 'sob' },
    { kind: 'wait', ms: 420 },
  ],
});
