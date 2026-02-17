import { createSSEStream, group, NotFound, route } from '@brika/router';
import { PluginPackageSchema } from '@brika/schema';
import { z } from 'zod';
import { HUB_VERSION } from '@/hub';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { PluginRegistry } from '@/runtime/registry';
import type { OperationProgress } from '@/runtime/registry/types';
import { NpmSearchService } from '@/runtime/services/npm-search';
import { VerifiedPluginsService } from '@/runtime/services/verified-plugins';
import { WorkspaceSearchService } from '@/runtime/services/workspace-search';
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
      const configLoader = inject(ConfigLoader);
      const config = configLoader.get();
      const { plugins, total } = await npmSearch.search(query.q, query.limit, query.offset);

      // Enrich with installed status from config (source of truth)
      const enrichedPlugins = plugins.map((plugin) => {
        const entry = config.plugins.find((p) => p.name === plugin.package.name);
        return {
          ...plugin,
          installed: entry !== undefined,
          installedVersion: entry ? plugin.package.version : undefined,
        };
      });

      return { plugins: enrichedPlugins, total };
    }
  ),

  // Discover local workspace plugins (auto-detected)
  route.get(
    '/local-plugins',
    {
      query: z.object({
        q: z.string().optional(),
      }),
    },
    async ({ query, inject }) => {
      const workspaceSearch = inject(WorkspaceSearchService);
      const plugins = await workspaceSearch.discover(query.q);
      return { plugins };
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
      const configLoader = inject(ConfigLoader);

      // Config is the source of truth for installed status
      const config = configLoader.get();
      const configEntry = config.plugins.find((p) => p.name === params.name);
      const workspaceEntry = configEntry?.version.startsWith('workspace:')
        ? configEntry
        : undefined;

      // Helper to build a local plugin response
      const buildLocalResponse = (pkg: PluginPackageSchema) => ({
        name: pkg.name,
        version: pkg.version,
        displayName: pkg.displayName,
        description: pkg.description,
        author: pkg.author,
        keywords: pkg.keywords ?? [],
        repository: pkg.repository,
        homepage: pkg.homepage,
        license: pkg.license,
        engines: pkg.engines,
        verified: false,
        featured: false,
        compatible: true,
        source: 'local' as const,
        installed: configEntry !== undefined,
        installedVersion: configEntry ? pkg.version : undefined,
        npm: { downloads: 0, publishedAt: '' },
      });

      // Check if this is an installed workspace plugin (in brika.yml)
      if (workspaceEntry) {
        try {
          const resolved = await configLoader.resolvePluginEntry(workspaceEntry);
          const raw = await Bun.file(`${resolved.rootDirectory}/package.json`).json();
          return buildLocalResponse(PluginPackageSchema.parse(raw));
        } catch {
          // Fall through to workspace scan
        }
      }

      // Check if this is a local workspace plugin (in plugins/ directory)
      const workspaceSearch = inject(WorkspaceSearchService);
      const localPlugin = await workspaceSearch.findByName(params.name);
      if (localPlugin) {
        return buildLocalResponse(localPlugin.pkg);
      }

      const npmSearch = inject(NpmSearchService);
      const verifiedService = inject(VerifiedPluginsService);

      // Fetch package details from npm
      const packageData = await npmSearch.getPackageDetails(params.name);

      if (!packageData) {
        throw new NotFound('Package not found');
      }

      // Check verification status
      const verified = await verifiedService.isVerified(params.name);
      const verifiedPlugin = verified ? await verifiedService.getVerifiedPlugin(params.name) : null;

      // Check compatibility
      const compatibilityResult = checkCompatibility(packageData.engines?.brika);

      return {
        ...packageData,
        verified,
        verifiedAt: verifiedPlugin?.verifiedAt,
        featured: verifiedPlugin?.featured || false,
        compatible: compatibilityResult.compatible,
        compatibilityReason: compatibilityResult.reason,
        installed: configEntry !== undefined,
        installedVersion: configEntry ? packageData.version : undefined,
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
      // Try to read local README from workspace
      const localReadme = async (rootDir: string) => {
        const file = Bun.file(`${rootDir}/README.md`);
        if (await file.exists()) {
          return { readme: await file.text(), filename: 'README.md' };
        }
        return null;
      };

      // Check installed workspace plugin (brika.yml)
      const configLoader = inject(ConfigLoader);
      const config = configLoader.get();
      const workspaceEntry = config.plugins.find(
        (p) => p.name === params.name && p.version.startsWith('workspace:')
      );

      if (workspaceEntry) {
        try {
          const resolved = await configLoader.resolvePluginEntry(workspaceEntry);
          const result = await localReadme(resolved.rootDirectory);
          if (result) return result;
        } catch {
          // Fall through
        }
      }

      // Check local workspace plugin (filesystem scan)
      const workspaceSearch = inject(WorkspaceSearchService);
      const localPlugin = await workspaceSearch.findByName(params.name);
      if (localPlugin) {
        const result = await localReadme(localPlugin.rootDir);
        if (result) return result;
      }

      try {
        const url = `https://unpkg.com/${params.name}@latest/README.md`;

        const response = await fetch(url, {
          redirect: 'follow',
        });

        if (!response.ok) {
          return { readme: null, filename: null };
        }

        return { readme: await response.text(), filename: 'README.md' };
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
      const iconPaths = ['icon.png', 'icon.svg', 'logo.png', 'logo.svg'];

      // Try to serve icon from a local directory
      const serveLocalIcon = async (rootDir: string) => {
        for (const iconPath of iconPaths) {
          const file = Bun.file(`${rootDir}/${iconPath}`);
          if (await file.exists()) {
            const blob = await file.arrayBuffer();
            const ext = iconPath.split('.').pop();
            const contentType = ext === 'svg' ? 'image/svg+xml' : 'image/png';
            return new Response(blob, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=60',
              },
            });
          }
        }
        return null;
      };

      // Check installed workspace plugin (brika.yml)
      const configLoader = inject(ConfigLoader);
      const config = configLoader.get();
      const workspaceEntry = config.plugins.find(
        (p) => p.name === params.name && p.version.startsWith('workspace:')
      );

      if (workspaceEntry) {
        try {
          const resolved = await configLoader.resolvePluginEntry(workspaceEntry);
          const result = await serveLocalIcon(resolved.rootDirectory);
          if (result) return result;
        } catch {
          // Fall through
        }
      }

      // Check local workspace plugin (filesystem scan)
      const workspaceSearch = inject(WorkspaceSearchService);
      const localPlugin = await workspaceSearch.findByName(params.name);
      if (localPlugin) {
        const result = await serveLocalIcon(localPlugin.rootDir);
        if (result) return result;
      }

      try {
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
                'Cache-Control': 'public, max-age=86400',
              },
            });
          }
        }

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
