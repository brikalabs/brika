/**
 * Per-plugin grant vector construction.
 *
 * The vector intersects three sets:
 *   1. Grants the hub has registered (= what the platform supports).
 *   2. Grants the plugin manifest requests (= what the author asked for).
 *   3. Grants the user has permitted (= what's allowed to run).
 *
 * For the migration window, the manifest's legacy `permissions: string[]`
 * (permission FAMILY names like `net`, `secrets`) is treated as a coarse
 * source of permits — every registered grant whose `permission.name` is in
 * the granted list is requested + permitted with its default scope. New
 * plugins use the structured `grants: {...}` manifest map instead, and the
 * vector picks up the per-grant scope verbatim.
 */

import type { GrantRegistry, GrantVector } from '@brika/grants';

interface StructuredManifestEntry {
  readonly scope?: unknown;
}

function isStructuredEntry(value: unknown): value is StructuredManifestEntry {
  return typeof value === 'object' && value !== null && 'scope' in value;
}

/**
 * Build the vector from the legacy `permissions: string[]` shape. Every
 * registered grant gated by a permission whose name appears in the granted
 * list is "requested + permitted" with its default scope.
 */
export function vectorForLegacyPermissions(
  registry: GrantRegistry,
  grantedPermissions: ReadonlyArray<string>
): GrantVector {
  const granted = new Set(grantedPermissions);
  const manifest: Record<string, { scope?: unknown }> = {};
  const userGrants: Record<string, unknown> = {};

  for (const grant of registry.list()) {
    const perm = grant.spec.permission;
    if (perm === undefined) {
      continue;
    }
    if (granted.has(perm.name)) {
      manifest[grant.spec.id] = { scope: perm.defaultScope };
      userGrants[grant.spec.id] = perm.defaultScope;
    }
  }

  return registry.buildVector(manifest, userGrants);
}

/**
 * Build the vector with per-grant scoped permits. The structured manifest
 * map shape:
 *
 *   { "dev.brika.net.fetch": { allow: ["api.example.com"] } }
 *
 * is treated as both the "requested" set and the per-grant scope value
 * (the legacy `permissions: string[]` array supplies the user-permit set).
 *
 * Future: when the StateStore grows a `plugin_grants` table, the second
 * argument changes from a flat family list to a `UserGrants` map keyed
 * by grant id.
 */
export function buildVectorWithUserConsent(
  registry: GrantRegistry,
  manifestGrants: Readonly<Record<string, unknown>> | undefined,
  grantedPermissionFamilies: ReadonlyArray<string>
): GrantVector {
  const granted = new Set(grantedPermissionFamilies);

  // A defined `grants` field (even empty `{}`) is the "I've migrated"
  // signal — use the structured path exclusively. Falling back to legacy
  // only when the manifest predates the schema (grants === undefined).
  if (manifestGrants !== undefined) {
    const userGrants: Record<string, unknown> = {};
    const manifest: Record<string, { scope?: unknown }> = {};
    for (const [id, raw] of Object.entries(manifestGrants)) {
      const grant = registry.get(id);
      if (!grant) {
        continue; // Unknown grant — silently drop.
      }
      const perm = grant.spec.permission;
      if (perm !== undefined && !granted.has(perm.name)) {
        continue;
      }
      // Manifest entries can be either `{ scope: ... }` shaped or the bare
      // scope value (e.g. `"dev.brika.net.fetch": { allow: [...] }`).
      // Treat values with a `scope` key as the structured form; everything
      // else is the bare scope.
      const scope = isStructuredEntry(raw) ? raw.scope : raw;
      manifest[id] = { scope };
      userGrants[id] = scope;
    }
    return registry.buildVector(manifest, userGrants);
  }

  return vectorForLegacyPermissions(registry, [...granted]);
}
