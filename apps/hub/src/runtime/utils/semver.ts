/**
 * Semantic Versioning Utilities
 *
 * Lightweight semver implementation for version comparison and range matching.
 * Supports common semver patterns: ^, ~, >=, >, exact, and ranges.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Parse a semver string into components.
 *
 * @param version - Version string (e.g., "1.2.3", "1.2.3-alpha.1+build.123")
 * @returns Parsed semver object or null if invalid
 */
export function parse(version: string): SemVer | null {
  const match = new RegExp(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/
  ).exec(version);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Compare two semver versions.
 *
 * @returns -1 if a < b, 0 if a === b, 1 if a > b, null if either version is invalid
 */
export function compare(a: string, b: string): -1 | 0 | 1 | null {
  const aSemVer = parse(a);
  const bSemVer = parse(b);

  if (!aSemVer || !bSemVer) {
    return null;
  }

  // Compare major
  if (aSemVer.major !== bSemVer.major) {
    return aSemVer.major > bSemVer.major ? 1 : -1;
  }

  // Compare minor
  if (aSemVer.minor !== bSemVer.minor) {
    return aSemVer.minor > bSemVer.minor ? 1 : -1;
  }

  // Compare patch
  if (aSemVer.patch !== bSemVer.patch) {
    return aSemVer.patch > bSemVer.patch ? 1 : -1;
  }

  // Compare prerelease (versions with prerelease are less than without)
  if (aSemVer.prerelease && !bSemVer.prerelease) {
    return -1;
  }
  if (!aSemVer.prerelease && bSemVer.prerelease) {
    return 1;
  }
  if (aSemVer.prerelease && bSemVer.prerelease) {
    return aSemVer.prerelease > bSemVer.prerelease
      ? 1
      : aSemVer.prerelease < bSemVer.prerelease
        ? -1
        : 0;
  }

  return 0;
}

/**
 * Check if version A is greater than version B.
 */
export function gt(a: string, b: string): boolean {
  return compare(a, b) === 1;
}

/**
 * Check if version A is greater than or equal to version B.
 */
export function gte(a: string, b: string): boolean {
  const result = compare(a, b);
  return result === 1 || result === 0;
}

/**
 * Check if version a is less than version b.
 */
export function lt(a: string, b: string): boolean {
  return compare(a, b) === -1;
}

/**
 * Check if version a is less than or equal to version b.
 */
export function lte(a: string, b: string): boolean {
  const result = compare(a, b);
  return result === -1 || result === 0;
}

/**
 * Check if version a equals version b.
 */
export function eq(a: string, b: string): boolean {
  return compare(a, b) === 0;
}

/**
 * Check if version satisfies a semver range.
 *
 * Supported ranges:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (compatible with 1.x.x)
 * - Tilde: "~1.2.3" (compatible with 1.2.x)
 * - Greater than: ">1.2.3", ">=1.2.3"
 * - Less than: "<1.2.3", "<=1.2.3"
 * - Range: ">=1.2.3 <2.0.0"
 *
 * @param version - Version to check
 * @param range - Semver range expression
 * @returns true if version satisfies range, false otherwise
 */
export function satisfies(version: string, range: string): boolean {
  const ver = parse(version);
  if (!ver) {
    return false;
  }

  // Handle range with spaces (e.g., ">=1.2.3 <2.0.0")
  if (range.includes(' ')) {
    const parts = range.split(/\s+/);
    return parts.every((part) => satisfies(version, part));
  }

  // Exact version
  if (!new RegExp(/^[~^><=]/).exec(range)) {
    return eq(version, range);
  }

  // Caret range (^)
  if (range.startsWith('^')) {
    const targetVersion = range.slice(1);
    const target = parse(targetVersion);
    if (!target) {
      return false;
    }

    // For 0.x.y, only minor version must match (0.x is not stable)
    if (target.major === 0) {
      return ver.major === target.major && ver.minor === target.minor && ver.patch >= target.patch;
    }

    // For x.y.z where x > 0, major must match and version >= target
    return ver.major === target.major && gte(version, targetVersion);
  }

  // Tilde range (~)
  if (range.startsWith('~')) {
    const targetVersion = range.slice(1);
    const target = parse(targetVersion);
    if (!target) {
      return false;
    }

    return ver.major === target.major && ver.minor === target.minor && ver.patch >= target.patch;
  }

  // Greater than or equal (>=)
  if (range.startsWith('>=')) {
    const targetVersion = range.slice(2).trim();
    return gte(version, targetVersion);
  }

  // Greater than (>)
  if (range.startsWith('>')) {
    const targetVersion = range.slice(1).trim();
    return gt(version, targetVersion);
  }

  // Less than or equal (<=)
  if (range.startsWith('<=')) {
    const targetVersion = range.slice(2).trim();
    return lte(version, targetVersion);
  }

  // Less than (<)
  if (range.startsWith('<')) {
    const targetVersion = range.slice(1).trim();
    return lt(version, targetVersion);
  }

  return false;
}

/**
 * Get the highest version from a list of versions.
 *
 * @param versions - Array of version strings
 * @returns Highest version or null if array is empty or contains invalid versions
 */
export function maxSatisfying(versions: string[], range?: string): string | null {
  if (versions.length === 0) {
    return null;
  }

  let filtered = versions;

  // Filter by range if provided
  if (range) {
    filtered = versions.filter((v) => satisfies(v, range));
  }

  if (filtered.length === 0) {
    return null;
  }

  // Find maximum
  return filtered.reduce((max, current) => {
    const cmp = compare(current, max);
    return cmp === 1 ? current : max;
  });
}

/**
 * Check if version is valid semver.
 */
export function isValid(version: string): boolean {
  return parse(version) !== null;
}

/**
 * Coerce version string to valid semver.
 * Attempts to extract version numbers from non-standard formats.
 *
 * @param version - Version string to coerce
 * @returns Valid semver string or null if cannot be coerced
 */
export function coerce(version: string): string | null {
  // Already valid
  if (isValid(version)) {
    return version;
  }

  // Try to extract version numbers
  const match = new RegExp(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/).exec(version);
  if (!match) {
    return null;
  }

  const major = match[1] || '0';
  const minor = match[2] || '0';
  const patch = match[3] || '0';

  return `${major}.${minor}.${patch}`;
}
