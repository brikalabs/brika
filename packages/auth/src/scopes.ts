/**
 * @brika/auth - Scopes
 *
 * Permission scopes control what actions a user can perform.
 * Each user has an explicit allow-list of scopes stored in DB.
 * New users receive ROLE_SCOPES[role] as defaults.
 *
 * To add a new scope:
 *   1. Add an entry to the scopes object below
 *   2. Optionally add it to ROLE_SCOPES in role-scopes.ts
 */

import { defineScopes } from './lib/define-scopes';

export const { Scope, SCOPES_REGISTRY } = defineScopes({
  scopes: {
    ADMIN_ALL:        { value: 'admin:*',          description: 'Full administrative access' },
    WORKFLOW_READ:    { value: 'workflow:read',     description: 'Read workflows' },
    WORKFLOW_WRITE:   { value: 'workflow:write',    description: 'Create and edit workflows' },
    WORKFLOW_EXECUTE: { value: 'workflow:execute',  description: 'Execute workflows' },
    BOARD_READ:       { value: 'board:read',        description: 'Read boards' },
    BOARD_WRITE:      { value: 'board:write',       description: 'Create and edit boards' },
    PLUGIN_READ:      { value: 'plugin:read',       description: 'List and read plugins' },
    PLUGIN_MANAGE:    { value: 'plugin:manage',     description: 'Install and uninstall plugins' },
    SETTINGS_READ:    { value: 'settings:read',     description: 'Read system settings' },
    SETTINGS_WRITE:   { value: 'settings:write',    description: 'Modify system settings' },
  },
});

export type Scope = (typeof Scope)[keyof typeof Scope];
