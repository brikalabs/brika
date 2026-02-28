/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, etc.).
 */

import { HubLocation as HubLocationSchema } from '@brika/ipc/contract';
import { group, route } from '@brika/router';
import { StateStore } from '@/runtime/state/state-store';

export const settingsRoutes = group({
  prefix: '/api/settings',
  routes: [
    /** Get the hub's configured location */
    route.get({
      path: '/location',
      handler: ({ inject }) => {
        const state = inject(StateStore);
        return { location: state.getHubLocation() };
      },
    }),

    /** Set the hub's location */
    route.put({
      path: '/location',
      body: HubLocationSchema,
      handler: async ({ body, inject }) => {
        const state = inject(StateStore);
        await state.setHubLocation(body);
        return { location: body };
      },
    }),

    /** Clear the hub's location */
    route.delete({
      path: '/location',
      handler: async ({ inject }) => {
        const state = inject(StateStore);
        await state.setHubLocation(null);
        return { ok: true };
      },
    }),
  ],
});
