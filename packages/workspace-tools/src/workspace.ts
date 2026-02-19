/**
 * Workspace package discovery, filtering and version update utilities.
 */

import { join } from 'node:path';
import { updateJsonObject } from './json';

export interface WorkspacePackage {
  /** Package name from the manifest */
  name: string;
  /** Current version string */
  version: string;
  /** Absolute path to the package.json */
  path: string;
  /** Path relative to the workspace root */
  relativePath: string;
  /** Whether the package is marked private (not publishable to npm) */
  isPrivate: boolean;
}

/**
 * Discovers all versioned package.json files in the workspace.
 * The root package.json is always first in the returned array.
 */
export async function discoverPackages(root: string): Promise<WorkspacePackage[]> {
  const rootPkgPath = join(root, 'package.json');
  const rootPkg = (await Bun.file(rootPkgPath).json()) as {
    name?: string;
    version?: string;
    private?: boolean;
    workspaces?: string[];
  };

  const packages: WorkspacePackage[] = [];

  if (rootPkg.version) {
    packages.push({
      name: rootPkg.name ?? '(root)',
      version: rootPkg.version,
      path: rootPkgPath,
      relativePath: 'package.json',
      isPrivate: rootPkg.private ?? false,
    });
  }

  for (const pattern of rootPkg.workspaces ?? []) {
    const dir = pattern.replace(/\/\*.*$/, '');
    const glob = new Bun.Glob('*/package.json');
    for await (const rel of glob.scan({ cwd: join(root, dir) })) {
      const absPath = join(root, dir, rel);
      const pkg = (await Bun.file(absPath).json()) as {
        name?: string;
        version?: string;
        private?: boolean;
      };
      if (!pkg.version) continue;
      packages.push({
        name: pkg.name ?? rel.replace('/package.json', ''),
        version: pkg.version,
        path: absPath,
        relativePath: join(dir, rel),
        isPrivate: pkg.private ?? false,
      });
    }
  }

  return packages;
}

/**
 * Filters packages by one or more patterns.
 * Each pattern can be:
 *   - a glob:      "@brika/*"
 *   - an exact name: "@brika/hub"
 *   - a substring: "hub"
 */
export function filterPackages(
  packages: WorkspacePackage[],
  patterns: string[]
): WorkspacePackage[] {
  if (patterns.length === 0) return packages;
  return packages.filter((pkg) =>
    patterns.some((pattern) => {
      if (pattern.includes('*')) return new Bun.Glob(pattern).match(pkg.name);
      return pkg.name === pattern || pkg.name.includes(pattern);
    })
  );
}

/**
 * Writes a new version into a package.json file, preserving all formatting.
 */
export async function writeVersion(pkgPath: string, nextVersion: string): Promise<void> {
  const content = await Bun.file(pkgPath).text();
  const updated = updateJsonObject(content, { version: nextVersion });
  await Bun.write(pkgPath, updated);
}

/**
 * Applies a new version to a set of packages.
 * When dryRun is true, files are not written.
 */
export async function applyVersionToPackages(
  packages: WorkspacePackage[],
  nextVersion: string,
  dryRun = false
): Promise<WorkspacePackage[]> {
  if (!dryRun) {
    await Promise.all(packages.map((pkg) => writeVersion(pkg.path, nextVersion)));
  }
  return packages;
}
