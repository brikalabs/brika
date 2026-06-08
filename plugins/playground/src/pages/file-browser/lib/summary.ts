import type { FsEntry } from '../types';
import type { Translate } from './i18n';

/** Compact "3 folders · 7 files / Loading… / Empty" summary for the toolbar. */
export function buildEntrySummary(entries: FsEntry[], loading: boolean, t: Translate): string {
  if (loading) {
    return t('fileBrowser.summary.loading');
  }
  if (entries.length === 0) {
    return t('fileBrowser.summary.empty');
  }
  const folders = entries.filter((e) => e.isDirectory).length;
  const files = entries.length - folders;
  const parts: string[] = [];
  if (folders > 0) {
    const key = folders === 1 ? 'fileBrowser.summary.folderOne' : 'fileBrowser.summary.folderOther';
    parts.push(t(key, { count: folders }));
  }
  if (files > 0) {
    const key = files === 1 ? 'fileBrowser.summary.fileOne' : 'fileBrowser.summary.fileOther';
    parts.push(t(key, { count: files }));
  }
  return parts.join(' · ');
}
