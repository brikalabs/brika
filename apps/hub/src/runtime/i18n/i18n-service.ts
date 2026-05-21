/**
 * I18n Service — orchestration layer.
 *
 * Thin DI wrapper around `TranslationRegistry` from `@brika/i18n`. Delegates
 * filesystem loading, embedded-archive fallback, the dev-mode watcher, and
 * the on-disk source index to dedicated internal collaborators so each
 * concern can be reasoned about (and tested) in isolation.
 *
 *   • Hub      `apps/hub/src/locales/<lang>/<ns>.json`         → namespace `<ns>`
 *   • Package  `packages/<X>/locales/<lang>/*.json` (merged)   → namespace `<X>` (scope stripped)
 *   • Plugin   `<pluginDir>/locales/<lang>/*.json` (merged)    → namespace `plugin:<id>`
 *
 * Design choice: collaborators are plain classes/modules instantiated by this
 * service (not separate DI singletons). They share the same `TranslationRegistry`
 * instance and are tightly coupled to the service's lifecycle — wiring them
 * through DI would buy no testability while adding indirection.
 */

import { inject, singleton } from '@brika/di';
import {
  countLeafKeys,
  type RegistryChangeListener,
  type TranslationData,
  TranslationRegistry,
} from '@brika/i18n';
import { type LoaderWarn, loadMergedLocaleFolder, pickPrimaryLocaleFile } from '@brika/i18n/node';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import {
  loadHubTranslations,
  loadPackageTranslations,
  WorkspaceRootResolver,
} from './i18n-disk-loader';
import { sanitizeTranslationData } from './i18n-key-safety';
import { SourceIndex } from './i18n-source-index';
import { type PackageWatch, PLUGIN_NS_PREFIX, type SourceFileEntry } from './i18n-types';
import { LocaleWatcher } from './i18n-watcher';

@singleton()
export class I18nService {
  readonly #config = inject(ConfigLoader);
  readonly #logs = inject(Logger).withSource('i18n');

  readonly #registry = new TranslationRegistry();

  /** Workspace package metadata: namespace + rootDir. Drives per-package watchers + granular reloads. */
  readonly #packageWatches = new Map<string, PackageWatch>();

  /** Plugin → locales it provides (for `#validatePluginTranslations`). */
  readonly #pluginLocales = new Map<string, Set<string>>();

  /** Allow-roots for `writeSourceKey`. Populated as hub + workspace + plugin dirs are discovered. */
  readonly #allowedWriteRoots = new Set<string>();

