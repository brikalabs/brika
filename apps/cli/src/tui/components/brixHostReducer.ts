/**
 * Pure state machine behind `<BrixHost>`. Lives in its own file
 * because the React component tangles it with five effects and a
 * handful of refs — but the state transitions themselves are pure,
 * so we test them here.
 *
 * State:
 *   - `idle` — Brix breathes; the bubble shows whatever the active
 *     view published as `statusText` (dimmed).
 *   - `speaking` — a new line is being revealed char-by-char. The
 *     face shows the talking mouth animation.
 *   - `reacting` — a one-shot reaction emote (wave/oops/sleep)
 *     plays in the face slot while a short line types in the bubble.
 *
 * Events come in from four sources (see BrixHost.tsx):
 *   1. `HUB`        — hub state transitioned (HUB_CHANGED outside).
 *   2. `STATUS`     — the active view published a new `statusText`.
 *   3. `IDLE_LINE`  — the auto-talk timer fired with a contextual line.
 *   4. `REVEAL`     — typewriter tick.
 *   5. `HOLD_OVER`  — the post-typing hold timer expired; go back idle.
 */

import type { AnimationKind } from '@brika/brix';

export type HostPhase = 'idle' | 'speaking' | 'reacting';

export interface HostState {
  readonly phase: HostPhase;
  /** The full line being shown. Empty in idle. */
  readonly text: string;
  /** Number of revealed characters. 0 ≤ revealed ≤ text.length. */
  readonly revealed: number;
  /** Reaction animation playing in the face slot (reacting phase only). */
  readonly reaction: AnimationKind | null;
  /** Color tint for the face during the current phase. */
  readonly tint: string;
}

export const INITIAL_STATE: HostState = {
  phase: 'idle',
  text: '',
  revealed: 0,
  reaction: null,
  tint: 'cyan',
};

export interface Reaction {
  readonly kind: AnimationKind;
  readonly color: string;
  readonly line: string;
}

export type HostEvent =
  | { readonly type: 'HUB'; readonly reaction: Reaction | null }
  | { readonly type: 'STATUS'; readonly text: string; readonly tint: string }
  | { readonly type: 'IDLE_LINE'; readonly text: string; readonly tint: string }
  | { readonly type: 'REVEAL' }
  | { readonly type: 'HOLD_OVER' };

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
        text: r.line,
        revealed: 0,
        reaction: r.kind,
        tint: r.color,
      };
    }
    case 'STATUS': {
      const text = event.text.trim();
      if (text.length === 0) {
        return state;
      }
      return {
        phase: 'speaking',
        text: event.text,
        revealed: 0,
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
      const text = event.text.trim();
      if (text.length === 0) {
        return state;
      }
      return {
        phase: 'speaking',
        text: event.text,
        revealed: 0,
        reaction: null,
        tint: event.tint,
      };
    }
    case 'REVEAL': {
      if (state.phase === 'idle') {
        return state;
      }
      if (state.revealed >= state.text.length) {
        return state;
      }
      return { ...state, revealed: state.revealed + 1 };
    }
    case 'HOLD_OVER': {
      return { ...INITIAL_STATE, tint: state.tint };
    }
  }
}

/** True when the current line is fully typed and we're waiting on HOLD_OVER. */
export function isFinished(state: HostState): boolean {
  return state.phase !== 'idle' && state.revealed >= state.text.length;
}
