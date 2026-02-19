/**
 * Git utilities for detecting which packages have changed since a given ref.
 */

import type { WorkspacePackage } from './workspace';

/**
 * Returns the most recent git tag, or null if no tags exist in the repository.
 */
export async function getLastTag(root: string): Promise<string | null> {
  const proc = Bun.spawn(['git', 'describe', '--tags', '--abbrev=0'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await proc.exited) !== 0) return null;
  const tag = (await new Response(proc.stdout).text()).trim();
  return tag || null;
}

/**
 * Returns the short SHA and subject of the commit at the given ref,
 * or null if the ref does not exist.
 */
export async function resolveRef(root: string, ref: string): Promise<string | null> {
  const proc = Bun.spawn(['git', 'log', '-1', '--oneline', ref], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await proc.exited) !== 0) return null;
  return (await new Response(proc.stdout).text()).trim() || null;
}

/**
 * Returns the package directory path (relative to root) for a WorkspacePackage.
 * e.g. "packages/sdk/package.json" → "packages/sdk"
 */
export function packageDir(pkg: WorkspacePackage): string {
  const slash = pkg.relativePath.lastIndexOf('/');
  return slash === -1 ? '.' : pkg.relativePath.slice(0, slash);
}

/**
 * Returns the set of package names that have at least one commit touching their
 * directory in the range `since..HEAD`.
 *
 * Runs all checks in parallel.
 */
export async function getChangedPackages(
  root: string,
  since: string,
  packages: WorkspacePackage[]
): Promise<Set<string>> {
  const changed = new Set<string>();

  await Promise.all(
    packages.map(async (pkg) => {
      const dir = packageDir(pkg);
      const proc = Bun.spawn(['git', 'log', '--oneline', since + '..HEAD', '--', dir + '/'], {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      const output = (await new Response(proc.stdout).text()).trim();
      if (output.length > 0) changed.add(pkg.name);
    })
  );

  return changed;
}
