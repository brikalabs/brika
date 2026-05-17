/**
 * Click-on-Brix behaviour. Each poke does three things:
 *
 *   1. Plays the `oops` body emote.
 *   2. Hurls Brix in a random upward direction via the live brix
 *      physics provider — `<BrixStage>` reads the resulting offset
 *      from the same `<BrixPhysicsProvider>` context and shifts the
 *      mascot internally. Gravity pulls him back to the floor,
 *      friction slows the slide, and a soft spring walks him home.
 *      Impulses stack, so a flurry of taps really tosses him around.
 *   3. Says something. Lines come from `OUCH_MILD` while the streak is
 *      small and `OUCH_ANNOYED` once the operator has clearly noticed
 *      that pokes annoy him. Hitting `UNLOCK_TAP_COUNT` in
 *      `UNLOCK_TAP_WINDOW_MS` skips the line entirely and navigates to
 *      the hidden Brix Run route.
 *
 * Life cycle: after `LIFETIME_POKE_LIMIT` total pokes (counted across
 * the whole session, not just the rapid window) Brix dies. The `dead`
 * emote plays for `DEAD_EMOTE_MS`, then the layout swaps the mascot
 * for a `<Tombstone>` that sits for `TOMBSTONE_MS` before he respawns.
 * Pokes during the dying or tombstone phases are ignored so the
 * animation can finish.
 *
 * Poke lines preempt on `POKE_PACING.instant` so each click is snappy.
 * The `say()` queue in `useBubbleStream` is still available for
 * non-reactive callers; pokes just don't use it.
 */

import { useBrixImpulse, useEmote } from '@brika/brix';
import { useRouter } from '@brika/tui';
import React, { type Dispatch, useCallback, useEffect, useRef } from 'react';
import type { Routes } from '../../../routes';
import type { HostEvent } from './brixHostReducer';
import {
  ANNOYED_THRESHOLD,
  DEAD_EMOTE_MS,
  KICK_MAG_X,
  KICK_MAG_Y,
  LIFETIME_POKE_LIMIT,
  PACING,
  POKE_PACING,
  TOMBSTONE_MS,
  UNLOCK_TAP_COUNT,
  UNLOCK_TAP_WINDOW_MS,
} from './constants';
import { DEATH_LINES, EPITAPHS, OUCH_ANNOYED, OUCH_MILD, UNLOCK_LINE } from './lines';
import { pickFrom, randomFloat } from './random';

/** Sample an impulse uniformly on the upper hemisphere — Brix should
 *  always pop *up* on a poke (no one wants to see him driven into the
 *  floor), with a random lateral component scaled to per-axis magnitudes
 *  that read well at terminal cell aspect ratio. */
function randomImpulse(): { vx: number; vy: number } {
  // Bias the angle into [0, π) so sin(angle) ≥ 0 → vy ≥ 0 → always upward.
  const angle = randomFloat() * Math.PI;
  return {
    vx: Math.cos(angle) * KICK_MAG_X,
    vy: Math.sin(angle) * KICK_MAG_Y,
  };
}

function pickOuch(streak: number): string {
  return streak >= ANNOYED_THRESHOLD
    ? pickFrom(OUCH_ANNOYED, '{:angry:}stop that!')
    : pickFrom(OUCH_MILD, '{:oops:}ouch!');
}

export type Life =
  | { readonly phase: 'alive' }
  | { readonly phase: 'dying' }
  | { readonly phase: 'tombstone'; readonly epitaph: string };

export interface PokeDeps {
  /** Direct reducer access. Pokes dispatch STATUS events here so they
   *  preempt whatever Brix is currently saying — no queue wait, no
   *  typewriter delay (poke lines use the `instant` pacing preset). */
  readonly dispatch: Dispatch<HostEvent>;
  /** Current life phase. Owned by `BrixHeaderInner` so the bubble can
   *  derive its `frozen` flag in time for the same-render dispatch
   *  cycle. Pokes are silently ignored when not `alive`. */
  readonly life: Life;
  /** Setter for `life`. Called when the lifetime poke limit is reached
   *  (→ `dying` → `tombstone` → `alive` again on respawn). */
  readonly setLife: Dispatch<React.SetStateAction<Life>>;
}

