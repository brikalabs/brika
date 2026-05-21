import { type BundleJson, BundleJsonCache } from './bundle';
import { buildFallbackChain } from './fallback';
import { deepMerge, mergeFallbackChain } from './merge';
import { type MissingKeyHandler, parseKey, type TranslateOptions, translate } from './translate';
import type { TranslationData } from './types';

export type RegistryChangeKind = 'set' | 'remove' | 'clear';

export interface RegistryChange {
  readonly kind: RegistryChangeKind;
  /** Namespace affected. `null` for `clear` events that touch multiple. */
  readonly namespace: string | null;
  /** Locale affected when known (omitted for `remove`/`clear`). */
  readonly locale?: string;
  /** Source that triggered the change, if tagged by the caller. */
  readonly source?: string;
}

export type RegistryChangeListener = (change: RegistryChange) => void;

export interface SetOptions {
  /** If `true`, deep-merge with existing data; otherwise replace. */
  readonly merge: boolean;
  /** Optional source tag (`'hub'`, `'package'`, `'plugin'`, …). Used for collision detection and clear filters. */
  readonly source?: string;
}

export interface RegistryStats {
  readonly namespaces: number;
  readonly locales: number;
}

export interface RegistryConfig {
  /** Namespace used when `t(key)` is called without an explicit `<ns>:` prefix. */
  readonly defaultNamespace?: string;
  /** Separator between namespace and key path. Default `:`. */
  readonly nsSeparator?: string;
  /** Called when a key can't be resolved (and no `defaultValue` was given). */
  readonly missingKeyHandler?: MissingKeyHandler;
  /**
   * Maximum number of resolved-locale entries kept in the LRU cache. Beyond
   * this, the least-recently-used locale is evicted. The pre-stringified
   * bundle cache piggybacks on the resolved-locale Map identities and evicts
   * along with them automatically. Default 8.
   */
  readonly maxResolvedLocales?: number;
}

const DEFAULT_MAX_RESOLVED_LOCALES = 8;

/**
 * A reusable in-memory translation store that backs the higher-level I18n
 * service. Holds `Map<namespace, Map<locale, TranslationData>>`, plus
 * per-namespace source tags and a resolved-locale cache.
 *
 * Consumers (hub, CLI, future tools) call `setNamespaceLocale` to feed the
 * registry from any source, then `getNamespaceTranslations` /
 * `getAllTranslations` for read access. The cache is invalidated automatically
 * on every mutation.
 */
export class TranslationRegistry {
  readonly #translations = new Map<string, Map<string, TranslationData>>();
  readonly #namespaceSource = new Map<string, string>();
  readonly #availableLocales = new Set<string>();
  readonly #resolvedLocaleCache = new Map<string, Map<string, TranslationData>>();
  readonly #listeners = new Set<RegistryChangeListener>();
  readonly #bundleJsonCache = new BundleJsonCache();

  readonly #defaultNamespace: string;
  readonly #nsSeparator: string;
  readonly #maxResolvedLocales: number;
  readonly #missingKeyHandler: MissingKeyHandler | undefined;

  // Bulk reloads (hub init, full reload) wrap N `setNamespaceLocale` calls in
  // one transaction to collapse the N×cache-clear + N×event fanout into a
  // single cache clear and a flush of buffered events at commit time.
  #transactionDepth = 0;
  #transactionDirty = false;
  readonly #bufferedChanges: RegistryChange[] = [];

  /** Optional callback invoked when a namespace is claimed by a second source. */
  onCollision?: (info: {
    namespace: string;
    existingSource: string;
    incomingSource: string;
  }) => void;

