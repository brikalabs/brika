/**
 * Update Routes
 *
 * Endpoints for checking and applying Brika hub updates.
 * Used by the frontend to show update notifications and trigger upgrades.
 */

import { Conflict, createSSEStream, group, Locked, route } from '@brika/router';
import { z } from 'zod';
import { MigrationStatus } from '@/runtime/bootstrap/plugins/migrations';
import { RESTART_CODE } from '@/runtime/restart-code';
import { UpdateService } from '@/runtime/updates';
import { CompatReportBuilder } from '@/runtime/updates/compat-report';
import { UpdateOrchestrator } from '@/runtime/updates/orchestrator';
import { UpdateRefusedError } from '@/runtime/updates/strategies';
import { UpdateLockHeldError } from '@/runtime/updates/update-lock';
import type { UpdatePhase } from '@/updater';

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
    /**
     * GET /api/system/migrations — last migration run report.
     *
     * Returns `{completedAt, reports}` once the boot-time migration
     * pass finishes. The UI polls this on mount and renders a banner
     * if any scope took > 500 ms or reported failures, so the user
     * sees long migrations rather than wondering why the hub seems
     * slow on first boot after an upgrade.
     */
    route.get({
      path: '/migrations',
      handler: ({ inject }) => {
        const status = inject(MigrationStatus);
        return status.snapshot;
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
     * GET /api/system/update/compat
     * Pre-flight compatibility report against the latest available
     * version. Used by the UpdateDialog to surface
     * "this update will disable N plugins" before the user commits.
     */
    route.get({
      path: '/compat',
      handler: async ({ inject }) => {
        const updates = inject(UpdateService);
        const builder = inject(CompatReportBuilder);
        const info = await updates.check();
        return builder.build(info.latestVersion);
      },
    }),

    /**
     * POST /api/system/update/apply
     * Apply the latest update. Streams progress via SSE.
     * After a successful update, the hub process exits so the process manager can restart it.
     *
     * Refusal codes are surfaced *before* the SSE stream opens, as a
     * conventional JSON error response, so the client can render a
     * proper "you can't update from here" banner instead of an
     * orphaned error event:
     *
     *   - 409 Conflict  → the strategy refuses (container,
     *     system-package, dev) — `code` + `guidance` in the body
     *   - 423 Locked    → another caller already holds the update lock
     */
    route.post({
      path: '/apply',
      query: z.object({
        force: z.coerce.boolean().optional(),
      }),
      handler: async ({ inject, query }) => {
        const orchestrator = inject(UpdateOrchestrator);

        if (!orchestrator.canApply()) {
          // Route refusals through the strategy's own rejection so the
          // guidance string lives in exactly one place (the strategy).
          // The await never resolves — refused strategies always reject —
          // so the throw below is unreachable, but TypeScript needs it.
          try {
            await orchestrator.apply({ force: query.force });
          } catch (err) {
            if (err instanceof UpdateRefusedError) {
              throw new Conflict(err.message, { code: err.code, guidance: err.guidance });
            }
            throw err;
          }
          throw new Conflict('Update refused');
        }

        return createSSEStream((send, close) => {
          const sendProgress = (phase: UpdatePhase, message: string, error?: string) => {
            send({ phase, message, error }, 'progress');
          };

          (async () => {
            try {
              const result = await orchestrator.apply({
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

              setTimeout(() => process.exit(RESTART_CODE), 1000);
            } catch (error) {
              if (error instanceof UpdateLockHeldError) {
                sendProgress('error', error.message, error.message);
                close();
                throw new Locked(error.message, { heldBy: error.heldBy });
              }
              if (error instanceof UpdateRefusedError) {
                sendProgress('error', error.message, error.message);
                close();
                throw new Conflict(error.message, {
                  code: error.code,
                  guidance: error.guidance,
                });
              }
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
