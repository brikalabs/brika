/**
 * Update Service
 *
 * Background service that periodically checks for Brika updates.
 * Caches the result so the UI can show an update badge without extra API calls.
 */

import { inject, singleton } from '@brika/di';
import { UpdateActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';
import { UpdateProvider } from '@/runtime/updates/update-provider';
import { noUpdateInfo, type UpdateInfo } from '@/updater';

/** Check every 6 hours */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

@singleton()
export class UpdateService {
  readonly #logs = inject(Logger).withSource('updates');
  readonly #events = inject(EventSystem);
  readonly #state = inject(StateStore);
  readonly #provider = inject(UpdateProvider);
  #cachedInfo: UpdateInfo | null = null;
  #lastCheckedAt: number = 0;
  #inflight: Promise<UpdateInfo> | null = null;
  #timer: Timer | null = null;

  /** Cached update info from last check (null if never checked) */
  get cachedInfo(): UpdateInfo | null {
    return this.#cachedInfo;
  }

  get lastCheckedAt(): number {
    return this.#lastCheckedAt;
  }

  /** Start periodic background checks */
  start(): void {
    // Check immediately, then periodically
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), CHECK_INTERVAL_MS);
    this.#logs.info('Update checker started', {
      intervalMs: CHECK_INTERVAL_MS,
    });
  }

  /** Stop periodic checks */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Return cached update info if it's still within the interval, otherwise
   * do a fresh remote check. Cheap to call from request handlers — multiple
   * concurrent UI consumers won't fan out to the upstream provider.
   */
  check(): Promise<UpdateInfo> {
    if (this.#cachedInfo && Date.now() - this.#lastCheckedAt < CHECK_INTERVAL_MS) {
      return Promise.resolve(this.#cachedInfo);
    }
    return this.refresh();
  }

  /**
   * Force a fresh remote check, bypassing the TTL. Used by the background
   * interval and by callers that explicitly opt out of the cache.
   * Concurrent callers — including the background timer racing with a
   * user-initiated check — share the same in-flight Promise and fan in
   * to a single upstream request.
   */
  refresh(): Promise<UpdateInfo> {
    if (this.#inflight !== null) {
      return this.#inflight;
    }
    const promise = this.#doRefresh().finally(() => {
      this.#inflight = null;
    });
    this.#inflight = promise;
    return promise;
  }

  async #doRefresh(): Promise<UpdateInfo> {
    try {
      this.#cachedInfo = await this.#provider.check(this.#state.getUpdateChannel(), {
        pinnedVersion: this.#state.getPinnedVersion(),
      });
      this.#lastCheckedAt = Date.now();

      if (this.#cachedInfo.updateAvailable) {
        this.#logs.info('New version available', {
          currentVersion: this.#cachedInfo.currentVersion,
          latestVersion: this.#cachedInfo.latestVersion,
        });

        this.#events.dispatch(
          UpdateActions.available.create(
            {
              currentVersion: this.#cachedInfo.currentVersion,
              latestVersion: this.#cachedInfo.latestVersion,
              releaseCommit: this.#cachedInfo.releaseCommit,
            },
            'hub'
          )
        );
      }

      return this.#cachedInfo;
    } catch (error) {
      this.#logs.debug(
        'Update check failed',
        {},
        {
          error,
        }
      );

      // Return stale cache if available
      if (this.#cachedInfo) {
        return this.#cachedInfo;
      }

      return noUpdateInfo(this.#state.getUpdateChannel());
    }
  }
}
