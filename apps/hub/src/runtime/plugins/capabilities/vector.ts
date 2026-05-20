/**
 * Per-plugin capability vector construction.
 *
 * The vector is what a plugin actually has — the intersection of:
 *   1. Capabilities the hub has registered (= what the platform supports).
 *   2. Capabilities the plugin manifest requests (= what the author asked for).
 *   3. Capabilities the user has granted (= what's permitted to run).
 *
 * For the bridging period where manifests still carry the old `permissions`
 * array (not yet a per-capability map), we treat each legacy permission as
 * "grant every capability whose permission.name matches". When the manifest
 * format upgrades to scoped grants, this function changes — the vector
 * shape over the wire does not.
 */

import type {
  CapabilityRegistry,
  CapabilityVector,
  ManifestCapabilities,
  UserGrants,
} from '@brika/capabilities';

/**
 * Build a manifest+grants pair from the legacy `grantedPermissions: string[]`
 * shape. Every registered capability gated by a permission whose name
 * appears in the granted list is "requested + granted" with its default
 * scope.
 */
export function vectorForLegacyGrants(
  registry: CapabilityRegistry,
  grantedPermissions: ReadonlyArray<string>
): CapabilityVector {
  const granted = new Set(grantedPermissions);
  const manifest: Record<string, { scope?: unknown }> = {};
  const userGrants: Record<string, unknown> = {};

  for (const cap of registry.list()) {
    const perm = cap.spec.permission;
    if (perm === undefined) {
      continue;
    }
    if (granted.has(perm.name)) {
      // Default scope is what existing plugins effectively had: full access
      // within the legacy boolean permission. When manifests carry scoped
      // grants, this is the only line that changes.
      manifest[cap.spec.id] = { scope: perm.defaultScope };
      userGrants[cap.spec.id] = perm.defaultScope;
    }
  }

  return registry.buildVector(
    manifest as ManifestCapabilities,
    userGrants as UserGrants
  );
}
