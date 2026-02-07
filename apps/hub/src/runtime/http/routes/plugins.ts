import { group, NotFound, route, UnprocessableEntity } from '@brika/router';
import { z } from 'zod';
import { getProcessMetrics, MetricsStore } from '@/runtime/metrics';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';
import { getOrThrow } from '../utils/resource-helpers';

/**
 * Create a generic plugin action handler
 */
const createPluginAction = (
  action: keyof Pick<PluginManager, 'enable' | 'disable' | 'reload' | 'kill'>
) =>
  route.post(
    `/:uid/${action}`,
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      await inject(PluginManager)[action](params.uid);
      return { ok: true };
    }
  );

export const pluginsRoutes = group('/api/plugins', [
  // List all plugins
  route.get('/', ({ inject }) => {
    return inject(PluginManager).list();
  }),

  // Load a new plugin by ref
  route.post('/load', { body: z.object({ ref: z.string() }) }, async ({ body, inject }) => {
    await inject(PluginManager).load(body.ref);
    return { ok: true };
  }),

  // Get plugin details by uid
  route.get('/:uid', { params: z.object({ uid: z.string() }) }, ({ params, inject }) => {
    const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
    return plugin;
  }),

  // Plugin icon endpoint
  route.get('/:uid/icon', { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

    if (!plugin.icon) {
      return new Response(null, { status: 204 });
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

    return new Response(null, { status: 204 });
  }),

  // Plugin assets endpoint — serves files from plugin's assets/ directory
  route.get(
    '/:uid/assets/*',
    { params: z.object({ uid: z.string() }) },
    async ({ params, req, inject }) => {
      const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

      const url = new URL(req.url);
      const prefix = `/api/plugins/${params.uid}/assets/`;
      const assetPath = url.pathname.slice(prefix.length);

      // Prevent path traversal
      if (!assetPath || assetPath.includes('..')) {
        return new Response(null, { status: 400 });
      }

      const filePath = `${plugin.rootDirectory}/assets/${assetPath}`;
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      return new Response(null, { status: 404 });
    }
  ),

  // Plugin README endpoint - returns markdown content
  route.get(
    '/:uid/readme',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

      // Try common README file names
      const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README', 'readme'];

      for (const name of readmeNames) {
        const readmePath = `${plugin.rootDirectory}/${name}`;
        const file = Bun.file(readmePath);

        if (await file.exists()) {
          const content = await file.text();
          return { readme: content, filename: name };
        }
      }

      return { readme: null, filename: null };
    }
  ),

  // Plugin lifecycle actions
  createPluginAction('enable'),
  createPluginAction('disable'),
  createPluginAction('reload'),
  createPluginAction('kill'),

  // Get plugin config (schema + values)
  route.get('/:uid/config', { params: z.object({ uid: z.string() }) }, ({ params, inject }) => {
    const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

    const configService = inject(PluginConfigService);
    return {
      schema: configService.getSchema(plugin.name),
      values: configService.getConfig(plugin.name),
    };
  }),

  // Update plugin config
  route.put(
    '/:uid/config',
    { params: z.object({ uid: z.string() }), body: z.record(z.string(), z.unknown()) },
    async ({ params, body, inject }) => {
      const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

      const configService = inject(PluginConfigService);
      const result = await configService.setConfig(plugin.name, body);
      if (!result.success) {
        throw new UnprocessableEntity('Invalid configuration', {
          errors: result.error.issues,
        });
      }

      // Send updated preferences to running plugin
      const process = inject(PluginLifecycle).getProcess(plugin.name);
      if (process) {
        process.sendPreferences(configService.getConfig(plugin.name));
      }

      return { values: configService.getConfig(plugin.name) };
    }
  ),

  // Get plugin metrics (CPU, memory)
  route.get(
    '/:uid/metrics',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');

      const metricsStore = inject(MetricsStore);
      let current = null;

      if (plugin.pid) {
        const metrics = await getProcessMetrics(plugin.pid);
        if (metrics) {
          current = { cpu: metrics.cpu, memory: metrics.memory };
        }
      }

      return {
        pid: plugin.pid,
        current,
        history: metricsStore.get(plugin.name),
      };
    }
  ),

  // Uninstall plugin by uid (unload, remove state, remove package)
  route.delete('/:uid', { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const manager = inject(PluginManager);
    const registry = inject(PluginRegistry);
    const state = inject(StateStore);

    const plugin = getOrThrow(manager.get(params.uid), 'Plugin not found');

    // Disable and unload the plugin
    try {
      await manager.disable(plugin.uid);
    } catch {
      // Plugin might already be stopped
    }
    await manager.unload(plugin.name);

    // Remove from state store
    await state.remove(plugin.name);

    // Only remove npm package if it's a registry package (not local)
    // Workspace packages and local file references are not removed from npm
    try {
      await registry.uninstall(plugin.name);
    } catch {
      // Package might not exist in registry (e.g., workspace plugin)
    }

    return { ok: true };
  }),
]);
