import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

const POLL_INTERVAL = 500;
const POLL_TIMEOUT = 60_000;

/**
 * Poll `/api/health` after a restart-triggering action (upgrade,
 * supervisor restart). When the hub responds `ready: true`, perform a
 * **soft reconnect**:
 *
 *   1. Invalidate every React Query cache so stale data from the
 *      pre-restart hub is refetched against the new one.
 *   2. Trigger `onReconnect` if supplied (callers re-establish SSE
 *      streams here).
 *
 * Previously this hook called `globalThis.location.reload()`, which
 * works but discards unsaved UI state (form inputs, scroll position,
 * non-cached client-only state). Soft reconnect keeps the SPA mounted
 * — the user notices a brief loading flicker while queries refetch,
 * not a full page reload.
 *
 * Callers that genuinely want a full reload (e.g. recovery flows
 * that expect the new build to ship breaking client changes) can
 * pass `{ forceReload: true }` to opt back in.
 */
export interface WaitForHubOptions {
  onReconnect?: () => void;
  forceReload?: boolean;
}

export function useWaitForHub(onTimeout?: () => void, options?: WaitForHubOptions) {
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const start = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean };
          if (data.ready) {
            clearInterval(pollRef.current);
            clearTimeout(timeoutRef.current);
            if (options?.forceReload === true) {
              globalThis.location.reload();
              return;
            }
            // Soft reconnect. Invalidate *only the active* queries so
            // the freshly-restarted hub isn't thundering-herded by a
            // burst of refetches for caches that no mounted component
            // is even reading. Idle queries refresh lazily on next
            // mount. The caller re-establishes SSE streams in
            // `onReconnect` (the shared event-source pool auto-
            // reconnects on its own EventSource error event, so most
            // consumers don't need to do anything here).
            queryClient.invalidateQueries({ type: 'active' });
            options?.onReconnect?.();
          }
        }
      } catch {
        // hub not yet up, keep polling
      }
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      onTimeout?.();
    }, POLL_TIMEOUT);
  }, [onTimeout, options, queryClient]);

  const stop = useCallback(() => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
  }, []);

  return {
    start,
    stop,
  };
}
