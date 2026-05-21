/**
 * Pre-stringified bundle bodies + content-hash ETags for the bulk endpoint.
 *
 * The cache is keyed on the resolved-locale Map identity passed in by
 * `TranslationRegistry#getBundleJson`. Because the registry drops those Map
 * instances on every mutation, the WeakMap evicts stale entries automatically
 * — no explicit invalidation needed when translation data changes.
 */

import type { TranslationData } from './types';

export interface BundleJson {
  readonly body: string;
  readonly etag: string;
}

export class BundleJsonCache {
  readonly #cache = new WeakMap<Map<string, TranslationData>, BundleJson>();

  get(resolved: Map<string, TranslationData>): BundleJson {
    const cached = this.#cache.get(resolved);
    if (cached) {
      return cached;
    }
    const body = JSON.stringify(Object.fromEntries(resolved));
    const etag = `"${fnv1a32(body).toString(36)}"`;
    const entry: BundleJson = { body, etag };
    this.#cache.set(resolved, entry);
    return entry;
  }
}

// FNV-1a 32-bit. Cheap, no deps, plenty of entropy for ETag use — not
// cryptographic, never use for security boundaries.
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.codePointAt(i) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
