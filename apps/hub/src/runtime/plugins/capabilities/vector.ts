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

  return registry.buildVector(manifest as ManifestCapabilities, userGrants as UserGrants);
}

/**
 * Build the vector from the new `capabilities` manifest map plus a user
 * grant map keyed by the same capability ids. This is the target path —
 * the legacy function above shims older state into this shape.
 *
 *   manifest:    Record<capabilityId, { scope?: unknown }>
 *   userGrants:  Record<capabilityId, scope>
 *
 * A capability appears in the vector iff it's registered AND requested by
 * the manifest AND granted by the user. Scope validation happens inside
 * `registry.buildVector`.
 */
/**
 * Derive the legacy permission family list (`['net', 'secrets', ...]`) from
 * a manifest `capabilities` map. Used by `toPlugin` so the UI can keep
 * iterating `plugin.permissions` until the per-capability grant UI lands.
 *
 * A capability whose id is not registered, or which has no permission gate,
 * contributes nothing.
 */
export function permissionFamiliesFromManifestCapabilities(
  registry: CapabilityRegistry,
  manifestCapabilities: Readonly<Record<string, unknown>>
): string[] {
  const families = new Set<string>();
  for (const id of Object.keys(manifestCapabilities)) {
    const cap = registry.get(id);
    if (cap?.spec.permission) {
      families.add(cap.spec.permission.name);
    }
  }
  return [...families];
}

/**
 * Heuristic family extraction from a capability id alone — no registry
 * needed. Used in code paths (`PluginLifecycle.fromStored`) that don't have
 * a PluginProcess registry handy. The convention:
 *
 *   `dev.brika.<family>.<verb>` → family
 *   `com.acme.<family>.<verb>`  → family (best-effort)
 *
 * Ids with fewer than three segments contribute nothing.
 */
export function permissionFamiliesFromIds(ids: ReadonlyArray<string>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const segments = id.split('.');
    if (segments.length >= 3) {
      const family = segments[2];
      if (family !== undefined && family !== '') {
        out.add(family);
      }
    }
  }
  return [...out];
}

/**
 * Compute a plugin's capability vector with user-consent enforcement.
 *
 * The user's legacy `grantedPermissions: string[]` (permission FAMILY names
 * like `net`, `secrets`) is treated as the source of truth. For each
 * manifest-declared capability, the vector includes it only if the spec's
 * `permission.name` family is in the granted set. Always-on capabilities
 * (no permission gate) flow through unconditionally.
 *
 * Drops:
 *   - capabilities not registered with the hub (unknown id)
 *   - capabilities whose family is not in the granted set
 *
 * IMPORTANT: the manifest never auto-grants itself. The plugin declares
 * which capabilities it WANTS; the user decides which families are
 * permitted. This is the same consent model the legacy
 * `vectorForLegacyGrants` enforces — extended to cover the new
 * `capabilities` manifest map.
 *
 * When per-capability scoped grants land in the StateStore, this function
 * will accept a richer `userGrants: Record<id, scope>` instead of the
 * coarse family list.
 */
export function buildVectorWithUserConsent(
  registry: CapabilityRegistry,
  manifestCaps: Readonly<Record<string, unknown>> | undefined,
  grantedPermissionFamilies: ReadonlyArray<string>
): CapabilityVector {
  const granted = new Set(grantedPermissionFamilies);

  // A defined `capabilities` field (even empty `{}`) is the "I've migrated"
  // signal — we use the new path exclusively. Falling back to legacy grants
  // only when the manifest predates the schema (capabilities === undefined).
  if (manifestCaps !== undefined) {
    const userGrants: Record<string, unknown> = {};
    for (const [id, requested] of Object.entries(manifestCaps)) {
      const cap = registry.get(id);
      if (!cap) {
        continue; // Unknown capability — silently drop.
      }
      const perm = cap.spec.permission;
      if (perm === undefined || granted.has(perm.name)) {
        userGrants[id] = requested;
      }
    }
    return vectorFromManifestCapabilities(registry, manifestCaps, userGrants);
  }

  return vectorForLegacyGrants(registry, [...granted]);
}

export function vectorFromManifestCapabilities(
  registry: CapabilityRegistry,
  manifestCapabilities: Readonly<Record<string, unknown>>,
  userGrants: Readonly<Record<string, unknown>>
): CapabilityVector {
  const manifest: Record<string, { scope?: unknown }> = {};
  for (const [id, raw] of Object.entries(manifestCapabilities)) {
    // Manifest entries can be either `{ scope: ... }` shaped or the bare
    // scope value (e.g. `"dev.brika.net.fetch": { allow: [...] }`). Try the
    // structured shape first; if it doesn't look like one, treat the whole
    // value as the scope.
    if (raw && typeof raw === 'object' && 'scope' in raw) {
      manifest[id] = { scope: (raw as { scope?: unknown }).scope };
    } else {
      manifest[id] = { scope: raw };
    }
  }
  return registry.buildVector(
    manifest as ManifestCapabilities,
    userGrants as UserGrants
  );
}
