/**
 * @brika/auth/server - All Routes
 *
 * Combines auth, session, profile, user, and scope routes.
 * Login and scopes are public; everything else requires authentication.
 */

import { combineRoutes, group } from '@brika/router';
import { requireAuth } from '../../middleware/requireAuth';
import { authProtectedRoutes, authPublicRoutes } from './auth';
import { profileRoutes } from './profile';
import { scopeRoutes } from './scopes';
import { sessionRoutes } from './sessions';
import { setupRoutes } from './setup';
import { userRoutes } from './users';

export const allAuthRoutes = combineRoutes(
  group({
    prefix: '/api/auth',
    routes: [authPublicRoutes, scopeRoutes],
  }),
  group({
    prefix: '/api/auth/setup',
    routes: [setupRoutes],
  }),
  group({
    prefix: '/api/auth',
    middleware: [requireAuth()],
    routes: [authProtectedRoutes, sessionRoutes, profileRoutes],
  }),
  userRoutes
);
