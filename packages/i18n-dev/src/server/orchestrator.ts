import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TranslationData } from '@brika/i18n';
import { loadLocaleFolder, loadMergedLocaleFolder } from '@brika/i18n/node';
import {
  generateNamespaceList,
  generateRegistryAugmentation,
  generateResourceTypes,
} from '../generate';
import { fetchRemoteTranslations } from '../remote';
import type { ValidationResult } from '../types';
import { validateLocales } from '../validate';

export interface ResolvedSource {
  /** Absolute path to the source directory scanned for `t()` calls. */
  readonly dir: string;
  /** Namespace prefix supplied by the host for bare-key calls in this tree. */
  readonly namespace?: string;
  /** Absolute path to the locale directory whose JSON files we scan/watch. */
  readonly localesDir?: string;
}

export interface ScanResult {
  validation: ValidationResult;
  /** locale → namespace → data */
  translations: Record<string, Record<string, TranslationData>>;
  /** Core locale data used for type generation. */
  coreTranslations: Map<string, Map<string, TranslationData>>;
}

/** Flatten the core scan into a `{ locale: { ns: data } }` shape for the client. */
export function flattenTranslations(
  translations: Map<string, Map<string, TranslationData>>
): Record<string, Record<string, TranslationData>> {
  const out: Record<string, Record<string, TranslationData>> = {};
  for (const [locale, nsMap] of translations) {
    out[locale] ??= {};
    for (const [ns, data] of nsMap) {
      out[locale][ns] = data;
    }
  }
  return out;
}

/**
 * Read every `<locale>/<namespace>.json` under `dir` into a nested map.
 * Replaces the old `scanLocaleDirectory` with the loader from `@brika/i18n/node`.
 */
async function scanLocaleDirectory(
  dir: string
): Promise<Map<string, Map<string, TranslationData>>> {
  const result = new Map<string, Map<string, TranslationData>>();
  let localeDirs: string[];
  try {
    const glob = new Bun.Glob('*/');
    localeDirs = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: false }));
  } catch {
    return result;
  }
  for (const slash of localeDirs) {
    const locale = slash.replace('/', '');
    if (!locale) {
      continue;
    }
    const folder = await loadLocaleFolder(`${dir}/${locale}`);
    const nsMap = new Map<string, TranslationData>();
    for (const [ns, data] of Object.entries(folder)) {
      nsMap.set(ns, data);
    }
    if (nsMap.size > 0) {
      result.set(locale, nsMap);
    }
  }
  return result;
}

/**
 * Read every `<locale>/<*>.json` under `<source>/locales` and merge them into
 * a single namespace named `source.namespace`. Used when the host declares a
 * per-source `localesDir` (or the convention is a folder rooted at the source).
 */
export interface PackageScanEntry {
  /** Namespace identifier supplied by the host. */
  readonly namespace: string;
  /** locale → namespace → flat-merged data (single-entry map). */
  readonly locales: Map<string, Map<string, TranslationData>>;
}

async function scanSourceLocales(source: ResolvedSource): Promise<PackageScanEntry | undefined> {
  const { localesDir, namespace } = source;
  if (!localesDir || !namespace) {
    return undefined;
  }
  let localeDirs: string[];
  try {
    const glob = new Bun.Glob('*/');
    localeDirs = await Array.fromAsync(glob.scan({ cwd: localesDir, onlyFiles: false }));
  } catch {
    return undefined;
  }
  const locales = new Map<string, Map<string, TranslationData>>();
  for (const slash of localeDirs) {
    const locale = slash.replace('/', '');
    if (!locale) {
      continue;
    }
    const { data } = await loadMergedLocaleFolder(`${localesDir}/${locale}`);
    if (Object.keys(data).length === 0) {
      continue;
    }
    const nsMap = new Map<string, TranslationData>();
    nsMap.set(namespace, data);
    locales.set(locale, nsMap);
  }
  if (locales.size === 0) {
    return undefined;
  }
  return { namespace, locales };
}

