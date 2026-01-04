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
 * Parse a semver version string into components.
 */
function parseVersion(v: string): [number, number, number] {
  const parts = v
    .replace(/^[^\d]*/, '')
    .split('.')
    .map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Simple semver range check.
 * Supports: ^x.y.z, ~x.y.z, >=x.y.z, x.y.z
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const [major, minor, patch] = parseVersion(version);
  const rangeClean = range.trim();

  if (rangeClean.startsWith('^')) {
    // ^x.y.z - compatible with version (same major, >= minor.patch)
    const [rMajor, rMinor, rPatch] = parseVersion(rangeClean.slice(1));
    if (major !== rMajor) return false;
    if (minor > rMinor) return true;
    if (minor === rMinor && patch >= rPatch) return true;
    return false;
  }

  if (rangeClean.startsWith('~')) {
    // ~x.y.z - approximately equivalent (same major.minor, >= patch)
    const [rMajor, rMinor, rPatch] = parseVersion(rangeClean.slice(1));
    if (major !== rMajor || minor !== rMinor) return false;
    return patch >= rPatch;
  }

  if (rangeClean.startsWith('>=')) {
    const [rMajor, rMinor, rPatch] = parseVersion(rangeClean.slice(2));
    if (major > rMajor) return true;
    if (major === rMajor && minor > rMinor) return true;
    if (major === rMajor && minor === rMinor && patch >= rPatch) return true;
    return false;
  }

  // Exact version match
  const [rMajor, rMinor, rPatch] = parseVersion(rangeClean);
  return major === rMajor && minor === rMinor && patch === rPatch;
}
