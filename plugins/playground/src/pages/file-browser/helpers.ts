import type { FsEntry, SortKey } from './types';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv']);
const TEXT_EXTS = new Set([
  'txt',
  'json',
  'md',
  'csv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
]);

/** Images larger than this threshold are shown with a generic icon instead of a thumbnail. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(extOf(name));
}

export function isTextFile(name: string): boolean {
  return TEXT_EXTS.has(extOf(name));
}

export function isPdfFile(name: string): boolean {
  return extOf(name) === 'pdf';
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXTS.has(extOf(name));
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.has(extOf(name));
}

export function joinPath(base: string, segment: string): string {
  return base.endsWith('/') ? `${base}${segment}` : `${base}/${segment}`;
}

/**
 * Format a byte count using decimal (SI) units — matches macOS Finder and
 * Windows Explorer. Directories return an em dash.
 */
export function formatSize(bytes: number, isDirectory: boolean): string {
  if (isDirectory) {
    return '—';
  }
  if (bytes < 1_000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  if (bytes < 1_000_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an epoch-ms timestamp as a short relative/absolute label. */
export function formatRelativeTime(epochMs: number): string {
  if (epochMs === 0) {
    return '—';
  }

  const diffSec = Math.round((Date.now() - epochMs) / 1_000);
  if (diffSec < 60) {
    return 'Just now';
  }
  if (diffSec < 3_600) {
    return `${Math.round(diffSec / 60)} min ago`;
  }
  if (diffSec < 86_400) {
    return `${Math.round(diffSec / 3_600)} hr ago`;
  }
  if (diffSec < 2 * 86_400) {
    return 'Yesterday';
  }

  const d = new Date(epochMs);
  const month = MONTHS[d.getMonth()];
  if (month === undefined) {
    return '—';
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${month} ${d.getDate()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

const SORT_COMPARATORS: Record<SortKey, (a: FsEntry, b: FsEntry) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  newest: (a, b) => b.mtime - a.mtime,
  oldest: (a, b) => a.mtime - b.mtime,
  largest: (a, b) => b.size - a.size,
  smallest: (a, b) => a.size - b.size,
};

/** Sort entries with folders before files, then by the chosen key. */
export function sortEntries(entries: FsEntry[], key: SortKey): FsEntry[] {
  const byKey = SORT_COMPARATORS[key];
  return [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) {
      return -1;
    }
    if (!a.isDirectory && b.isDirectory) {
      return 1;
    }
    return byKey(a, b);
  });
}
