import { route } from "@elia/router";
import { PluginManager } from "../../plugins/plugin-manager";
import { ToolRegistry } from "../../tools/tool-registry";
import { BlockRegistry } from "../../blocks";
import { AutomationEngine } from "../../automations";
import { SchedulerService } from "../../scheduler/scheduler-service";
import { RulesEngine } from "../../rules/rules-engine";

export const healthRoutes = [
  route.get("/api/health", async () => {
    return { ok: true };
  }),

  route.get("/api/stats", async ({ inject }) => {
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
        running: pluginList.filter((p) => p.health === "running").length,
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
