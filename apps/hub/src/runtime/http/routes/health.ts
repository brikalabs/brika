import { route } from '@elia/router';
import { AutomationEngine } from '@/runtime/automations';
import { BlockRegistry } from '@/runtime/blocks';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { RulesEngine } from '@/runtime/rules/rules-engine';
import { SchedulerService } from '@/runtime/scheduler/scheduler-service';
import { ToolRegistry } from '@/runtime/tools/tool-registry';

export const healthRoutes = [
  route.get('/api/health', () => {
    return { ok: true };
  }),

  route.get('/api/stats', ({ inject }) => {
    const plugins = inject(PluginManager);
    const tools = inject(ToolRegistry);
    const blocks = inject(BlockRegistry);
    const automations = inject(AutomationEngine);
    const scheduler = inject(SchedulerService);
    const rules = inject(RulesEngine);

    const pluginList = plugins.list();
    const toolList = tools.list();
    const blockList = blocks.list();
    const workflowList = automations.list();
    const scheduleList = scheduler.list();
    const ruleList = rules.list();

    return {
      plugins: {
        total: pluginList.length,
        running: pluginList.filter((p) => p.status === 'running').length,
      },
      tools: { total: toolList.length },
      blocks: { total: blockList.length, byCategory: blocks.listByCategory() },
      workflows: {
        total: workflowList.length,
        enabled: workflowList.filter((w) => w.enabled).length,
      },
      schedules: {
        total: scheduleList.length,
        enabled: scheduleList.filter((s) => s.enabled).length,
      },
      rules: {
        total: ruleList.length,
        enabled: ruleList.filter((r) => r.enabled).length,
      },
    };
  }),
];
