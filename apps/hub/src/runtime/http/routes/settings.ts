/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, themes, etc.).
 */

import {
  ActiveThemeUpdate as ActiveThemeUpdateSchema,
  HubLocation as HubLocationSchema,
  ThemeConfig as ThemeConfigSchema,
} from '@brika/ipc/contract';
import { BadRequest, group, route } from '@brika/router';
import { z } from 'zod';
import { ThemeActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
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
      handler: ({ body, inject }) => {
        const state = inject(StateStore);
        state.setHubLocation(body);
        return {
          location: body,
        };
      },
    }),

    /** Clear the hub's location */
    route.delete({
      path: '/location',
      handler: ({ inject }) => {
        const state = inject(StateStore);
        state.setHubLocation(null);
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
      handler: ({ body, inject }) => {
        const state = inject(StateStore);
        if (body.timezone === state.getHubTimezone()) {
          return { timezone: body.timezone };
        }
        state.setHubTimezone(body.timezone);
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
      handler: ({ inject }) => {
        const state = inject(StateStore);
        if (state.getHubTimezone() === null) {
          return { ok: true };
        }
        state.setHubTimezone(null);
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
      handler: ({ body, inject }) => {
        inject(StateStore).setUpdateChannel(body.channel);
        return { channel: body.channel };
      },
    }),

    /** Get the pinned version (null when not on the `pinned` channel). */
    route.get({
      path: '/update-pinned-version',
      handler: ({ inject }) => {
        return { version: inject(StateStore).getPinnedVersion() };
      },
    }),

    /**
     * Set the pinned version. Pass an empty string or omit to clear.
     * Validation is minimal — semver-ish, leading `v` optional, no
     * spaces. The actual "is this a known release tag?" check happens
     * lazily on the next `check` (GitHub returns 404 if the tag is
     * bogus).
     */
    route.put({
      path: '/update-pinned-version',
      body: z.object({
        version: z
          .string()
          .regex(/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u)
          .nullable(),
      }),
      handler: ({ body, inject }) => {
        inject(StateStore).setPinnedVersion(body.version);
        return { version: body.version };
      },
    }),

    /** List all custom themes */
    route.get({
      path: '/custom-themes',
      handler: ({ inject }) => ({
        themes: inject(StateStore).listCustomThemes(),
      }),
    }),

    /** Upsert a custom theme by id */
    route.put({
      path: '/custom-themes/:id',
      params: z.object({ id: z.string() }),
      body: ThemeConfigSchema,
      handler: ({ params, body, inject }) => {
        if (body.id !== params.id) {
          throw new BadRequest('Theme id in body does not match path');
        }
        inject(StateStore).upsertCustomTheme(body);
        inject(EventSystem).dispatch(ThemeActions.customThemesChanged.create({}, 'hub'));
        return { theme: body };
      },
    }),

    /** Delete a custom theme by id */
    route.delete({
      path: '/custom-themes/:id',
      params: z.object({ id: z.string() }),
      handler: ({ params, inject }) => {
        inject(StateStore).deleteCustomTheme(params.id);
        inject(EventSystem).dispatch(ThemeActions.customThemesChanged.create({}, 'hub'));
        return { ok: true };
      },
    }),

    /** Get the active theme + color mode */
    route.get({
      path: '/theme',
      handler: ({ inject }) => inject(StateStore).getActiveTheme(),
    }),

    /** Patch the active theme + color mode (either field is optional) */
    route.put({
      path: '/theme',
      body: ActiveThemeUpdateSchema,
      handler: ({ body, inject }) => {
        const next = inject(StateStore).setActiveTheme(body);
        inject(EventSystem).dispatch(
          ThemeActions.activeChanged.create({ theme: next.theme, mode: next.mode }, 'hub')
        );
        return next;
      },
    }),
  ],
});