  /** Source-file index — recording, lookup, edit-with-safety. */
  readonly #sources = new SourceIndex({
    registry: this.#registry,
    getAllowedRoots: () => [...this.#allowedWriteRoots],
  });

  readonly #workspaceRoot = new WorkspaceRootResolver(() => this.#config.getRootDir());

  /** Active filesystem watcher (null until init()). */
  #watcher: LocaleWatcher | null = null;

  #localesDir = '';

  readonly #warn: LoaderWarn = (message, ctx, error) => {
    this.#logs.warn(message, ctx, error === undefined ? undefined : { error });
  };

  constructor() {
    this.#registry.onCollision = ({ namespace, existingSource, incomingSource }) => {
      this.#logs.warn('Namespace claimed by multiple sources', {
        namespace,
        existing: existingSource,
        incoming: incomingSource,
      });
    };
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async init(): Promise<void> {
    // BRIKA_LOCALES_DIR overrides the default `${rootDir}/locales` lookup.
    // Needed in dev setups where the writable source files live somewhere
    // other than under BRIKA_HOME — e.g. mortar runs the hub from the repo
    // root, but the actual JSON files are at `apps/hub/src/locales`. In
    // production binaries the env var is unset, and the embedded archive
    // serves as a read-only fallback regardless.
    const rootDir = this.#config.getRootDir();
    this.#localesDir = Bun.env.BRIKA_LOCALES_DIR ?? `${rootDir}/locales`;
    this.#allowedWriteRoots.add(this.#localesDir);

    await this.#loadAll();
    this.#startWatcher();

    const stats = this.#registry.getStats();
    this.#logs.info('I18n system initialized', {
      availableLocales: this.#registry.listLocales(),
      namespaceCount: stats.namespaces,
      localesDir: this.#localesDir,
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  getNamespaceTranslations(locale: string, namespace: string): TranslationData | null {
    return this.#registry.getNamespaceTranslations(locale, namespace);
  }

  listNamespaces(): string[] {
    return this.#registry.listNamespaces();
  }

  listLocales(): string[] {
    return [...this.#registry.listLocales(), 'cimode'];
  }

  getAllTranslations(locale: string): Record<string, TranslationData> {
    return this.#registry.getAllTranslations(locale);
  }

  /**
   * Pre-stringified bundle JSON + ETag for the bulk endpoint. Cached on the
   * registry; invalidated on any mutation. See `Registry.getBundleJson`.
   */
  getBundleJson(locale: string): { readonly body: string; readonly etag: string } {
    return this.#registry.getBundleJson(locale);
  }

  /** List every tracked source file across hub, packages, and plugins. */
  listSourceFiles(): SourceFileEntry[] {
    return this.#sources.list();
  }

  /** Look up the source file for a single (namespace, locale) pair. */
  getSourceFile(namespace: string, locale: string): SourceFileEntry | undefined {
    return this.#sources.get(namespace, locale);
  }

  /**
   * Apply a dot-path edit to the source file backing `<namespace, locale>`,
   * write it back, AND update the registry transactionally so the response
   * doesn't return until queries reflect the new data. Rejects unknown source
   * files (embedded-archive locales) and untrusted paths via three layers:
   * URL-param shape, allow-root containment, and recursive prototype-pollution
   * scan. See `SourceIndex.write`.
   */
  writeSourceKey(namespace: string, locale: string, key: string, value: unknown): Promise<void> {
    return this.#sources.write(namespace, locale, key, value);
  }

  /** Subscribe to registry mutations (used by SSE / live-reload integrations). */
  onChange(listener: RegistryChangeListener): () => void {
    return this.#registry.onChange(listener);
  }

  /** Register translations for a plugin. Called by PluginManager on install/load. */
  async registerPluginTranslations(pluginId: string, pluginDir: string): Promise<string[]> {
    const namespace = `${PLUGIN_NS_PREFIX}${pluginId}`;
    const detectedLocales: string[] = [];

    try {
      const glob = new Bun.Glob('*/');
      const entries = await Array.fromAsync(
        glob.scan({ cwd: `${pluginDir}/locales`, onlyFiles: false })
      );

      // Plugin re-register replaces existing data — clear first.
      this.#registry.removeNamespace(namespace);
      this.#allowedWriteRoots.add(`${pluginDir}/locales`);

      for (const entry of entries) {
        const locale = entry.replace('/', '');
        if (!locale) {
          continue;
        }
        detectedLocales.push(locale);

        const folderPath = `${pluginDir}/locales/${locale}`;
        const { data } = await loadMergedLocaleFolder(folderPath, this.#warn);
        if (Object.keys(data).length > 0) {
          const safe = sanitizeTranslationData(data, folderPath, this.#warn);
          this.#registry.setNamespaceLocale(namespace, locale, safe, {
            merge: false,
            source: 'plugin',
          });
          const path = await pickPrimaryLocaleFile(folderPath, 'plugin');
          if (path) {
            this.#sources.record({ namespace, locale, path, kind: 'plugin' });
          }
        }
      }

      if (detectedLocales.length > 0) {
        this.#pluginLocales.set(pluginId, new Set(detectedLocales));
        this.#logs.debug('Plugin translations registered', { pluginId, locales: detectedLocales });
        this.#validatePluginTranslations(pluginId, detectedLocales);
      }
    } catch {
      // No locales folder or read error — fine.
    }

    return detectedLocales.sort((a, b) => a.localeCompare(b));
  }

  /** Unregister translations for a plugin. */
  unregisterPluginTranslations(pluginId: string): void {
    const namespace = `${PLUGIN_NS_PREFIX}${pluginId}`;
    if (this.#registry.removeNamespace(namespace)) {
      this.#pluginLocales.delete(pluginId);
      this.#sources.forget(namespace);
      this.#logs.debug('Plugin translations unregistered', { pluginId });
    }
  }

  /** Reload hub and workspace-package translations from disk. */
  async reloadCoreTranslations(): Promise<void> {
    await this.#registry.transaction(async () => {
      this.#registry.clear((source) => source !== 'plugin');
      this.#packageWatches.clear();
      this.#sources.forgetNonPlugin();
      await this.#loadAll();
    });
    // Re-install watchers — `#packageWatches` was cleared and repopulated, so
    // the disposers from the previous start() call point at stale paths.
    // Without this, hot-reload silently stops working for package locales.
    this.#startWatcher();
    this.#logs.info('Core translations reloaded from disk');
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  async #loadAll(): Promise<void> {
    await loadHubTranslations({
      localesDir: this.#localesDir,
      registry: this.#registry,
      sources: this.#sources,
      warn: this.#warn,
    });
    await loadPackageTranslations({
      registry: this.#registry,
      sources: this.#sources,
      warn: this.#warn,
      workspaceRoot: await this.#workspaceRoot.resolve(),
      onPackageDiscovered: (pkg) => {
        this.#packageWatches.set(pkg.rootDir, pkg);
        this.#allowedWriteRoots.add(`${pkg.rootDir}/locales`);
      },
    });
  }

  #startWatcher(): void {
    this.#watcher?.dispose();
    this.#watcher = new LocaleWatcher({
      registry: this.#registry,
      localesDir: this.#localesDir,
      packageWatches: this.#packageWatches,
      warn: this.#warn,
      onWatcherError: (path, error) => {
        this.#logs.debug('Locale watcher unavailable', { directory: path }, { error });
      },
      onWatcherInstalled: (path) => {
        this.#logs.debug('Watching locales directory', { directory: path });
      },
    });
    this.#watcher.start();
  }

  #validatePluginTranslations(pluginId: string, detectedLocales: string[]): void {
    const pluginOwnLocales = this.#pluginLocales.get(pluginId);
    const otherLocales = this.#registry.listLocales().filter((loc) => !pluginOwnLocales?.has(loc));
    const missingLocales = otherLocales.filter((loc) => !detectedLocales.includes(loc));
    if (missingLocales.length > 0) {
      this.#logs.warn('Plugin missing translations for locales', { pluginId, missingLocales });
    }

    const namespace = `${PLUGIN_NS_PREFIX}${pluginId}`;
    const reference = this.#registry.getNamespaceTranslations(detectedLocales[0] ?? '', namespace);
    if (!reference || detectedLocales.length <= 1) {
      return;
    }

    const referenceCount = countLeafKeys(reference);
    for (const locale of detectedLocales.slice(1)) {
      const data = this.#registry.getNamespaceTranslations(locale, namespace);
      if (!data) {
        continue;
      }
      const count = countLeafKeys(data);
      if (count !== referenceCount) {
        this.#logs.warn('Plugin translation key count mismatch', {
          pluginId,
          [detectedLocales[0] ?? '']: referenceCount,
          [locale]: count,
        });
        break;
      }
    }
  }
}

// Re-export for callers that imported `SourceFileEntry` from the service file.
export type { SourceFileEntry } from './i18n-types';
