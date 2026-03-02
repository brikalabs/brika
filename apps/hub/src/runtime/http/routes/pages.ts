import type { InjectionToken } from '@brika/di';
import { group, route } from '@brika/router';
import { z } from 'zod';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { getOrThrow } from '../utils/resource-helpers';

type Inject = <T>(token: InjectionToken<T>) => T;

function resolveModuleCacheKey(inject: Inject, uid: string, pageId: string) {
  const plugin = getOrThrow(inject(PluginManager).get(uid), 'Plugin not found');
  return `${plugin.name}:pages/${pageId}`;
}

export const pageRoutes = group({
  prefix: '/api/plugins/:uid/pages',
  routes: [
    /**
     * Serve the compiled JS module for a plugin page (CSS inlined).
     * URL format: /api/plugins/:uid/pages/:pageId.:hash.js — hash is for cache busting only.
     */
    route.get({
      path: '/:file',
      params: z.object({
        uid: z.string(),
        file: z.string(),
      }),
      handler: ({ params, inject }) => {
        // Parse pageId from "pageId.hash.js"
        const dotIdx = params.file.indexOf('.');
        const pageId = dotIdx > 0 ? params.file.slice(0, dotIdx) : params.file;
        const entry = inject(ModuleCompiler).get(resolveModuleCacheKey(inject, params.uid, pageId));
        if (!entry) {
          return new Response('Page not found', {
            status: 404,
          });
        }

        return new Response(Bun.file(entry.filePath), {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      },
    }),
  ],
});
