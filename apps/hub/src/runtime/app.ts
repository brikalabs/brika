import { inject } from "@elia/shared";
import { ApiServer } from "./http/api-server";
import { LogRouter } from "./logs/log-router";
import { LogStore } from "./logs/log-store";
import { PluginManager } from "./plugins/plugin-manager";
import { RulesEngine } from "./rules/rules-engine";
import { SchedulerService } from "./scheduler/scheduler-service";
import { StoreService } from "./store/store-service";
import { StateStore } from "./state/state-store";
import { ConfigLoader } from "./config/config-loader";
import { AutomationEngine, YamlWorkflowLoader } from "./automations";

// Hot reload detection
const HOT_STARTED_KEY = Symbol.for("elia.hub.started");
function isHotReload(): boolean {
  return (globalThis as Record<symbol, boolean>)[HOT_STARTED_KEY];
}
function markStarted(): void {
  (globalThis as Record<symbol, boolean>)[HOT_STARTED_KEY] = true;
}

export class HubApp {
  async start(): Promise<void> {
    const logs = inject(LogRouter);

    // Check if this is a hot reload
    if (isHotReload()) {
      logs.info("hub.hot-reload", { message: "Module reloaded, services preserved" });
      return;
    }

    // Load configuration
    const configLoader = inject(ConfigLoader);
    const config = await configLoader.load();
    logs.info("config.loaded", { port: config.hub.port });

    // Initialize log persistence (before other services start logging)
    const logStore = inject(LogStore);
    await logStore.init();
    logs.setStore(logStore);
    logs.info("logs.store.ready");

    // Initialize core services
    await inject(StateStore).init();
    await inject(StoreService).init();
    await inject(SchedulerService).init();
    await inject(RulesEngine).init();
    await inject(AutomationEngine).init();

    // Clean up stale plugin state entries (files that no longer exist)
    await inject(PluginManager).cleanupStaleState();

    // Restore previously enabled plugins from state
    await inject(PluginManager).restoreEnabledFromState();

    // Auto-install plugins from config
    const pm = inject(PluginManager);
    for (const entry of config.install) {
      if (!entry.enabled) continue;

      const resolvedRef = await configLoader.resolvePluginRef(entry.ref);
      logs.info("plugin.autoload", { ref: entry.ref, resolved: resolvedRef });

      try {
        await pm.load(resolvedRef);
      } catch (error) {
        logs.error("plugin.autoload.failed", { ref: entry.ref, error: String(error) });
      }
    }

    // Legacy: load from ELIA_PLUGINS env var
    const preload = (process.env.ELIA_PLUGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const ref of preload) {
      try {
        await pm.load(ref);
      } catch (error) {
        logs.error("plugin.preload.failed", { ref, error: String(error) });
      }
    }

    // Load rules from config
    const rulesEngine = inject(RulesEngine);
    for (const rule of config.rules) {
      if (!rule.enabled) continue;
      try {
        await rulesEngine.create({
          name: rule.name,
          trigger: { type: "event", match: rule.event },
          condition: rule.condition,
          actions: [
            { tool: rule.action.tool, args: rule.action.args as Record<string, import("@elia/shared").Json> },
          ],
          enabled: true,
        });
        logs.info("rule.loaded", { name: rule.name });
      } catch (error) {
        logs.error("rule.load.failed", { name: rule.name, error: String(error) });
      }
    }

    // Load schedules from config
    const scheduler = inject(SchedulerService);
    for (const schedule of config.schedules) {
      if (!schedule.enabled) continue;
      try {
        await scheduler.create({
          name: schedule.name,
          trigger: schedule.trigger,
          action: {
            tool: schedule.action.tool,
            args: schedule.action.args as Record<string, import("@elia/shared").Json>,
          },
          enabled: true,
        });
        logs.info("schedule.loaded", { name: schedule.name });
      } catch (error) {
        logs.error("schedule.load.failed", { name: schedule.name, error: String(error) });
      }
    }

    // Load YAML workflows with hot-reload
    const yamlLoader = inject(YamlWorkflowLoader);
    await yamlLoader.loadDir(`${configLoader.getRootDir()}/automations`);
    yamlLoader.watch();

    // Start API server
    await inject(ApiServer).start();
    logs.info("hub.started", { port: config.hub.port });

    // Mark as started for hot reload detection
    markStarted();
  }

  async stop(): Promise<void> {
    inject(YamlWorkflowLoader).stopWatching();
    await inject(ApiServer).stop();
    await inject(AutomationEngine).stop();
    await inject(RulesEngine).stop();
    await inject(SchedulerService).stop();
    await inject(PluginManager).stopAll();
    inject(LogRouter).info("hub.stopped");
    inject(LogStore).close();
  }
}
