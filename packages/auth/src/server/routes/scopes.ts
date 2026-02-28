/**
 * Scope routes — list available scopes (public)
 */

import { route } from '@brika/router';
import { inject } from '@brika/di';
import { ScopeService } from '../../services/ScopeService';

/** GET /scopes — List all available scopes */
const listScopes = route.get({ path: '/scopes', handler: () => {
  const scopeService = inject(ScopeService);

  return {
    scopes: scopeService.getRegistry(),
    categories: ['admin', 'workflow', 'board', 'plugin', 'settings'],
  };
}});

export const scopeRoutes = [listScopes];
