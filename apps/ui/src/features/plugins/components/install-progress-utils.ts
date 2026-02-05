import type { InstallProgress } from '@brika/shared';

/**
 * Get human-readable label for installation progress phase
 */
export function getPhaseLabel(
  progress: InstallProgress | null,
  mode?: 'update' | 'reinstall'
): string {
  if (!progress) return '';

  const action = mode === 'reinstall' ? 'Reinstall' : mode === 'update' ? 'Update' : 'Installation';

  switch (progress.phase) {
    case 'resolving':
      return 'Resolving dependencies...';
    case 'downloading':
      return 'Downloading packages...';
    case 'linking':
      return 'Linking packages...';
    case 'complete':
      return `${action} complete!`;
    case 'error':
      return `${action} failed`;
    default:
      return '';
  }
}
