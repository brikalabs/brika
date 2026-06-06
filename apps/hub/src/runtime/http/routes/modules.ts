import { group, route } from '@brika/router';
import { z } from 'zod';
import { ModuleCompiler } from '@/runtime/modules';
import { getModuleKind, moduleScopeId } from '@/runtime/modules/module-kinds';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

/**
 * Serve the compiled JS module for any client module kind (page, brick, block
 * view). CSS is inlined into the JS as a self-injecting <style> tag.
 *
 * URL format: /api/modules/:pluginUid/:kind/:id.:hash.js (the hash is for
 * cache busting only). pluginUid (not name) avoids encoded slashes in scoped
 * package names.
 */
export const modulesRoutes = group({
  prefix: '/api/modules',
  routes: [
    route.get({
      path: '/:pluginUid/:kind/:file',
      params: z.object({
        pluginUid: z.string(),
        kind: z.string(),
        file: z.string(),
      }),
      handler: ({ params, inject }) => {
        const kind = getModuleKind(params.kind);
        if (!kind) {
          return new Response('Unknown module kind', { status: 404 });
        }
        const pluginName = inject(PluginLifecycle).resolvePluginNameByUid(params.pluginUid);
        if (!pluginName) {
          return new Response('Plugin not found', { status: 404 });
        }
        // Parse the module id from "id.hash.js".
        const dotIdx = params.file.indexOf('.');
        const id = dotIdx > 0 ? params.file.slice(0, dotIdx) : params.file;
        const entry = inject(ModuleCompiler).get(moduleScopeId(pluginName, kind, id));
        if (!entry) {
          return new Response('Module not found', { status: 404 });
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
