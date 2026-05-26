import type { FsEntry } from '../types';

/** Compact "3 folders · 7 files / Loading… / Empty" summary for the toolbar. */
export function buildEntrySummary(entries: FsEntry[], loading: boolean): string {
  if (loading) {
    return 'Loading…';
  }
  if (entries.length === 0) {
    return 'Empty';
  }
  const folders = entries.filter((e) => e.isDirectory).length;
  const files = entries.length - folders;
  const parts: string[] = [];
  if (folders > 0) {
    parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  }
  if (files > 0) {
    parts.push(`${files} file${files === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}
