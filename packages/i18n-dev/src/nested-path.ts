/**
 * Thin re-export of dot-path utilities from `@brika/i18n`.
 *
 * The dev tool used to maintain its own copies; they were duplicated against
 * the runtime. Going through `@brika/i18n` keeps the prototype-pollution guard
 * (`UnsafeKeyPathError`) and the path-resolution rules consistent everywhere.
 */

import { isTranslationData, type TranslationData, UnsafeKeyPathError } from '@brika/i18n';

export { getNestedValue, setNestedValue, UnsafeKeyPathError } from '@brika/i18n';

/**
 * Resolve a dot-path to `{ parent, key }`. Returns `undefined` if any
 * intermediate segment is missing or not an object. Used by the overlay's
 * store mutators to look up a leaf's parent for deletion.
 */
export function resolvePath(
  obj: TranslationData,
  path: string
): { parent: TranslationData; key: string } | undefined {
  if (!path) {
    return undefined;
  }
  const parts = path.split('.');
  const lastPart = parts.pop();
  if (!lastPart) {
    return undefined;
  }
  let current: TranslationData = obj;
  for (const part of parts) {
    const next = current[part];
    if (!isTranslationData(next)) {
      return undefined;
    }
    current = next;
  }
  return { parent: current, key: lastPart };
}

const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Delete a value at a dot-separated path. No-op if any segment is missing.
 * Mirrors `setNestedValue`'s prototype-pollution rejection — the overlay
 * sends user-typed paths over HTTP, so the same untrusted-input guard applies.
 */
export function deleteNestedValue(obj: TranslationData, path: string): void {
  if (!path) {
    return;
  }
  for (const part of path.split('.')) {
    if (UNSAFE_SEGMENTS.has(part)) {
      throw new UnsafeKeyPathError(part);
    }
  }
  const resolved = resolvePath(obj, path);
  if (resolved) {
    delete resolved.parent[resolved.key];
  }
}
