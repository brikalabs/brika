/**
 * Per-plugin grant vector construction.
 *
 * The vector intersects three sets:
 *   1. Grants the hub has registered (= what the platform supports).
 *   2. Grants the plugin manifest requests (= what the author asked for,
 *      via the `grants: {...}` map keyed by reverse-DNS id).
 *   3. Grants the user has permitted (= which permission families the
 *      operator toggled on, stored per-plugin in the StateStore).
 *
 * Manifest shape: a single `grants` map carries per-grant scopes:
 *     { "dev.brika.net.fetch": { allow: ["api.example.com"] } }
 * The map value IS the scope. No wrapping object, no parallel
 * `permissions` array — the family of each grant is read off the
 * registered spec.
 */

import type { GrantId, GrantRegistry, GrantVector } from '@brika/grants';

export type InvalidScopeListener = (id: GrantId, message: string) => void;

/**
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
  const manifest: Record<string, { scope?: unknown }> = {};
  const userGrants: Record<string, unknown> = {};

  if (manifestGrants !== undefined) {
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
  }

  return registry.buildVector(manifest, userGrants, (id, err) => {
    onInvalidScope?.(id, err.issues[0]?.message ?? 'validation failed');
  });
}

/**
 * Families the plugin requests, derived from its declared grant ids by
 * looking up each grant's permission gate in the registry. Used by the
 * UI to show consent toggles and by the hub to surface "which families
 * does this plugin want" without re-parsing the manifest.
 */
export function familiesForManifestGrants(
  registry: GrantRegistry,
  manifestGrants: Readonly<Record<string, unknown>> | undefined
): string[] {
  if (manifestGrants === undefined) {
    return [];
  }
  const out = new Set<string>();
  for (const id of Object.keys(manifestGrants)) {
    const grant = registry.get(id);
    const name = grant?.spec.permission?.name;
    if (name !== undefined) {
      out.add(name);
    }
  }
  return [...out];
}
