import { route } from '@brika/router';
import { HUB_VERSION } from '@/hub';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { WorkflowEngine } from '@/runtime/workflows';

export const healthRoutes = [
  route.get('/api/health', () => {
    return {
      ok: true,
      version: HUB_VERSION,
      runtime: `Bun ${Bun.version}`,
    };
  }),

  route.get('/api/stats', ({ inject }) => {
    const plugins = inject(PluginManager);
    const blocks = inject(BlockRegistry);
    const workflows = inject(WorkflowEngine);
    const sparks = inject(SparkRegistry);

    const pluginList = plugins.list();
    const blockList = blocks.list();
    const workflowList = workflows.list();
    const sparkList = sparks.list();

    return {
      plugins: {
        total: pluginList.length,
        running: pluginList.filter((p) => p.status === 'running').length,
      },
      blocks: { total: blockList.length, byCategory: blocks.listByCategory() },
      workflows: {
        total: workflowList.length,
        enabled: workflowList.filter((w) => w.enabled).length,
      },
      sparks: { total: sparkList.length },
    };
  }),
];
