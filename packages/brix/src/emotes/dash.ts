/**
 * Dash — Brix sprints from centre to one edge, brakes, sprints back.
 * Wind-up squat, fast lateral tween (w stretches wide for a streaky
 * "motion-lean" look), then a hard brake.
 *
 * `dash` and `flee` share the same body simulation: only the face,
 * mood, colour, and line differ. Reusing one `Beat[]` between two
 * `defineEmote` calls is all it takes — the simulator bakes each face
 * into its own timeline.
 */

import type { Beat } from './builder';
import { defineEmote } from './builder';

const BEATS: ReadonlyArray<Beat> = [
  // Wind-up: pull back, slight stretch (anticipation).
  { kind: 'tween', cx: 6, w: 4, h: 4, ms: 180, ease: 'easeIn' },
  { kind: 'wait', ms: 80 },
  // GO right — body stretches wide for motion lean.
  { kind: 'tween', cx: 12, w: 7, h: 3, ms: 480, ease: 'easeOut' },
  // Brake into a wide settle.
  { kind: 'tween', w: 5, ms: 140 },
  { kind: 'wait', ms: 280 },

  // Wind-up the other way.
  { kind: 'tween', cx: 13, w: 4, h: 4, ms: 180, ease: 'easeIn' },
  { kind: 'wait', ms: 80 },
  // GO left.
  { kind: 'tween', cx: 2, w: 7, h: 3, ms: 480, ease: 'easeOut' },
  { kind: 'tween', w: 5, ms: 140 },
  { kind: 'wait', ms: 280 },

  // Drift back to centre to set up the next loop cleanly.
  { kind: 'tween', cx: 7, ms: 240, ease: 'easeOut' },
];

export const dashEmote = defineEmote('dash', {
  mood: 'excited',
  color: 'cyan',
  line: '{:excited:}zoom!',
  hold: 400,
  loop: true,
  initial: { face: 'starry' },
  beats: BEATS,
});

export const fleeEmote = defineEmote('flee', {
  mood: 'panic',
  color: 'red',
  line: '{:panic:}nope nope nope',
  hold: 300,
  loop: true,
  initial: { face: 'panic' },
  beats: BEATS,
});
