import { isTranslationData, type TranslationData } from './types';

/**
 * Resolve a dot-separated path inside a translation tree.
 *
 *   getNestedValue({ ui: { title: 'Hi' } }, 'ui.title') → 'Hi'
 */
export function getNestedValue(data: TranslationData, path: string): unknown {
  if (!path) {
    return data;
  }
  let current: unknown = data;
  let start = 0;
  for (let i = 0; i <= path.length; i++) {
    if (i === path.length || path[i] === '.') {
      if (!isTranslationData(current)) {
        return undefined;
      }
      const segment = path.slice(start, i);
      current = current[segment];
      start = i + 1;
    }
  }
  return current;
}

/**
 * Visit every leaf in a translation tree. Arrays count as leaves (matching
 * i18next semantics), so a key whose value is an array is passed to `visitor`
 * once with the array as `value`.
 *
 * Use this when you want to stream over leaves without materialising the full
 * `Map`. `flatten` / `flattenInto` are implemented in terms of `walkLeaves`.
 */
export function walkLeaves(
  data: TranslationData,
  visitor: (path: string, value: unknown) => void
): void {
  walkLeavesWithPrefix(data, '', visitor);
}

function walkLeavesWithPrefix(
  data: TranslationData,
  prefix: string,
  visitor: (path: string, value: unknown) => void
): void {
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTranslationData(value)) {
      walkLeavesWithPrefix(value, path, visitor);
    } else {
      visitor(path, value);
    }
  }
}

/**
 * Flatten a nested translation tree into a `{ "a.b.c": "leaf" }` map. Arrays
 * are stored as-is (they're treated as leaf values, matching i18next).
 *
 * `target` is mutated in place — callers pass an existing Map for incremental
 * flattening across multiple files.
 */
export function flattenInto(
  data: TranslationData,
  prefix: string,
  target: Map<string, unknown>
): void {
  walkLeavesWithPrefix(data, prefix, (path, value) => {
    target.set(path, value);
  });
}

export function flatten(data: TranslationData): Map<string, unknown> {
  const map = new Map<string, unknown>();
  flattenInto(data, '', map);
  return map;
}

/**
 * Path segments that, if allowed, would let a caller mutate the JavaScript
 * object prototype chain. We reject these everywhere `setNestedValue` is used
 * so untrusted dot-paths (HTTP body, overlay edit, etc.) can never poison
 * `Object.prototype` or similar. Also exported so other untrusted-input
 * sites (HTTP bundle parser, HMR payload bridge, language-code guards)
 * can apply the same rule against a single source of truth.
 */
export const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/** True if `segment` would target the prototype chain if used as a property name. */
export function isUnsafeKeySegment(segment: string): boolean {
  return UNSAFE_SEGMENTS.has(segment);
}

export class UnsafeKeyPathError extends Error {
  constructor(public readonly segment: string) {
    super(`Unsafe key segment: "${segment}"`);
    this.name = 'UnsafeKeyPathError';
  }
}

/**
 * Walk a parsed translation tree and return a copy with every prototype-pollution
 * key (`__proto__`, `constructor`, `prototype`) dropped at every depth. The
 * input is `unknown` because callers feed this fresh `JSON.parse` output —
 * V8 emits `__proto__` as an own enumerable data property in that case, so
 * `Object.entries` will hand it back to anyone who iterates blindly.
 *
 * Returns `null` if the input isn't a plain record. Non-record leaf values
 * (strings, numbers, arrays — all valid i18next leaves) pass through
 * unchanged.
 *
 * Use at every untrusted-bundle boundary: HTTP response from the bundle
 * endpoint, HMR payload pushed by a dev tool, anything else that hands
 * the runtime a translation tree.
 */
export function sanitizeTranslationTree(input: unknown): TranslationData | null {
  if (!isTranslationData(input)) {
    return null;
  }
  const out: TranslationData = {};
  for (const [key, value] of Object.entries(input)) {
    if (UNSAFE_SEGMENTS.has(key)) {
      continue;
    }
    if (isTranslationData(value)) {
      const sanitizedChild = sanitizeTranslationTree(value);
      if (sanitizedChild !== null) {
        out[key] = sanitizedChild;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Set a value at a dot-separated path inside a translation tree, creating
 * intermediate objects as needed. Existing primitive segments along the path
 * are overwritten with objects. Returns the (possibly mutated) root.
 *
 * Throws `UnsafeKeyPathError` for path segments that target the prototype
 * chain (`__proto__`, `constructor`, `prototype`). Callers handling untrusted
 * input should catch this error and reject the request.
 */
export function setNestedValue(
  data: TranslationData,
  path: string,
  value: unknown
): TranslationData {
  if (!path) {
    return data;
  }
  const parts = path.split('.');
  for (const segment of parts) {
    if (UNSAFE_SEGMENTS.has(segment)) {
      throw new UnsafeKeyPathError(segment);
    }
  }
  let current: TranslationData = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    if (!segment) {
      continue;
    }
    const next = current[segment];
    if (isTranslationData(next)) {
      current = next;
    } else {
      const created: TranslationData = {};
      current[segment] = created;
      current = created;
    }
  }
  const tail = parts.at(-1);
  if (tail) {
    current[tail] = value;
  }
  return data;
}
