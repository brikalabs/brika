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
import { checkForUpdate, noUpdateInfo, type UpdateInfo } from '@/updater';

/** Check every 6 hours */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

@singleton()
export class UpdateService {
  readonly #logs = inject(Logger).withSource('updates');
  readonly #events = inject(EventSystem);
  #cachedInfo: UpdateInfo | null = null;
  #lastCheckedAt: number = 0;
  #checking = false;
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
    this.check();
    this.#timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this.#logs.info('Update checker started', { intervalMs: CHECK_INTERVAL_MS });
  }

  /** Stop periodic checks */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** Check for updates now (returns cached result if already checking) */
  async check(): Promise<UpdateInfo> {
    if (this.#checking && this.#cachedInfo) {
      return this.#cachedInfo;
    }

    this.#checking = true;
    try {
      this.#cachedInfo = await checkForUpdate();
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
      this.#logs.debug('Update check failed', {}, { error });

      // Return stale cache if available
      if (this.#cachedInfo) return this.#cachedInfo;

      return noUpdateInfo();
    } finally {
      this.#checking = false;
    }
  }
}
