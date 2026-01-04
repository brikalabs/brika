import { createBanner } from '@brika/banner';
import { inject } from '@brika/shared';
import { hub } from '@/hub';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
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
  private readonly logs = inject(LogRouter);
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
      this.logs.info('hub.hot-reload');
      return;
    }

    // 1. Logging first
    await this.logStore.init();
    this.logs.setStore(this.logStore);

    // 2. Initialize .brika directory
    await this.initializer.init();

    // 3. Load config
    const config = await this.configLoader.load();

    // 4. Display startup message
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

    // 5. Run plugin lifecycle
    for (const p of this.plugins) {
      this.logs.info(`plugin.init`, { name: p.name });
      await p.onInit?.();
    }
    for (const p of this.plugins) {
      this.logs.info(`plugin.load`, { name: p.name });
      await p.onLoad?.(config);
    }
    for (const p of this.plugins) {
      this.logs.info(`plugin.start`, { name: p.name });
      await p.onStart?.();
    }

    this.logs.info('hub.started');
    (globalThis as Record<symbol, boolean>)[HOT_STARTED] = true;
  }

  async stop(): Promise<void> {
    for (const p of this.plugins.toReversed()) {
      this.logs.info(`plugin.stop.start`, { name: p.name });
      await p.onStop?.();
    }
    this.logs.info('hub.stopped');
    this.logStore.close();
  }
}

export function bootstrap(): Bootstrap {
  return new Bootstrap();
}
