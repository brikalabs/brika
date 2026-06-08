/**
 * Update Routes
 *
 * Endpoints for checking and applying Brika hub updates.
 * Used by the frontend to show update notifications and trigger upgrades.
 *
 * **Authorization**: the read endpoints are exposed to any authenticated
 * session (so the UI's update badge works for non-admin viewers), but
 * the dangerous write endpoints — apply, restart, stop — and the
 * plugin-enumerating compat report sit behind `Scope.ADMIN_ALL`. The
 * gating is composed in `routes/index.ts`; the route exports below are
 * split into `*ReadRoutes` (authed) and `*AdminRoutes` (admin) groups
 * so the index can wrap each appropriately.
 */

import { Analytics } from '@brika/analytics';
import { Conflict, createSSEStream, group, Locked, route } from '@brika/router';
import { z } from 'zod';
import { MigrationStatus } from '@/runtime/bootstrap/plugins/migrations';
import { RESTART_CODE } from '@/runtime/restart-code';
import { StateStore } from '@/runtime/state/state-store';
import { UpdateService } from '@/runtime/updates';
import { CompatReportBuilder } from '@/runtime/updates/compat-report';
import { UpdateOrchestrator } from '@/runtime/updates/orchestrator';
import { UpdateRefusedError } from '@/runtime/updates/strategies';
import type { UpdatePhase } from '@/runtime/updates/updater';

// ─── Public-ish (authed) read endpoints ──────────────────────────────────────

export const systemReadRoutes = group({
  prefix: '/api/system',
  routes: [
    /**
     * GET /api/system/migrations — last migration run report.
     *
     * Migration IDs are operator-facing info, not secrets — leaving this
     * authed (not admin) so the UI banner works for everyone.
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

export const updateReadRoutes = group({
  prefix: '/api/system/update',
  routes: [
    /**
     * GET /api/system/update
     * Check for available updates.
     *
     * - default: serves cached info if within TTL + channel matches
     * - `?refresh=true`: force a remote fetch (the UI's "Check now"
     *   button passes this so the user gets a real network round-trip
     *   instead of a 6-hour-stale cache hit)
     *
     * Authed (not admin) — the UI shows an update badge to every user.
     */
    route.get({
      path: '/',
      query: z.object({
        refresh: z.coerce.boolean().optional(),
      }),
      handler: async ({ inject, query }) => {
        const updates = inject(UpdateService);
        const info = query.refresh ? await updates.refresh() : await updates.check();
        return {
          ...info,
          lastCheckedAt: updates.lastCheckedAt,
        };
      },
    }),
  ],
});

// ─── Admin-only write endpoints ──────────────────────────────────────────────

export const systemAdminRoutes = group({
  prefix: '/api/system',
  routes: [
    /** POST /api/system/restart — signal supervisor to restart the hub */
    route.post({
      path: '/restart',
      handler: ({ inject }) => {
        inject(Analytics).capture('system.restart_requested');
        setTimeout(() => process.exit(RESTART_CODE), 100);
        return { ok: true };
      },
    }),
    /** POST /api/system/stop — shut down the hub and supervisor */
    route.post({
      path: '/stop',
      handler: ({ inject }) => {
        inject(Analytics).capture('system.stop_requested');
        setTimeout(() => process.exit(0), 100);
        return { ok: true };
      },
    }),
  ],
});

export const updateAdminRoutes = group({
  prefix: '/api/system/update',
  routes: [
    /**
     * GET /api/system/update/compat
     * Pre-flight compatibility report. Admin-only — enumerating every
     * installed plugin name on a multi-user hub is a low-grade info
     * disclosure even if the names themselves aren't secret.
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
     * POST /api/system/update/apply — admin-only.
     * Streams progress via SSE. After a successful update the hub
     * process exits and the supervisor restarts it.
     *
     * Pre-stream error responses:
     *   - 409 Conflict — strategy refuses (container, system-package,
     *     dev); body carries `code` + `guidance`.
     *   - 423 Locked   — another caller holds the update lock; body
     *     carries `heldBy` for diagnostics.
     *
     * Errors during the stream go out as `phase: 'error'` events;
     * throwing after `close()` would only leak an unhandled rejection.
     */
    route.post({
      path: '/apply',
      query: z.object({
        force: z.coerce.boolean().optional(),
      }),
      handler: async ({ inject, query }) => {
        const orchestrator = inject(UpdateOrchestrator);
        const analytics = inject(Analytics);

        if (!orchestrator.canApply()) {
          // Route refusals through the strategy's own rejection so the
          // guidance string lives in one place (the strategy).
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

        // Pre-stream lock check: if someone else has the lock, we want
        // a real 423 response BEFORE opening the SSE stream so the
        // client can render a "wait for the other apply" panel
        // instead of an opaque error event.
        //
        // The full holder metadata (pid + startedAt) goes to the audit
        // log; the response body carries only `since` so we don't leak
        // the running process's pid to every authenticated client.
        const heldBy = orchestrator.peekLockHolder();
        if (heldBy !== null) {
          throw new Locked('Update already in progress', { since: heldBy.startedAt });
        }

        return createSSEStream((send, close) => {
          const sendProgress = (phase: UpdatePhase, message: string, error?: string) => {
            send({ phase, message, error }, 'progress');
          };

          analytics.capture('update.apply_started', { forced: query.force === true });

          (async () => {
            try {
              const state = inject(StateStore);
              const result = await orchestrator.apply({
                force: query.force,
                channel: state.getUpdateChannel(),
                pinnedVersion: state.getPinnedVersion(),
                onProgress(phase, detail) {
                  sendProgress(phase, detail);
                },
              });

              analytics.capture('update.apply_completed', {
                fromVersion: result.previousVersion,
                toVersion: result.newVersion,
              });

              sendProgress(
                'restarting',
                `Updated v${result.previousVersion} → v${result.newVersion}. Restarting...`
              );
              close();

              // Latch the orchestrator so any apply request landing in
              // the 1 s window before the actual exit is refused
              // rather than starting a second download that the exit
              // signal would kill mid-flight.
              orchestrator.markRestartPending();
              setTimeout(() => process.exit(RESTART_CODE), 1000);
            } catch (error) {
              // Once the SSE response is committed we can't switch it
              // to a JSON error body. Surface every failure as a
              // structured `'error'` progress event.
              const message = error instanceof Error ? error.message : String(error);
              analytics.capture('update.apply_failed', {
                reason: error instanceof Error ? error.name : 'unknown',
              });
              sendProgress('error', message, message);
              close();
            }
          })();
        });
      },
    }),
  ],
});
