/**
 * Wires `brixHostReducer` to the upstream CLI signals (hub state +
 * status text + mood) and drives the typewriter reveal + post-reveal
 * hold timers. Returns the state slice the layout needs to paint the
 * bubble plus two writers:
 *
 *   `dispatch`  raw escape hatch — use when the caller really must
 *               preempt whatever Brix is saying (e.g. the rapid-tap
 *               unlock that navigates away). Replaces the current line.
 *   `say`       polite writer — queues a line and plays it once the
 *               current reveal + hold finishes. Rapid bursts no longer
 *               clobber each other; the operator gets to read all of
 *               them in order. Capped at `SAY_QUEUE_MAX` so a poke
 *               spam can't grow unbounded.
 *
 * The two `useRef` guards (`lastHubRef`, `lastTextRef`) keep us from
 * re-typewritering the same line on every render — only genuine prop
 * transitions enqueue a fresh reveal.
 */

import type { Mood, PacingOptions } from '@brika/brix';
import { type Dispatch, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  type HostEvent,
  type HostState,
  INITIAL_STATE,
  isFinished,
  reduce,
  visibleText,
} from './brixHostReducer';
import { colorForMood } from './colors';
import { MIN_TICK_MS, PACING, REACTION_HOLD_MS, SPEECH_HOLD_MS } from './constants';
import { type HubState, REACTIONS } from './lines';

/** Hard cap on queued lines waiting to type out. Picked just above
 *  the rapid-tap unlock threshold so a normal poke flurry queues
 *  cleanly without filling the buffer; further pokes drop silently
 *  (the knockback / emote feedback still fires at the call site). */
const SAY_QUEUE_MAX = 4;

interface QueuedLine {
  readonly text: string;
  readonly tint: string;
  readonly pacing: PacingOptions;
}

export interface BubbleStream {
  readonly state: HostState;
  readonly bubbleText: string;
  readonly bubbleTint: string;
  readonly bubbleDim: boolean;
  /** `true` while characters are still streaming — drives mouth flap. */
  readonly speaking: boolean;
  /** Raw reducer access; bypass the queue and replace the active line.
   *  Use this only for hard preempts (e.g. the easter-egg unlock). */
  readonly dispatch: Dispatch<HostEvent>;
  /** Queue a line; it plays as soon as the current reveal + hold ends.
   *  Defaults to the global `PACING`; pass a tighter cadence (e.g.
   *  `POKE_PACING`) for short reactive lines that should land fast.
   *  Returns `true` if the line was accepted, `false` if the queue is
   *  full and the line was dropped. */
  readonly say: (text: string, tint: string, pacing?: PacingOptions) => boolean;
}

export function useBubbleStream(
  hubState: HubState,
  statusText: string,
  mood: Mood,
  /** When `true`, the auto-dispatch effects (HUB on hub-state change,
   *  STATUS on `statusText` change, HOLD_OVER on reveal complete,
   *  queue-drain on idle) are all suppressed. The typewriter keeps
   *  ticking so a line that was already dispatched still reveals, but
   *  nothing new replaces it and the bubble doesn't return to idle.
   *  Imperative `dispatch()` calls from callers (e.g. `usePoke`) still
   *  go through — freezing only affects the hook's own auto-effects. */
  frozen = false
): BubbleStream {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);

  // Greet on every genuine hub-state transition.
  const lastHubRef = useRef<HubState>(hubState);
  useEffect(() => {
    if (frozen || lastHubRef.current === hubState) {
      return;
    }
    lastHubRef.current = hubState;
    dispatch({ type: 'HUB', reaction: REACTIONS[hubState], pacing: PACING });
  }, [hubState, frozen]);

  // Speak whenever the upstream caption changes.
  const lastTextRef = useRef<string>(statusText);
  useEffect(() => {
    if (frozen || lastTextRef.current === statusText) {
      return;
    }
    lastTextRef.current = statusText;
    dispatch({ type: 'STATUS', text: statusText, tint: colorForMood(mood), pacing: PACING });
  }, [statusText, mood, frozen]);

  // Typewriter tick — one reveal per the step's own pause. Runs even
  // while frozen so a death line that was just dispatched still reveals.
  useEffect(() => {
    if (state.phase === 'idle' || state.cursor >= state.stream.length) {
      return;
    }
    const step = state.stream[state.cursor];
    const delay = Math.max(MIN_TICK_MS, step?.pauseMs ?? PACING.charMs ?? MIN_TICK_MS);
    const t = setTimeout(() => dispatch({ type: 'REVEAL' }), delay);
    return () => clearTimeout(t);
  }, [state.phase, state.cursor, state.stream]);

  // Hold the final frame for a beat, then return to idle. Suppressed
  // while frozen so the displayed line stays put (death + tombstone
  // phases want the line to linger until the bubble is thawed).
  const finished = isFinished(state);
  useEffect(() => {
    if (frozen || !finished) {
      return;
    }
    const hold = state.phase === 'reacting' ? REACTION_HOLD_MS : SPEECH_HOLD_MS;
    const t = setTimeout(() => dispatch({ type: 'HOLD_OVER' }), hold);
    return () => clearTimeout(t);
  }, [finished, state.phase, frozen]);

  // Queued `say()` lines drain whenever the reducer parks in `idle`.
  // The tick state forces the drain effect to re-run on a fresh enqueue
  // even if `state.phase` didn't change (the queue is held in a ref).
  const queueRef = useRef<QueuedLine[]>([]);
  const [drainTick, setDrainTick] = useState(0);
  useEffect(() => {
    if (frozen || state.phase !== 'idle') {
      return;
    }
    const next = queueRef.current.shift();
    if (next) {
      dispatch({ type: 'STATUS', text: next.text, tint: next.tint, pacing: next.pacing });
    }
  }, [state.phase, drainTick, frozen]);

  const say = useCallback(
    (text: string, tint: string, pacing: PacingOptions = PACING): boolean => {
      if (queueRef.current.length >= SAY_QUEUE_MAX) {
        return false;
      }
      queueRef.current.push({ text, tint, pacing });
      setDrainTick((t) => (t + 1) % 1_000_000);
      return true;
    },
    []
  );

  const bubbleText = state.phase === 'idle' ? statusText : visibleText(state);
  const bubbleDim = state.phase === 'idle';
  const bubbleTint = state.phase === 'idle' ? 'gray' : state.tint;
  const speaking = state.phase !== 'idle' && state.cursor < state.stream.length;

  return { state, bubbleText, bubbleTint, bubbleDim, speaking, dispatch, say };
}
