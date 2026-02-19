/**
 * Update Routes
 *
 * Endpoints for checking and applying Brika hub updates.
 * Used by the frontend to show update notifications and trigger upgrades.
 */

import { group, route } from '@brika/router';
import { UpdateService } from '@/runtime/updates';
import { applyUpdate } from '@/updater';

export const updateRoutes = group('/api/system/update', [
  /**
   * GET /api/system/update
   * Check for available updates (uses cached result if recent, otherwise checks now)
   */
  route.get('/', async ({ inject }) => {
    const updates = inject(UpdateService);
    const info = await updates.check();
    return {
      ...info,
      lastCheckedAt: updates.lastCheckedAt,
    };
  }),

  /**
   * POST /api/system/update
   * Apply the latest update. Returns progress via JSON response.
   * The hub should be restarted after a successful update.
   */
  route.post('/apply', async () => {
    try {
      const result = await applyUpdate();
      return {
        ok: true,
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
        message: `Updated from v${result.previousVersion} to v${result.newVersion}. Restart required.`,
        restartRequired: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message,
        restartRequired: false,
      };
    }
  }),
]);
