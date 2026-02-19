import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginRouteRegistry } from '@/runtime/plugins/plugin-route-registry';
import { extractHeaders, extractQuery, proxyToPlugin } from '../utils/route-proxy';

/**
 * Well-known OAuth callback route.
 *
 * Provides a clean, deterministic URL for OAuth redirect URIs:
 *   /api/oauth/{providerId}/callback
 *
 * Looks up which plugin registered the route `/oauth/{providerId}/callback`
 * and proxies the request to that plugin.
 */
export const oauthRoutes = group('/api/oauth', [
  route.all(
    '/:providerId/*',
    { params: z.object({ providerId: z.string() }) },
    ({ params, req, inject }) => {
      const url = new URL(req.url);
      const pluginPath = url.pathname.slice('/api'.length) || '/';

      const registered = inject(PluginRouteRegistry).resolveByPath(req.method, pluginPath);
      if (!registered) throw new NotFound('OAuth route not found');

      const process = inject(PluginLifecycle).getProcess(registered.pluginName);
      if (!process) throw new NotFound('Plugin not running');

      return proxyToPlugin(
        process,
        `${req.method}:${pluginPath}`,
        req.method,
        pluginPath,
        extractQuery(url),
        extractHeaders(req, url, process.uid)
      );
    }
  ),
]);
