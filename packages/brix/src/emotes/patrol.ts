/**
 * Patrol — Brix walks slowly from one side of the stage to the other
 * with a head-bob between every "step" (h alternates 3↔4). `patrol`
 * and `wandering` share the same gait — only the face/mood/colour
 * differ, demonstrating that one body animation can carry several
 * personalities.
 */

import type { Beat } from './builder';
import { defineEmote } from './builder';

const STEP_MS = 380;

const BEATS: ReadonlyArray<Beat> = [
  { kind: 'wait', ms: 250 },
  // Stride right — four bobbing steps to cx=11.
  { kind: 'tween', cx: 5, h: 4, ms: STEP_MS },
  { kind: 'tween', cx: 7, h: 3, ms: STEP_MS },
  { kind: 'tween', cx: 9, h: 4, ms: STEP_MS },
  { kind: 'tween', cx: 11, h: 3, ms: STEP_MS },
  { kind: 'wait', ms: 350 },
  // About-face and stride back.
  { kind: 'tween', cx: 9, h: 4, ms: STEP_MS },
  { kind: 'tween', cx: 7, h: 3, ms: STEP_MS },
  { kind: 'tween', cx: 5, h: 4, ms: STEP_MS },
  { kind: 'tween', cx: 3, h: 3, ms: STEP_MS },
  { kind: 'wait', ms: 350 },
];

export const patrolEmote = defineEmote('patrol', {
  mood: 'focused',
  color: 'cyan',
  line: '{:focused:}on watch',
  hold: 500,
  loop: true,
  initial: { face: 'focus', cx: 3 },
  beats: BEATS,
});

export const wanderingEmote = defineEmote('wandering', {
  mood: 'curious',
  color: 'yellow',
  line: '{:curious:}what is over here?',
  hold: 500,
  loop: true,
  initial: { face: 'curious', cx: 3 },
  beats: BEATS,
});
