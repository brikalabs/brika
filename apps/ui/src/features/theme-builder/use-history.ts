/**
 * useHistory — a small undo/redo stack on top of a single value.
 *
 * Intended for the theme draft: every mutation pushes a new past entry,
 * `undo()` moves a step back, `redo()` re-applies. Rapid edits (e.g.
 * dragging the radius slider) are coalesced within `throttleMs` so the
 * user doesn't have to press undo 40 times to back out of one gesture.
 */

import { useCallback, useRef, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastPushAt: number;
}

export interface HistoryApi<T> {
  value: T;
  set: (next: T, options?: { coalesce?: boolean }) => void;
  replace: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (value: T) => void;
}

interface Options {
  /** Merge consecutive edits into the previous history entry if closer than this. */
  throttleMs?: number;
  /** Cap past length so memory doesn't grow unbounded. */
  limit?: number;
}

export function useHistory<T>(initial: T, options: Options = {}): HistoryApi<T> {
  const { throttleMs = 500, limit = 100 } = options;
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: initial,
    future: [],
    lastPushAt: 0,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const set = useCallback(
    (next: T, opts?: { coalesce?: boolean }) => {
      setState((prev) => {
        if (Object.is(prev.present, next)) {
          return prev;
        }
        const now = Date.now();
        const coalesce = opts?.coalesce !== false && now - prev.lastPushAt < throttleMs;
        const nextPast = coalesce ? prev.past : [...prev.past, prev.present].slice(-limit);
        return {
          past: nextPast,
          present: next,
          future: [],
          lastPushAt: now,
        };
      });
    },
    [limit, throttleMs]
  );

  const replace = useCallback((next: T) => {
    setState((prev) =>
      Object.is(prev.present, next) ? prev : { ...prev, present: next, future: [] }
    );
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) {
        return prev;
      }
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
        lastPushAt: 0,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) {
        return prev;
      }
      const [next, ...rest] = prev.future;
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: rest,
        lastPushAt: 0,
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setState({ past: [], present: value, future: [], lastPushAt: 0 });
  }, []);

  return {
    value: state.present,
    set,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}
