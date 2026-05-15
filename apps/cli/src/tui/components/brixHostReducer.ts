/**
 * Pure state machine behind `<BrixHost>`. Lives in its own file
 * because the React component tangles it with several effects and a
 * handful of refs — but the state transitions themselves are pure,
 * so we test them here.
 *
 * State carries a pre-computed `RevealStep[]` stream (mood-script
 * parsed + typewriter expanded) plus a cursor. The host's reveal
 * effect just steps the cursor and reads `step.pauseMs` for the
 * delay before the next tick — so word-boundary and punctuation
 * pacing are encoded once, in the stream, instead of recomputed.
 *
 * Phases:
 *   - `idle`      — Brix breathes; bubble shows the active view's
 *                   statusText, dimmed.
 *   - `speaking`  — a line is being typed char-by-char. Mouth flaps
 *                   per cursor advance.
 *   - `reacting`  — a one-shot reaction emote (wave/oops/sleep) plays
 *                   in the face slot while a short line types.
 *
 * Events:
 *   1. `HUB`        — hub state changed (host computes the reaction).
 *   2. `STATUS`     — the active view published a new `statusText`.
 *   3. `IDLE_LINE`  — the auto-talk timer fired with a contextual line.
 *   4. `REVEAL`     — typewriter tick.
 *   5. `HOLD_OVER`  — the post-typing hold timer expired; go back idle.
 */

import {
  type AnimationKind,
  expandReveal,
  parseMoodScript,
  type RevealStep,
} from '@brika/brix';

export type HostPhase = 'idle' | 'speaking' | 'reacting';

export interface HostState {
  readonly phase: HostPhase;
  /** Pre-computed reveal stream (one entry per character). Empty in idle. */
  readonly stream: ReadonlyArray<RevealStep>;
  /** How many stream entries have been revealed so far. 0 ≤ cursor ≤ stream.length. */
  readonly cursor: number;
  /** Reaction animation playing in the face slot (reacting phase only). */
  readonly reaction: AnimationKind | null;
  /** Color tint for the face during the current phase. */
  readonly tint: string;
}

export const INITIAL_STATE: HostState = {
  phase: 'idle',
  stream: [],
  cursor: 0,
  reaction: null,
  tint: 'cyan',
};

export interface Reaction {
  readonly kind: AnimationKind;
  readonly color: string;
  readonly line: string;
}

export interface PacingOptions {
  readonly charMs?: number;
  readonly wordPauseMs?: number;
  readonly sentencePauseMs?: number;
  readonly clausePauseMs?: number;
}

export type HostEvent =
  | { readonly type: 'HUB'; readonly reaction: Reaction | null; readonly pacing?: PacingOptions }
  | {
      readonly type: 'STATUS';
      readonly text: string;
      readonly tint: string;
      readonly pacing?: PacingOptions;
    }
  | {
      readonly type: 'IDLE_LINE';
      readonly text: string;
      readonly tint: string;
      readonly pacing?: PacingOptions;
    }
  | { readonly type: 'REVEAL' }
  | { readonly type: 'HOLD_OVER' };

function streamFor(text: string, pacing: PacingOptions = {}): ReadonlyArray<RevealStep> {
  return expandReveal(parseMoodScript(text), 'typewriter', pacing);
}

/** Pure reducer — no side effects, no timers. Tested in isolation. */
export function reduce(state: HostState, event: HostEvent): HostState {
  switch (event.type) {
    case 'HUB': {
      const r = event.reaction;
      if (!r) {
        return state;
      }
      return {
        phase: 'reacting',
        stream: streamFor(r.line, event.pacing),
        cursor: 0,
        reaction: r.kind,
        tint: r.color,
      };
    }
    case 'STATUS': {
      if (event.text.trim().length === 0) {
        return state;
      }
      return {
        phase: 'speaking',
        stream: streamFor(event.text, event.pacing),
        cursor: 0,
        reaction: null,
        tint: event.tint,
      };
    }
    case 'IDLE_LINE': {
      // Only fire if Brix is actually idle — protects against stale
      // setTimeouts firing after the phase has moved on.
      if (state.phase !== 'idle') {
        return state;
      }
      if (event.text.trim().length === 0) {
        return state;
      }
      return {
        phase: 'speaking',
        stream: streamFor(event.text, event.pacing),
        cursor: 0,
        reaction: null,
        tint: event.tint,
      };
    }
    case 'REVEAL': {
      if (state.phase === 'idle') {
        return state;
      }
      if (state.cursor >= state.stream.length) {
        return state;
      }
      return { ...state, cursor: state.cursor + 1 };
    }
    case 'HOLD_OVER': {
      return { ...INITIAL_STATE, tint: state.tint };
    }
  }
}

/** True when the stream is fully revealed and we're waiting on HOLD_OVER. */
export function isFinished(state: HostState): boolean {
  return state.phase !== 'idle' && state.cursor >= state.stream.length;
}

/** Convenience — the rendered text up to the current cursor. */
export function visibleText(state: HostState): string {
  let out = '';
  for (let i = 0; i < state.cursor && i < state.stream.length; i += 1) {
    const step = state.stream[i];
    if (step) {
      out += step.token + step.trailing;
    }
  }
  return out;
}
