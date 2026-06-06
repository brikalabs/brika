import { createRegistry } from './registry';

/**
 * UI-facing metadata for permission families. The grants registry in
 * `@brika/grants` is the runtime source of truth — these entries only
 * carry per-family display data (icon, i18n keys) that the consent UI
 * uses to render a toggle. Keep in sync with the families declared on
 * SDK grant specs under `packages/sdk/src/grants/*`.
 */
export const { PERMISSIONS, PERMISSION_LIST, isValidPermission, filterValidPermissions } =
  createRegistry({
    location: { icon: 'map-pin' },
    secrets: { icon: 'key-round' },
    net: { icon: 'globe' },
    rawSocket: { icon: 'ethernet-port', requiresRestart: true },
    fs: { icon: 'folder' },
    ws: { icon: 'plug' },
    dns: { icon: 'globe-2' },
    ui: { icon: 'mouse-pointer-square' },
  });

export type Permission = keyof typeof PERMISSIONS;
export type { PermissionDefinition } from './registry';
