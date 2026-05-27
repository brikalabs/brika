import { container, inject } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';
import {
  GitHubUpdateProvider,
  UpdateOrchestrator,
  UpdateProvider,
  UpdateService,
} from '@/runtime/updates';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for automatic update checking.
 *
 * Starts a background timer that periodically checks GitHub for new
 * releases. Results are cached and exposed via /api/system/update routes.
 *
 * Provider selection happens here so the rest of the hub stays
 * provider-agnostic:
 *
 *   - Production: registers `GitHubUpdateProvider`.
 *   - Dev with `BRIKA_DEV_FAKE_UPDATE` set: dynamically imports the
 *     `*.mock.ts` module (stripped from the prod binary by the
 *     `stub-mock-files` Bun.build plugin) and registers the mock
 *     provider in its place.
 *
 * The dynamic-import branch is the *only* statement in the hub that
 * mentions the mock module by path — searching for "updater.mock" in
 * production code returns one hit, here.
 */
export function updates(): BootstrapPlugin {
  return {
    name: 'updates',
    async onInit() {
      const logs = inject(Logger).withSource('updates');
      const useMock = process.env.BRIKA_DEV_FAKE_UPDATE?.trim().length;
      if (useMock) {
        try {
          // The path is a literal so the build-stub plugin can target it.
          const mod = await import('@/__dev__/updater.mock');
          mod.logMockBannerIfActive((m) => logs.warn(m));
          container.register(UpdateProvider, { useClass: mod.MockUpdateProvider });
          return;
        } catch (error) {
          logs.warn(
            'BRIKA_DEV_FAKE_UPDATE is set but the mock module is unavailable ' +
              '(stripped by the production build?). Falling back to the real provider.',
            {
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }
      container.register(UpdateProvider, { useClass: GitHubUpdateProvider });
      // NB: `recordBootAttempt()` is called from `startHub()` BEFORE
      // this plugin runs — see comment there. We only do the success
      // marker here in `onStart`.
    },
    onStart() {
      inject(UpdateService).start();
      inject(UpdateOrchestrator).recordBootSuccess();
    },
    onStop() {
      inject(UpdateService).stop();
    },
  };
}
