/**
 * Public publish helpers facade.
 * Formatting and parsing live in dedicated files.
 */

import { isObjectRecord } from './type-guards';
import type { WorkspacePackage } from './workspace';

export type { PackageDetails, PluginDetails } from './package-details';
export { readPackageDetails } from './package-details';
export {
  countExports,
  formatNpmHint,
  formatNpmStatus,
  formatPackageLabel,
  formatPackagePreview,
  getBinNames,
  getHooks,
} from './package-preview';

/** Returns true if the package lives under the plugins/ workspace directory. */
export function isPluginPackage(pkg: WorkspacePackage): boolean {
  return pkg.relativePath.startsWith('plugins/');
}

/**
 * Coerces a raw `--filter` flag value into a string array.
 * Handles `string`, `string[]`, and any other type (returns []).
 */
export function parseFilters(filter: unknown): string[] {
  if (typeof filter === 'string') {
    return [filter];
  }
  if (!Array.isArray(filter)) {
    return [];
  }
  return filter.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Gets a value from a Map, throwing with the given message if absent.
 */
export function mustGet<K, V>(map: Map<K, V>, key: K, errorMessage: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(errorMessage);
  }
  return value;
}

/**
 * Fetches the latest published version of a package from the npm registry.
 * Returns null if the package has never been published or the registry is unreachable.
 */
export async function fetchPublishedVersion(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!isObjectRecord(data)) {
      return null;
    }
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Builds the argument list for `bun publish`.
 */
export function buildPublishArgs(dryRun: boolean): string[] {
  // --ignore-scripts: skip prepublishOnly hooks — verification is already
  // performed by the publish workflow before reaching this point.
  const args = ['bun', 'publish', '--access', 'public', '--ignore-scripts'];
  if (dryRun) {
    args.push('--dry-run');
  }
  return args;
}
