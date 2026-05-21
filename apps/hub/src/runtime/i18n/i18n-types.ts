/**
 * Shared types + constants for the hub-side i18n modules.
 *
 * Lives in its own file so the public `i18n-service.ts` and the internal
 * collaborators (`i18n-source-index`, `i18n-archive-loader`, `i18n-watcher`)
 * can all reference the same shapes without circular imports.
 */

/** Prefix for plugin namespaces to avoid collisions with hub/package namespaces. */
export const PLUGIN_NS_PREFIX = 'plugin:';

export type NamespaceSource = 'hub' | 'package' | 'plugin';

export interface ArchiveEntry {
  readonly relativePath: string;
  text(): Promise<string>;
}

/**
 * Where a `<namespace, locale>` slot was loaded from on disk. Exposed via
 * `/api/i18n/sources` so the dev overlay (or any HTTP consumer) can show the
 * authoring file and request edits routed back here through HTTP.
 *
 * Embedded-archive entries (standalone binary) have no on-disk path and
 * therefore don't appear in this map — they're read-only by construction.
 */
export interface SourceFileEntry {
  readonly namespace: string;
  readonly locale: string;
  readonly path: string;
  readonly kind: NamespaceSource;
}

/** Metadata for one workspace package whose locales the hub watches. */
export interface PackageWatch {
  readonly namespace: string;
  readonly rootDir: string;
}

export type ArchivePathParser = (
  relativePath: string
) => { namespace: string; locale: string } | null;
