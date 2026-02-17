/**
 * Plugin Permission System
 *
 * Typed, extensible permission definitions shared between hub and UI.
 * Each permission controls access to a specific hub capability.
 *
 * ## Adding a new permission
 * 1. Add the permission ID to the `Permission` union type
 * 2. Add a `PermissionDefinition` entry to `PERMISSIONS`
 * 3. Add i18n keys in `apps/hub/locales/{en,fr}/plugins.json` → `permissions`
 * 4. Implement the hub-side check in the relevant IPC handler
 *
 * ## Security model
 * - Plugins declare required permissions in `package.json` → `"permissions": ["location"]`
 * - On first install, declared permissions are auto-granted (can be revoked by user)
 * - Hub validates grants at runtime before returning protected data
 * - Only permissions in the `PERMISSIONS` registry are recognized; unknown values are ignored
 * - The UI only displays permissions that exist in the registry
 */

// ─────────────────────────────────────────────────────────────────────────────
// Permission IDs — union type of all known permissions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All recognized plugin permission identifiers.
 * This is the single source of truth for valid permission values.
 */
export type Permission = 'location';

/**
 * Type guard to check if a string is a valid permission.
 */
export function isValidPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/**
 * Filter an array of strings to only valid permissions.
 * Unknown permission strings are silently dropped.
 */
export function filterValidPermissions(values: string[]): Permission[] {
  return values.filter(isValidPermission);
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission Definitions — metadata for each permission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static metadata for a permission.
 * Used by the UI to display permission info and by the hub for validation.
 */
export interface PermissionDefinition {
  /** Unique permission identifier */
  readonly id: Permission;
  /** Lucide icon name for UI display */
  readonly icon: string;
  /** i18n key for the permission label (e.g., "plugins:permissions.location") */
  readonly labelKey: string;
  /** i18n key for the permission description */
  readonly descriptionKey: string;
}

/**
 * Registry of all known permissions with their metadata.
 * Keyed by permission ID for O(1) lookup.
 */
export const PERMISSIONS: Readonly<Record<Permission, PermissionDefinition>> = {
  location: {
    id: 'location',
    icon: 'map-pin',
    labelKey: 'plugins:permissions.location',
    descriptionKey: 'plugins:permissions.locationDesc',
  },
} as const;

/**
 * All permission definitions as an ordered array.
 * Useful for rendering lists in the UI.
 */
export const PERMISSION_LIST: readonly PermissionDefinition[] = Object.values(PERMISSIONS);
