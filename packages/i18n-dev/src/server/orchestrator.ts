/// <reference types="bun-types" />

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TranslationData } from '@brika/i18n';
import { loadLocaleFolder, loadMergedLocaleFolder } from '@brika/i18n/node';
import {
  generateNamespaceList,
  generateRegistryAugmentation,
  generateResourceTypes,
} from '../generate';
import { scanLocaleDirectory } from '../locale-scan';
import { fetchRemoteTranslations } from '../remote';
import type { KeyUsageMap } from '../scan-usage';
import type { ValidationResult } from '../types';
import { validateCodeUsage, validateLocales } from '../validate';

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
  /**
   * Non-fatal failures encountered while assembling the scan (currently:
   * remote-hub fetch errors). The Vite plugin folds each entry into a
   * `plugin-error` issue so the overlay surfaces "hub unreachable" instead
   * of disguising it as 700+ missing-key errors.
   */
  warnings: readonly string[];
}

function flattenTranslations(
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

type LocaleNsMap = Map<string, Map<string, TranslationData>>;

async function scanSourceLocales(source: ResolvedSource): Promise<LocaleNsMap | undefined> {
  const { localesDir, namespace } = source;
  if (!localesDir) {
    return undefined;
  }
  let localeDirs: string[];
  try {
    const glob = new Bun.Glob('*/');
    localeDirs = await Array.fromAsync(glob.scan({ cwd: localesDir, onlyFiles: false }));
  } catch {
    return undefined;
  }
  const locales: LocaleNsMap = new Map();
  for (const slash of localeDirs) {
    const locale = slash.replace('/', '');
    if (!locale) {
      continue;
    }
    const nsMap = namespace
      ? await loadMergedNamespace(`${localesDir}/${locale}`, namespace)
      : await loadPerFileNamespaces(`${localesDir}/${locale}`);
    if (nsMap.size === 0) {
      continue;
    }
    locales.set(locale, nsMap);
  }
  return locales.size > 0 ? locales : undefined;
}

async function loadMergedNamespace(
  folderPath: string,
  namespace: string
): Promise<Map<string, TranslationData>> {
  const { data } = await loadMergedLocaleFolder(folderPath);
  const nsMap = new Map<string, TranslationData>();
  if (Object.keys(data).length > 0) {
    nsMap.set(namespace, data);
  }
  return nsMap;
}

async function loadPerFileNamespaces(folderPath: string): Promise<Map<string, TranslationData>> {
  const map = await loadLocaleFolder(folderPath);
  const nsMap = new Map<string, TranslationData>();
  for (const [ns, data] of Object.entries(map)) {
    nsMap.set(ns, data);
  }
  return nsMap;
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
  /**
   * Namespace prefixes the host applies at runtime that the static scanner
   * doesn't know about — e.g. brika's `tp(pluginId, key)` wrapper prepends
   * `'plugin:'` to land in the runtime namespace. Without this, code calls
   * to `tp()` would surface as false `unknown-key` errors.
   */
  readonly tpNamespacePrefixes?: ReadonlyArray<string>;
  /**
   * Skip `dead-key` reporting for locale namespaces served by sources the
   * static scanner can't see (e.g. runtime-installed plugins, CMS bundles).
   * Brika passes `['plugin:']` here so installed-plugin namespaces aren't
   * flagged as dead just because their source isn't in the workspace.
   */
  readonly deadKeyIgnoreNamespaces?: ReadonlyArray<string>;
  /** Severity override for unknown-key check. Default `'error'`. */
  readonly unknownKeySeverity?: 'error' | 'warning' | 'off';
  /** Severity override for dead-key check. Default `'warning'`. */
  readonly deadKeySeverity?: 'error' | 'warning' | 'off';
}

/**
 * Fold remote-hub translations into the core map. Local data wins on overlap
 * (the same key/locale won't be overwritten), but remote-only namespaces fill
 * in so the overlay can validate what the deployed hub actually serves.
 *
 * Returns any failures so the caller can surface them — the validator can't
 * tell the difference between "hub returned no `auth` namespace" and "code
 * misspelled `auth:profile`", so silent failure here turns into hundreds of
 * misleading `unknown-key` errors.
 */
async function mergeRemoteTranslations(
  coreTranslations: Map<string, Map<string, TranslationData>>,
  remoteApiUrl: string
): Promise<readonly string[]> {
  let remote: Awaited<ReturnType<typeof fetchRemoteTranslations>>;
  try {
    remote = await fetchRemoteTranslations(remoteApiUrl);
  } catch (err) {
    return [`remote scan threw: ${err instanceof Error ? err.message : String(err)}`];
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
  return remote.errors;
}

async function scanSourcesInto(
  sources: ReadonlyArray<ResolvedSource>,
  coreTranslations: LocaleNsMap
): Promise<void> {
  for (const source of sources) {
    const entry = await scanSourceLocales(source);
    if (!entry) {
      continue;
    }
    for (const [locale, nsMap] of entry) {
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

/**
 * Run `validateCodeUsage` against an existing scan and return a fresh
 * `ValidationResult` with the cross-validation issues merged in. Used by
 * the Vite plugin to refresh the issue stream whenever the static key-usage
 * map changes (debounced separately from the locale-file watcher).
 */
export function mergeCodeUsageIssues(
  validation: ValidationResult,
  coreTranslations: Map<string, Map<string, TranslationData>>,
  keyUsage: KeyUsageMap,
  options: OrchestratorOptions
): ValidationResult {
  const codeIssues = validateCodeUsage(coreTranslations, keyUsage, options.referenceLocale, {
    extraPrefixes: options.tpNamespacePrefixes,
    deadKeyIgnoreNamespaces: options.deadKeyIgnoreNamespaces,
    unknownKeySeverity: options.unknownKeySeverity,
    deadKeySeverity: options.deadKeySeverity,
  });
  return {
    ...validation,
    issues: [...validation.issues, ...codeIssues],
    timestamp: Date.now(),
  };
}

export async function runScan(options: OrchestratorOptions): Promise<ScanResult> {
  const { localesDir, apiUrl, referenceLocale, sources } = options;

  const coreTranslations = localesDir
    ? await scanLocaleDirectory(localesDir)
    : new Map<string, Map<string, TranslationData>>();

  await scanSourcesInto(sources, coreTranslations);

  const warnings = apiUrl ? await mergeRemoteTranslations(coreTranslations, apiUrl) : [];

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
    warnings,
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
