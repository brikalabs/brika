import { group, route } from '@brika/router';
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
  ],
});
