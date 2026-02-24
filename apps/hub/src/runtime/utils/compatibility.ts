import { HUB_VERSION } from '@/hub';
import type { CompatibilityResult } from '@/runtime/store/types';
import * as semver from './semver';

/**
 * Check if a plugin's engine requirement is compatible with the current Brika version.
 *
 * This function is used to validate plugin compatibility before installation or during
 * plugin discovery in the store. It uses semver range matching to determine if the
 * current Brika version satisfies the plugin's engine requirements.
 *
 * @param engineRequirement - The semver range from plugin's engines.brika field (e.g., "^0.2.0", ">=1.0.0")
 * @param currentVersion - Optional version to check against (defaults to current HUB_VERSION)
 * @returns Compatibility result with detailed reason if incompatible
 *
 * @example
 * ```ts
 * // Check if plugin is compatible with current Brika version
 * const result = checkCompatibility("^0.2.0");
 * if (!result.compatible) {
 *   console.error(result.reason);
 * }
 *
 * // Check compatibility with a specific version
 * const result = checkCompatibility("^0.2.0", "0.3.0");
 * ```
 */
export function checkCompatibility(
  engineRequirement: string | undefined,
  currentVersion: string = HUB_VERSION
): CompatibilityResult {
  // No requirement specified
  if (!engineRequirement) {
    return {
      compatible: false,
      reason: 'No engine requirement specified (missing engines.brika field)',
    };
  }

  // Validate current version
  if (!semver.isValid(currentVersion)) {
    return {
      compatible: false,
      reason: `Invalid current version: ${currentVersion}`,
    };
  }

  try {
    // Check if current version satisfies the requirement
    const satisfied = semver.satisfies(currentVersion, engineRequirement);

    if (satisfied) {
      return { compatible: true };
    }

    return {
      compatible: false,
      reason: `Requires Brika ${engineRequirement}, current version is ${currentVersion}`,
    };
  } catch {
    return {
      compatible: false,
      reason: `Invalid engine requirement: ${engineRequirement}`,
    };
  }
}

/**
 * Check if a plugin version satisfies minimum version requirements.
 *
 * Useful for verified plugins that specify a minimum version.
 *
 * @param pluginVersion - Current plugin version
 * @param minVersion - Minimum required version
 * @returns true if plugin version >= minVersion
 */
export function meetsMinimumVersion(
  pluginVersion: string,
  minVersion: string | undefined
): boolean {
  if (!minVersion) {
    return true; // No minimum version requirement
  }

  return semver.gte(pluginVersion, minVersion);
}

/**
 * Check compatibility and provide detailed information for user display.
 *
 * This is a higher-level function that provides more context for UI display.
 *
 * @param pluginManifest - Plugin manifest with engines field
 * @returns Extended compatibility result with suggestions
 */
export function checkPluginCompatibility(pluginManifest: {
  name: string;
  version: string;
  engines?: { brika?: string };
}): CompatibilityResult & { suggestion?: string } {
  const result = checkCompatibility(pluginManifest.engines?.brika);

  if (!result.compatible && !pluginManifest.engines?.brika) {
    return {
      ...result,
      suggestion: `Contact the plugin author to add Brika version requirements`,
    };
  }

  if (!result.compatible) {
    // Provide helpful suggestion
    const requirement = pluginManifest.engines!.brika!;

    return {
      ...result,
      suggestion: `This plugin requires Brika ${requirement}. Please update Brika or use an older version of this plugin.`,
    };
  }

  return result;
}
