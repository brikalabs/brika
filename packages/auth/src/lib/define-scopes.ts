/**
 * @brika/auth - Scope builder
 *
 * Takes a declarative scope/role config and produces typed Scope constant,
 * ROLE_SCOPES mapping, and SCOPES_REGISTRY metadata.
 */

interface ScopeDef {
  readonly value: string;
  readonly description: string;
}

export interface ScopeRegistryEntry {
  description: string;
  category: string;
}

export interface BuiltScopes<TDefs extends Record<string, ScopeDef>> {
  /** Scope constant — e.g. `Scope.WORKFLOW_READ` → `'workflow:read'` */
  Scope: { readonly [K in keyof TDefs]: TDefs[K]['value'] };
  /** Scope metadata for UI display. */
  SCOPES_REGISTRY: Record<TDefs[keyof TDefs]['value'], ScopeRegistryEntry>;
}

export function defineScopes<const TDefs extends Record<string, ScopeDef>>(config: {
  scopes: TDefs;
}): BuiltScopes<TDefs> {
  const { scopes } = config;

  const Scope = Object.fromEntries(
    Object.entries(scopes).map(([k, v]) => [
      k,
      v.value,
    ])
  ) as BuiltScopes<TDefs>['Scope'];

  const SCOPES_REGISTRY = Object.fromEntries(
    Object.values(scopes).map((def) => [
      def.value,
      {
        description: def.description,
        category: def.value.split(':')[0],
      },
    ])
  ) as BuiltScopes<TDefs>['SCOPES_REGISTRY'];

  return {
    Scope,
    SCOPES_REGISTRY,
  };
}
