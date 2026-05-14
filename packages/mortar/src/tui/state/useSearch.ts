/**
 * In-buffer text search. Two modes: `normal` (search is dormant or
 * shows the active match line) and `searching` (typed chars build up
 * the query before Enter commits it).
 *
 * `scopeKey` resets state when it changes — pass the focused service's
 * id so the search is per-tab (matches in one service's log are
 * meaningless when switching to another).
 */

import { useEffect, useMemo, useState } from 'react';

export type SearchMode = 'normal' | 'searching';

export interface SearchControls {
  readonly mode: SearchMode;
  /** Pattern as the user is typing (before Enter commits). */
  readonly input: string;
  /** Committed pattern; empty when no search is active. */
  readonly query: string;
  /** Line indices in `logs` that contain `query` (case-insensitive). */
  readonly matches: ReadonlyArray<number>;
  /** Index INTO `matches` for the highlighted "current" match. */
  readonly currentMatchIdx: number;
  /** Convenience: the log line index of the current match, or `null`. */
  readonly currentMatchLine: number | null;
  /** Enter "searching" mode (the input field captures keys). */
  readonly enter: () => void;
  /** Discard the in-progress input and exit "searching" mode. */
  readonly cancel: () => void;
  /** Commit the typed input as the active query. */
  readonly commit: () => void;
  /** Append a typed character to the input buffer. */
  readonly type: (ch: string) => void;
  /** Pop one character off the input buffer. */
  readonly backspace: () => void;
  /** Move to the next / previous committed match. */
  readonly next: () => void;
  readonly prev: () => void;
  /** Clear the committed query (returns to normal mode + no highlights). */
  readonly clear: () => void;
}

export function useSearch(logs: readonly string[], scopeKey: string): SearchControls {
  const [mode, setMode] = useState<SearchMode>('normal');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Per-tab scoping: reset on scope change.
  useEffect(() => {
    setMode('normal');
    setInput('');
    setQuery('');
    setCurrentMatchIdx(0);
  }, [scopeKey]);

  // `logs.length` is in the dep array because the supervisor mutates
  // the same array in place — the reference doesn't change when lines
  // are appended, so we'd miss them without an explicit length signal.
  // Re-running the full scan is bounded by the 30fps render throttle
  // upstream, so a 10k-line buffer × 30fps × ~1µs per includes() is
  // single-digit CPU.
  const matches = useMemo<number[]>(() => {
    if (!query) {
      return [];
    }
    const needle = query.toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < logs.length; i++) {
      const line = logs[i];
      if (line && line.toLowerCase().includes(needle)) {
        out.push(i);
      }
    }
    return out;
  }, [logs, query, logs.length]);

  const currentMatchLine = matches[currentMatchIdx] ?? null;

  return useMemo(
    () => ({
      mode,
      input,
      query,
      matches,
      currentMatchIdx,
      currentMatchLine,
      enter: () => {
        setMode('searching');
        setInput(query); // prefill from active query
      },
      cancel: () => {
        setMode('normal');
        setInput('');
      },
      commit: () => {
        const q = input.trim();
        setMode('normal');
        setQuery(q);
        setCurrentMatchIdx(0);
        if (q.length === 0) {
          setInput('');
        }
      },
      type: (ch) => setInput((s) => s + ch),
      backspace: () => setInput((s) => s.slice(0, -1)),
      next: () => {
        if (matches.length > 0) {
          setCurrentMatchIdx((i) => (i + 1) % matches.length);
        }
      },
      prev: () => {
        if (matches.length > 0) {
          setCurrentMatchIdx((i) => (i - 1 + matches.length) % matches.length);
        }
      },
      clear: () => {
        setMode('normal');
        setQuery('');
        setInput('');
        setCurrentMatchIdx(0);
      },
    }),
    [mode, input, query, matches, currentMatchIdx, currentMatchLine]
  );
}
