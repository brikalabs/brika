/**
 * Generic hook that fetches an HTTP resource from the hub and refreshes
 * whenever the hub's state transitions (e.g. starts running). Returns
 * loading / data / error so views can render all three branches.
 *
 *   const { data, error, loading, refresh } = useHubResource(fetchPlugins, []);
 *
 * `deps` are forwarded to `useEffect` so callers can trigger refreshes
 * on prop changes. The hub-status dependency is added automatically.
 */

import { useCallback, useEffect, useState } from 'react';
import { useCli } from './useCli';

export interface HubResource<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function useHubResource<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): HubResource<T> {
  const cli = useCli();
  const running = cli.hub.state === 'running';
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!running) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await fetcher();
        if (cancelled) {
          return;
        }
        setData(next);
        setError(null);
      } catch (e) {
        if (cancelled) {
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [running, tick, fetcher, ...deps]);

  return { data, error, loading, refresh };
}
