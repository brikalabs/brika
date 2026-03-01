/**
 * Update Routes
 *
 * Endpoints for checking and applying Brika hub updates.
 * Used by the frontend to show update notifications and trigger upgrades.
 */

import { createSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { RESTART_CODE } from '@/cli/utils/runtime';
import { UpdateService } from '@/runtime/updates';
import { applyUpdate, type UpdatePhase } from '@/updater';

export const systemRoutes = group({
  prefix: '/api/system',
  routes: [
    /** POST /api/system/restart — signal supervisor to restart the hub */
    route.post({
      path: '/restart',
      handler: () => {
        setTimeout(() => process.exit(RESTART_CODE), 100);
        return {
          ok: true,
        };
      },
    }),
    /** POST /api/system/stop — shut down the hub and supervisor */
    route.post({
      path: '/stop',
      handler: () => {
        setTimeout(() => process.exit(0), 100);
        return {
          ok: true,
        };
      },
    }),
  ],
});

export const updateRoutes = group({
  prefix: '/api/system/update',
  routes: [
    /**
     * GET /api/system/update
     * Check for available updates (uses cached result if recent, otherwise checks now)
     */
    route.get({
      path: '/',
      handler: async ({ inject }) => {
        const updates = inject(UpdateService);
        const info = await updates.check();
        return {
          ...info,
          lastCheckedAt: updates.lastCheckedAt,
        };
      },
    }),

    /**
     * POST /api/system/update/apply
     * Apply the latest update. Streams progress via SSE.
     * After a successful update, the hub process exits so the process manager can restart it.
     */
    route.post({
      path: '/apply',
      query: z.object({
        force: z.coerce.boolean().optional(),
      }),
      handler: ({ query }) => {
        return createSSEStream((send, close) => {
          const sendProgress = (phase: UpdatePhase, message: string, error?: string) => {
            send(
              {
                phase,
                message,
                error,
              },
              'progress'
            );
          };

          (async () => {
            try {
              const result = await applyUpdate({
                force: query.force,
                onProgress(phase, detail) {
                  sendProgress(phase, detail);
                },
              });

              sendProgress(
                'restarting',
                `Updated v${result.previousVersion} → v${result.newVersion}. Restarting...`
              );
              close();

              // Give the SSE stream time to flush, then signal supervisor to restart
              setTimeout(() => process.exit(RESTART_CODE), 1000);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              sendProgress('error', message, message);
              close();
            }
          })();
        });
      },
    }),
  ],
});
