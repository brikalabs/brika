/**
 * User-facing formatters: byte counts (SI units, matches Finder/Explorer)
 * and friendly mtime labels.
 */

import type { Translate } from './i18n';

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
export function formatRelativeTime(epochMs: number, t: Translate): string {
  if (epochMs === 0) {
    return '—';
  }

  const diffSec = Math.round((Date.now() - epochMs) / 1_000);
  if (diffSec < 60) {
    return t('fileBrowser.time.justNow');
  }
  if (diffSec < 3_600) {
    return t('fileBrowser.time.minAgo', { count: Math.round(diffSec / 60) });
  }
  if (diffSec < 86_400) {
    return t('fileBrowser.time.hrAgo', { count: Math.round(diffSec / 3_600) });
  }
  if (diffSec < 2 * 86_400) {
    return t('fileBrowser.time.yesterday');
  }

  const d = new Date(epochMs);
  const month = MONTHS[d.getMonth()];
  if (month === undefined) {
    return '—';
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${month} ${d.getDate()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}
