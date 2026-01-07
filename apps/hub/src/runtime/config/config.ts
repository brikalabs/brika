import { inject, singleton } from '@brika/shared';
import { ConfigLoader } from './config-loader';

@singleton()
export class HubConfig {
  readonly host: string;
  readonly port: number;
  readonly homeDir: string;

  constructor() {
    // Try to get values from ConfigLoader if already loaded, else use env/defaults
    try {
      const loader = inject(ConfigLoader);
      const config = loader.get();
      this.host = process.env.BRIKA_HOST ?? config.hub.host;
      this.port = Number(process.env.BRIKA_PORT ?? config.hub.port);
      // Use .brika directory from config loader
      this.homeDir = process.env.BRIKA_HOME ?? loader.getBrikaDir();
    } catch {
      // Config not loaded yet, use env/defaults
      this.host = process.env.BRIKA_HOST ?? '127.0.0.1';
      this.port = Number(process.env.BRIKA_PORT ?? '3001');
      // Fallback to relative path
      this.homeDir = process.env.BRIKA_HOME ?? '.brika';
    }
  }
}

@singleton()
export class PluginManagerConfig {
  readonly callTimeoutMs = 5000;
  readonly heartbeatEveryMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly killTimeoutMs = 3000;

  // Auto-restart configuration
  readonly autoRestartEnabled = true;
  readonly restartBaseDelayMs = 1000;
  readonly restartMaxDelayMs = 60000;
  readonly restartMaxCrashes = 5;
  readonly restartCrashWindowMs = 60000;
  readonly restartStabilityMs = 30000;

  constructor() {
    try {
      const loader = inject(ConfigLoader);
      const config = loader.get();
      this.heartbeatEveryMs = config.hub.plugins.heartbeatInterval;
      this.heartbeatTimeoutMs = config.hub.plugins.heartbeatTimeout;
    } catch {
      this.heartbeatEveryMs = 5000;
      this.heartbeatTimeoutMs = 15000;
    }
  }
}
