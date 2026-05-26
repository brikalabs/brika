import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listEntries } from '../actions';
import type { FsEntry } from '../types';

interface UseDirectoryResult {
  entries: FsEntry[];
  loading: boolean;
  permissionDenied: boolean;
  reload: () => Promise<void>;
}

/**
 * Owns `entries / loading / permissionDenied` for a single directory path.
 * Re-fetches whenever `path` changes; exposes `reload` for mutations.
 *
 * `PERMISSION_DENIED` is surfaced as a separate flag so the caller can
 * render the consent gate without a noisy toast — we opt out of the
 * default toast in that one case and let everything else through.
 */
export function useDirectory(path: string): UseDirectoryResult {
  const [permissionDenied, setPermissionDenied] = useState(false);

  const callAction = useCallAction({
    onError: (err) => {
      const isPermDenied =
        err.code === 'PERMISSION_DENIED' || err.message.includes('PERMISSION_DENIED');
      if (isPermDenied) {
        setPermissionDenied(true);
        return false; // suppress toast — the gate handles surfacing it
      }
      return true; // chain to default toast
    },
  });
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Monotonic request id — when `path` flips A → B → A faster than the
  // server can answer, the older fetch must not clobber state seeded by
  // the newer one. Same pattern as `use-preview.ts`.
  const requestIdRef = useRef(0);

  const fetchPath = useCallback(
    async (target: string) => {
      const id = ++requestIdRef.current;
      setLoading(true);
      try {
        const data = await callAction(listEntries, { path: target });
        if (id !== requestIdRef.current) {
          return;
        }
        setPermissionDenied(false);
        setEntries(data.entries);
      } catch {
        // `onError` above already handled the permission-denied case;
        // toast covers everything else.
      } finally {
        if (id === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [callAction]
  );

  useEffect(() => {
    fetchPath(path);
  }, [path, fetchPath]);

  const reload = useCallback(() => fetchPath(path), [path, fetchPath]);

  return { entries, loading, permissionDenied, reload };
}
