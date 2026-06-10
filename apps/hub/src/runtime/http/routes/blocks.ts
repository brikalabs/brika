import { group, route } from '@brika/router';
import { z } from 'zod';
import { BlockRegistry } from '@/runtime/blocks';
import type { RegisteredBlock } from '@/runtime/blocks/block-registry';
import { ModuleCompiler } from '@/runtime/modules';
import { MODULE_KINDS, resolveModuleUrl } from '@/runtime/modules/module-kinds';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

/**
 * Enrich a registered block with the URLs of its compiled custom view modules,
 * when the plugin ships them: a config-panel view (`src/blocks/<id>.view.tsx`)
 * and/or a node-body display (`src/blocks/<id>.node.tsx`). Both are served by the
 * generic /api/modules route.
 */
function toBlockDto(
  block: RegisteredBlock,
  lifecycle: PluginLifecycle,
  compiler: ModuleCompiler
): RegisteredBlock & { viewModuleUrl?: string; nodeModuleUrl?: string; pluginUid?: string } {
  const pluginName = block.pluginId;
  const pluginUid = lifecycle.getProcess(pluginName)?.uid;
  if (!pluginUid) {
    return block;
  }
  const viewModuleUrl = resolveModuleUrl(
    compiler,
    pluginName,
    pluginUid,
    MODULE_KINDS.blockView,
    block.id
  );
  const nodeModuleUrl = resolveModuleUrl(
    compiler,
    pluginName,
    pluginUid,
    MODULE_KINDS.blockNode,
    block.id
  );
  if (!viewModuleUrl && !nodeModuleUrl) {
    return block;
  }
  return { ...block, viewModuleUrl, nodeModuleUrl, pluginUid };
}

export const blocksRoutes = group({
  prefix: '/api/blocks',
  routes: [
    route.get({
      path: '/',
      handler: ({ inject }) => {
        const lifecycle = inject(PluginLifecycle);
        const compiler = inject(ModuleCompiler);
        return inject(BlockRegistry)
          .list()
          .map((b) => toBlockDto(b, lifecycle, compiler));
      },
    }),

    route.get({
      path: '/categories',
      handler: ({ inject }) => {
        return inject(BlockRegistry).listByCategory();
      },
    }),

    /**
     * Fetch dynamic options for a block config field via IPC. The query string
     * (e.g. the selected provider) is forwarded to the plugin's options
     * provider so the list can depend on sibling field values.
     */
    route.get({
      path: '/:typeId/config/:name/options',
      params: z.object({
        typeId: z.string(),
        name: z.string(),
      }),
      query: z.record(z.string(), z.string()),
      handler: async ({ params, query, inject }) => {
        const block = inject(BlockRegistry).get(params.typeId);
        if (!block?.pluginId) {
          return { options: [] };
        }
        const process = inject(PluginLifecycle).getProcess(block.pluginId);
        if (!process) {
          return { options: [] };
        }
        return { options: await process.fetchPreferenceOptions(params.name, query) };
      },
    }),
  ],
});
