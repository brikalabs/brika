/**
 * i18next backend that fetches one namespace per HTTP call.
 *
 *   GET {apiPrefix}/:locale/:namespace
 *
 * `404` is treated as "namespace absent" and remembered so subsequent lookups
 * don't retry. Concurrent fetches for the same `<lang>:<ns>` pair are deduped
 * via an in-flight Map.
 */

import i18n from 'i18next';
import { z } from 'zod';

type ReadCallback = (err: unknown, data: Record<string, unknown> | boolean) => void;

const NamespaceDataSchema = z.record(z.string(), z.unknown());

export interface NamespaceLoader {
  readonly load: (language: string, namespace: string) => Promise<Record<string, unknown>>;
}

export class HttpNamespaceLoader implements NamespaceLoader {
  readonly #apiPrefix: string;
  readonly #inflight = new Map<string, Promise<Record<string, unknown>>>();
  readonly #knownMissing = new Set<string>();

  constructor(apiPrefix: string) {
    this.#apiPrefix = apiPrefix;
  }

  load(language: string, namespace: string): Promise<Record<string, unknown>> {
    const key = `${language}:${namespace}`;
    if (this.#knownMissing.has(key)) {
      return Promise.resolve({});
    }
    const existing = this.#inflight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const promise = fetch(`${this.#apiPrefix}/${language}/${encodeURIComponent(namespace)}`)
      .then(async (res) => {
        if (res.status === 404) {
          this.#knownMissing.add(key);
          i18n.addResourceBundle(language, namespace, {}, true, true);
          return {};
        }
        if (!res.ok) {
          throw new Error(`Failed to load ${namespace} for ${language}: ${res.status}`);
        }
        const raw: unknown = await res.json();
        const data = NamespaceDataSchema.parse(raw);
        i18n.addResourceBundle(language, namespace, data, true, true);
        this.#knownMissing.delete(key);
        return data;
      })
      .finally(() => {
        this.#inflight.delete(key);
      });
    this.#inflight.set(key, promise);
    return promise;
  }

  forgetMissing(key: string): boolean {
    return this.#knownMissing.delete(key);
  }

  hasKnownMissing(key: string): boolean {
    return this.#knownMissing.has(key);
  }

  clear(): void {
    this.#inflight.clear();
    this.#knownMissing.clear();
  }
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
