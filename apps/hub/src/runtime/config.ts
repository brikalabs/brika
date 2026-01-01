import { singleton, inject } from "@elia/shared";
import { ConfigLoader } from "./config/config-loader";

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
      this.host = process.env.ELIA_HOST ?? config.hub.host;
      this.port = Number(process.env.ELIA_PORT ?? config.hub.port);
      // Use project root for .elia directory
      this.homeDir = process.env.ELIA_HOME ?? `${loader.getRootDir()}/.elia`;
    } catch {
      // Config not loaded yet, use env/defaults
      this.host = process.env.ELIA_HOST ?? "127.0.0.1";
      this.port = Number(process.env.ELIA_PORT ?? "3001");
      // Fallback to relative path
      this.homeDir = process.env.ELIA_HOME ?? ".elia";
    }
  }
}

@singleton()
export class PluginManagerConfig {
  readonly callTimeoutMs = 5000;
  readonly heartbeatEveryMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly killTimeoutMs = 3000;

  constructor() {
    try {
      const loader = inject(ConfigLoader);
      const config = loader.get();
      this.heartbeatEveryMs = config.plugins.heartbeatInterval;
      this.heartbeatTimeoutMs = config.plugins.heartbeatTimeout;
    } catch {
      this.heartbeatEveryMs = 5000;
      this.heartbeatTimeoutMs = 15000;
    }
  }
}
