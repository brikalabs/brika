import type React from 'react';
import { useEffect, useState } from 'react';

// Side-effect: ensures globalThis.__brika is populated before any brick module loads.
// Top-level await in plugin-bridge guarantees this resolves before dependent modules.
import './plugin-bridge';

/** Dynamically imports a compiled plugin/brick module. */
export function useModuleImport(url: string) {
  const [Module, setModule] = useState<React.FC | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reject empty URLs and non-relative paths to prevent remote code execution
    if (!url?.startsWith('/')) {
      setModule(null);
      setError(Boolean(url));
      return;
    }
    setError(false);
    // Keep the previous Module rendered while the new bundle downloads —
    // a hot-reload swap shouldn't flash the loading spinner. We only blank
    // the Module on initial mount or on hard error.
    let cancelled = false;
    import(/* @vite-ignore */ url)
      .then((mod) => {
        if (!cancelled) {
          setModule(() => mod.default);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { Module, error };
}
