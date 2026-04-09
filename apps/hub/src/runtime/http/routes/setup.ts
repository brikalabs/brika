/**
 * Hub-level Setup Routes
 *
 * Extends the auth setup with hub-specific state (setupCompleted flag).
 * The status endpoint is public; the complete endpoint requires auth.
 */

import { UserService } from '@brika/auth/server';
import { group, route } from '@brika/router';
import { StateStore } from '@/runtime/state/state-store';

/**
 * GET /api/setup/status — Public
 * Combines auth (hasAdmin) + hub state (setupCompleted) to determine if onboarding is needed.
 */
export const hubSetupPublicRoutes = group({
  prefix: '/api/setup',
  routes: [
    route.get({
      path: '/status',
      handler: ({ inject }) => {
        const userService = inject(UserService);
        const state = inject(StateStore);
        const hasAdmin = userService.hasAdmin();
        const setupCompleted = state.isSetupCompleted();
        return { needsSetup: !hasAdmin || !setupCompleted };
      },
    }),
  ],
});

/**
 * POST /api/setup/complete — Protected (requireAuth applied at group level)
 * Marks the onboarding wizard as fully completed.
 */
export const hubSetupProtectedRoutes = group({
  prefix: '/api/setup',
  routes: [
    route.post({
      path: '/complete',
      handler: async ({ inject }) => {
        const state = inject(StateStore);
        await state.setSetupCompleted(true);
        return { ok: true };
      },
    }),
  ],
});
