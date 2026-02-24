export interface PermissionDefinition {
  readonly id: string;
  readonly icon: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
}

export function createRegistry<T extends Record<string, { icon: string }>>(map: T) {
  type P = keyof T & string;

  const PERMISSIONS = Object.fromEntries(
    Object.entries(map).map(([id, meta]) => [
      id,
      {
        id,
        ...meta,
        labelKey: `plugins:permissions.${id}`,
        descriptionKey: `plugins:permissions.${id}Desc`,
      },
    ])
  ) as Readonly<Record<P, PermissionDefinition>>;

  const PERMISSION_LIST: readonly PermissionDefinition[] = Object.values(PERMISSIONS);

  function isValidPermission(value: string): value is P {
    return Object.hasOwn(PERMISSIONS, value);
  }

  function filterValidPermissions(values: string[]): P[] {
    return values.filter(isValidPermission);
  }

  return { PERMISSIONS, PERMISSION_LIST, isValidPermission, filterValidPermissions };
}
