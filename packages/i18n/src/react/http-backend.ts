/**
 * i18next backend that hydrates from a single bulk-bundle fetch per language.
 *
 *   GET {apiPrefix}/bundle/:locale   →  { ns1: {...}, ns2: {...}, ... }
 *
 * The first `load(language, *)` triggers one request; every concurrent and
 * subsequent `load()` for the same language reads from the cached bundle.
 * ETag + `If-None-Match` is used on revalidation so an unchanged bundle
 * returns 304 with no body.
 *
 * Missing-namespace fallback: a request for a namespace not in the cached
 * bundle (e.g. a plugin registered server-side after this client booted)
 * triggers one conditional revalidation. If the fresh bundle includes the
 * namespace it's returned; otherwise the `<lang>:<ns>` pair is recorded
 * known-missing so future lookups short-circuit without re-fetching.
 *
 * Every payload coming off the wire goes through `sanitizeTranslationTree`
 * before it touches i18next. A malicious or compromised server can't inject
 * `__proto__` / `constructor` / `prototype` keys via `JSON.parse` and poison
 * the prototype chain through i18next's deep-merge paths.
 */

import { sanitizeTranslationTree, type TranslationData } from '@brika/i18n';
import i18n from 'i18next';
import { z } from 'zod';

type ReadCallback = (err: unknown, data: Record<string, unknown> | boolean) => void;

const BundleShapeSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
type Bundle = Record<string, TranslationData>;

/** Hard cap on cached `ETag` strings — defense against a hostile server. */
const MAX_ETAG_LENGTH = 256;

export interface NamespaceLoader {
  readonly load: (language: string, namespace: string) => Promise<Record<string, unknown>>;
}

interface BundleCacheEntry {
  readonly bundle: Bundle;
  readonly etag: string | null;
}

export class BundleNamespaceLoader implements NamespaceLoader {
  readonly #apiPrefix: string;
  readonly #cache = new Map<string, BundleCacheEntry>();
  readonly #inflight = new Map<string, Promise<Bundle>>();
  readonly #knownMissing = new Set<string>();

  constructor(apiPrefix: string) {
    this.#apiPrefix = apiPrefix;
  }

  async load(language: string, namespace: string): Promise<Record<string, unknown>> {
    const cachedBundle = await this.#getBundle(language);
    const fromCache = cachedBundle[namespace];
    if (fromCache !== undefined) {
      return fromCache;
    }
    const key = `${language}:${namespace}`;
    if (this.#knownMissing.has(key)) {
      return {};
    }
    // Missing from the cached bundle — could be a namespace that was
    // registered on the hub after this client booted (plugin install,
    // hot-reload). Revalidate once and check again; the bundle's ETag
    // makes "nothing changed" a cheap 304.
    const fresh = await this.#fetchBundle(language).catch(() => cachedBundle);
    const fromFresh = fresh[namespace];
    if (fromFresh !== undefined) {
      return fromFresh;
    }
    this.#knownMissing.add(key);
    return {};
  }

  /**
   * Re-fetch the bundle for `language` with `If-None-Match`. On 304 the
   * cache stays as-is. On 200 the new bundle replaces the cache and every
   * namespace is pushed into i18next so a render cycle picks up the change
   * without waiting for the next `read()`. Failures are swallowed — the
   * cached bundle still serves.
   */
  async revalidate(language: string): Promise<void> {
    this.#inflight.delete(language);
    let fresh: Bundle;
    try {
      fresh = await this.#fetchBundle(language);
    } catch {
      return;
    }
    for (const [namespace, data] of Object.entries(fresh)) {
      this.#knownMissing.delete(`${language}:${namespace}`);
      i18n.addResourceBundle(language, namespace, data, true, true);
    }
  }

  /**
   * Replace the cached bundle for `language` with `bundle` and push every
   * entry into i18next. Used by out-of-band data sources (dev HMR push,
   * SSR hydration) — input is sanitized in case the source isn't fully
   * trusted (e.g. a third-party Vite plugin that decides to broadcast
   * translation updates).
   */
  hydrate(language: string, bundle: Record<string, unknown>): void {
    const safe = sanitizeBundleShape(bundle);
    this.#cache.set(language, { bundle: safe, etag: this.#cache.get(language)?.etag ?? null });
    for (const [namespace, data] of Object.entries(safe)) {
      this.#knownMissing.delete(`${language}:${namespace}`);
      i18n.addResourceBundle(language, namespace, data, true, true);
    }
  }

  /**
   * Returns the cached bundle for `language` if present (zero network), or
   * hands off to `#fetchBundle` which performs the actual HTTP fetch.
   * Use this from `load()` paths; `revalidate()` bypasses this and calls
   * `#fetchBundle` directly to force a conditional re-fetch.
   */
  #getBundle(language: string): Promise<Bundle> {
    const cached = this.#cache.get(language);
    if (cached !== undefined) {
      return Promise.resolve(cached.bundle);
    }
    return this.#fetchBundle(language);
  }

  #fetchBundle(language: string): Promise<Bundle> {
    const inflight = this.#inflight.get(language);
    if (inflight !== undefined) {
      return inflight;
    }
    const promise = this.#doFetchBundle(language).finally(() => {
      this.#inflight.delete(language);
    });
    this.#inflight.set(language, promise);
    return promise;
  }

  async #doFetchBundle(language: string): Promise<Bundle> {
    const cached = this.#cache.get(language);
    const headers: Record<string, string> = {};
    if (cached?.etag !== undefined && cached.etag !== null) {
      headers['If-None-Match'] = cached.etag;
    }
    const res = await fetch(
      `${this.#apiPrefix}/bundle/${encodeURIComponent(language)}`,
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    if (res.status === 304 && cached) {
      return cached.bundle;
    }
    if (!res.ok) {
      if (cached) {
        return cached.bundle;
      }
      throw new Error(`Failed to load bundle for ${language}: ${res.status}`);
    }
    const rawEtag = res.headers.get('etag');
    const etag = rawEtag !== null && rawEtag.length <= MAX_ETAG_LENGTH ? rawEtag : null;
    const raw: unknown = await res.json();
    const shape = BundleShapeSchema.parse(raw);
    const safe = sanitizeBundleShape(shape);
    this.#cache.set(language, { bundle: safe, etag });
    return safe;
  }
}

/**
 * Run `sanitizeTranslationTree` over every namespace in a bundle-shaped
 * record, dropping prototype-pollution keys at every depth. Returns a new
 * object with `null` prototype to defeat any attempt to reach the prototype
 * chain through bracket access on the bundle itself.
 */
function sanitizeBundleShape(input: Record<string, unknown>): Bundle {
  const out: Bundle = Object.create(null);
  for (const [namespace, data] of Object.entries(input)) {
    const safe = sanitizeTranslationTree(data);
    if (safe !== null) {
      out[namespace] = safe;
    }
  }
  return out;
}

/** Build the i18next-compatible backend descriptor that delegates to `loader`. */
export function buildHttpBackend(loader: NamespaceLoader) {
  return {
    type: 'backend' as const,
    init() {
      // required by the i18next backend interface
    },
    read(language: string, namespace: string, callback: ReadCallback) {
      if (language === 'cimode') {
        callback(null, {});
        return;
      }
      loader
        .load(language, namespace)
        .then((data) => callback(null, data))
        .catch((err: unknown) => callback(err, false));
    },
  };
}