export interface PokeApi {
  readonly onPoke: () => void;
}

export function usePoke({ dispatch, life, setLife }: Readonly<PokeDeps>): PokeApi {
  const api = useEmote();
  const router = useRouter<Routes>();
  const tapTimes = useRef<number[]>([]);
  const totalPokes = useRef(0);
  const physics = useBrixImpulse();

  // Clear any pending death/respawn timers on unmount so a re-mount
  // (HMR, tab switch) doesn't trip a phantom transition.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
    };
  }, []);

  const onPoke = useCallback(() => {
    // Ignore pokes while dying or in the tombstone phase — let the
    // animation play out.
    if (life.phase !== 'alive') {
      return;
    }

    api.play('oops');
    const { vx, vy } = randomImpulse();
    physics.impulse(vx, vy);

    const now = Date.now();
    tapTimes.current = [...tapTimes.current, now].filter(
      (t) => now - t < UNLOCK_TAP_WINDOW_MS
    );
    const streak = tapTimes.current.length;
    totalPokes.current += 1;

    if (streak >= UNLOCK_TAP_COUNT) {
      tapTimes.current = [];
      dispatch({ type: 'STATUS', text: UNLOCK_LINE, tint: 'magenta', pacing: PACING });
      router.navigate('brix');
      return;
    }

    if (totalPokes.current >= LIFETIME_POKE_LIMIT) {
      // Murder. Three-phase choreography:
      //   1. `dead` plays the panic+collapse animation (~2.5s).
      //   2. `lyingDead` is queued behind it — a static flat-brick
      //      pose held forever. Without this, the EmoteProvider would
      //      fall back to the cyan idle pose after `dead` ends and
      //      Brix would look weirdly alive again during the rest of
      //      the dying phase.
      //   3. At the dying→tombstone tick we swap the bubble caption
      //      from the dying line to the epitaph. The bubble is frozen
      //      throughout, but imperative dispatches still fire — the
      //      `frozen` flag only gates the hook's own auto-effects.
      // On respawn we `api.cancel()` to clear `lyingDead` so the
      // normal idle pose resumes.
      api.play('dead');
      api.play('lyingDead', { queue: true });
      dispatch({
        type: 'STATUS',
        text: pickFrom(DEATH_LINES, '{:dead:}§4goodbye.'),
        tint: 'red',
        pacing: PACING,
      });
      const epitaph = pickFrom(EPITAPHS, 'here lies Brix');
      setLife({ phase: 'dying' });
      const toTombstone = setTimeout(() => {
        setLife({ phase: 'tombstone', epitaph });
        // Replace the dying line with the epitaph in the bubble.
        // First line becomes the headline; subsequent lines flatten
        // into a single sentence so the bubble (which is one row of
        // text) reads cleanly.
        const epitaphLine = `{:dead:}§8${epitaph.split('\n').join(' — ')}`;
        dispatch({
          type: 'STATUS',
          text: epitaphLine,
          tint: 'gray',
          pacing: PACING,
        });
      }, DEAD_EMOTE_MS);
      const toRespawn = setTimeout(() => {
        totalPokes.current = 0;
        tapTimes.current = [];
        physics.reset();
        api.cancel();
        setLife({ phase: 'alive' });
      }, DEAD_EMOTE_MS + TOMBSTONE_MS);
      timersRef.current.add(toTombstone);
      timersRef.current.add(toRespawn);
      return;
    }

    dispatch({
      type: 'STATUS',
      text: pickOuch(streak),
      tint: streak >= ANNOYED_THRESHOLD ? 'red' : 'yellow',
      pacing: POKE_PACING,
    });
  }, [api, router, dispatch, physics, life.phase]);

  return { onPoke };
}
