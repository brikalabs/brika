import { inject } from '@brika/di';
import { UpdateService } from '@/runtime/updates';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for automatic update checking.
 *
 * Starts a background timer that periodically checks GitHub for new releases.
 * Results are cached and exposed via /api/system/update routes.
 */
export function updates(): BootstrapPlugin {
  const service = inject(UpdateService);

  return {
    name: 'updates',
    onStart() {
      service.start();
    },
    onStop() {
      service.stop();
    },
  };
}
