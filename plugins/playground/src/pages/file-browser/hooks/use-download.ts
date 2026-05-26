import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback } from 'react';
import { readEntry } from '../actions';
import { triggerDownload } from '../lib/download';
import { joinPath } from '../lib/path';
import type { FsEntry } from '../types';

/**
 * Imperative file download — reads the entry as a blob, mints a blob
 * URL, and clicks an anchor tag. Same `streamFile` path as the
 * preview, so even huge files stay flat-memory on the way through.
 *
 * Returns a callback that takes a directory entry (relative to
 * `currentPath`); the blob URL is revoked a second later, which is
 * plenty of time for the browser to start the download.
 */
export function useFileDownload(currentPath: string) {
  const callAction = useCallAction();

  return useCallback(
    async (entry: FsEntry) => {
      try {
        const blob = await callAction(readEntry, {
          path: joinPath(currentPath, entry.name),
        });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, entry.name);
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } catch {
        // Toast already fired by `useCallAction`'s default error path.
      }
    },
    [callAction, currentPath]
  );
}
