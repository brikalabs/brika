/**
 * @brika/auth - Roles
 *
 * User roles determine the default set of scopes granted to a user.
 *
 * To add a new role:
 *   1. Add an entry below with its default scopes
 */

import { defineRoles } from './lib/define-roles';
import { Scope } from './scopes';

export const { Role, ROLE_SCOPES } = defineRoles({
  ADMIN: {
    value: 'admin',
    defaultScopes: [
      Scope.ADMIN_ALL,
    ],
  },
  USER: {
    value: 'user',
    defaultScopes: [
      Scope.WORKFLOW_READ,
      Scope.WORKFLOW_WRITE,
      Scope.WORKFLOW_EXECUTE,
      Scope.BOARD_READ,
      Scope.BOARD_WRITE,
      Scope.PLUGIN_READ,
      Scope.SETTINGS_READ,
    ],
  },
  GUEST: {
    value: 'guest',
    defaultScopes: [
      Scope.WORKFLOW_READ,
      Scope.BOARD_READ,
      Scope.PLUGIN_READ,
    ],
  },
  SERVICE: {
    value: 'service',
    defaultScopes: [],
  },
});

export type Role = (typeof Role)[keyof typeof Role];
