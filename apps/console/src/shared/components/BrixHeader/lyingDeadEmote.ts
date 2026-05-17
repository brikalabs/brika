/**
 * `lyingDead` — Brix's "stay dead" pose. Static flat-brick body with
 * `x_x` eyes, the same red tint the `dead` emote uses, held for so
 * long the timeline effectively never ends.
 *
 * Why a separate emote from `dead`? The built-in `dead` emote is the
 * *animation* (panic shake → desperate hops → collapse), and it only
 * runs ~2.5 s before naturally ending. After that the EmoteProvider
 * falls back to the idle emote — which is cyan, alive, and visually
 * wrong while Brix is supposed to be a corpse. `usePoke` queues
 * `lyingDead` right behind `dead` so the moment the death animation
 * finishes, the flat-brick pose takes over and stays put until the
 * tombstone phase replaces the stage entirely (and `api.cancel()` on
 * respawn lets the idle pose return).
 */

import { defineEmote } from '@brika/brix';

/** Long enough to outlast any plausible `DEAD_EMOTE_MS` setting without
 *  the timeline actually rolling over. One hour is theatre. */
const FOREVER_MS = 60 * 60 * 1000;

export const lyingDeadEmote = defineEmote('lyingDead', {
  mood: 'dead',
  color: 'red',
  // Same priority as `dead` so nothing lower can preempt the corpse.
  priority: 9,
  hold: 1,
  initial: { face: 'dead', h: 2 },
  beats: [{ kind: 'wait', ms: FOREVER_MS }],
});
