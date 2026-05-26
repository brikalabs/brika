import type { FsEntry, SortKey } from '../types';

const COMPARATORS: Record<SortKey, (a: FsEntry, b: FsEntry) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  newest: (a, b) => b.mtime - a.mtime,
  oldest: (a, b) => a.mtime - b.mtime,
  largest: (a, b) => b.size - a.size,
  smallest: (a, b) => a.size - b.size,
};

/** Sort entries with folders before files, then by the chosen key. */
export function sortEntries(entries: FsEntry[], key: SortKey): FsEntry[] {
  const byKey = COMPARATORS[key];
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
