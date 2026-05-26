import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback } from 'react';
import { deleteEntry as deleteEntryAction } from '../actions';
import { joinPath } from '../lib/path';
import type { FsEntry } from '../types';

interface UseDeleteOptions {
  currentPath: string;
  onDeleted: (entry: FsEntry) => void | Promise<void>;
}

/**
 * Returns a callback that removes a single entry under `currentPath`
 * and forwards the entry to `onDeleted` so the parent can close the
 * preview / reload the directory.
 */
export function useDelete({ currentPath, onDeleted }: UseDeleteOptions) {
  const callAction = useCallAction();

  return useCallback(
    async (entry: FsEntry) => {
      try {
        await callAction(deleteEntryAction, { path: joinPath(currentPath, entry.name) });
        await onDeleted(entry);
      } catch {
        // Toast already fired.
      }
    },
    [callAction, currentPath, onDeleted]
  );
}
