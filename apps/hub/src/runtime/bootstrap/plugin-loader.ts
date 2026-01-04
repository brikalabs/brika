import { inject, singleton } from '@brika/shared';
import type { EliaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';
import type { Loader } from './loader';

@singleton()
export class PluginLoader implements Loader {
  readonly name = 'plugins';

  private readonly logs = inject(LogRouter);
  private readonly configLoader = inject(ConfigLoader);
  private readonly pm = inject(PluginManager);
  private readonly registry = inject(PluginRegistry);
  private readonly state = inject(StateStore);

  async init(): Promise<void> {
    await this.state.init();
    await this.registry.init();
  }

  async load(config: EliaConfig): Promise<void> {
    this.logs.info('plugins.sync.start');

    // Sync registry and state
    await this.registry.syncToConfig(config.install);
    const validNames = new Set(config.install.map((e) => e.name));
    await this.state.syncToConfig(validNames);

    this.logs.info('plugins.sync.done');

    // Load configured plugins
    for (const entry of config.install) {
      try {
        const resolved = await this.configLoader.resolvePluginEntry(entry);
        await this.pm.load(resolved.ref);
      } catch (error) {
        this.logs.error('plugin.load.failed', { name: entry.name, error: String(error) });
      }
    }

    // Legacy: load from ELIA_PLUGINS env var
    await this.loadFromEnv();
  }

  async stop(): Promise<void> {
    await this.pm.stopAll();
  }

  private async loadFromEnv(): Promise<void> {
    const preload = (process.env.ELIA_PLUGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const ref of preload) {
      try {
        await this.pm.load(ref);
      } catch (error) {
        this.logs.error('plugin.preload.failed', { ref, error: String(error) });
      }
    }
  }
}
