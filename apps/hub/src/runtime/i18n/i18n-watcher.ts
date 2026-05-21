/**
 * Hub-side filesystem watcher coordinator.
 *
 * Hub locales: each `<lang>/<ns>.json` file is its own namespace. The watcher
 * reloads only the affected files, so an edit to `en/common.json` doesn't
 * blow away the `fr` cache.
 *
 * Workspace package locales: many files in one `<lang>/` dir deep-merge into a
 * single namespace. We can't determine per-file contributions cheaply, so on
 * any change to a package's `locales/` we re-merge that locale's entire dir
 * for the affected package.
 */

import { isTranslationData, type TranslationRegistry } from '@brika/i18n';
import { type LoaderWarn, loadMergedLocaleFolder, watchLocaleSource } from '@brika/i18n/node';
import type { PackageWatch } from './i18n-types';

export interface WatcherOptions {
  readonly registry: TranslationRegistry;
  readonly localesDir: string;
  readonly packageWatches: ReadonlyMap<string, PackageWatch>;
  readonly warn: LoaderWarn;
  readonly onWatcherError: (path: string, error: unknown) => void;
  readonly onWatcherInstalled: (path: string) => void;
}

/**
 * Owns the lifecycle of every locale-watching `fs.watch`. Hub + each
 * workspace package gets one watcher; disposers are pooled for shutdown.
 */
export class LocaleWatcher {
  readonly #registry: TranslationRegistry;
  readonly #localesDir: string;
  readonly #packageWatches: ReadonlyMap<string, PackageWatch>;
  readonly #warn: LoaderWarn;
  readonly #onWatcherError: (path: string, error: unknown) => void;
  readonly #onWatcherInstalled: (path: string) => void;
  readonly #disposers: Array<() => void> = [];

  constructor(options: WatcherOptions) {
    this.#registry = options.registry;
    this.#localesDir = options.localesDir;
    this.#packageWatches = options.packageWatches;
    this.#warn = options.warn;
    this.#onWatcherError = options.onWatcherError;
    this.#onWatcherInstalled = options.onWatcherInstalled;
  }

  /** Install watchers for hub + every known workspace package. */
  start(): void {
    this.dispose();

    // Hub: each file = one namespace; reload affected files independently.
    this.#install(this.#localesDir, (changed) => this.#reloadHubFiles(changed));

    // Workspace packages: all files in a <lang>/ dir merge into one namespace,
    // so we re-merge that locale's entire dir for the affected package on change.
    for (const pkg of this.#packageWatches.values()) {
      this.#install(`${pkg.rootDir}/locales`, (changed) => this.#reloadPackageFiles(pkg, changed));
    }
  }

  /** Tear down every active watcher. Safe to call repeatedly. */
  dispose(): void {
    for (const dispose of this.#disposers) {
      dispose();
    }
    this.#disposers.length = 0;
  }

  #install(
    path: string,
    onReload: (changedFiles: readonly string[]) => Promise<void> | void
  ): void {
    const dispose = watchLocaleSource({
      path,
      onReload,
      onError: (error) => this.#onWatcherError(path, error),
    });
    this.#disposers.push(dispose);
    this.#onWatcherInstalled(path);
  }

  async #reloadHubFiles(changedFiles: readonly string[]): Promise<void> {
    if (changedFiles.length === 0) {
      return;
    }
    await this.#registry.transaction(async () => {
      for (const rel of changedFiles) {
        const slash = rel.indexOf('/');
        if (slash === -1) {
          continue;
        }
        const locale = rel.slice(0, slash);
        const file = rel.slice(slash + 1);
        if (!locale || !file.endsWith('.json')) {
          continue;
        }
        const namespace = file.slice(0, -'.json'.length);
        if (!namespace) {
          continue;
        }
        await this.#reloadHubFile(namespace, locale, `${this.#localesDir}/${rel}`);
      }
    });
  }

  async #reloadHubFile(namespace: string, locale: string, filePath: string): Promise<void> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      this.#registry.removeNamespaceLocale(namespace, locale);
      return;
    }
    try {
      const parsed: unknown = await file.json();
      if (isTranslationData(parsed)) {
        this.#registry.setNamespaceLocale(namespace, locale, parsed, {
          merge: false,
          source: 'hub',
        });
      } else {
        this.#warn('Hub locale JSON root is not an object', { path: filePath });
      }
    } catch (error) {
      this.#warn('Failed to reload hub locale', { path: filePath }, error);
    }
  }

  async #reloadPackageFiles(
    pkg: PackageWatch,
    changedFiles: readonly string[]
  ): Promise<void> {
    if (changedFiles.length === 0) {
      return;
    }
    // Multiple files per locale merge into one namespace — re-merge the whole
    // affected locale directory rather than try to track per-file contributions.
    const affectedLocales = new Set<string>();
    for (const rel of changedFiles) {
      const slash = rel.indexOf('/');
      if (slash === -1) {
        continue;
      }
      const locale = rel.slice(0, slash);
      if (locale) {
        affectedLocales.add(locale);
      }
    }
    if (affectedLocales.size === 0) {
      return;
    }
    await this.#registry.transaction(async () => {
      for (const locale of affectedLocales) {
        const { data } = await loadMergedLocaleFolder(
          `${pkg.rootDir}/locales/${locale}`,
          this.#warn
        );
        if (Object.keys(data).length === 0) {
          this.#registry.removeNamespaceLocale(pkg.namespace, locale);
        } else {
          this.#registry.setNamespaceLocale(pkg.namespace, locale, data, {
            merge: false,
            source: 'package',
          });
        }
      }
    });
  }
}
