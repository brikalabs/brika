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
import {
  checkForUpdate,
  listReleases,
  noUpdateInfo,
  type ReleaseSummary,
  type UpdateInfo,
} from '@/updater';

/** Check every 6 hours */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Cache release-history fetches for 30 minutes — list endpoint is purely cosmetic */
const RELEASES_CACHE_MS = 30 * 60 * 1000;

@singleton()
export class UpdateService {
  readonly #logs = inject(Logger).withSource('updates');
  readonly #events = inject(EventSystem);
  readonly #state = inject(StateStore);
  #cachedInfo: UpdateInfo | null = null;
  #lastCheckedAt: number = 0;
  #checking = false;
  #timer: Timer | null = null;
  #releasesCache: { readonly fetchedAt: number; readonly releases: ReleaseSummary[] } | null = null;

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

  /** Check for updates now (returns cached result if already checking) */
  async check(): Promise<UpdateInfo> {
    if (this.#checking && this.#cachedInfo) {
      return this.#cachedInfo;
    }

    this.#checking = true;
    try {
      this.#cachedInfo = await checkForUpdate(this.#state.getUpdateChannel());
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
    } finally {
      this.#checking = false;
    }
  }

  /**
   * Fetch a list of recent releases, cached for 30 minutes.
   * Returns the cached list (possibly stale) on fetch failure.
   */
  async listReleases(limit = 20): Promise<ReleaseSummary[]> {
    const now = Date.now();
    if (this.#releasesCache && now - this.#releasesCache.fetchedAt < RELEASES_CACHE_MS) {
      return this.#releasesCache.releases;
    }

    try {
      const releases = await listReleases(limit);
      this.#releasesCache = { fetchedAt: now, releases };
      return releases;
    } catch (error) {
      this.#logs.debug('Release list fetch failed', {}, { error });
      return this.#releasesCache?.releases ?? [];
    }
  }
}
