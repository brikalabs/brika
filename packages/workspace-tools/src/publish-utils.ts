/**
 * Public publish helpers facade.
 * Formatting and parsing live in dedicated files.
 */

import { isObjectRecord } from './type-guards';

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

/**
 * Fetches the latest published version of a package from the npm registry.
 * Returns null if the package has never been published or the registry is unreachable.
 */
export async function fetchPublishedVersion(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!isObjectRecord(data)) return null;
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
  if (dryRun) args.push('--dry-run');
  return args;
}
