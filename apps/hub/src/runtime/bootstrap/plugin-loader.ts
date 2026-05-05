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
    await this.state.init();
    this.state.applyTimezone();
    await this.registry.init();
  }

  async load(config: BrikaConfig): Promise<void> {
    this.logs.info('Synchronizing plugin registry and state', {
      pluginCount: config.plugins.length,
    });

    // Sync registry — creates symlinks for workspace plugins, installs npm plugins
    await this.registry.syncToConfig(config.plugins);
    const validNames = new Set(config.plugins.map((e) => e.name));
    await this.state.syncToConfig(validNames);

    this.logs.info('Plugin synchronization completed successfully');

    // Load all plugins via registry (all plugins are in pluginsDir/node_modules/)
    for (const entry of config.plugins) {
      try {
        await this.pm.load(entry.name, this.registry.pluginsDir);
      } catch (err) {
        this.logs.error(
          'Failed to load plugin',
          {
            pluginName: entry.name,
            version: entry.version,
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
