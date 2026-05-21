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
  pickPrimaryLocaleFile,
} from './loaders';
export { watchLocaleSource } from './watch';
export {
  discoverNamespacedSources,
  discoverPackageLocales,
  findWorkspaceRoot,
} from './workspace';
