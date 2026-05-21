/**
 * Node/Bun-only entry. Anything in here uses `node:fs` or Bun built-ins and
 * therefore won't run in a browser. Import from here in server-side code and
 * tooling; keep client-side code on the isomorphic root entry.
 */

export {
  detectFileIndent,
  detectIndentFromContent,
  type LoaderWarn,
  loadLocaleFolder,
  loadMergedLocaleFolder,
  type MergedLocaleFolder,
  pickPrimaryLocaleFile,
} from './loaders';
export { type WatchOptions, watchLocaleSource } from './watch';
export {
  type DiscoverNamespacedSourcesOptions,
  discoverNamespacedSources,
  discoverPackageLocales,
  findWorkspaceRoot,
  type NamespacedSource,
  type PackageJson,
  PackageJsonSchema,
  type PackageLocaleEntry,
} from './workspace';
