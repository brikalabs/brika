/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, themes, etc.).
 */

import { Analytics } from '@brika/analytics';
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
import { UpdateService } from '@/runtime/updates';
import { UPDATE_CHANNEL_IDS } from '@/runtime/updates/channels';

/**
 * Settings writes that touch the update channel or pinned version live
 * here. They're admin-only — a low-privilege user shouldn't be able to
 * pin the hub to an arbitrary tag or flip everyone onto canary.
 *
 * Wired into the admin scope in `routes/index.ts`.
 */
export const settingsAdminRoutes = group({
  prefix: '/api/settings',
  routes: [
    /**
     * Set the update channel. Rejects pinned without a prior version
     * — the orchestrator would otherwise throw on every subsequent
     * `check` ("Pinned channel selected but no version was set").
     */
    route.put({
      path: '/update-channel',
      body: z.object({ channel: z.enum(UPDATE_CHANNEL_IDS) }),
      handler: ({ body, inject }) => {
        const state = inject(StateStore);
        if (body.channel === 'pinned' && state.getPinnedVersion() === null) {
          throw new BadRequest(
            'Cannot switch to pinned channel: set a pinned version first via PUT /api/settings/update-pinned-version.'
          );
        }
        state.setUpdateChannel(body.channel);
        inject(Analytics).capture('settings.update_channel_changed', { channel: body.channel });
        // Drop the cached UpdateInfo so the next `GET /api/system/update`
        // re-fetches against the new channel. Without this the UI would
        // see stale info for up to 6 hours (the TTL on the background
        // checker) — the bug a user hit on the Settings → Hub page.
        inject(UpdateService).invalidate();
        return { channel: body.channel };
      },
    }),

    /**
     * Set the pinned version. Pass `null` to clear. Validation is
     * minimal — semver-ish, leading `v` optional, no spaces. The
     * "is this a real release tag?" check happens lazily on the
     * next `check` (GitHub returns 404 if the tag is bogus).
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
        inject(Analytics).capture('settings.pinned_version_changed', {
          cleared: body.version === null,
        });
        // Same reason as update-channel: drop the cache so the next
        // `check()` fetches against the newly-pinned tag.
        inject(UpdateService).invalidate();
        return { version: body.version };
      },
    }),
  ],
});

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
        inject(Analytics).capture('settings.location_changed', { cleared: false });
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
        inject(Analytics).capture('settings.location_changed', { cleared: true });
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
        inject(Analytics).capture('settings.timezone_changed', {
          timezone: body.timezone,
          cleared: false,
        });
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
        inject(Analytics).capture('settings.timezone_changed', { cleared: true });
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

    /** Get the pinned version (null when not on the `pinned` channel). */
    route.get({
      path: '/update-pinned-version',
      handler: ({ inject }) => {
        return { version: inject(StateStore).getPinnedVersion() };
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
        inject(Analytics).capture('settings.custom_theme_saved');
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
        inject(Analytics).capture('settings.custom_theme_deleted');
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
        inject(Analytics).capture('settings.active_theme_changed', {
          mode: next.mode,
          themeChanged: body.theme !== undefined,
          modeChanged: body.mode !== undefined,
        });
        return next;
      },
    }),
  ],
});
