import { createBanner } from '@brika/banner';
import { configureDatabases } from '@brika/db';
import { inject } from '@brika/di';
import { hub } from '@/hub';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { ApiServer } from '@/runtime/http/api-server';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { setHubReady, setHubStopping } from '@/runtime/readiness';
import type { BootstrapPlugin } from './plugin';

const HOT_STARTED = Symbol.for('brika.hub.started');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Outcome of a graceful-shutdown attempt. */
export type ShutdownResult = 'drained' | 'timeout';

const TIMEOUT = Symbol('shutdown-timeout');

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
  private readonly apiServer = inject(ApiServer);
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
    for (const p of this.plugins) {
      p.setup?.(this);
    }
    await this.initializer.init();
    const config = await this.configLoader.load();
    this.logStore.startRetention(config.hub.logs.retentionDays, config.hub.logs.pruneIntervalMs);

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

  /**
   * Graceful shutdown bounded by `gracePeriodMs`.
   *
   * Runs the normal {@link stop} sequence — which stops accepting new HTTP
   * connections and drains in-flight requests via `ApiServer.stop()` — but
   * races it against a hard timeout so a wedged `onStop` can never hang the
   * process forever. On timeout we force-close any lingering connections and
   * always flush/close the {@link LogStore} so no buffered log line is lost,
   * even on the timeout path where `stop()` never reached its own close.
   *
   * @returns `'drained'` if everything stopped cleanly within the grace
   *   period, `'timeout'` if the hard-timeout fallback had to fire.
   */
  async shutdown(gracePeriodMs: number): Promise<ShutdownResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), gracePeriodMs);
    });

    try {
      const outcome = await Promise.race([this.stop(), deadline]);
      if (outcome === TIMEOUT) {
        this.logs.warn('Graceful shutdown exceeded grace period, forcing exit', {
          gracePeriodMs,
        });
        // Force-close any connections still draining so they can't keep
        // the event loop alive past the deadline.
        await this.apiServer.stop(true);
        return 'timeout';
      }
      return 'drained';
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      // Guarantee the log buffer is flushed before exit. On the clean path
      // stop() already closed it; close() is idempotent so this is a no-op
      // there and the safety net on the timeout path.
      this.logStore.close();
    }
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
