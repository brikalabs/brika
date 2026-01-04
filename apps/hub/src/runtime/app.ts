import { inject } from '@brika/shared';
import {
  bootstrap,
  I18nLoader,
  PluginLoader,
  RuleLoader,
  ScheduleLoader,
  AutomationLoader,
} from '@/runtime/bootstrap';
import { LogRouter } from '@/runtime/logs/log-router';

// Hot reload detection
const HOT_STARTED_KEY = Symbol.for('elia.hub.started');

/**
 * ELIA Hub Application
 * 
 * Declarative bootstrap configuration using builder pattern.
 */
export class HubApp {
  private readonly logs = inject(LogRouter);

  // Declarative bootstrap configuration
  private readonly hub = bootstrap()
    .with(I18nLoader)
    .with(PluginLoader)
    .with(RuleLoader)
    .with(ScheduleLoader)
    .with(AutomationLoader)
    .build();

  /**
   * Start the hub.
   */
  async start(): Promise<void> {
    // Skip if already started (hot reload)
    if (this.isHotReload()) {
      this.logs.info('hub.hot-reload', { message: 'Module reloaded, services preserved' });
      return;
    }

    await this.hub.start();
    this.markStarted();
  }

  /**
   * Stop the hub.
   */
  async stop(): Promise<void> {
    await this.hub.stop();
  }

  private isHotReload(): boolean {
    return (globalThis as Record<symbol, boolean>)[HOT_STARTED_KEY];
  }

  private markStarted(): void {
    (globalThis as Record<symbol, boolean>)[HOT_STARTED_KEY] = true;
  }
}
