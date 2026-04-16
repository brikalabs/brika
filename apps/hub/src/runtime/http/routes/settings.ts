/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, etc.).
 */

import { HubLocation as HubLocationSchema } from '@brika/ipc/contract';
import { group, route } from '@brika/router';
import { z } from 'zod';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';
import { UPDATE_CHANNEL_IDS } from '@/runtime/updates/channels';

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

    /** Get the configured update channel */
    route.get({
      path: '/update-channel',
      handler: ({ inject }) => {
        return { channel: inject(StateStore).getUpdateChannel() };
      },
    }),

    /** Set the update channel */
    route.put({
      path: '/update-channel',
      body: z.object({ channel: z.enum(UPDATE_CHANNEL_IDS) }),
      handler: async ({ body, inject }) => {
        await inject(StateStore).setUpdateChannel(body.channel);
        return { channel: body.channel };
      },
    }),
  ],
});
