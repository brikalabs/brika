/**
 * Defense-in-depth path / key safety helpers for the hub-side i18n module.
 *
 * The HTTP layer validates payload shapes with zod, and `setNestedValue`
 * already rejects unsafe segments in untrusted dot-paths. The helpers here
 * add two extra layers:
 *
 *   1. `assertSafeSegment` — used on URL params (namespace, locale) before
 *      they reach the source-files Map. The lookup is safe by construction
 *      (only known indexes can match), but rejecting `..` / `/` / `\` early
 *      avoids ambiguity in logs + crashes attempts to confuse path joins
 *      downstream.
 *
 *   2. `assertNoUnsafeKeys` — recursive scan of parsed JSON before we mutate
 *      it. Required because `Bun.file(path).json()` happily returns objects
 *      like `{"__proto__": {...}}` — `setNestedValue`'s segment guard only
 *      catches paths supplied by HTTP, not pre-existing keys on disk.
 */

import { isTranslationData, type TranslationData, UnsafeKeyPathError } from '@brika/i18n';

/**
 * Path segments that would let a caller mutate the JavaScript object
 * prototype chain. Mirrors the set inside `@brika/i18n`'s `setNestedValue`.
 */
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export class UnsafeSegmentError extends Error {
  constructor(
    public readonly segment: string,
    public readonly context: 'namespace' | 'locale'
  ) {
    super(`Unsafe ${context} segment: ${JSON.stringify(segment)}`);
    this.name = 'UnsafeSegmentError';
  }
}

/**
 * Reject namespace / locale URL params that contain `..`, path separators, or
 * the prototype-pollution keywords. Cheaper than a regex; we want explicit
 * named errors when defenders investigate logs.
 *
 * Plugin namespaces look like `plugin:@scope/name` — colons and `@` are fine.
 * The slash inside a scoped npm name does need to be allowed for namespaces,
 * so the namespace check tolerates `/` only when preceded by `@`. Locales
 * never contain slashes.
 */
export function assertSafeSegment(value: string, context: 'namespace' | 'locale'): void {
  if (value.length === 0) {
    throw new UnsafeSegmentError(value, context);
  }
  if (value === '.' || value === '..' || value.includes('..')) {
    throw new UnsafeSegmentError(value, context);
  }
  if (value.includes('\\')) {
    throw new UnsafeSegmentError(value, context);
  }
  if (context === 'locale' && value.includes('/')) {
    throw new UnsafeSegmentError(value, context);
  }
  if (context === 'namespace' && !isAllowedNamespaceSlash(value)) {
    throw new UnsafeSegmentError(value, context);
  }
  if (UNSAFE_SEGMENTS.has(value)) {
    throw new UnsafeSegmentError(value, context);
  }
}

/**
 * Scoped plugin namespaces look like `plugin:@scope/name` — exactly one slash,
 * immediately after a `@<scope>` token. Reject every other slash placement.
 */
function isAllowedNamespaceSlash(namespace: string): boolean {
  const slashes = namespace.split('/').length - 1;
  if (slashes === 0) {
    return true;
  }
  if (slashes > 1) {
    return false;
  }
  // exactly one slash — must be in `…@scope/name`.
  const at = namespace.lastIndexOf('@');
  const slash = namespace.indexOf('/');
  return at !== -1 && at < slash && namespace.slice(at + 1, slash).length > 0;
}

/**
 * Recursively assert that the object tree does not contain prototype-pollution
 * keys at any depth. Throws `UnsafeKeyPathError` (re-exported from `@brika/i18n`)
 * so callers can distinguish this from other errors.
 *
 * `data` must already pass `isTranslationData`. Use this on untrusted JSON
 * (overlay-writable source files) before mutating the tree.
 */
export function assertNoUnsafeKeys(data: TranslationData): void {
  for (const [key, value] of Object.entries(data)) {
    if (UNSAFE_SEGMENTS.has(key)) {
      throw new UnsafeKeyPathError(key);
    }
    if (isTranslationData(value)) {
      assertNoUnsafeKeys(value);
    }
  }
}

/**
 * Non-throwing variant: returns a copy of the tree with unsafe keys dropped,
 * and logs each removal via the caller-supplied warn fn. Suitable for boot-time
 * loaders where a planted `__proto__` segment in a hub-shipped JSON shouldn't
 * crash the entire service. The overlay-write path uses `assertNoUnsafeKeys`
 * (throws) because the request is user-driven and reversible.
 */
export function sanitizeTranslationData(
  data: TranslationData,
  filePath: string,
  warn?: (message: string, ctx: { path: string }) => void
): TranslationData {
  const out: TranslationData = {};
  for (const [key, value] of Object.entries(data)) {
    if (UNSAFE_SEGMENTS.has(key)) {
      warn?.(`Dropped unsafe key "${key}" from translation data`, { path: filePath });
      continue;
    }
    if (isTranslationData(value)) {
      out[key] = sanitizeTranslationData(value, filePath, warn);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Narrow caught errors to `UnsafeKeyPathError` without an `instanceof` cast. */
export function isUnsafeKeyPathError(error: unknown): error is UnsafeKeyPathError {
  return error instanceof UnsafeKeyPathError;
}
