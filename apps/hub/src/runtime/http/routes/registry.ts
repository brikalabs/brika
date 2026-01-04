import { createAsyncSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { PluginRegistry } from '@/runtime/registry';

export const registryRoutes = group('/api/registry', [
  // SSE: Install a package with progress streaming
  route.post(
    '/install',
    {
      body: z.object({
        package: z.string(),
        version: z.string().optional(),
      }),
    },
    ({ body, inject }) => {
      const registry = inject(PluginRegistry);

      return createAsyncSSEStream(async (send) => {
        for await (const progress of registry.install(body.package, body.version)) {
          send(progress, 'progress');

          // If error, stop streaming
          if (progress.phase === 'error') break;
        }
      });
    }
  ),

  // SSE: Update package(s) with progress streaming
  route.post(
    '/update',
    {
      body: z.object({
        package: z.string().optional(),
      }),
    },
    ({ body, inject }) => {
      const registry = inject(PluginRegistry);

      return createAsyncSSEStream(async (send) => {
        for await (const progress of registry.update(body.package)) {
          send(progress, 'progress');

          if (progress.phase === 'error') break;
        }
      });
    }
  ),

  // Check for available updates
  route.get('/updates', async ({ inject }) => {
    const registry = inject(PluginRegistry);
    const updates = await registry.checkUpdates();
    return { updates };
  }),

  // List all installed packages
  route.get('/packages', async ({ inject }) => {
    const registry = inject(PluginRegistry);
    const packages = await registry.list();
    return { packages };
  }),

  // Get a specific package
  route.get(
    '/packages/:name',
    {
      params: z.object({
        name: z.string(),
      }),
    },
    async ({ params, inject }) => {
      const registry = inject(PluginRegistry);
      const pkg = await registry.get(params.name);
      return { package: pkg };
    }
  ),

  // Uninstall a package
  route.delete(
    '/packages/:name',
    {
      params: z.object({
        name: z.string(),
      }),
    },
    async ({ params, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.uninstall(params.name);
      return { success: true };
    }
  ),
]);
