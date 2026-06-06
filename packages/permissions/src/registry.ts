export interface PermissionDefinition {
  readonly id: string;
  readonly icon: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  /**
   * When true, toggling this permission only takes effect after the plugin
   * process is restarted (the capability is wired at spawn time, e.g. the
   * raw-socket env the sandbox lockdown reads at boot, rather than checked
   * per-call against the grant vector). The hub reloads the plugin on toggle
   * so the change applies without the operator restarting it manually.
   */
  readonly requiresRestart?: boolean;
}

export function createRegistry<
  T extends Record<
    string,
    {
      icon: string;
      requiresRestart?: boolean;
    }
  >,
>(map: T) {
  type P = keyof T & string;

  const PERMISSIONS = Object.fromEntries(
    Object.entries(map).map(([id, meta]) => [
      id,
      {
        id,
        ...meta,
        labelKey: `permissions:${id}`,
        descriptionKey: `permissions:${id}Desc`,
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

  return {
    PERMISSIONS,
    PERMISSION_LIST,
    isValidPermission,
    filterValidPermissions,
  };
}
