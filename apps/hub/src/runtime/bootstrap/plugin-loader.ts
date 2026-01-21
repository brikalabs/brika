import { inject, singleton } from '@brika/shared';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';
import type { Loader } from './loader';

@singleton()
export class PluginLoader implements Loader {
  readonly name = 'plugins';

  private readonly logs = inject(Logger);
  private readonly configLoader = inject(ConfigLoader);
  private readonly pm = inject(PluginManager);
  private readonly registry = inject(PluginRegistry);
  private readonly state = inject(StateStore);

  async init(): Promise<void> {
    await this.state.init();
    await this.registry.init();
  }

  async load(config: BrikaConfig): Promise<void> {
    this.logs.info('Synchronizing plugin registry and state', {
      pluginCount: config.plugins.length,
    });

    // Sync registry and state
    await this.registry.syncToConfig(config.plugins);
    const validNames = new Set(config.plugins.map((e) => e.name));
    await this.state.syncToConfig(validNames);

    this.logs.info('Plugin synchronization completed successfully');

    // Load configured plugins
    for (const entry of config.plugins) {
      try {
        const resolved = await this.configLoader.resolvePluginEntry(entry);
        await this.pm.load(resolved.rootDirectory);
      } catch (err) {
        this.logs.error(
          'Failed to load plugin',
          { pluginName: entry.name, version: entry.version },
          { error: err }
        );
      }
    }
  }

  async stop(): Promise<void> {
    await this.pm.stopAll();
  }
}
