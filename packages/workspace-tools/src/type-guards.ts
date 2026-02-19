/**
 * Shared type guard utilities for workspace-tools.
 * Pure functions — no side effects.
 */

/** Returns true if `value` is a non-null object (i.e. can be used as a Record). */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
