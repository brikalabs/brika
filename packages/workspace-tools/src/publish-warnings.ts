import type { PackageDetails } from './package-details';

export function getPrivateWorkspaceDependencyWarnings(
  details: PackageDetails,
  privateWorkspacePackageNames: Set<string>
): string[] {
  if (privateWorkspacePackageNames.size === 0 || !details.dependencyNames) return [];
  const warnings: string[] = [];
  for (const dependencyName of details.dependencyNames) {
    if (privateWorkspacePackageNames.has(dependencyName)) {
      warnings.push(`depends on private workspace package "${dependencyName}"`);
    }
  }
  return warnings;
}
