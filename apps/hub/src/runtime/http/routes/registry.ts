import { createSSEStream, group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { HUB_VERSION } from '@/hub';
import { Logger } from '@/runtime/logs/log-router';
import { PluginRegistry } from '@/runtime/registry';
import type { OperationProgress } from '@/runtime/registry/types';
import { StoreService } from '@/runtime/store';

/** Strip an optional source prefix (`local:` / `npm:`) from a plugin ID. */
function stripSourcePrefix(id: string): string {
  const colonIdx = id.indexOf(':');
  return colonIdx > 0 ? id.slice(colonIdx + 1) : id;
}

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
  // ─── Package management (install / uninstall / update) ───────────────────

  route.post(
    '/install',
    { body: z.object({ package: z.string(), version: z.string().optional() }) },
    async ({ body, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.init();
      const generator = registry.install(body.package, body.version);
      return createSSEStream((send, close) => streamProgress(generator, send, close));
    }
  ),

  route.post(
    '/update',
    { body: z.object({ package: z.string().optional() }) },
    async ({ body, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.init();
      const generator = registry.update(body.package);
      return createSSEStream((send, close) => streamProgress(generator, send, close));
    }
  ),

  route.get('/updates', async ({ inject }) => {
    const registry = inject(PluginRegistry);
    const updates = await registry.checkUpdates();
    return { updates };
  }),

  route.get('/packages', async ({ inject }) => {
    const registry = inject(PluginRegistry);
    const packages = await registry.list();
    return { packages };
  }),

  route.get(
    '/packages/:name',
    { params: z.object({ name: z.string() }) },
    async ({ params, inject }) => {
      const registry = inject(PluginRegistry);
      const pkg = await registry.get(params.name);
      return { package: pkg };
    }
  ),

  route.delete(
    '/packages/:name',
    { params: z.object({ name: z.string() }) },
    async ({ params, inject }) => {
      const registry = inject(PluginRegistry);
      await registry.uninstall(params.name);
      return { success: true };
    }
  ),

  // ─── Store API ────────────────────────────────────────────────────────────

  route.get('/version', () => ({
    version: HUB_VERSION,
    engines: { node: process.version },
  })),

  route.get(
    '/search',
    {
      query: z.object({
        q: z.string().optional(),
        limit: z.coerce.number().optional().default(20),
        offset: z.coerce.number().optional().default(0),
      }),
    },
    ({ query, inject }) => inject(StoreService).search(query.q, query.limit, query.offset)
  ),

  route.get('/verified', ({ inject }) => inject(StoreService).getVerifiedList()),

  route.get(
    '/plugins/:name',
    { params: z.object({ name: z.string() }) },
    async ({ params, inject }) => {
      const store = inject(StoreService);
      const plugin = await store.getPluginDetails(params.name);
      if (!plugin) throw new NotFound('Package not found');
      return plugin;
    }
  ),

  // ─── Plugin assets (README / icon) ────────────────────────────────────────

  route.get(
    '/plugins/:name/readme',
    { params: z.object({ name: z.string() }) },
    async ({ params, inject }) => {
      const store = inject(StoreService);
      const pkgName = stripSourcePrefix(params.name);
      const rootDir = await store.getLocalPluginRoot(params.name);

      if (rootDir) {
        const file = Bun.file(`${rootDir}/README.md`);
        if (await file.exists()) {
          return { readme: await file.text(), filename: 'README.md' };
        }
      }

      try {
        const response = await fetch(`https://unpkg.com/${pkgName}@latest/README.md`, {
          redirect: 'follow',
        });
        if (!response.ok) return { readme: null, filename: null };
        return { readme: await response.text(), filename: 'README.md' };
      } catch (error) {
        inject(Logger).error('Failed to fetch README from CDN', {
          packageName: pkgName,
          error: String(error),
        });
        return { readme: null, filename: null };
      }
    }
  ),

  route.get(
    '/plugins/:name/icon',
    { params: z.object({ name: z.string() }) },
    async ({ params, inject }) => {
      const iconPaths = ['icon.png', 'icon.svg', 'logo.png', 'logo.svg'];
      const pkgName = stripSourcePrefix(params.name);

      const serveLocalIcon = async (rootDir: string) => {
        for (const iconPath of iconPaths) {
          const file = Bun.file(`${rootDir}/${iconPath}`);
          if (await file.exists()) {
            const blob = await file.arrayBuffer();
            const ext = iconPath.split('.').pop();
            return new Response(blob, {
              headers: {
                'Content-Type': ext === 'svg' ? 'image/svg+xml' : 'image/png',
                'Cache-Control': 'public, max-age=60',
              },
            });
          }
        }
        return null;
      };

      const store = inject(StoreService);
      const rootDir = await store.getLocalPluginRoot(params.name);
      if (rootDir) {
        const result = await serveLocalIcon(rootDir);
        if (result) return result;
      }

      try {
        for (const iconPath of iconPaths) {
          const response = await fetch(`https://unpkg.com/${pkgName}@latest/${iconPath}`, {
            redirect: 'follow',
          });
          if (response.ok) {
            const blob = await response.arrayBuffer();
            return new Response(blob, {
              headers: {
                'Content-Type': response.headers.get('content-type') || 'image/png',
                'Cache-Control': 'public, max-age=86400',
              },
            });
          }
        }
        return new Response(null, { status: 404 });
      } catch (error) {
        inject(Logger).error('Failed to fetch icon from CDN', {
          packageName: pkgName,
          error: String(error),
        });
        return new Response(null, { status: 404 });
      }
    }
  ),
]);
