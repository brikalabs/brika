/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, etc.).
 */

import { requireSession, UserPreferencesService } from '@brika/auth/server';
import {
  ActiveThemeUpdate,
  type ColorModeType,
  HubLocation as HubLocationSchema,
  ThemeConfig,
} from '@brika/ipc/contract';
import { group, NotFound, route } from '@brika/router';
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
        if (state.getHubTimezone() === null) {
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

    // ─── Per-user theme preference ─────────────────────────────────────────

    /** Get the caller's active theme + color mode. */
    route.get({
      path: '/theme',
      handler: (ctx) => {
        const session = requireSession(ctx);
        const prefs = ctx.inject(UserPreferencesService).get(session.userId);
        return {
          theme: prefs.activeTheme,
          mode: (prefs.colorMode ?? 'system') satisfies ColorModeType,
        };
      },
    }),

    /** Patch active theme and/or color mode for the caller. */
    route.put({
      path: '/theme',
      body: ActiveThemeUpdate,
      handler: (ctx) => {
        const session = requireSession(ctx);
        const prefs = ctx.inject(UserPreferencesService);
        const patch: Partial<{ activeTheme: string | null; colorMode: ColorModeType | null }> = {};
        if (ctx.body.theme !== undefined) {
          patch.activeTheme = ctx.body.theme;
        }
        if (ctx.body.mode !== undefined) {
          patch.colorMode = ctx.body.mode;
        }
        const next = prefs.update(session.userId, patch);
        return {
          theme: next.activeTheme,
          mode: (next.colorMode ?? 'system') satisfies ColorModeType,
        };
      },
    }),

    // ─── Custom themes library (hub-global) ────────────────────────────────

    /** List every custom theme stored on the hub. */
    route.get({
      path: '/custom-themes',
      handler: ({ inject }) => {
        return { themes: inject(StateStore).listCustomThemes() };
      },
    }),

    /** Fetch a single custom theme by id. */
    route.get({
      path: '/custom-themes/:id',
      params: z.object({ id: z.string() }),
      handler: ({ params, inject }) => {
        const theme = inject(StateStore).getCustomTheme(params.id);
        if (!theme) {
          throw new NotFound(`Theme not found: ${params.id}`);
        }
        return { theme };
      },
    }),

    /** Upsert a custom theme. Path id must match body id. */
    route.put({
      path: '/custom-themes/:id',
      params: z.object({ id: z.string() }),
      body: ThemeConfig,
      handler: async ({ params, body, inject }) => {
        if (body.id !== params.id) {
          throw new NotFound(`Path id ${params.id} does not match body id ${body.id}`);
        }
        const saved = inject(StateStore).upsertCustomTheme(body);
        await inject(EventSystem).dispatch(
          ThemeActions.invalidate.create({ themeId: saved.id, reason: 'upsert' })
        );
        return { theme: saved };
      },
    }),

    /** Delete a custom theme. No-op if already absent. */
    route.delete({
      path: '/custom-themes/:id',
      params: z.object({ id: z.string() }),
      handler: async ({ params, inject }) => {
        const removed = inject(StateStore).removeCustomTheme(params.id);
        if (removed) {
          await inject(EventSystem).dispatch(
            ThemeActions.invalidate.create({ themeId: params.id, reason: 'remove' })
          );
        }
        return { ok: true };
      },
    }),
  ],
});
