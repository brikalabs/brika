import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Analytics } from '@brika/analytics';
import { isValidPermission, PERMISSIONS } from '@brika/permissions';
import type { Plugin } from '@brika/plugin';
import { group, route, UnprocessableEntity } from '@brika/router';
import { z } from 'zod';
import { brikaContext } from '@/runtime/context/brika-context';
import { getProcessMetrics, MetricsStore } from '@/runtime/metrics';
import { ModuleCompiler } from '@/runtime/modules';
import { MODULE_KINDS, resolveModuleUrl } from '@/runtime/modules/module-kinds';
import { DiskUsageCache } from '@/runtime/plugins/disk-usage';
import { pluginDataDir } from '@/runtime/plugins/fs-dirs';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginPermissionService } from '@/runtime/plugins/plugin-permissions';
import { PluginRegistry } from '@/runtime/registry';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { StateStore } from '@/runtime/state/state-store';
import { getOrThrow } from '../utils/resource-helpers';
import { safePath } from '../utils/safe-path';

/** Enrich plugin pages with pre-built moduleUrl for cache-busting. */
function enrichPages(plugin: Plugin, compiler: ModuleCompiler) {
  if (!plugin.pages.length) {
    return plugin.pages;
  }
  return plugin.pages.map((page) => ({
    ...page,
    moduleUrl: resolveModuleUrl(compiler, plugin.name, plugin.uid, MODULE_KINDS.page, page.id),
  }));
}

function enrichPlugin(plugin: Plugin, compiler: ModuleCompiler) {
  return { ...plugin, pages: enrichPages(plugin, compiler) };
}

/**
 * Create a generic plugin action handler
 */
const createPluginAction = (
  action: keyof Pick<PluginManager, 'enable' | 'disable' | 'reload' | 'kill'>
) =>
  route.post({
    path: `/:uid/${action}`,
    params: z.object({
      uid: z.string(),
    }),
    handler: async ({ params, inject }) => {
      await inject(PluginManager)[action](params.uid);
      inject(Analytics).capture('plugin.lifecycle_action', { action, uid: params.uid });
      return {
        ok: true,
      };
    },
  });

