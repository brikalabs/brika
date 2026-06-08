import { toast } from '@brika/sdk/ui-kit';
import { useCallAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useState } from 'react';
import { writeEntry } from '../actions';
import { joinPath } from '../lib/path';
import type { UploadItem } from '../types';

interface UseUploadsOptions {
  onAllDone: () => void | Promise<void>;
}

interface UseUploadsResult {
  queue: UploadItem[];
  upload: (files: FileList | File[], targetDir: string) => Promise<void>;
}

// A tiny write completes in a few ms — too fast to register as "an upload
// happened". Floor the visible "uploading" state and hold the "uploaded"
// confirmation briefly so the ghost row reads as deliberate feedback.
const MIN_UPLOAD_MS = 450;
const DONE_LINGER_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateStatus(id: string, patch: Partial<UploadItem>) {
  return (prev: UploadItem[]): UploadItem[] =>
    prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/**
 * Owns the upload queue and drives a sequential `writeEntry` action call
 * per file. Each in-flight file surfaces as a ghost row in the listing
 * (`pending → uploading → done`); a failure raises a filename-scoped toast
 * and drops the row. When a batch finishes and the directory reloads, the
 * batch's rows retire so the freshly-listed real entries take over.
 *
 * `onAllDone` fires once per batch — typically a directory reload.
 */
export function useUploads({ onAllDone }: UseUploadsOptions): UseUploadsResult {
  const { t } = useLocale();
  // We raise our own filename-scoped error toast below, so suppress the
  // generic per-call action toast to avoid doubling up.
  const callAction = useCallAction({ toastOnError: false });
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const upload = useCallback(
    async (files: FileList | File[], targetDir: string) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      // `crypto.randomUUID()` over `${Date.now()}-${file.name}` — two
      // identical files dropped in the same millisecond would otherwise
      // share an id and the status updates would clobber each other.
      const newItems: UploadItem[] = fileArray.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
      }));
      const batchIds = new Set(newItems.map((item) => item.id));
      setQueue((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        setQueue(updateStatus(item.id, { status: 'uploading' }));
        try {
          // File goes as the raw POST body; path rides X-Brika-Action-Meta
          // header. Plugin handler receives `{ path, body: Uint8Array }`.
          // Race the write against a floor so a fast write still shows.
          await Promise.all([
            callAction(writeEntry, item.file, {
              meta: { path: joinPath(targetDir, item.file.name) },
            }),
            delay(MIN_UPLOAD_MS),
          ]);
          setQueue(updateStatus(item.id, { status: 'done' }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toast.error(t('fileBrowser.upload.failedTitle'), {
            description: `${item.file.name}: ${message}`,
          });
          // The toast is the record now — drop the failed row.
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
        }
      }

      // Hold the "uploaded" confirmation, then retire this batch's ghost rows
      // BEFORE reloading so a row never doubles with its incoming real entry.
      await delay(DONE_LINGER_MS);
      setQueue((prev) => prev.filter((q) => !batchIds.has(q.id)));
      await onAllDone();
    },
    [callAction, onAllDone, t]
  );

  return { queue, upload };
}
