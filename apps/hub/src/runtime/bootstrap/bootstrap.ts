import { createBanner } from '@brika/banner';
import { inject } from '@brika/shared';
import { hub } from '@/hub';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import type { BootstrapPlugin } from './plugin';

const HOT_STARTED = Symbol.for('brika.hub.started');

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
    plugin.setup?.(this);
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

    // 1. Logging first
    await this.logStore.init();
    this.logs.setStore(this.logStore);

    // 2. Initialize .brika directory
    await this.initializer.init();

    // 3. Load config
    const config = await this.configLoader.load();

    // 4. Run plugin lifecycle
    for (const p of this.plugins) {
      this.logs.info('Initializing bootstrap plugin', { plugin: p.name });
      await p.onInit?.();
    }
    for (const p of this.plugins) {
      this.logs.info('Loading bootstrap plugin', { plugin: p.name });
      await p.onLoad?.(config);
    }
    for (const p of this.plugins) {
      this.logs.info('Starting bootstrap plugin', { plugin: p.name });
      await p.onStart?.();
    }

    this.logs.info('Brika Hub started successfully', {
      version: hub.version,
      pluginCount: this.plugins.length,
    });
    (globalThis as Record<symbol, boolean>)[HOT_STARTED] = true;
  }

  async stop(): Promise<void> {
    for (const p of this.plugins.toReversed()) {
      this.logs.info('Stopping bootstrap plugin', { plugin: p.name });
      await p.onStop?.();
    }
    this.logs.info('Brika Hub stopped successfully');
    this.logStore.close();
  }
}

export function bootstrap(): Bootstrap {
  return new Bootstrap();
}
