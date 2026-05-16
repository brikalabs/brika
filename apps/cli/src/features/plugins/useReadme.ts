/**
 * Fetches a markdown README for a given key (plugin uid or package name).
 * Shared between the installed and registry detail pages — the only
 * difference is which API call provides the source, so the hook takes
 * the fetcher as an argument.
 *
 * Re-fetches when `key` changes; cancels stale responses via an
 * `await`-side `cancelled` flag so navigating between plugins doesn't
 * resurrect an unmounted detail page's state.
 */

import { useEffect, useState } from 'react';

export interface UseReadme {
  readonly text: string | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function useReadme(fetcher: (key: string) => Promise<string>, key: string): UseReadme {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const result = await fetcher(key);
        if (!cancelled) {
          setText(result);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetcher, key]);

  return { text, loading, error };
}
