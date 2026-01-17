import { semver } from '@/runtime/utils';

// Re-export hub version from centralized module
export { HUB_VERSION } from '../../hub';

/**
 * Get current timestamp in milliseconds.
 */
export function now(): number {
  return Date.now();
}

/**
 * Generate a deterministic UID from the plugin name.
 * Uses Bun.hash (64-bit) converted to base36 for a stable, URL-safe identifier.
 */
export function generateUid(pluginName: string): string {
  const hash = Bun.hash(pluginName);
  return hash.toString(36);
}

/**
 * Check if a version satisfies a semver range.
 *
 * This is a wrapper around the centralized semver.satisfies utility.
 * Uses the robust semver implementation from @/runtime/utils.
 *
 * Supports: ^x.y.z, ~x.y.z, >=x.y.z, >x.y.z, <=x.y.z, <x.y.z, x.y.z, and ranges
 *
 * @param version - Version to check
 * @param range - Semver range expression
 * @returns true if version satisfies range
 *
 * @example
 * ```ts
 * satisfiesVersion('1.2.3', '^1.0.0') // true
 * satisfiesVersion('0.2.5', '^0.2.0') // true
 * satisfiesVersion('2.0.0', '^1.0.0') // false
 * ```
 */
export function satisfiesVersion(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}
