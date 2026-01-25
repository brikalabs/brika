/**
 * Check if version A is greater than or equal to version B.
 */
export function gte(a: string, b: string): boolean {
  try {
    const result = Bun.semver.order(a, b);
    return result === 1 || result === 0;
  } catch {
    return false;
  }
}
/**
 * Check if version satisfies a semver range using Bun's native semver API.
 *
 * Supported ranges:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (compatible with 1.x.x)
 * - Tilde: "~1.2.3" (compatible with 1.2.x)
 * - Greater than: ">1.2.3", ">=1.2.3"
 * - Less than: "<1.2.3", "<=1.2.3"
 * - Range: ">=1.2.3 <2.0.0"
 * - Wildcards: "1.x", "1.2.x"
 *
 * @param version - Version to check
 * @param range - Semver range expression
 * @returns true if version satisfies range, false otherwise
 */
export function satisfies(version: string, range: string): boolean {
  return Bun.semver.satisfies(version, range);
}

/**
 * Get the highest version from a list of versions that satisfies the given range.
 *
 * @param versions - Array of version strings
 * @param range - Optional semver range to filter by
 * @returns Highest version or null if array is empty or no versions satisfy the range
 */
export function maxSatisfying(versions: string[], range?: string): string | null {
  if (versions.length === 0) {
    return null;
  }

  // Filter by range if provided, using Bun's native satisfies
  const filtered = range ? versions.filter((v) => Bun.semver.satisfies(v, range)) : versions;

  if (filtered.length === 0) {
    return null;
  }

  // Sort using Bun's native order and return the highest (last element)
  const sorted = filtered.toSorted((a, b) => {
    try {
      return Bun.semver.order(a, b);
    } catch {
      return 0;
    }
  });
  return sorted.at(-1) ?? null;
}

/**
 * Check if version is valid semver using Bun's native API.
 */
export function isValid(version: string): boolean {
  try {
    // If order() doesn't throw, it's a valid version
    Bun.semver.order(version, version);
    return true;
  } catch {
    return false;
  }
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
