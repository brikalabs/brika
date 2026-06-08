import { inject, singleton } from '@brika/di';
import type { BrikaConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';
import type { Loader } from './loader';

@singleton()
export class PluginLoader implements Loader {
  readonly name = 'plugins';

  private readonly logs = inject(Logger);
  private readonly pm = inject(PluginManager);
  private readonly registry = inject(PluginRegistry);
  private readonly state = inject(StateStore);

  async init(): Promise<void> {
    this.state.init();
    this.state.applyTimezone();
    await this.registry.init();
  }

  async load(config: BrikaConfig): Promise<void> {
    this.logs.info('Synchronizing plugin registry and state', {
      pluginCount: config.plugins.length,
    });

    // Sync registry: creates symlinks for workspace plugins, installs npm plugins
    await this.registry.syncToConfig(config.plugins);
    const validNames = new Set(config.plugins.map((e) => e.name));
    this.state.syncToConfig(validNames);

    this.logs.info('Plugin synchronization completed successfully');

    // Cache metadata for EVERY installed plugin, enabled or not. A disabled
    // plugin is skipped by the spawn loop below, but it must still appear in the
    // plugin list (manager.list() drops state rows that have no cached metadata)
    // so the operator can see it and re-enable it.
    await this.state.loadMetadataCache();

    // Load all plugins via registry (all plugins are in pluginsDir/node_modules/).
    for (const entry of config.plugins) {
      // Honor the operator's enable/disable choice: a plugin the operator
      // disabled must NOT be spawned at boot. Previously every config plugin was
      // loaded unconditionally, so a disabled plugin still ran its code on every
      // restart. A plugin with no state row yet (a fresh config entry) has made
      // no explicit choice and loads as before.
      if (this.state.get(entry.name)?.enabled === false) {
        this.logs.info('Skipping disabled plugin at boot', { pluginName: entry.name });
        continue;
      }
      try {
        // Local/workspace plugins are the operator's own code: start a first-time
        // one immediately. A remote (npm) plugin that requests grants installs
        // dormant on first sight until the operator reviews and enables it.
        const local = entry.version.startsWith('workspace:') || entry.version.startsWith('file:');
        if (local) {
          await this.pm.load(entry.name, this.registry.pluginsDir, { defaultEnabled: true });
        } else {
          await this.pm.load(entry.name, this.registry.pluginsDir);
        }
      } catch (err) {
        this.logs.error(
          'Failed to load plugin',
          {
            pluginName: entry.name,
            version: entry.version,
            reason: err instanceof Error ? err.message : String(err),
          },
          {
            error: err,
          }
        );
      }
    }
  }

  async stop(): Promise<void> {
    await this.pm.stopAll();
  }
}
