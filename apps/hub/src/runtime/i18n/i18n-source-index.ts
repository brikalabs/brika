/**
 * On-disk source-file index for the hub i18n runtime.
 *
 * Tracks which `<namespace, locale>` slot maps to which JSON file on disk, so
 * the `/api/i18n/sources` endpoint and the dev overlay can route edits back
 * to the correct file. Embedded-archive entries (no on-disk path) are
 * deliberately absent — they're read-only by construction.
 *
 * Also owns the write surface (`writeSourceKey`), which is wrapped in three
 * layers of safety:
 *
 *   1. Namespace / locale parameter validation (`assertSafeSegment`).
 *   2. Symlink-aware path containment (`ensureSafePath`) — refuses to write
 *      outside the configured allow-roots, and refuses to follow a symlink
 *      planted at the target leaf.
 *   3. Recursive prototype-pollution scan on the parsed JSON
 *      (`assertNoUnsafeKeys`) — catches `{"__proto__": {...}}` planted by
 *      tampering with the source file before mutation.
 */

import { lstat, realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import {
  isTranslationData,
  setNestedValue,
  type TranslationData,
  type TranslationRegistry,
} from '@brika/i18n';
import { detectFileIndent } from '@brika/i18n/node';
import { assertNoUnsafeKeys, assertSafeSegment } from './i18n-key-safety';
import type { SourceFileEntry } from './i18n-types';

export interface SourceIndexOptions {
  readonly registry: TranslationRegistry;
  /**
   * Allowed write roots. `writeSourceKey` refuses to land outside this set.
   * Supplied as a closure so the caller (the service) can grow the set as
   * workspace / plugin directories are discovered at runtime. Resolved through
   * `realpath` on every check.
   */
  readonly getAllowedRoots: () => readonly string[];
}

/**
 * Tracks `<namespace, locale> → SourceFileEntry` and writes edits back to
 * disk + the registry transactionally.
 */
export class SourceIndex {
  readonly #registry: TranslationRegistry;
  readonly #getAllowedRoots: () => readonly string[];
  readonly #entries = new Map<string, Map<string, SourceFileEntry>>();

  constructor(options: SourceIndexOptions) {
    this.#registry = options.registry;
    this.#getAllowedRoots = options.getAllowedRoots;
  }

  /** Insert / replace the source-file pointer for one (namespace, locale) pair. */
  record(entry: SourceFileEntry): void {
    let byLocale = this.#entries.get(entry.namespace);
    if (!byLocale) {
      byLocale = new Map();
      this.#entries.set(entry.namespace, byLocale);
    }
    byLocale.set(entry.locale, entry);
  }

  /** Drop a single (namespace, locale) pair, or the whole namespace if `locale` is omitted. */
  forget(namespace: string, locale?: string): void {
    if (locale === undefined) {
      this.#entries.delete(namespace);
      return;
    }
    const byLocale = this.#entries.get(namespace);
    if (!byLocale) {
      return;
    }
    byLocale.delete(locale);
    if (byLocale.size === 0) {
      this.#entries.delete(namespace);
    }
  }

  /**
   * Drop hub + package entries; keep plugin entries intact. Used by
   * `reloadCoreTranslations` before reloading hub + workspace data.
   */
  forgetNonPlugin(): void {
    for (const [namespace, byLocale] of this.#entries) {
      for (const [locale, entry] of byLocale) {
        if (entry.kind === 'plugin') {
          continue;
        }
        byLocale.delete(locale);
      }
      if (byLocale.size === 0) {
        this.#entries.delete(namespace);
      }
    }
  }

  /** All tracked source files, sorted by namespace then locale. */
  list(): SourceFileEntry[] {
    const result: SourceFileEntry[] = [];
    for (const byLocale of this.#entries.values()) {
      for (const entry of byLocale.values()) {
        result.push(entry);
      }
    }
    return result.sort((a, b) => {
      const ns = a.namespace.localeCompare(b.namespace);
      return ns === 0 ? a.locale.localeCompare(b.locale) : ns;
    });
  }

  /** Look up the source file for a single (namespace, locale) pair. */
  get(namespace: string, locale: string): SourceFileEntry | undefined {
    return this.#entries.get(namespace)?.get(locale);
  }

  /**
   * Apply a dot-path edit to the source file backing `<namespace, locale>`,
   * write it back, AND update the registry transactionally so the response
   * doesn't return until queries reflect the new data. The fs.watcher fires
   * later with the same data — re-applying idempotently. Rejects for unknown
   * source files (embedded-archive locales).
   */
  async write(namespace: string, locale: string, key: string, value: unknown): Promise<void> {
    assertSafeSegment(namespace, 'namespace');
    assertSafeSegment(locale, 'locale');

    const entry = this.get(namespace, locale);
    if (!entry) {
      throw new Error(`No on-disk source for namespace="${namespace}" locale="${locale}"`);
    }

    await ensureSafePath(entry.path, this.#getAllowedRoots());

    const root = await readTranslationJson(entry.path);
    setNestedValue(root, key, value);
    const indent = await detectFileIndent(entry.path);

    await this.#registry.transaction(async () => {
      await Bun.write(entry.path, `${JSON.stringify(root, null, indent)}\n`);
      this.#registry.setNamespaceLocale(namespace, locale, root, {
        merge: false,
        source: entry.kind,
      });
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read + validate a translation source file. Treats parse errors and missing
 * files as "empty object" — this preserves the original write-on-blank-file
 * behaviour. Throws `UnsafeKeyPathError` if the parsed object contains
 * prototype-pollution segments at any depth.
 */
async function readTranslationJson(path: string): Promise<TranslationData> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch {
    return {};
  }
  if (!isTranslationData(parsed)) {
    return {};
  }
  assertNoUnsafeKeys(parsed);
  return parsed;
}

/**
 * Refuse to write to `targetPath` unless it resolves inside one of the
 * allow-roots, and refuse to follow a symlink planted at the target leaf.
 *
 * Policy: a symlink at the leaf is rejected outright (`refuse to follow`).
 * Symlinks higher up the path are tolerated as long as the resolved path
 * still falls inside an allow-root after `realpath` — this matches how
 * monorepo bind-mounts (e.g. Docker volumes pointing into a workspace) work
 * legitimately, while still blocking the `~/.ssh/authorized_keys` attack.
 */
async function ensureSafePath(targetPath: string, allowedRoots: readonly string[]): Promise<void> {
  // Reject if the leaf itself is a symlink — the most direct attack vector.
  const leafStat = await lstat(targetPath).catch(() => null);
  if (leafStat?.isSymbolicLink()) {
    throw new Error(`refusing to follow symlink at ${targetPath}`);
  }

  const real = await realpath(targetPath);
  const resolvedRoots = await Promise.all(
    allowedRoots.map((root) => realpath(root).catch(() => null))
  );
  const ok = resolvedRoots.some(
    (root) => root !== null && (real === root || real.startsWith(root + sep))
  );
  if (!ok) {
    throw new Error(`refusing to write outside allowed roots: ${real}`);
  }
}
