/**
 * UpdateProvider — DI seam between the rest of the hub and "where do
 * update releases come from."
 *
 * In production the provider is {@link GitHubUpdateProvider}, which
 * delegates to the real `checkForUpdate` / `applyUpdate` functions in
 * `@/updater`. In dev, `BRIKA_DEV_FAKE_UPDATE` swaps in a
 * `MockUpdateProvider` (from `@/__dev__/updater.mock`) — but that whole
 * file is stripped from the production binary by the `stub-mock-files`
 * Bun.build plugin in `apps/build/src/plugins/stub-mock-files.ts`.
 *
 * `UpdateService` and the HTTP apply route inject through this
 * abstraction, so neither has to know whether the source is GitHub or
 * the mock. Test code can also register a `useValue`/`useClass` here
 * via `container.register(UpdateProvider, …)` and exercise either path
 * without an env var.
 */

import { injectable } from '@brika/di';
import type { UpdateChannelId } from '@/runtime/updates/channels';
import {
  type ApplyUpdateOptions,
  applyUpdate,
  checkForUpdate,
  type UpdateInfo,
  type UpdatePhase,
} from '@/updater';

export interface ApplyResult {
  previousVersion: string;
  previousCommit: string;
  newVersion: string;
  newCommit: string;
}

export interface ProviderApplyOptions {
  force?: boolean;
  channel?: UpdateChannelId;
  onProgress?: (phase: UpdatePhase, detail: string) => void;
}

/**
 * Source of update releases. Concrete implementations decide where
 * releases come from (GitHub, a local mock, a test fixture).
 *
 * Used directly as the DI token — register a concrete subclass with
 * `container.register(UpdateProvider, { useClass: … })` at bootstrap.
 *
 * The base methods throw rather than being `abstract`: tsyringe's
 * `InjectionToken<T>` only accepts concrete constructors, so making the
 * class abstract breaks the registration call. If you inject this token
 * without binding a concrete implementation, the throw surfaces the
 * misconfiguration immediately — that's the same blast radius as
 * `abstract` would give us, just at runtime.
 */
export class UpdateProvider {
  check(_channel: UpdateChannelId): Promise<UpdateInfo> {
    throw new Error(
      'UpdateProvider.check is not implemented — bootstrap must register a concrete provider.'
    );
  }
  apply(_options: ProviderApplyOptions): Promise<ApplyResult> {
    throw new Error(
      'UpdateProvider.apply is not implemented — bootstrap must register a concrete provider.'
    );
  }
}

/**
 * Real implementation: hits the GitHub Releases API and (on `apply`)
 * downloads, verifies, extracts, and swaps the local binary in place.
 *
 * Wraps the module-level functions in `@/updater` so unit tests that
 * import them directly keep working unchanged.
 */
@injectable()
export class GitHubUpdateProvider extends UpdateProvider {
  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(options: ProviderApplyOptions): Promise<ApplyResult> {
    const args: ApplyUpdateOptions = {
      force: options.force,
      channel: options.channel,
      onProgress: options.onProgress,
    };
    return applyUpdate(args);
  }
}
