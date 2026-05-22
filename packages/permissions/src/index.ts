import { createRegistry } from './registry';

// Add new permissions here.
export const { PERMISSIONS, PERMISSION_LIST, isValidPermission, filterValidPermissions } =
  createRegistry({
    location: {
      icon: 'map-pin',
    },
    secrets: {
      icon: 'key-round',
    },
    net: {
      icon: 'globe',
    },
  });

export type Permission = keyof typeof PERMISSIONS;
export type { PermissionDefinition } from './registry';
