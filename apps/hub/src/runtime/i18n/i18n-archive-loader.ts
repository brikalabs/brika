/**
 * Embedded-archive loader for production binaries.
 *
 * When the hub runs as a standalone binary (no writable `locales/` directory
 * on disk), translations come from gzipped tarballs embedded at build time by
 * the `@brika/db/macros` macro. This module unpacks those archives and feeds
 * the entries into the registry as read-only namespaces.
 *
 * Layouts:
 *   - Hub archive:       `{locale}/{namespace}.json`
 *   - Workspace archive: `{namespace}/{locale}/{file}.json`
 */

import { isTranslationData, type TranslationData, type TranslationRegistry } from '@brika/i18n';
import type { LoaderWarn } from '@brika/i18n/node';
import { assertNoUnsafeKeys, isUnsafeKeyPathError } from './i18n-key-safety';
import type { ArchiveEntry, ArchivePathParser, NamespaceSource } from './i18n-types';

export interface LoadArchiveOptions {
  readonly bytes: number[];
  readonly source: NamespaceSource;
  readonly parsePath: ArchivePathParser;
  readonly registry: TranslationRegistry;
  readonly warn: LoaderWarn;
}

/** Load translations from an embedded gzipped tar archive into the registry. */
export async function loadArchive(options: LoadArchiveOptions): Promise<void> {
  const { bytes, source, parsePath, registry, warn } = options;
  if (bytes.length === 0) {
    return;
  }

  try {
    const compressed = new Uint8Array(bytes);
    const tarData = Bun.gunzipSync(compressed);
    const archive = new Bun.Archive(tarData);
    const files = await archive.files();

    for (const [relativePath, file] of files) {
      await absorbArchiveEntry({
        entry: { relativePath, text: () => file.text() },
        source,
        parsePath,
        registry,
        warn,
      });
    }
  } catch (e) {
    // `LoaderWarn` requires a `path` context — the archive-level failure has
    // no specific file path; use a synthetic identifier so the warning is
    // still searchable in logs.
    warn(`Failed to read ${source} archive`, { path: `<embedded:${source}>` }, e);
  }
}

interface AbsorbEntryOptions {
  readonly entry: ArchiveEntry;
  readonly source: NamespaceSource;
  readonly parsePath: ArchivePathParser;
  readonly registry: TranslationRegistry;
  readonly warn: LoaderWarn;
}

/** Parse + validate one archive entry and feed it to the registry. */
async function absorbArchiveEntry(options: AbsorbEntryOptions): Promise<void> {
  const { entry, source, parsePath, registry, warn } = options;
  const route = parsePath(entry.relativePath);
  if (!route) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.text());
  } catch (e) {
    warn('Failed to parse embedded locale', { path: entry.relativePath }, e);
    return;
  }
  if (!isTranslationData(parsed)) {
    warn('Embedded locale JSON root is not an object', { path: entry.relativePath });
    return;
  }
  const sanitized = sanitizeTranslationData(parsed, entry.relativePath, warn);

  registry.setNamespaceLocale(route.namespace, route.locale, sanitized, {
    merge: true,
    source,
  });
}

/**
 * Strip unsafe keys (`__proto__`, `constructor`, `prototype`) from embedded
 * translation data. Embedded archives are produced by our own build, so the
 * presence of unsafe keys would indicate either a build-time tamper or an
 * upstream regression — either way, warn and drop the key rather than crash
 * boot.
 */
function sanitizeTranslationData(
  data: TranslationData,
  path: string,
  warn: LoaderWarn
): TranslationData {
  try {
    assertNoUnsafeKeys(data);
    return data;
  } catch (error) {
    if (isUnsafeKeyPathError(error)) {
      warn('Dropping unsafe key from embedded locale', { path }, { segment: error.segment });
      return dropUnsafeKeys(data);
    }
    throw error;
  }
}

function dropUnsafeKeys(data: TranslationData): TranslationData {
  // Use Object.create(null) at the root + descend, so prototype-chain keys
  // are dropped at every depth. We rebuild rather than delete in-place so the
  // returned object is detached from any tampered prototype.
  const out: TranslationData = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    out[key] = isTranslationData(value) ? dropUnsafeKeys(value) : value;
  }
  return out;
}

/** Hub archive layout: "{locale}/{namespace}.json". */
export function parseHubArchivePath(
  relativePath: string
): { namespace: string; locale: string } | null {
  const slash = relativePath.indexOf('/');
  if (slash === -1) {
    return null;
  }
  const locale = relativePath.slice(0, slash);
  const nsFile = relativePath.slice(slash + 1);
  if (!locale || !nsFile.endsWith('.json')) {
    return null;
  }
  return { namespace: nsFile.replace('.json', ''), locale };
}

/** Workspace archive layout: "{namespace}/{locale}/{file}.json". */
export function parsePackageArchivePath(
  relativePath: string
): { namespace: string; locale: string } | null {
  const parts = relativePath.split('/');
  if (parts.length < 3) {
    return null;
  }
  const [namespace, locale, ...fileParts] = parts;
  const fileName = fileParts.join('/');
  if (!namespace || !locale || !fileName.endsWith('.json')) {
    return null;
  }
  return { namespace, locale };
}