export const pluginsRoutes = group({
  prefix: '/api/plugins',
  routes: [
    // List all plugins
    route.get({
      path: '/',
      handler: ({ inject }) => {
        const compiler = inject(ModuleCompiler);
        return inject(PluginManager)
          .list()
          .map((p) => enrichPlugin(p, compiler));
      },
    }),

    // Load a new plugin by ref
    route.post({
      path: '/load',
      body: z.object({
        ref: z.string(),
      }),
      handler: async ({ body, inject }) => {
        await inject(PluginManager).load(body.ref);
        // Classify the ref rather than emitting it raw: a local ref can be a
        // filesystem path that embeds the operator's username.
        inject(Analytics).capture('plugin.loaded_by_ref', {
          local: body.ref.startsWith('.') || body.ref.startsWith('/') || body.ref.includes(':\\'),
        });
        return {
          ok: true,
        };
      },
    }),

    // Get plugin details by uid
    route.get({
      path: '/:uid',
      params: z.object({
        uid: z.string(),
      }),
      handler: ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        return enrichPlugin(plugin, inject(ModuleCompiler));
      },
    }),

    // Plugin icon endpoint
    route.get({
      path: '/:uid/icon',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        if (!plugin.icon) {
          return new Response(null, {
            status: 204,
          });
        }

        const file = Bun.file(Bun.resolveSync(plugin.icon, plugin.rootDirectory));
        if (await file.exists()) {
          const content = await file.arrayBuffer();
          return new Response(content, {
            headers: {
              'Content-Type': file.type || 'image/png',
              'Cache-Control': 'public, max-age=86400, immutable',
            },
          });
        }

        return new Response(null, {
          status: 204,
        });
      },
    }),

    // Plugin assets endpoint — serves files from plugin's assets/ directory
    route.get({
      path: '/:uid/assets/*',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, req, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        const url = new URL(req.url);
        const prefix = `/api/plugins/${params.uid}/assets/`;
        const assetPath = decodeURIComponent(url.pathname.slice(prefix.length));

        const assetsDir = `${plugin.rootDirectory}/assets`;
        const filePath = safePath(assetsDir, assetPath);
        if (!filePath) {
          return new Response(null, {
            status: 400,
          });
        }

        const file = Bun.file(filePath);

        if (await file.exists()) {
          return new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }

        return new Response(null, {
          status: 404,
        });
      },
    }),

    // Plugin README endpoint - returns markdown content
    route.get({
      path: '/:uid/readme',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        // Try common README file names
        const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README', 'readme'];

        for (const name of readmeNames) {
          const readmePath = `${plugin.rootDirectory}/${name}`;
          const file = Bun.file(readmePath);

          if (await file.exists()) {
            const content = await file.text();
            return {
              readme: content,
              filename: name,
            };
          }
        }

        return {
          readme: null,
          filename: null,
        };
      },
    }),

    // Plugin lifecycle actions
    createPluginAction('enable'),
    createPluginAction('disable'),
    createPluginAction('reload'),
    createPluginAction('kill'),

    // Get plugin config (schema + values)
    route.get({
      path: '/:uid/config',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        const configService = inject(PluginConfigService);
        const schema = configService.getSchema(plugin.name);

        // Resolve dynamic-dropdown options via IPC
        const process = inject(PluginLifecycle).getProcess(plugin.name);
        const resolved = await Promise.all(
          schema.map(async (pref) => {
            if (pref.type !== 'dynamic-dropdown' || !process) {
              return pref;
            }
            const options = await process.fetchPreferenceOptions(pref.name);
            return {
              ...pref,
              options,
            };
          })
        );

        return {
          schema: resolved,
          values: await configService.getConfigForApi(plugin.name),
        };
      },
    }),

    // Fetch dynamic options for a single preference
    route.get({
      path: '/:uid/preferences/:name/options',
      params: z.object({
        uid: z.string(),
        name: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        const process = inject(PluginLifecycle).getProcess(plugin.name);
        if (!process) {
          return {
            options: [],
          };
        }
        const options = await process.fetchPreferenceOptions(params.name);
        return {
          options,
        };
      },
    }),

    // Update plugin config
    route.put({
      path: '/:uid/config',
      params: z.object({
        uid: z.string(),
      }),
      body: z.record(z.string(), z.unknown()),
      handler: async ({ params, body, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        const configService = inject(PluginConfigService);
        const result = await configService.setConfig(plugin.name, body);
        if (!result.success) {
          throw new UnprocessableEntity('Invalid configuration', {
            errors: result.error.issues,
          });
        }

        const lifecycle = inject(PluginLifecycle);
        const runningProcess = lifecycle.getProcess(plugin.name);
        if (runningProcess) {
          // Hot-reload prefs for the live plugin.
          runningProcess.sendPreferences(await configService.getConfig(plugin.name));
        } else if (plugin.status === 'awaiting-config') {
          // The plugin was parked waiting for valid prefs. We just
          // persisted a valid set, so kick it back to life — no manual
          // reload needed from the operator.
          const stored = inject(StateStore).get(plugin.name);
          if (stored?.enabled) {
            await lifecycle.load(stored.rootDirectory);
          }
        }

        inject(Analytics).capture('plugin.config_updated', {
          uid: plugin.uid,
          fieldCount: Object.keys(body).length,
        });

        return {
          values: await configService.getConfigForApi(plugin.name),
        };
      },
    }),

    // Toggle a plugin permission (grant or revoke)
    route.put({
      path: '/:uid/permissions',
      params: z.object({
        uid: z.string(),
      }),
      body: z.object({
        permission: z.string(),
        granted: z.boolean(),
      }),
      handler: async ({ params, body, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        const permService = inject(PluginPermissionService);

        const updated = permService.setPermission(plugin.name, body.permission, body.granted);
        // REVOKES take effect live: the hub re-checks the (invalidated) vector
        // on every grant.request. GRANTS do not: the plugin-side ctx proxy is
        // built from the vector frozen into its process at spawn, so a newly
        // granted family stays PERMISSION_DENIED client-side until the plugin
        // restarts. Reload on grant (and for spawn-time families like
        // rawSocket, whose env the sandbox lockdown reads at boot).
        const requiresRestart =
          body.granted ||
          (isValidPermission(body.permission) &&
            PERMISSIONS[body.permission].requiresRestart === true);
        if (requiresRestart) {
          await inject(PluginManager).reload(plugin.uid);
        } else {
          inject(PluginLifecycle).getProcess(plugin.name)?.invalidateVector();
        }
        inject(Analytics).capture('plugin.permission_toggled', {
          uid: plugin.uid,
          permission: body.permission,
          granted: body.granted,
        });
        return {
          grantedPermissions: updated,
        };
      },
    }),

    // Get plugin metrics (CPU, memory)
    route.get({
      path: '/:uid/metrics',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

        const metricsStore = inject(MetricsStore);
        let current = null;

        if (plugin.pid) {
          const metrics = await getProcessMetrics(plugin.pid);
          if (metrics) {
            current = {
              cpu: metrics.cpu,
              memory: metrics.memory,
            };
          }
        }

        return {
          pid: plugin.pid,
          current,
          history: metricsStore.get(plugin.name),
        };
      },
    }),

    // Get plugin disk usage (per fs root: data / cache / tmp + total).
    // Cached + works for stopped plugins — see DiskUsageCache.
    route.get({
      path: '/:uid/disk-usage',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        return await inject(DiskUsageCache).get(plugin);
      },
    }),

    // Uninstall plugin by uid (unload, remove state, remove package)
    route.delete({
      path: '/:uid',
      params: z.object({
        uid: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const manager = inject(PluginManager);
        const registry = inject(PluginRegistry);
        const state = inject(StateStore);
        const configService = inject(PluginConfigService);
        const secrets = inject(SecretStore);

        const plugin = getOrThrow(manager.get(params.uid), 'Plugin not found');

        // Capture secret keys while the plugin is still registered (schema is reachable)
        const secretKeys = configService.getSecretKeysForPlugin(plugin.name);

        // Disable and unload the plugin
        try {
          await manager.disable(plugin.uid);
        } catch {
          // Plugin might already be stopped
        }
        await manager.unload(plugin.name);

        // Remove from state store
        state.remove(plugin.name);

        // Remove the plugin's writable storage (data/cache/tmp under
        // `<brikaDir>/plugins/data/<uid>/`). The boot prune migration is only a
        // safety net for crashes/legacy rows; an always-on hub would otherwise
        // keep this (quota-sized, holds streamed uploads) on disk until restart.
        await rm(join(pluginDataDir(brikaContext.systemDir), plugin.uid), {
          recursive: true,
          force: true,
        });

        // Remove credentials from the OS keychain (declared keys + any runtime
        // `setSecret` keys tracked in the secret index).
        await secrets.deleteAllForPlugin(plugin.name, secretKeys);

        // Only remove npm package if it's a registry package (not local)
        // Workspace packages and local file references are not removed from npm
        try {
          await registry.uninstall(plugin.name);
        } catch {
          // Package might not exist in registry (e.g., workspace plugin)
        }

        inject(Analytics).capture('plugin.uninstalled', { uid: plugin.uid });

        return {
          ok: true,
        };
      },
    }),
  ],
});
