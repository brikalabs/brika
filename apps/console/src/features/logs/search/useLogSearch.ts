/**
 * Server-side log search — wraps the hub's `/api/logs` endpoint, the
 * same one the web UI uses. Pushes filtering into the hub's SQLite
 * store instead of grep-scanning the in-memory ring buffer per render,
 * so a `/needle` over a 5k-line tail stays responsive.
 *
 *   const search = useLogSearch();
 *   search.commit('error');                // fires query
 *   search.results;                        // ReadonlyArray<StoredLogEventDto>
 *   search.next(); search.prev();          // navigate matches
 *   search.clear();                        // back to live tail
 *
 * UX shape mirrors the on-screen flow:
 *   - `enter()`           — open the input (draft mode).
 *   - `commit(query)`     — submit; cancels any in-flight fetch and
 *                            starts a fresh one. `query=''` resets to
 *                            live tail and clears state.
 *   - `cancel()`          — abandon draft, back to whatever's active.
 *   - `next()` / `prev()` — cycle through `results`.
 *   - `clear()`           — kill the active query AND results.
 *
 * Debounce: the consumer drives commit (Enter key), so we don't add
 * internal typing debounce — explicit submission is the contract.
 * Each `commit` aborts the previous fetch via `AbortController` so a
 * fast typist doesn't queue stale results.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LogQueryParams, queryLogs, type StoredLogEventDto } from '../../../shared/cli/api';

const DEFAULT_LIMIT = 500;

export type LogSearchMode = 'idle' | 'editing' | 'loading' | 'ready' | 'error';

export interface LogSearchControls {
  readonly mode: LogSearchMode;
  /** Committed query — empty when no search is active. */
  readonly query: string;
  /** Result set from the last commit; `[]` when no query is active. */
  readonly results: ReadonlyArray<StoredLogEventDto>;
  /** Index into `results` for the highlighted "current" match. */
  readonly currentIdx: number;
  /** Current match's `LogEventDto`, or `null` when results are empty. */
  readonly current: StoredLogEventDto | null;
  /** Error message from the last query, or `null`. */
  readonly error: string | null;

  /** Enter "editing" mode (caller renders an Input). */
  readonly enter: () => void;
  /** Abandon the draft, restore the previous active state. */
  readonly cancel: () => void;
  /** Submit a query. Empty string clears + returns to live tail. */
  readonly commit: (query: string) => void;
  /** Move to the next / previous match (wraps). */
  readonly next: () => void;
  readonly prev: () => void;
  /** Drop the query + results. Returns to live tail. */
  readonly clear: () => void;
}

export interface UseLogSearchOptions {
  /** Per-query result cap. Defaults to 500 (matches the web UI). */
  readonly limit?: number;
  /** Extra filters folded into every commit (level, source, plugin,
   *  date range). Currently unused but threaded through so future
   *  filter UIs can opt in without re-plumbing the hook. */
  readonly extraParams?: Omit<LogQueryParams, 'search' | 'cursor' | 'limit' | 'order'>;
}

export function useLogSearch(opts: Readonly<UseLogSearchOptions> = {}): LogSearchControls {
  const [mode, setMode] = useState<LogSearchMode>('idle');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<StoredLogEventDto>>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Track the in-flight fetch so a follow-up commit can abort it.
  const inFlightRef = useRef<AbortController | null>(null);
  const extraParamsRef = useRef(opts.extraParams);
  extraParamsRef.current = opts.extraParams;
  const limitRef = useRef(opts.limit ?? DEFAULT_LIMIT);
  limitRef.current = opts.limit ?? DEFAULT_LIMIT;

  // Mirror `results` into a ref so `next` / `prev` can read the live
  // length without abusing `setResults((cur) => cur)` as a "read state"
  // hack (which trips Sonar S3516 — a setter that always returns the
  // same value).
  const resultsRef = useRef(results);
  resultsRef.current = results;

  // Cancel any in-flight request when the component unmounts so a
  // stale response never resurrects unmounted state.
  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
    };
  }, []);

  const runQuery = useCallback(async (q: string): Promise<void> => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setMode('loading');
    setError(null);
    try {
      const res = await queryLogs(
        {
          ...extraParamsRef.current,
          search: q,
          limit: limitRef.current,
          order: 'asc',
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        return;
      }
      setResults(res.logs);
      setCurrentIdx(0);
      setMode('ready');
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
        return;
      }
      setResults([]);
      setError(e instanceof Error ? e.message : String(e));
      setMode('error');
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
    }
  }, []);

  const enter = useCallback(() => setMode('editing'), []);

  const cancel = useCallback(() => {
    setMode(query.length > 0 ? 'ready' : 'idle');
  }, [query]);

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      setQuery(trimmed);
      if (trimmed.length === 0) {
        inFlightRef.current?.abort();
        setResults([]);
        setError(null);
        setCurrentIdx(0);
        setMode('idle');
        return;
      }
      void runQuery(trimmed);
    },
    [runQuery]
  );

  const next = useCallback(() => {
    const total = resultsRef.current.length;
    if (total === 0) {
      return;
    }
    setCurrentIdx((i) => (i + 1) % total);
  }, []);

  const prev = useCallback(() => {
    const total = resultsRef.current.length;
    if (total === 0) {
      return;
    }
    setCurrentIdx((i) => (i - 1 + total) % total);
  }, []);

  const clear = useCallback(() => {
    inFlightRef.current?.abort();
    setQuery('');
    setResults([]);
    setError(null);
    setCurrentIdx(0);
    setMode('idle');
  }, []);

  const current = results[currentIdx] ?? null;

  return useMemo<LogSearchControls>(
    () => ({
      mode,
      query,
      results,
      currentIdx,
      current,
      error,
      enter,
      cancel,
      commit,
      next,
      prev,
      clear,
    }),
    [mode, query, results, currentIdx, current, error, enter, cancel, commit, next, prev, clear]
  );
}
