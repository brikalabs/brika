import { createSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { HUB_VERSION } from '@/hub';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import type { OperationProgress } from '@/runtime/registry/types';
import { NpmSearchService } from '@/runtime/services/npm-search';
import { VerifiedPluginsService } from '@/runtime/services/verified-plugins';
import { checkCompatibility } from '@/runtime/utils/compatibility';

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

  // ─── Store API Endpoints ──────────────────────────────────────────────────

  // Get current Brika version
  route.get('/version', () => {
    return {
      version: HUB_VERSION,
      engines: {
        node: process.version,
      },
    };
  }),

  // Search npm for Brika plugins
  route.get(
    '/search',
    {
      query: z.object({
        q: z.string().optional(),
        limit: z.coerce.number().optional().default(20),
        offset: z.coerce.number().optional().default(0),
      }),
    },
    async ({ query, inject }) => {
      const npmSearch = inject(NpmSearchService);
      const pluginManager = inject(PluginManager);
      const { plugins, total } = await npmSearch.search(query.q, query.limit, query.offset);

      // Check installed status for each plugin
      const pluginsWithInstalledStatus = plugins.map((plugin) => {
        const installedPlugin = pluginManager.getByName(plugin.package.name);
        return {
          ...plugin,
          installed: installedPlugin !== null,
          installedVersion: installedPlugin?.version,
        };
      });

      return { plugins: pluginsWithInstalledStatus, total };
    }
  ),

  // Get verified plugins list
  route.get('/verified', async ({ inject }) => {
    const verifiedService = inject(VerifiedPluginsService);
    const list = await verifiedService.getVerifiedList();
    return list;
  }),

  // Get enriched plugin details (npm + verified + compatibility + installed status)
  route.get(
    '/plugins/:name',
    {
      params: z.object({
        name: z.string(),
      }),
    },
    async ({ params, inject }) => {
      const npmSearch = inject(NpmSearchService);
      const verifiedService = inject(VerifiedPluginsService);
      const pluginManager = inject(PluginManager);

      // Fetch package details from npm
      const packageData = await npmSearch.getPackageDetails(params.name);

      if (!packageData) {
        return { error: 'Package not found' };
      }

      // Check verification status
      const verified = await verifiedService.isVerified(params.name);
      const verifiedPlugin = verified ? await verifiedService.getVerifiedPlugin(params.name) : null;

      // Check compatibility
      const compatibilityResult = checkCompatibility(packageData.engines?.brika);

      // Check if installed
      const installedPlugin = pluginManager.getByName(params.name);
      const installed = installedPlugin !== null;

      return {
        ...packageData,
        verified,
        verifiedAt: verifiedPlugin?.verifiedAt,
        featured: verifiedPlugin?.featured || false,
        compatible: compatibilityResult.compatible,
        compatibilityReason: compatibilityResult.reason,
        installed,
        installedVersion: installedPlugin?.version,
      };
    }
  ),

  // Get README for a package from npm
  route.get(
    '/plugins/:name/readme',
    {
      params: z.object({
        name: z.string(),
      }),
    },
    async ({ params, inject }) => {
      try {
        // Fetch README from unpkg (CDN for npm packages)
        // params.name is already decoded by the router, unpkg can handle @ and /
        const url = `https://unpkg.com/${params.name}@latest/README.md`;

        const response = await fetch(url, {
          redirect: 'follow', // Follow redirects
        });

        if (!response.ok) {
          return { readme: null, filename: null };
        }

        const readme = await response.text();

        return {
          readme,
          filename: 'README.md',
        };
      } catch (error) {
        const log = inject(Logger);
        log.error('Failed to fetch README from CDN', {
          packageName: params.name,
          error: String(error),
        });
        return { readme: null, filename: null };
      }
    }
  ),

  // Get icon for a package from npm
  route.get(
    '/plugins/:name/icon',
    {
      params: z.object({
        name: z.string(),
      }),
    },
    async ({ params, inject }) => {
      try {
        // Try to fetch icon from unpkg
        // params.name is already decoded by the router, unpkg can handle @ and /
        const iconPaths = ['icon.png', 'icon.svg', 'logo.png', 'logo.svg'];

        for (const iconPath of iconPaths) {
          const url = `https://unpkg.com/${params.name}@latest/${iconPath}`;
          const response = await fetch(url, {
            redirect: 'follow',
          });

          if (response.ok) {
            const blob = await response.arrayBuffer();
            const contentType = response.headers.get('content-type') || 'image/png';

            return new Response(blob, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // Cache for 1 day
              },
            });
          }
        }

        // If no icon found, return 404
        return new Response(null, { status: 404 });
      } catch (error) {
        const log = inject(Logger);
        log.error('Failed to fetch icon from CDN', {
          packageName: params.name,
          error: String(error),
        });
        return new Response(null, { status: 404 });
      }
    }
  ),
]);
