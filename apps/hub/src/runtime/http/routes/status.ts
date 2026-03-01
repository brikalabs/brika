import { resolve } from 'node:path';
import { route } from '@brika/router';
import { buildInfo } from '@/build-info';
import { HUB_VERSION, hub } from '@/hub';
import { BlockRegistry } from '@/runtime/blocks';
import { BrickTypeRegistry } from '@/runtime/bricks';
import { ConfigLoader } from '@/runtime/config';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { isHubReady } from '@/runtime/readiness';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { WorkflowEngine } from '@/runtime/workflows';

export { buildInfo } from '@/build-info';

// Process start time - computed once at module load
const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

/** Simple health check endpoint */
export const healthRoute = route.get({
  path: '/api/health',
  handler: () => ({
    ok: true as const,
    ready: isHubReady(),
    version: HUB_VERSION,
    build: buildInfo,
  }),
});

/** Full system information endpoint */
export const systemRoute = route.get({
  path: '/api/system',
  handler: ({ inject }) => {
    const configLoader = inject(ConfigLoader);
    const plugins = inject(PluginManager);
    const blocks = inject(BlockRegistry);
    const workflows = inject(WorkflowEngine);
    const sparks = inject(SparkRegistry);
    const brickTypes = inject(BrickTypeRegistry);

    const config = configLoader.get();
    const pluginList = plugins.list();
    const blockList = blocks.list();
    const workflowList = workflows.list();
    const sparkList = sparks.list();

    return {
      version: HUB_VERSION,
      pid: process.pid,
      runtime: `Bun ${Bun.version}`,
      os: `${Bun.env.OS ?? process.platform} ${process.arch}`,
      startedAt,
      build: buildInfo,
      repository: hub.homepage,
      paths: {
        root: resolve(configLoader.rootDir),
        config: resolve(configLoader.configPath),
        data: resolve(configLoader.brikaDir),
        plugins: resolve(configLoader.brikaDir, config.hub.plugins.installDir),
      },
      stats: {
        plugins: {
          total: pluginList.length,
          running: pluginList.filter((p) => p.status === 'running').length,
        },
        blocks: {
          total: blockList.length,
        },
        workflows: {
          total: workflowList.length,
          enabled: workflowList.filter((w) => w.enabled).length,
        },
        sparks: {
          total: sparkList.length,
        },
        bricks: {
          total: brickTypes.size,
        },
      },
    };
  },
});

export const statusRoutes = [healthRoute, systemRoute];
