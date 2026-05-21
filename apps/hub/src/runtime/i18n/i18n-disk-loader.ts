/**
 * Disk-based loaders for hub + workspace-package translations.
 *
 * Each loader either succeeds against the live filesystem and reports the
 * discovered structure, or falls back to the embedded gzipped archive shipped
 * with production binaries. The orchestrating service threads the registry +
 * source index in and the loader writes through them — no shared state lives
 * here.
 */

import { loadTarBytes, loadWorkspaceLocaleArchive } from '@brika/db/macros' with { type: 'macro' };
import type { TranslationRegistry } from '@brika/i18n';
import {
  discoverPackageLocales,
  findWorkspaceRoot,
  type LoaderWarn,
  loadLocaleFolder,
  pickPrimaryLocaleFile,
} from '@brika/i18n/node';
import { loadArchive, parseHubArchivePath, parsePackageArchivePath } from './i18n-archive-loader';
import type { SourceIndex } from './i18n-source-index';
import type { PackageWatch } from './i18n-types';

export interface LoadHubOptions {
  readonly localesDir: string;
  readonly registry: TranslationRegistry;
  readonly sources: SourceIndex;
  readonly warn: LoaderWarn;
}

/**
 * Load hub translations: one namespace per `<locale>/<ns>.json` file. Falls
 * back to the embedded archive if the on-disk directory is unreadable.
 */
export async function loadHubTranslations(options: LoadHubOptions): Promise<void> {
  const { localesDir, registry, sources, warn } = options;

  try {
    const glob = new Bun.Glob('*/');
    const localeDirs = await Array.fromAsync(glob.scan({ cwd: localesDir, onlyFiles: false }));

    for (const entry of localeDirs) {
      const locale = entry.replace('/', '');
      if (!locale) {
        continue;
      }

      const localeData = await loadLocaleFolder(`${localesDir}/${locale}`, warn);
      for (const [namespace, data] of Object.entries(localeData)) {
        registry.setNamespaceLocale(namespace, locale, data, { merge: true, source: 'hub' });
        sources.record({
          namespace,
          locale,
          path: `${localesDir}/${locale}/${namespace}.json`,
          kind: 'hub',
        });
      }
    }
    return;
  } catch {
    // Locales directory absent — fall through to embedded archive.
  }

  await loadArchive({
    bytes: await loadTarBytes('apps/hub/src/locales'),
    source: 'hub',
    parsePath: parseHubArchivePath,
    registry,
    warn,
  });
}

export interface LoadPackageOptions {
  readonly registry: TranslationRegistry;
  readonly sources: SourceIndex;
  readonly warn: LoaderWarn;
  readonly workspaceRoot: string | null;
  readonly onPackageDiscovered: (pkg: PackageWatch) => void;
}

/**
 * Load every workspace package's `locales/` directory. Each package becomes
 * one namespace (`<X>`) with files in `<locale>/` merged together. Falls
 * back to the embedded workspace archive when no workspace root is reachable.
 */
export async function loadPackageTranslations(options: LoadPackageOptions): Promise<void> {
  const { registry, sources, warn, workspaceRoot, onPackageDiscovered } = options;

  if (workspaceRoot) {
    const entries = await discoverPackageLocales(workspaceRoot, warn);
    if (entries.length > 0) {
      for (const entry of entries) {
        onPackageDiscovered({ namespace: entry.namespace, rootDir: entry.rootDir });
        for (const [locale, data] of entry.locales) {
          registry.setNamespaceLocale(entry.namespace, locale, data, {
            merge: true,
            source: 'package',
          });
          const path = await pickPrimaryLocaleFile(
            `${entry.rootDir}/locales/${locale}`,
            entry.namespace
          );
          if (path) {
            sources.record({ namespace: entry.namespace, locale, path, kind: 'package' });
          }
        }
      }
      return;
    }
  }

  await loadArchive({
    bytes: await loadWorkspaceLocaleArchive(),
    source: 'package',
    parsePath: parsePackageArchivePath,
    registry,
    warn,
  });
}

/** Lazily resolve and cache the workspace root for the running process. */
export class WorkspaceRootResolver {
  readonly #findRootDir: () => string;
  #cache: string | null | undefined = undefined;

  constructor(findRootDir: () => string) {
    this.#findRootDir = findRootDir;
  }

  async resolve(): Promise<string | null> {
    if (this.#cache !== undefined) {
      return this.#cache;
    }
    const root = await findWorkspaceRoot(this.#findRootDir());
    this.#cache = root ?? null;
    return this.#cache;
  }
}
