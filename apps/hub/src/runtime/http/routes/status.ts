import { resolve } from 'node:path';
import { route } from '@brika/router';
import { getBuildDate, getGitBranch, getGitCommit } from '@/build-info.macro' with {
  type: 'macro',
};
import { HUB_VERSION, hub } from '@/hub';
import { BlockRegistry } from '@/runtime/blocks';
import { ConfigLoader } from '@/runtime/config';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { WorkflowEngine } from '@/runtime/workflows';

// Build info - computed at bundle-time via Bun macros
const buildInfo = {
  commit: getGitCommit(),
  branch: getGitBranch(),
  date: getBuildDate(),
};

// Process start time - computed once at module load
const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

/** Simple health check endpoint */
export const healthRoute = route.get('/api/health', () => ({
  ok: true as const,
  version: HUB_VERSION,
  build: buildInfo,
}));

/** Full system information endpoint */
export const systemRoute = route.get('/api/system', ({ inject }) => {
  const configLoader = inject(ConfigLoader);
  const plugins = inject(PluginManager);
  const blocks = inject(BlockRegistry);
  const workflows = inject(WorkflowEngine);
  const sparks = inject(SparkRegistry);

  const config = configLoader.get();
  const pluginList = plugins.list();
  const blockList = blocks.list();
  const workflowList = workflows.list();
  const sparkList = sparks.list();

  return {
    version: HUB_VERSION,
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
      blocks: { total: blockList.length },
      workflows: {
        total: workflowList.length,
        enabled: workflowList.filter((w) => w.enabled).length,
      },
      sparks: { total: sparkList.length },
    },
  };
});

export const statusRoutes = [healthRoute, systemRoute];
