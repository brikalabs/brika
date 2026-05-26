import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useState } from 'react';
import { writeEntry } from '../actions';
import { joinPath } from '../helpers';
import type { UploadItem } from '../types';

const CLEAR_DONE_AFTER_MS = 2_000;

interface UseUploadsOptions {
  onAllDone: () => void | Promise<void>;
}

interface UseUploadsResult {
  queue: UploadItem[];
  upload: (files: FileList | File[], targetDir: string) => Promise<void>;
}

function updateStatus(id: string, patch: Partial<UploadItem>) {
  return (prev: UploadItem[]): UploadItem[] =>
    prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function dropDone(prev: UploadItem[]): UploadItem[] {
  return prev.filter((q) => q.status !== 'done');
}

/**
 * Owns the upload queue and drives a sequential `writeEntry` action call
 * per file. Each row walks `pending → uploading → done | error`. Done
 * rows are cleared after a short window so users see the confirmation
 * before they disappear.
 *
 * `onAllDone` fires once per batch — typically a directory reload.
 */
export function useUploads({ onAllDone }: UseUploadsOptions): UseUploadsResult {
  // Suppress the default per-call toast: failed uploads already appear
  // inline in the queue row with their error message, so a toast on top
  // would spam the user (especially on multi-file batches).
  const callAction = useCallAction({ toastOnError: false });
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const upload = useCallback(
    async (files: FileList | File[], targetDir: string) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      const newItems: UploadItem[] = fileArray.map((file) => ({
        id: `${Date.now()}-${file.name}`,
        file,
        status: 'pending',
      }));
      setQueue((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        setQueue(updateStatus(item.id, { status: 'uploading' }));
        try {
          // File goes as the raw POST body; path rides X-Brika-Action-Meta
          // header. Plugin handler receives `{ path, body: Uint8Array }`.
          await callAction(writeEntry, item.file, {
            meta: { path: joinPath(targetDir, item.file.name) },
          });
          setQueue(updateStatus(item.id, { status: 'done' }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setQueue(updateStatus(item.id, { status: 'error', error: message }));
        }
      }

      await onAllDone();
      setTimeout(() => setQueue(dropDone), CLEAR_DONE_AFTER_MS);
    },
    [callAction, onAllDone]
  );

  return { queue, upload };
}
