/**
 * @brika/auth - Role builder
 *
 * Takes a declarative role config and produces typed Role constant
 * and ROLE_SCOPES mapping.
 */

interface RoleDef<TScope extends string> {
  readonly value: string;
  readonly defaultScopes: readonly TScope[];
}

export interface BuiltRoles<TDefs extends Record<string, RoleDef<string>>> {
  /** Role constant — e.g. `Role.ADMIN` → `'admin'` */
  Role: { readonly [K in keyof TDefs]: TDefs[K]['value'] };
  /** Default scopes for each role (keyed by role value). */
  ROLE_SCOPES: { [K in keyof TDefs as TDefs[K]['value']]: readonly [...TDefs[K]['defaultScopes']] };
}

export function defineRoles<const TDefs extends Record<string, RoleDef<string>>>(
  defs: TDefs,
): BuiltRoles<TDefs> {
  const Role = Object.fromEntries(
    Object.entries(defs).map(([k, v]) => [k, v.value]),
  ) as BuiltRoles<TDefs>['Role'];

  const ROLE_SCOPES = Object.fromEntries(
    Object.entries(defs).map(([, v]) => [v.value, v.defaultScopes]),
  ) as BuiltRoles<TDefs>['ROLE_SCOPES'];

  return { Role, ROLE_SCOPES };
}
