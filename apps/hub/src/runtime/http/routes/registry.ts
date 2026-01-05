import { createSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { PluginRegistry } from '@/runtime/registry';
import type { OperationProgress } from '@/runtime/registry/types';

/**
 * Helper to stream async generator progress via SSE
 */
function streamProgress(
  generator: AsyncGenerator<OperationProgress>,
  send: (data: unknown, event?: string) => void,
  close: () => void
): void {
  (async () => {
    try {
      for await (const progress of generator) {
        send(progress, 'progress');
        if (progress.phase === 'error' || progress.phase === 'complete') {
          close();
          break;
        }
      }
    } catch (error) {
      send({ phase: 'error', message: String(error) }, 'progress');
      close();
    }
  })();
}

export const registryRoutes = group('/api/registry', [
  route.post(
    '/install',
    {
      body: z.object({
        package: z.string(),
        version: z.string().optional(),
      }),
    },
    async ({ body, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.init();

      const generator = registry.install(body.package, body.version);
      return createSSEStream((send, close) => streamProgress(generator, send, close));
    }
  ),

  // Update package(s) with progress streaming
  route.post(
    '/update',
    {
      body: z.object({
        package: z.string().optional(),
      }),
    },
    async ({ body, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.init();

      const generator = registry.update(body.package);
      return createSSEStream((send, close) => streamProgress(generator, send, close));
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
