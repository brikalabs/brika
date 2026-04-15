/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, etc.).
 */

import { z } from 'zod';
import { HubLocation as HubLocationSchema } from '@brika/ipc/contract';
import { group, route } from '@brika/router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';

export const settingsRoutes = group({
  prefix: '/api/settings',
  routes: [
    /** Get the hub's configured location */
    route.get({
      path: '/location',
      handler: ({ inject }) => {
        const state = inject(StateStore);
        return {
          location: state.getHubLocation(),
        };
      },
    }),

    /** Set the hub's location */
    route.put({
      path: '/location',
      body: HubLocationSchema,
      handler: async ({ body, inject }) => {
        const state = inject(StateStore);
        await state.setHubLocation(body);
        return {
          location: body,
        };
      },
    }),

    /** Clear the hub's location */
    route.delete({
      path: '/location',
      handler: async ({ inject }) => {
        const state = inject(StateStore);
        await state.setHubLocation(null);
        return {
          ok: true,
        };
      },
    }),

    /** Get the hub's configured timezone */
    route.get({
      path: '/timezone',
      handler: ({ inject }) => {
        const state = inject(StateStore);
        return {
          timezone: state.getHubTimezone(),
        };
      },
    }),

    /** Set the hub's timezone */
    route.put({
      path: '/timezone',
      body: z.object({ timezone: z.string() }),
      handler: async ({ body, inject }) => {
        const state = inject(StateStore);
        if (body.timezone === state.getHubTimezone()) {
          return { timezone: body.timezone };
        }
        await state.setHubTimezone(body.timezone);
        state.applyTimezone();
        inject(PluginManager).broadcastTimezone(body.timezone);
        return {
          timezone: body.timezone,
        };
      },
    }),

    /** Clear the hub's timezone */
    route.delete({
      path: '/timezone',
      handler: async ({ inject }) => {
        const state = inject(StateStore);
        if (state.getHubTimezone() == null) {
          return { ok: true };
        }
        await state.setHubTimezone(null);
        state.applyTimezone();
        inject(PluginManager).broadcastTimezone(null);
        return {
          ok: true,
        };
      },
    }),
  ],
});
