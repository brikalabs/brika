import { group, NotFound, route } from '@elia/router';
import { z } from 'zod';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';

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
    const plugin = inject(PluginManager).get(params.uid);
    if (!plugin) throw new NotFound('Plugin not found');
    return plugin;
  }),

  // Plugin icon endpoint
  route.get('/:uid/icon', { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const plugin = inject(PluginManager).get(params.uid);
    if (!plugin) throw new NotFound('Plugin not found');

    if (!plugin.icon) {
      return new Response(null, { status: 204 });
    }

    const file = Bun.file(Bun.resolveSync(plugin.icon, plugin.dir));
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

  // Plugin README endpoint - returns markdown content
  route.get(
    '/:uid/readme',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      const plugin = inject(PluginManager).get(params.uid);
      if (!plugin) throw new NotFound('Plugin not found');

      // Try common README file names
      const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README', 'readme'];

      for (const name of readmeNames) {
        const readmePath = `${plugin.dir}/${name}`;
        const file = Bun.file(readmePath);

        if (await file.exists()) {
          const content = await file.text();
          return { readme: content, filename: name };
        }
      }

      return { readme: null, filename: null };
    }
  ),

  // Enable plugin by uid
  route.post(
    '/:uid/enable',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      await inject(PluginManager).enable(params.uid);
      return { ok: true };
    }
  ),

  // Disable plugin by uid
  route.post(
    '/:uid/disable',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      await inject(PluginManager).disable(params.uid);
      return { ok: true };
    }
  ),

  // Reload plugin by uid
  route.post(
    '/:uid/reload',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      await inject(PluginManager).reload(params.uid);
      return { ok: true };
    }
  ),

  // Kill plugin by uid
  route.post(
    '/:uid/kill',
    { params: z.object({ uid: z.string() }) },
    async ({ params, inject }) => {
      await inject(PluginManager).kill(params.uid);
      return { ok: true };
    }
  ),

  // Uninstall plugin by uid (unload, remove state, remove package)
  route.delete('/:uid', { params: z.object({ uid: z.string() }) }, async ({ params, inject }) => {
    const manager = inject(PluginManager);
    const registry = inject(PluginRegistry);
    const state = inject(StateStore);

    const plugin = manager.get(params.uid);
    if (!plugin) throw new NotFound('Plugin not found');

    // Disable and unload the plugin
    try {
      await manager.disable(plugin.uid);
    } catch {
      // Plugin might already be stopped
    }
    await manager.unload(plugin.ref);

    // Remove from state store
    await state.remove(plugin.ref);

    // Only remove npm package if it's a registry package (not file: refs)
    if (!plugin.ref.startsWith('file:')) {
      try {
        await registry.uninstall(plugin.name);
      } catch {
        // Package might not exist in registry (e.g., workspace plugin)
      }
    }

    return { ok: true };
  }),
]);
