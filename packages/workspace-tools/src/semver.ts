/**
 * Semver utilities for workspace-tools.
 * Pure functions — no side effects, easily testable.
 */

import { semver } from 'bun';

export type BumpType = 'major' | 'minor' | 'patch';

export const BUMP_TYPES: BumpType[] = [
  'major',
  'minor',
  'patch',
];

/** Returns true if the string is a valid x.y.z version literal. */
export function isExactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}

/** Returns true if the string is a recognised bump keyword. */
export function isBumpType(value: string): value is BumpType {
  return (BUMP_TYPES as string[]).includes(value);
}

/**
 * Compute the next version given the current version and a bump type or
 * exact target version. Throws on invalid input.
 */
export function applyBump(current: string, bump: string): string {
  if (isExactVersion(bump)) {
    return bump;
  }

  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`"${current}" is not a valid semver string.`);
  }
  const [major, minor, patch] = parts as [
    number,
    number,
    number,
  ];

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(
        `Unknown bump type "${bump}". Use major, minor, patch, or an exact x.y.z version.`
      );
  }
}

/**
 * Compare two versions. Returns 0 if equal, -1 if a < b, 1 if a > b.
 * Delegates to Bun's built-in semver.order().
 */
export function compareVersions(a: string, b: string): 0 | 1 | -1 {
  return semver.order(a, b);
}
