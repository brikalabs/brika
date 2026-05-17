/**
 * `<BrixHeader>` — top region of the brika TUI: the Brix mascot beside
 * a speech bubble. Public entry; wraps the layout in its own
 * `EmoteProvider` so the rest of the shell stays uncoupled from Brix's
 * animation runtime.
 *
 * The behaviour layer is intentionally split into small modules under
 * this folder:
 *
 *   useEmoteSync       hub state + activity emote → BrixStage
 *   useBubbleStream    reducer + typewriter ticks + post-reveal hold
 *   useIdleChatter     time-of-day + mood + random-thought biased picks
 *   usePoke            knockback offset, tiered ouch lines, unlock nav
 *   lines / colors     dialogue corpus + mood→tint map
 *   constants          pacing + chrome + kick + unlock tuning
 *   random             cosmetic-only randomness helpers
 *   timeOfDay          tiny date → bucket helper
 *   brixHostReducer    pure typewriter state machine (kept colocated)
 */

import { BrixPhysicsProvider, EMOTE_LIBRARY, EmoteProvider } from '@brika/brix';
import type React from 'react';
import { BrixHeaderInner } from './BrixHeaderInner';
import { lyingDeadEmote } from './lyingDeadEmote';

/** Augment the built-in emote catalog with our console-local extras
 *  (`lyingDead` is the corpse pose Brix holds after the death animation
 *  finishes). Built outside the component so React doesn't see a new
 *  identity on every render. */
const EMOTE_LIBRARY_WITH_EXTRAS = {
  ...EMOTE_LIBRARY,
  lyingDead: lyingDeadEmote,
};

/** Restitution at floor impact — pokes should rebound a couple of
 *  times before settling. 0.45 gives ~2-3 visible hops on a vy=22
 *  impulse before the per-impact rest threshold kicks in. */
const POKE_BOUNCE = 0.45;

/** Hard cap on velocity built up by chained impulses. Sized so a
 *  single poke barely registers (KICK_MAG_Y=14 is below the y cap)
 *  but rapid spam can't push Brix into mach-speed pinball. */
const MAX_VELOCITY = { x: 18, y: 22 } as const;

/** Hard cap on displacement from home — keeps Brix inside the stage
 *  canvas even under abuse. `x` ≈ half the stage width minus body
 *  half-width so he can't slide off the visible cells; `y` matches
 *  `JUMP_HEADROOM` so jumps stay inside the headroom we reserved. */
const MAX_OFFSET = { x: 4, y: 2 } as const;

export function BrixHeader(): React.ReactElement {
  return (
    <EmoteProvider library={EMOTE_LIBRARY_WITH_EXTRAS}>
      <BrixPhysicsProvider bounce={POKE_BOUNCE} maxVelocity={MAX_VELOCITY} maxOffset={MAX_OFFSET}>
        <BrixHeaderInner />
      </BrixPhysicsProvider>
    </EmoteProvider>
  );
}
