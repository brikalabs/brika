import type { InstallProgress } from '@brika/shared';
import type { TFunction } from 'i18next';

/**
 * Get human-readable label for installation progress phase
 */
export function getPhaseLabel(
  progress: InstallProgress | null,
  t: TFunction,
  mode?: 'update' | 'reinstall'
): string {
  if (!progress) return '';

  let action: string;
  if (mode === 'reinstall') {
    action = t('plugins:actions.reinstall');
  } else if (mode === 'update') {
    action = t('plugins:actions.update');
  } else {
    action = t('store:install.title');
  }

  switch (progress.phase) {
    case 'resolving':
      return t('plugins:progress.resolving');
    case 'downloading':
      return t('plugins:progress.downloading');
    case 'linking':
      return t('plugins:progress.linking');
    case 'complete':
      return t('plugins:progress.complete', { action });
    case 'error':
      return t('plugins:progress.failed', { action });
    default:
      return '';
  }
}
