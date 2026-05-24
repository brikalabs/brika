/**
 * Per-plugin concurrency cap.
 *
 * Without a cap, a plugin can fire ten thousand parallel fetches and
 * exhaust the hub's socket / fd budget — both denial-of-service and an
 * indirect way to starve other plugins. The cap is a counting semaphore
 * keyed by `pluginUid`: each plugin gets its own bucket, and bucket size
 * defaults to `DEFAULT_MAX_CONCURRENT`.
 *
 * Acquire is awaitable: callers that exceed the cap queue rather than
 * fail. Queueing is FIFO so a steady stream of requests can't starve an
 * older one. Holding the slot is bounded by the per-call timeout that
 * `perform.ts` already applies — a misbehaving handler can't pin a slot
 * forever.
 */

import { DEFAULT_MAX_CONCURRENT } from './types';

export interface SemaphoreOptions {
  /** Slots per plugin. Defaults to `DEFAULT_MAX_CONCURRENT` if omitted. */
  readonly slotsPerPlugin?: number;
}

/**
 * Per-plugin counting semaphore. Acquires return a release function the
 * caller must invoke (typically via `try/finally`). Failing to release
 * leaks a slot until the plugin is unloaded; we accept that as
 * "developer error inside the hub" rather than installing a finalizer.
 */
export class ConcurrencyLimiter {
  readonly #slotsPerPlugin: number;
  readonly #buckets = new Map<string, Bucket>();

  constructor(opts?: SemaphoreOptions) {
    this.#slotsPerPlugin = opts?.slotsPerPlugin ?? DEFAULT_MAX_CONCURRENT;
  }

  /**
   * Wait for a free slot for `pluginUid`. Resolves once acquired with a
   * `release()` that must be called exactly once.
   */
  async acquire(pluginUid: string): Promise<() => void> {
    const bucket = this.#bucket(pluginUid);
    if (bucket.available > 0) {
      bucket.available -= 1;
      return () => this.#release(pluginUid);
    }
    return await new Promise<() => void>((resolve) => {
      bucket.waiters.push(() => {
        // Slot was handed off by `#release`; no decrement needed because
        // `#release` skipped its own decrement when it consumed a waiter.
        resolve(() => this.#release(pluginUid));
      });
    });
  }

  /** Test hook — slots currently available for `pluginUid`. */
  available(pluginUid: string): number {
    return this.#buckets.get(pluginUid)?.available ?? this.#slotsPerPlugin;
  }

  /** Test hook — number of queued waiters for `pluginUid`. */
  waiting(pluginUid: string): number {
    return this.#buckets.get(pluginUid)?.waiters.length ?? 0;
  }

  #bucket(pluginUid: string): Bucket {
    let bucket = this.#buckets.get(pluginUid);
    if (!bucket) {
      bucket = { available: this.#slotsPerPlugin, waiters: [] };
      this.#buckets.set(pluginUid, bucket);
    }
    return bucket;
  }

  #release(pluginUid: string): void {
    const bucket = this.#buckets.get(pluginUid);
    if (!bucket) {
      return;
    }
    const next = bucket.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter — keeps `available`
      // unchanged so we don't briefly leak a slot to a newly-arriving
      // caller that would otherwise race the awake waiter.
      next();
      return;
    }
    bucket.available += 1;
  }
}

interface Bucket {
  available: number;
  waiters: Array<() => void>;
}