export interface OrchestratorOptions {
  readonly localesDir: string | null;
  readonly apiUrl: string | null;
  readonly referenceLocale: string;
  readonly sources: ReadonlyArray<ResolvedSource>;
  readonly cacheDir: string;
  /**
   * i18next default namespace. Used by `generateNamespaceList` to place the
   * caller's chosen default first in the generated `i18n-namespaces.ts`.
   * Defaults to `'translation'` to match i18next's own default.
   */
  readonly defaultNamespace?: string;
}

/**
 * Fold remote-hub translations into the core map. Local data wins on overlap
 * (the same key/locale won't be overwritten), but remote-only namespaces fill
 * in so the overlay can validate what the deployed hub actually serves.
 *
 * Mutates `coreTranslations` in place so downstream `validateLocales` /
 * `flattenTranslations` see the merged map.
 */
export async function mergeRemoteTranslations(
  coreTranslations: Map<string, Map<string, TranslationData>>,
  remoteApiUrl: string
): Promise<void> {
  let remote: Awaited<ReturnType<typeof fetchRemoteTranslations>>;
  try {
    remote = await fetchRemoteTranslations(remoteApiUrl);
  } catch {
    return;
  }
  for (const [locale, nsMap] of remote.translations) {
    let localeRow = coreTranslations.get(locale);
    if (!localeRow) {
      localeRow = new Map();
      coreTranslations.set(locale, localeRow);
    }
    for (const [ns, data] of nsMap) {
      if (!localeRow.has(ns)) {
        localeRow.set(ns, data);
      }
    }
  }
}

async function scanSourcesInto(
  sources: ReadonlyArray<ResolvedSource>,
  coreTranslations: Map<string, Map<string, TranslationData>>
): Promise<void> {
  for (const source of sources) {
    const entry = await scanSourceLocales(source);
    if (!entry) {
      continue;
    }
    for (const [locale, nsMap] of entry.locales) {
      let localeRow = coreTranslations.get(locale);
      if (!localeRow) {
        localeRow = new Map();
        coreTranslations.set(locale, localeRow);
      }
      for (const [ns, data] of nsMap) {
        // Local source files take precedence over anything that was already
        // there (hub-served data is the fallback when both are present).
        localeRow.set(ns, data);
      }
    }
  }
}

export async function runScan(options: OrchestratorOptions): Promise<ScanResult> {
  const { localesDir, apiUrl, referenceLocale, sources } = options;

  const coreTranslations = localesDir
    ? await scanLocaleDirectory(localesDir)
    : new Map<string, Map<string, TranslationData>>();

  await scanSourcesInto(sources, coreTranslations);

  if (apiUrl) {
    await mergeRemoteTranslations(coreTranslations, apiUrl);
  }

  // Validate ONCE against the fully-merged map so coverage reflects every
  // source (local files + workspace packages + hub) under union semantics.
  const { issues, coverage } = validateLocales(coreTranslations, referenceLocale);
  const allTranslations = flattenTranslations(coreTranslations);

  return {
    validation: {
      issues,
      coverage,
      timestamp: Date.now(),
      referenceLocale,
    },
    translations: allTranslations,
    coreTranslations,
  };
}

/** Generate type declarations into the cache directory. */
export async function generateTypes(
  options: OrchestratorOptions,
  coreTranslations: Map<string, Map<string, TranslationData>>,
  allTranslations: Record<string, Record<string, TranslationData>>
): Promise<void> {
  const { cacheDir, referenceLocale, defaultNamespace = 'translation' } = options;
  if (!cacheDir) {
    return;
  }
  const refData = coreTranslations.get(referenceLocale);
  if (!refData) {
    return;
  }

  const coreNamespaces = [...refData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, content]) => ({ name, content }));

  const allRef = allTranslations[referenceLocale] ?? {};
  const allNamespaces = Object.entries(allRef)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, content]) => ({ name, content }));

  await mkdir(cacheDir, { recursive: true });
  await Promise.all([
    writeFile(join(cacheDir, 'i18n-resources.d.ts'), generateResourceTypes(coreNamespaces)),
    writeFile(
      join(cacheDir, 'i18n-namespaces.ts'),
      generateNamespaceList(
        coreNamespaces.map((n) => n.name),
        defaultNamespace
      )
    ),
    writeFile(join(cacheDir, 'i18n-registry.d.ts'), generateRegistryAugmentation(allNamespaces)),
  ]);
}
