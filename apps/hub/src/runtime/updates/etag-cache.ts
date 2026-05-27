/**
 * ETag cache for GitHub release API requests.
 *
 * Unauthenticated GitHub API calls are limited to 60/hour per IP. The
 * hub's update checker fires every 6 h by default but the `apply`
 * route and offline CLI both also hit the API, plus dev / CI invocations
 * — easy to blow through the budget on a shared egress. ETags make
 * GitHub return `304 Not Modified` for unchanged release lists, which
 * doesn't count against the budget.
 *
 * Cache lives at `${brikaDir}/.github-etag.json`. Keyed on full URL.
 * Body is the JSON GitHub returned — we re-use it verbatim on 304.
 *
 * Best-effort: cache read/write errors degrade to "no cache" rather
 * than throwing.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const CACHE_FILE = '.github-etag.json';

const CacheEntrySchema = z.object({
  etag: z.string(),
  lastFetched: z.number(),
  body: z.unknown(),
});
type CacheEntry = z.infer<typeof CacheEntrySchema>;

const CacheSchema = z.record(z.string(), CacheEntrySchema);

export interface FetchWithEtagResult<T> {
  body: T;
  /** True when the response came from the cache (304 Not Modified). */
  fromCache: boolean;
}

export class GithubEtagCache {
  readonly #path: string;
  #data: Record<string, CacheEntry>;

  constructor(brikaDir: string) {
    this.#path = join(brikaDir, CACHE_FILE);
    this.#data = this.#load();
  }

  /**
   * Fetch `url` with `If-None-Match` set when we have a cached etag.
   * The caller passes a zod `schema` so both the fresh response and
   * the replayed cached body are validated before they cross the
   * boundary — without it, the cache would hand back values typed as
   * the caller's `T` that are actually unvalidated JSON (persisted
   * bodies can outlive a schema change).
   */
  async fetchJson<T>(
    url: string,
    schema: z.ZodType<T>,
    init?: RequestInit
  ): Promise<FetchWithEtagResult<T>> {
    const existing = this.#data[url];
    const headers = new Headers(init?.headers);
    if (existing) {
      headers.set('If-None-Match', existing.etag);
    }

    const response = await fetch(url, { ...init, headers });
    if (response.status === 304 && existing) {
      // GitHub confirms the cached body is still current. No budget tick.
      return { body: this.#replayCached(schema, existing), fromCache: true };
    }
    // Rate-limit / forbidden responses: prefer a stale-but-existing
    // cache entry to throwing — the hub's update check should degrade
    // gracefully when the unauthenticated 60/hour budget runs out on
    // shared egress. The caller still sees `fromCache: true` so they
    // know the data is potentially stale.
    if ((response.status === 403 || response.status === 429) && existing) {
      return { body: this.#replayCached(schema, existing), fromCache: true };
    }
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`GitHub response failed schema validation: ${parsed.error.message}`);
    }
    const newEtag = response.headers.get('etag');
    if (newEtag !== null) {
      this.#data = {
        ...this.#data,
        [url]: { etag: newEtag, lastFetched: Date.now(), body: parsed.data },
      };
      this.#persist();
    }
    return { body: parsed.data, fromCache: false };
  }

  /**
   * Validate a cached body against the current schema. A schema change
   * that lands while a cache entry from the old shape is on disk
   * shouldn't poison the hot path — drop the entry and force a fresh
   * fetch by throwing, which lets the caller retry without the etag.
   */
  #replayCached<T>(schema: z.ZodType<T>, entry: CacheEntry): T {
    const parsed = schema.safeParse(entry.body);
    if (parsed.success) {
      return parsed.data;
    }
    // Invalidate this entry so the caller's retry hits a 200 path.
    const { [Object.keys(this.#data).find((k) => this.#data[k] === entry) ?? '']: _, ...rest } =
      this.#data;
    this.#data = rest;
    this.#persist();
    throw new Error(`Cached response is stale-shape (schema mismatch): ${parsed.error.message}`);
  }

  #load(): Record<string, CacheEntry> {
    if (!existsSync(this.#path)) {
      return {};
    }
    try {
      const parsed = CacheSchema.safeParse(JSON.parse(readFileSync(this.#path, 'utf8')));
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Corrupt cache — reset rather than crashing the updater. Worst case
      // is one wasted API call before the cache rebuilds.
    }
    return {};
  }

  #persist(): void {
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      const tmp = `${this.#path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.#data, null, 2), { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, this.#path);
    } catch {
      // Cache write failed (permission, disk full) — silently degrade.
    }
  }
}
