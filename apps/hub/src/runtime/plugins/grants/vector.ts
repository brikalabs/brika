/**
 * Per-plugin grant vector construction.
 *
 * The vector intersects three sets:
 *   1. Grants the hub has registered (= what the platform supports).
 *   2. Grants the plugin manifest requests (= what the author asked for).
 *   3. Grants the user has permitted (= what's allowed to run).
 *
 * Two manifest shapes are supported during the migration window:
 *
 *   1. Modern (`grants: {...}` map) — per-grant scope verbatim:
 *        { "dev.brika.net.fetch": { allow: ["api.example.com"] } }
 *      The map value IS the scope. No wrapping object.
 *
 *   2. Legacy (`permissions: string[]`) — coarse family list. Every
 *      registered grant whose `permission.name` is in the list is
 *      requested + permitted with its `defaultScope`.
 *
 * A plugin upgrading to the modern shape declares an explicit `grants`
 * field (even `{}` if it asks for nothing); the legacy path only fires
 * when `grants` is undefined.
 */

import type { GrantId, GrantRegistry, GrantVector } from '@brika/grants';

export type InvalidScopeListener = (id: GrantId, message: string) => void;

/**
 * Build the vector from the legacy `permissions: string[]` shape. Every
 * registered grant gated by a permission whose name appears in the granted
 * list is "requested + permitted" with its default scope.
 */
export function vectorForLegacyPermissions(
  registry: GrantRegistry,
  grantedPermissions: ReadonlyArray<string>,
  onInvalidScope?: InvalidScopeListener
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

  return registry.buildVector(manifest, userGrants, (id, err) => {
    onInvalidScope?.(id, err.issues[0]?.message ?? 'validation failed');
  });
}

/**
 * Build the vector from the structured `grants: {...}` manifest map plus
 * the legacy family list (which still drives per-family user consent
 * until the StateStore grows a per-grant permit table).
 *
 * `onInvalidScope` is invoked once per dropped grant; the caller routes
 * those to the operator log. Without it, scope-validation errors are
 * silently dropped — bad for plugin authors debugging "why didn't my
 * grant land?".
 */
export function buildVectorWithUserConsent(
  registry: GrantRegistry,
  manifestGrants: Readonly<Record<string, unknown>> | undefined,
  grantedPermissionFamilies: ReadonlyArray<string>,
  onInvalidScope?: InvalidScopeListener
): GrantVector {
  const granted = new Set(grantedPermissionFamilies);

  // A defined `grants` field (even empty `{}`) is the "I've migrated"
  // signal — use the modern path exclusively. Legacy mode only fires
  // when the manifest predates the schema (grants === undefined).
  if (manifestGrants === undefined) {
    return vectorForLegacyPermissions(registry, [...granted], onInvalidScope);
  }

  const manifest: Record<string, { scope?: unknown }> = {};
  const userGrants: Record<string, unknown> = {};
  for (const [id, scope] of Object.entries(manifestGrants)) {
    const grant = registry.get(id);
    if (!grant) {
      onInvalidScope?.(id, 'unknown grant — not registered with the hub');
      continue;
    }
    const perm = grant.spec.permission;
    if (perm !== undefined && !granted.has(perm.name)) {
      continue; // permission family not consented to
    }
    manifest[id] = { scope };
    userGrants[id] = scope;
  }
  return registry.buildVector(manifest, userGrants, (id, err) => {
    onInvalidScope?.(id, err.issues[0]?.message ?? 'validation failed');
  });
}
