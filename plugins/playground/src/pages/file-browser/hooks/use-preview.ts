import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readEntry } from '../actions';
import { isAudioFile, isImageFile, isPdfFile, isTextFile, isVideoFile, joinPath } from '../helpers';
import type { FsEntry, PreviewState } from '../types';

interface UsePreviewOptions {
  currentPath: string;
}

interface UsePreviewResult {
  preview: PreviewState;
  loading: boolean;
  open: (entry: FsEntry) => Promise<void>;
  close: () => void;
  closeIfMatches: (name: string) => void;
}

function previewKindFor(name: string): PreviewState['kind'] {
  if (isImageFile(name)) {
    return 'image';
  }
  if (isPdfFile(name)) {
    return 'pdf';
  }
  if (isAudioFile(name)) {
    return 'audio';
  }
  if (isVideoFile(name)) {
    return 'video';
  }
  if (isTextFile(name)) {
    return 'text';
  }
  return 'generic';
}

/**
 * Owns preview state for the file browser.
 *
 * Calls the `readEntry` action which returns a `Blob` directly (the hub
 * forwards bytes from `binaryResponse` with the matching Content-Type —
 * no base64 anywhere). The hook tracks the blob URL it minted so it
 * can `URL.revokeObjectURL` it when the preview changes or unmounts.
 *
 * The blob also carries `size` and `type`, which we capture for the
 * preview header (see `PreviewState.meta`).
 */
export function usePreview({ currentPath }: UsePreviewOptions): UsePreviewResult {
  const callAction = useCallAction();
  const [preview, setPreview] = useState<PreviewState>({ kind: 'none' });
  const [loading, setLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  /**
   * Path of the currently-rendered preview. Held in a ref so `open`
   * can early-return when the user clicks the same entry repeatedly,
   * without including the whole `preview` state in the callback's
   * deps (which would otherwise re-create it on every render).
   */
  const openPathRef = useRef<string | null>(null);

  const releaseBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    openPathRef.current = null;
  }, []);

  useEffect(() => releaseBlobUrl, [releaseBlobUrl]);

  const close = useCallback(() => {
    releaseBlobUrl();
    setPreview({ kind: 'none' });
  }, [releaseBlobUrl]);

  const open = useCallback(
    async (entry: FsEntry) => {
      const name = entry.name;
      const path = joinPath(currentPath, name);
      // Re-clicking the entry that's already open is a no-op — every
      // `readEntry` call loads the full file into memory at both the
      // plugin process and the page (blob), so without this guard a
      // user can balloon RAM by clicking the same 100 MB video 10x
      // before GC catches up.
      if (openPathRef.current === path) {
        return;
      }
      const kind = previewKindFor(name);
      setLoading(true);
      try {
        const blob = await callAction(readEntry, { path });
        releaseBlobUrl();
        const meta = {
          size: blob.size,
          contentType: blob.type || 'application/octet-stream',
          mtime: entry.mtime,
          virtualPath: path,
        };
        openPathRef.current = path;
        if (kind === 'text') {
          setPreview({ kind: 'text', name, content: await blob.text(), meta });
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setPreview({ kind, name, url: blobUrl, meta });
      } catch {
        // Toast already fired.
      } finally {
        setLoading(false);
      }
    },
    [callAction, currentPath, releaseBlobUrl]
  );

  const closeIfMatches = useCallback(
    (name: string) => {
      setPreview((p) => {
        if (p.kind !== 'none' && p.name === name) {
          releaseBlobUrl();
          return { kind: 'none' };
        }
        return p;
      });
    },
    [releaseBlobUrl]
  );

  return { preview, loading, open, close, closeIfMatches };
}
