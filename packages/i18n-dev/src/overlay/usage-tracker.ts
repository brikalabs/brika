import i18next from 'i18next';
import type { KeyUsage, KeyUsageMap } from '../scan-usage';
import { extractQualifiedKey, takeBuildTimeCallSite } from './call-site';

// ─── Static usage (provided by the Vite plugin over HMR) ───────────────────

let keyUsageData: KeyUsageMap = {};
const usageListeners = new Set<() => void>();
const EMPTY_USAGES: KeyUsage[] = [];

/** i18next plural suffixes — when looking up usage for `key_one`, also check `key`. */
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function stripPluralSuffix(qualifiedKey: string): string | null {
  const colonIdx = qualifiedKey.indexOf(':');
  const ns = colonIdx >= 0 ? qualifiedKey.slice(0, colonIdx + 1) : '';
  const key = colonIdx >= 0 ? qualifiedKey.slice(colonIdx + 1) : qualifiedKey;

  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return ns + key.slice(0, -suffix.length);
    }
  }
  return null;
}

export function applyKeyUsage(data: KeyUsageMap) {
  keyUsageData = data;
  mergedUsageCache.clear();
  for (const listener of usageListeners) {
    listener();
  }
}

export function getKeyUsage(qualifiedKey: string): KeyUsage[] {
  const direct = keyUsageData[qualifiedKey];
  if (direct) {
    return direct;
  }
  // Fall back to the base key without plural suffix (e.g. `ns:items_one` → `ns:items`)
  const baseKey = stripPluralSuffix(qualifiedKey);
  if (baseKey) {
    return keyUsageData[baseKey] ?? EMPTY_USAGES;
  }
  return EMPTY_USAGES;
}

export function subscribeKeyUsage(listener: () => void): () => void {
  usageListeners.add(listener);
  return () => usageListeners.delete(listener);
}

// ─── Runtime usage (captured from build-time `__cs` only) ──────────────────

/**
 * Map of rendered string → qualifiedKey, populated by the `t()` wrapper. Used
 * by the highlight overlay and the runtime markers to associate DOM text
 * with the key it came from.
 */
export const trackedTranslations = new Map<string, string>();

/**
 * Runtime call sites observed for each qualified key.
 *
 * Outer map: `qualifiedKey` → inner. Inner map: `file:line` → count, so
 * repeated calls from the same source position dedupe naturally while we
 * still track total hit counts.
 *
 * Sites are sourced *only* from the compiler-injected `__cs` field. Host
 * code that wasn't run through the build-time transform won't appear here
 * — the static scanner picks it up instead.
 */
const runtimeKeyUsages = new Map<
  string,
  Map<string, { file: string; line: number; count: number }>
>();
const runtimeUsageListeners = new Set<() => void>();

export function subscribeRuntimeUsages(listener: () => void): () => void {
  runtimeUsageListeners.add(listener);
  return () => runtimeUsageListeners.delete(listener);
}

export function getRuntimeUsages(qualifiedKey: string): { file: string; line: number }[] {
  const inner = runtimeKeyUsages.get(qualifiedKey);
  if (!inner) {
    return [];
  }
  return [...inner.values()];
}

function notifyRuntimeChange(): void {
  for (const listener of runtimeUsageListeners) {
    listener();
  }
}

function recordRuntimeUsage(qualifiedKey: string, file: string, line: number): void {
  let inner = runtimeKeyUsages.get(qualifiedKey);
  if (!inner) {
    inner = new Map();
    runtimeKeyUsages.set(qualifiedKey, inner);
  }
  const tag = `${file}:${line}`;
  const existing = inner.get(tag);
  if (existing) {
    existing.count++;
    return;
  }
  inner.set(tag, { file, line, count: 1 });
  mergedUsageCache.clear();
  notifyRuntimeChange();
}

// ─── Merged static + runtime usage (cached for useSyncExternalStore) ──────

const mergedUsageCache = new Map<string, KeyUsage[]>();
const MERGED_EMPTY: KeyUsage[] = [];

/**
 * Combined static-scan + runtime-capture usages for `qualifiedKey`. Static
 * usage comes from the build-time AST scanner over the configured source
 * trees; runtime usage comes from the compiler-injected `__cs` field on
 * `t()` calls. Deduped by `file:line`.
 *
 * Memoised — `useSyncExternalStore` requires `getSnapshot` to return the
 * same reference until the data actually changes. The cache is invalidated
 * by `applyKeyUsage` and `recordRuntimeUsage` so it stays correct even
 * between renders / across test mounts where no React subscriber is active.
 */
export function getMergedKeyUsage(qualifiedKey: string): KeyUsage[] {
  const cached = mergedUsageCache.get(qualifiedKey);
  if (cached !== undefined) {
    return cached;
  }
  const seen = new Set<string>();
  const merged: KeyUsage[] = [];
  for (const u of getKeyUsage(qualifiedKey)) {
    const tag = `${u.file}:${u.line}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      merged.push(u);
    }
  }
  for (const u of getRuntimeUsages(qualifiedKey)) {
    const tag = `${u.file}:${u.line}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      merged.push(u);
    }
  }
  const stable = merged.length === 0 ? MERGED_EMPTY : merged;
  mergedUsageCache.set(qualifiedKey, stable);
  return stable;
}

// ─── Translation tracker installation ──────────────────────────────────────

let trackerInstalled = false;

/**
 * Wrap i18next's `t()` so we can:
 *   - capture rendered strings → qualified-key (for DOM highlight matching)
 *   - record build-time call sites from `__cs` (for "Used in N files" panel)
 *
 * Two extension surfaces were considered:
 *   1. `i18next.use({ type: 'postProcessor', process: ... })` — clean but
 *      receives the rendered value only, not the input args we need to
 *      derive the qualified key.
 *   2. Wrap `i18next.t` directly — requires assigning to a const-typed
 *      overload set. Done here via `Reflect.set` so the mutation is
 *      isolated to one searchable site if i18next ever ships an official
 *      wrapper hook.
 *
 * The original `t` is captured before assignment and invoked via
 * `Function.prototype.apply` so its declared overloads (and runtime `this`)
 * are preserved.
 */
export function installTranslationTracker() {
  if (trackerInstalled) {
    return;
  }
  trackerInstalled = true;

  // Reference the original `t` function. Its declared overloads can't be
  // re-invoked through a rest-args tuple at the type level, so we narrow
  // it to a generic callable via `Function.prototype.apply` indirection
  // inside the wrapper — no `as` cast needed.
  const i18nextRef = i18next;
  const origT = i18nextRef.t;

  Reflect.set(i18nextRef, 't', (...args: unknown[]) => {
    const { site, args: forwarded } = takeBuildTimeCallSite(args);
    const result: unknown = Reflect.apply(origT, i18nextRef, forwarded);
    if (typeof result === 'string' && result.length > 0) {
      const qualifiedKey = extractQualifiedKey(args);
      if (qualifiedKey) {
        trackedTranslations.set(result, qualifiedKey);
        if (site) {
          recordRuntimeUsage(qualifiedKey, site.file, site.line);
        }
      }
    }
    return result;
  });
}
