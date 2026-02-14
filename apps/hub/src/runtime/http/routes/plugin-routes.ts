import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRouteRegistry } from '@/runtime/plugins/plugin-route-registry';
import { getOrThrow } from '../utils/resource-helpers';
import { extractBody, extractHeaders, extractQuery, proxyToPlugin } from '../utils/route-proxy';

/**
 * Proxy handler for plugin-registered HTTP routes.
 * Routes are served at: /api/plugins/:uid/routes/<plugin-path>
 */
export const pluginRoutesHandler = group('/api/plugins', [
  route.all(
    '/:uid/routes/*',
    { params: z.object({ uid: z.string() }) },
    async ({ params, req, inject }) => {
      const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
      const process = inject(PluginLifecycle).getProcess(plugin.name);
      if (!process) throw new NotFound('Plugin not running');

      const url = new URL(req.url);
      const prefix = `/api/plugins/${params.uid}/routes`;
      const pluginPath = url.pathname.slice(prefix.length) || '/';

      const registry = inject(PluginRouteRegistry);
      if (!registry.resolve(plugin.name, req.method, pluginPath)) {
        throw new NotFound('Route not found');
      }

      return proxyToPlugin(
        process,
        `${req.method}:${pluginPath}`,
        req.method,
        pluginPath,
        extractQuery(url),
        extractHeaders(req, url, plugin.uid),
        await extractBody(req)
      );
    }
  ),
]);