  constructor(config: RegistryConfig = {}) {
    this.#defaultNamespace = config.defaultNamespace ?? 'translation';
    this.#nsSeparator = config.nsSeparator ?? ':';
    this.#maxResolvedLocales = Math.max(
      1,
      config.maxResolvedLocales ?? DEFAULT_MAX_RESOLVED_LOCALES
    );
    this.#missingKeyHandler = config.missingKeyHandler;
  }

  /** Set translations for `<namespace, locale>`. Merges or replaces per options. */
  setNamespaceLocale(
    namespace: string,
    locale: string,
    data: TranslationData,
    options: SetOptions
  ): void {
    this.#trackSource(namespace, options.source);

    let nsLocales = this.#translations.get(namespace);
    if (!nsLocales) {
      nsLocales = new Map<string, TranslationData>();
      this.#translations.set(namespace, nsLocales);
    }
    if (options.merge) {
      const existing = nsLocales.get(locale);
      nsLocales.set(locale, existing ? deepMerge(existing, data) : data);
    } else {
      nsLocales.set(locale, data);
    }
    this.#availableLocales.add(locale);
    this.#markDirty();
    this.#emit({ kind: 'set', namespace, locale, source: options.source });
  }

  /** Remove a namespace entirely. Returns whether anything was removed. */
  removeNamespace(namespace: string): boolean {
    const removed = this.#translations.delete(namespace);
    this.#namespaceSource.delete(namespace);
    if (removed) {
      this.#markDirty();
      this.#emit({ kind: 'remove', namespace });
    }
    return removed;
  }

  /**
   * Drop a single `<namespace, locale>` entry. Returns whether anything was
   * removed. If the namespace ends up empty afterwards, also drops the
   * namespace itself (and its source tag).
   *
   * Used by granular hot-reload to react to file deletions without losing
   * the rest of the namespace.
   */
  removeNamespaceLocale(namespace: string, locale: string): boolean {
    const nsLocales = this.#translations.get(namespace);
    if (!nsLocales) {
      return false;
    }
    const removed = nsLocales.delete(locale);
    if (!removed) {
      return false;
    }
    if (nsLocales.size === 0) {
      this.#translations.delete(namespace);
      this.#namespaceSource.delete(namespace);
    }
    this.#rebuildAvailableLocales();
    this.#markDirty();
    this.#emit({ kind: 'set', namespace, locale });
    return true;
  }

  /**
   * Drop namespaces whose source matches the predicate. Pass `() => true` to
   * clear everything. Used by the hub's reload flow to drop hub+package data
   * while preserving plugins.
   */
  clear(predicate: (source: string | undefined) => boolean): void {
    let removedAny = false;
    for (const [namespace, source] of this.#namespaceSource) {
      if (predicate(source)) {
        this.#translations.delete(namespace);
        this.#namespaceSource.delete(namespace);
        removedAny = true;
      }
    }
    // Also drop namespaces without a source tag if the predicate accepts undefined.
    for (const namespace of this.#translations.keys()) {
      if (!this.#namespaceSource.has(namespace) && predicate(undefined)) {
        this.#translations.delete(namespace);
        removedAny = true;
      }
    }
    if (removedAny) {
      this.#rebuildAvailableLocales();
      this.#markDirty();
      this.#emit({ kind: 'clear', namespace: null });
    }
  }

  /**
   * Group multiple mutations into one effective event + one cache clear.
   *
   *   registry.transaction(() => {
   *     for (const ns of bulkData) registry.setNamespaceLocale(...);
   *   });
   *
   * Within the callback, individual `set`/`remove`/`clear` events are buffered
   * and dispatched in one batch when the outermost transaction commits.
   *
   * Nests safely — only the outermost commit clears the cache.
   */
  transaction<T>(fn: () => T): T;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  transaction<T>(fn: () => T | Promise<T>): T | Promise<T> {
    this.#transactionDepth++;
    let result: T | Promise<T>;
    try {
      result = fn();
    } catch (error) {
      this.#commitTransaction();
      throw error;
    }
    if (result instanceof Promise) {
      return result.finally(() => {
        this.#commitTransaction();
      });
    }
    this.#commitTransaction();
    return result;
  }

  /** Resolve a `<locale, namespace>` pair through the fallback chain. */
  getNamespaceTranslations(locale: string, namespace: string): TranslationData | null {
    return this.#resolveLocale(locale).get(namespace) ?? null;
  }

  /** Bulk resolution of every registered namespace for `locale`. */
  getAllTranslations(locale: string): Record<string, TranslationData> {
    return Object.fromEntries(this.#resolveLocale(locale));
  }

  /**
   * Pre-stringified JSON body for the bulk-bundle endpoint, paired with a
   * content-hash ETag. Cached per `<locale>` and invalidated whenever the
   * underlying resolved-locale cache clears (i.e. on any mutation).
   *
   * Servers should:
   *   1. Compare `etag` against the client's `If-None-Match` header → 304.
   *   2. Otherwise return `body` with `Content-Type: application/json` and the
   *      `ETag` header set.
   */
  getBundleJson(locale: string): BundleJson {
    return this.#bundleJsonCache.get(this.#resolveLocale(locale));
  }

  /** All namespaces currently registered, sorted lexicographically. */
  listNamespaces(): string[] {
    return [...this.#translations.keys()].sort((a, b) => a.localeCompare(b));
  }

  /** All locales any namespace contributes, sorted lexicographically. */
  listLocales(): string[] {
    return [...this.#availableLocales].sort((a, b) => a.localeCompare(b));
  }

  /** Snapshot counts for logs / observability. */
  getStats(): RegistryStats {
    return {
      namespaces: this.#translations.size,
      locales: this.#availableLocales.size,
    };
  }

  /** Subscribe to mutation events. Returns an unsubscribe function. */
  onChange(listener: RegistryChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Translate a key in the given locale. Resolves namespace from `ns:path`
   * notation (or `defaultNamespace`), applies plural / context suffixes, runs
   * interpolation, and falls through to `defaultValue` / `missingKeyHandler`
   * when the key is absent.
   */
  t(locale: string, key: string, options: TranslateOptions = {}): string {
    const { namespace, path } = parseKey(key, this.#defaultNamespace, this.#nsSeparator);
    const tree = this.#resolveLocale(locale).get(namespace);
    if (tree) {
      const rendered = translate(tree, path, { ...options, locale });
      if (rendered !== undefined) {
        return rendered;
      }
    }
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    return this.#missingKeyHandler?.(key, locale) ?? key;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #trackSource(namespace: string, source: string | undefined): void {
    if (source === undefined) {
      return;
    }
    const existing = this.#namespaceSource.get(namespace);
    if (existing === undefined) {
      this.#namespaceSource.set(namespace, source);
      return;
    }
    if (existing !== source) {
      this.onCollision?.({ namespace, existingSource: existing, incomingSource: source });
    }
  }

  #resolveLocale(locale: string): Map<string, TranslationData> {
    const cached = this.#resolvedLocaleCache.get(locale);
    if (cached) {
      // LRU: move to end so it stays "recent" — Map iteration order is insertion order.
      this.#resolvedLocaleCache.delete(locale);
      this.#resolvedLocaleCache.set(locale, cached);
      return cached;
    }

    const chain = buildFallbackChain(locale);
    const result = new Map<string, TranslationData>();
    for (const [namespace, nsLocales] of this.#translations) {
      const merged = mergeFallbackChain(chain, (loc) => nsLocales.get(loc));
      if (Object.keys(merged).length > 0) {
        result.set(namespace, merged);
      }
    }
    this.#resolvedLocaleCache.set(locale, result);

    // Bound the cache: drop the oldest entries beyond the configured cap.
    // The bundle-JSON WeakMap evicts along with them because it's keyed on
    // the resolved Map's identity.
    while (this.#resolvedLocaleCache.size > this.#maxResolvedLocales) {
      const oldest = this.#resolvedLocaleCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#resolvedLocaleCache.delete(oldest);
    }

    return result;
  }

  #rebuildAvailableLocales(): void {
    this.#availableLocales.clear();
    for (const nsLocales of this.#translations.values()) {
      for (const locale of nsLocales.keys()) {
        this.#availableLocales.add(locale);
      }
    }
  }

  #emit(change: RegistryChange): void {
    if (this.#transactionDepth > 0) {
      this.#bufferedChanges.push(change);
      return;
    }
    this.#dispatch(change);
  }

  #dispatch(change: RegistryChange): void {
    for (const listener of this.#listeners) {
      try {
        listener(change);
      } catch {
        // listener failures must not affect other listeners or the caller
      }
    }
  }

  #markDirty(): void {
    if (this.#transactionDepth > 0) {
      this.#transactionDirty = true;
      return;
    }
    this.#resolvedLocaleCache.clear();
  }

  #commitTransaction(): void {
    this.#transactionDepth--;
    if (this.#transactionDepth > 0) {
      return;
    }
    if (this.#transactionDirty) {
      this.#resolvedLocaleCache.clear();
      this.#transactionDirty = false;
    }
    if (this.#bufferedChanges.length === 0) {
      return;
    }
    const drained = this.#bufferedChanges.splice(0);
    for (const change of drained) {
      this.#dispatch(change);
    }
  }
}
