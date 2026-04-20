import { createBanner } from '@brika/banner';
import { configureDatabases } from '@brika/db';
import { inject } from '@brika/di';
import { hub } from '@/hub';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { setHubReady, setHubStopping } from '@/runtime/readiness';
import type { BootstrapPlugin } from './plugin';

const HOT_STARTED = Symbol.for('brika.hub.started');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Declarative bootstrap builder for the BRIKA hub.
 *
 * @example
 * ```ts
 * await bootstrap()
 *   .use(routes(allRoutes))
 *   .use(loader(PluginLoader))
 *   .use(trapSignals())
 *   .start();
 * ```
 */
export class Bootstrap {
  private readonly logs = inject(Logger);
  private readonly logStore = inject(LogStore);
  private readonly initializer = inject(BrikaInitializer);
  private readonly configLoader = inject(ConfigLoader);
  private readonly plugins: BootstrapPlugin[] = [];

  use(plugin: BootstrapPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  async start(): Promise<void> {
    if ((globalThis as Record<symbol, boolean>)[HOT_STARTED]) {
      this.logs.info('Hot reload detected, skipping initialization');
      return;
    }

    console.log(
      createBanner({
        title: 'BRIKA',
        subtitle: 'Build. Run. Integrate. Keep Automating.',
        metadata: {
          Version: hub.version,
          Package: hub.name,
        },
      })
    );

    configureDatabases(`${this.configLoader.getRootDir()}/.brika`);
    this.logStore.init();
    this.logs.setStore(this.logStore);
    for (const p of this.plugins) { p.setup?.(this); }
    await this.initializer.init();
    const config = await this.configLoader.load();

    await this.runPhase('Initializing', (p) => p.onInit?.());
    await this.runPhase('Loading', (p) => p.onLoad?.(config));
    await this.runPhase('Starting', (p) => p.onStart?.());

    setHubReady();
    this.logs.info('Brika Hub started successfully', {
      version: hub.version,
      pluginCount: this.plugins.length,
    });
    (globalThis as Record<symbol, boolean>)[HOT_STARTED] = true;
  }

  async stop(): Promise<void> {
    setHubStopping();
    await this.runPhase('Stopping', (p) => p.onStop?.(), this.plugins.toReversed());
    this.logs.info('Brika Hub stopped successfully');
    this.logStore.close();
  }

  private async runPhase(
    label: string,
    fn: (plugin: BootstrapPlugin) => Promise<void> | void,
    plugins = this.plugins
  ): Promise<void> {
    for (const p of plugins) {
      this.logs.info(`${label} bootstrap plugin`, {
        plugin: p.name,
      });
      try {
        await fn(p);
      } catch (error) {
        this.logs.warn(`${label} bootstrap plugin failed`, {
          plugin: p.name,
          error: errorMessage(error),
        });
      }
    }
  }
}

export function bootstrap(): Bootstrap {
  return new Bootstrap();
}
