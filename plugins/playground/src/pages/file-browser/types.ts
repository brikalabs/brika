export interface FsEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  /** File size in bytes; 0 for directories and symlinks. */
  size: number;
  /** Last-modified time as Unix epoch milliseconds; 0 if unknown. */
  mtime: number;
}

/** Resolved metadata about a previewed file, shown in the panel header. */
export interface PreviewMeta {
  /** Size in bytes as reported by the materialised blob. */
  size: number;
  /** Effective MIME type — from the action response or "application/octet-stream". */
  contentType: string;
  /** Last-modified time copied from the directory listing (0 if unknown). */
  mtime: number;
  /** Virtual path inside `/data` — handy for "copy path" affordances. */
  virtualPath: string;
}

/**
 * Materialised preview ready for the panel to render.
 *
 * `image | pdf | audio | video | generic` carry a blob URL backed by
 * the bytes that came down the `readEntry` action; `text` carries
 * already-decoded content; `none` is the empty state. Blob URLs are
 * owned by the `usePreview` hook and revoked when the kind transitions.
 */
export type PreviewState =
  | { kind: 'none' }
  | { kind: 'image'; name: string; url: string; meta: PreviewMeta }
  | { kind: 'pdf'; name: string; url: string; meta: PreviewMeta }
  | { kind: 'audio'; name: string; url: string; meta: PreviewMeta }
  | { kind: 'video'; name: string; url: string; meta: PreviewMeta }
  | { kind: 'generic'; name: string; url: string; meta: PreviewMeta }
  | { kind: 'text'; name: string; content: string; meta: PreviewMeta };

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
}

export type SortKey = 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest';
